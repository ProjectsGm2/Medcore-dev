import React, { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building, Key, ShieldCheck, Loader2, Upload, ImageIcon, UserCircle } from "lucide-react";
import { cn, resolveImageSrc } from "@/lib/utils";

export default function Settings() {
  const logoInputRef = useRef(null);
  const smallLogoInputRef = useRef(null);
  const { data: all = {}, refetch, isLoading: settingsLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.settings.all(),
  });

  const { data: rolesMaster = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["masters", "staff_role"],
    queryFn: () => base44.entities.Master.filter({ type: "staff_role" }),
  });

  const [general, setGeneral] = useState({
    clinic_name: "",
    clinic_code: "",
    address: "",
    phone: "",
    email: "",
    logo: "",
    small_logo: "",
  });
  const [processingLogo, setProcessingLogo] = useState({
    logo: false,
    small_logo: false,
  });

  const [prefixes, setPrefixes] = useState({
    prescription_prefix: "RX-",
    uhid_prefix: "UHID-",
  });

  const defaultRoles = ["admin", "doctor", "receptionist"];
  const roles = rolesMaster.length > 0 
    ? rolesMaster.map(r => r.name.toLowerCase())
    : defaultRoles;

  const modules = ["Patients", "Appointments", "OPD", "Dispensary", "Staff", "Staff.Password", "Master", "Settings", "ImportExport"];
  
  const [selectedRole, setSelectedRole] = useState("admin");
  const [permissions, setPermissions] = useState({});

  useEffect(() => {
    if (all) {
      setGeneral({
        clinic_name: all.clinic_name || "",
        clinic_code: all.clinic_code || "",
        address: all.address || "",
        phone: all.phone || "",
        email: all.email || "",
        logo: all.logo || "",
        small_logo: all.small_logo || "",
      });
      setPrefixes({
        prescription_prefix: all.prescription_prefix || "RX-",
        uhid_prefix: all.uhid_prefix || "UHID-",
      });

      if (all.permissions_json) {
        try {
          const parsed = JSON.parse(all.permissions_json);
          // If the old structure (single module map) is detected, wrap it in 'admin'
          if (parsed.Patients && !parsed.admin) {
             setPermissions({ admin: parsed });
          } else {
             setPermissions(parsed);
          }
        } catch (e) {
          console.error("Failed to parse permissions", e);
        }
      }
    }
  }, [all]);

  // Ensure every role has every module in state
  useEffect(() => {
    setPermissions(prev => {
      const next = { ...prev };
      roles.forEach(role => {
        if (!next[role]) next[role] = {};
        modules.forEach(mod => {
          if (!next[role][mod]) {
            next[role][mod] = { view: false, add: false, edit: false, delete: false };
          } else {
            next[role][mod] = { view: !!next[role][mod].view, add: !!next[role][mod].add, edit: !!next[role][mod].edit, delete: !!next[role][mod].delete };
          }
        });
      });
      return next;
    });
  }, [rolesMaster]);

  const saveMut = useMutation({
    mutationFn: async (updates) => {
      for (const [key, value] of Object.entries(updates)) {
        await base44.settings.set(key, value);
      }
    },
    onSuccess: () => refetch(),
  });

  const handleGeneralSave = () => saveMut.mutate(general);
  const handlePrefixSave = () => saveMut.mutate(prefixes);
  const handlePermissionSave = () => saveMut.mutate({ permissions_json: JSON.stringify(permissions) });

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const compressLogoFile = async (file, { maxWidth, maxHeight, targetBytes }) => {
    const sourceUrl = await readFileAsDataUrl(file);
    const img = await loadImage(sourceUrl);
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return sourceUrl;

    let quality = 0.9;
    let currentWidth = width;
    let currentHeight = height;
    let output = sourceUrl;

    while (quality >= 0.45) {
      canvas.width = currentWidth;
      canvas.height = currentHeight;
      ctx.clearRect(0, 0, currentWidth, currentHeight);
      ctx.drawImage(img, 0, 0, currentWidth, currentHeight);
      output = canvas.toDataURL("image/webp", quality);
      if (output.length <= targetBytes) return output;
      quality -= 0.1;
      if (quality < 0.65 && currentWidth > 320 && currentHeight > 320) {
        currentWidth = Math.max(320, Math.round(currentWidth * 0.9));
        currentHeight = Math.max(320, Math.round(currentHeight * 0.9));
      }
    }

    return output.length < sourceUrl.length ? output : sourceUrl;
  };

  const handleLogoFileChange = async (field, event) => {
    const file = event.target.files?.[0];
    if (file) {
      const limits = field === "small_logo"
        ? { maxWidth: 256, maxHeight: 256, targetBytes: 180_000 }
        : { maxWidth: 1200, maxHeight: 400, targetBytes: 450_000 };
      setProcessingLogo((prev) => ({ ...prev, [field]: true }));
      try {
        const result = await compressLogoFile(file, limits);
        setGeneral((prev) => ({ ...prev, [field]: result }));
      } catch {
        const fallback = await readFileAsDataUrl(file);
        setGeneral((prev) => ({ ...prev, [field]: fallback }));
      } finally {
        setProcessingLogo((prev) => ({ ...prev, [field]: false }));
      }
    }
    event.target.value = "";
  };

  const handleSelectAll = (role, checked) => {
    setPermissions(prev => {
      const next = { ...prev };
      const rolePerms = { ...next[role] };
      modules.forEach(mod => {
        rolePerms[mod] = { view: checked, add: checked, edit: checked, delete: checked };
      });
      next[role] = rolePerms;
      return next;
    });
  };

  const handleRowSelectAll = (role, mod, checked) => {
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [mod]: { view: checked, add: checked, edit: checked, delete: checked }
      }
    }));
  };

  const togglePermission = (role, mod, action) => {
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [mod]: {
          ...prev[role][mod],
          [action]: !prev[role][mod][action]
        }
      }
    }));
  };

  const isLoading = settingsLoading || rolesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Clinic Settings"
        description="Configure clinic-wide settings, document prefixes, and system permissions"
      />

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="general" className="gap-2">
            <Building className="w-4 h-4" /> General
          </TabsTrigger>
          <TabsTrigger value="prefixes" className="gap-2">
            <Key className="w-4 h-4" /> Prefixes
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <ShieldCheck className="w-4 h-4" /> Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Update your clinic's basic information and branding.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Clinic Name</Label>
                  <Input 
                    value={general.clinic_name} 
                    onChange={(e) => setGeneral({ ...general, clinic_name: e.target.value })} 
                    placeholder="MedCare Hospital"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Clinic Code</Label>
                  <Input 
                    value={general.clinic_code} 
                    onChange={(e) => setGeneral({ ...general, clinic_code: e.target.value })} 
                    placeholder="MC-001"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Address</Label>
                  <Input 
                    value={general.address} 
                    onChange={(e) => setGeneral({ ...general, address: e.target.value })} 
                    placeholder="123 Health St, City"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input 
                    value={general.phone} 
                    onChange={(e) => setGeneral({ ...general, phone: e.target.value })} 
                    placeholder="+1 234 567 890"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    value={general.email} 
                    onChange={(e) => setGeneral({ ...general, email: e.target.value })} 
                    placeholder="contact@medcare.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t">
                <div className="space-y-4">
                  <Label>Clinic Logo (Full)</Label>
                  <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed rounded-lg bg-slate-50/50">
                    {resolveImageSrc(general.logo) ? (
                      <img src={resolveImageSrc(general.logo)} alt="Logo" className="max-h-24 object-contain" />
                    ) : (
                      <ImageIcon className="w-12 h-12 text-slate-300" />
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleLogoFileChange("logo", e)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={processingLogo.logo}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {processingLogo.logo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload Full Logo
                    </Button>
                    {general.logo ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setGeneral((prev) => ({ ...prev, logo: "" }))}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">Recommended: 400x120px, PNG/JPG</p>
                </div>
                <div className="space-y-4">
                  <Label>Clinic Small Logo (Icon)</Label>
                  <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed rounded-lg bg-slate-50/50">
                    {resolveImageSrc(general.small_logo) ? (
                      <img src={resolveImageSrc(general.small_logo)} alt="Small Logo" className="w-16 h-16 object-contain" />
                    ) : (
                      <ImageIcon className="w-12 h-12 text-slate-300" />
                    )}
                    <input
                      ref={smallLogoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleLogoFileChange("small_logo", e)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={processingLogo.small_logo}
                      onClick={() => smallLogoInputRef.current?.click()}
                    >
                      {processingLogo.small_logo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload Icon Logo
                    </Button>
                    {general.small_logo ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setGeneral((prev) => ({ ...prev, small_logo: "" }))}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">Used for printables & billing. Recommended: 100x100px</p>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handleGeneralSave} 
                  disabled={saveMut.isPending}
                  className="bg-cyan-600 hover:bg-cyan-700 min-w-[120px]"
                >
                  {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prefixes" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Prefix Settings</CardTitle>
              <CardDescription>Define prefixes for generated IDs and documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Prescription Prefix</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={prefixes.prescription_prefix} 
                      onChange={(e) => setPrefixes({ ...prefixes, prescription_prefix: e.target.value })} 
                      placeholder="RX-"
                    />
                    <div className="px-3 flex items-center bg-slate-100 rounded border text-xs text-slate-500 font-mono">
                      {prefixes.prescription_prefix}12345
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">Example format: RX-10001</p>
                </div>
                <div className="space-y-2">
                  <Label>UHID Prefix</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={prefixes.uhid_prefix} 
                      onChange={(e) => setPrefixes({ ...prefixes, uhid_prefix: e.target.value })} 
                      placeholder="UHID-"
                    />
                    <div className="px-3 flex items-center bg-slate-100 rounded border text-xs text-slate-500 font-mono">
                      {prefixes.uhid_prefix}9876
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">Example format: UHID-1001</p>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handlePrefixSave} 
                  disabled={saveMut.isPending}
                  className="bg-cyan-600 hover:bg-cyan-700 min-w-[120px]"
                >
                  {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Prefixes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Permission Settings</CardTitle>
              <CardDescription>Configure access levels for each staff role across system components.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2 pb-2">
                {roles.map((role) => (
                  <Button
                    key={role}
                    type="button"
                    variant={selectedRole === role ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedRole(role)}
                    className={cn(
                      "capitalize gap-2",
                      selectedRole === role && "bg-cyan-600 hover:bg-cyan-700"
                    )}
                  >
                    <UserCircle className="w-4 h-4" />
                    {role}
                  </Button>
                ))}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-left px-6 py-3 font-semibold text-slate-700">
                        <div className="flex items-center gap-2">
                          Module / Component
                          <div className="flex items-center gap-1.5 ml-4 bg-white px-2 py-0.5 rounded border border-slate-200">
                            <Checkbox 
                              id="select-all-role"
                              checked={
                                modules.every(m => {
                                  const mp = permissions[selectedRole]?.[m];
                                  return mp?.view && mp?.add && mp?.edit && mp?.delete;
                                })
                              }
                              onCheckedChange={(checked) => handleSelectAll(selectedRole, !!checked)}
                            />
                            <Label htmlFor="select-all-role" className="text-[10px] uppercase font-bold text-slate-400 cursor-pointer">
                              Select All
                            </Label>
                          </div>
                        </div>
                      </th>
                      <th className="text-center px-6 py-3 font-semibold text-slate-700 w-24">View</th>
                      <th className="text-center px-6 py-3 font-semibold text-slate-700 w-24">Add</th>
                      <th className="text-center px-6 py-3 font-semibold text-slate-700 w-24">Edit</th>
                      <th className="text-center px-6 py-3 font-semibold text-slate-700 w-24">Delete</th>
                      <th className="text-center px-6 py-3 font-semibold text-slate-700 w-24">All</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {modules.map((module) => {
                      const rolePerms = permissions[selectedRole] || {};
                      const modPerms = rolePerms[module] || { view: false, add: false, edit: false, delete: false };
                      const isRowAllChecked = modPerms.view && modPerms.add && modPerms.edit && modPerms.delete;
                      
                      return (
                        <tr key={module} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-700">{module}</td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center">
                              <Checkbox 
                                checked={modPerms.view} 
                                onCheckedChange={() => togglePermission(selectedRole, module, 'view')}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center">
                              <Checkbox 
                                checked={modPerms.add} 
                                onCheckedChange={() => togglePermission(selectedRole, module, 'add')}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center">
                              <Checkbox 
                                checked={modPerms.edit} 
                                onCheckedChange={() => togglePermission(selectedRole, module, 'edit')}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center">
                              <Checkbox 
                                checked={modPerms.delete} 
                                onCheckedChange={() => togglePermission(selectedRole, module, 'delete')}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 bg-slate-50/30">
                            <div className="flex justify-center">
                              <Checkbox 
                                checked={isRowAllChecked} 
                                onCheckedChange={(checked) => handleRowSelectAll(selectedRole, module, !!checked)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handlePermissionSave} 
                  disabled={saveMut.isPending}
                  className="bg-cyan-600 hover:bg-cyan-700 min-w-[120px]"
                >
                  {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save All Permissions"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
