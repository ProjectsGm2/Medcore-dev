import React, { useState, useMemo } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Search, Pencil, Loader2, Mail, Image as ImageIcon, Check, ChevronsUpDown, Upload, Eye, Trash2, ArrowUpDown, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePermission } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function SearchableSelect({
  options,
  value,
  onSelect,
  placeholder,
  emptyMessage = "No options found.",
  className,
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between text-xs font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {options.find((opt) => (typeof opt === "string" ? opt : opt.value) === value)?.label || 
           (typeof options.find((opt) => (typeof opt === "string" ? opt : opt.value) === value) === "string" ? options.find((opt) => (typeof opt === "string" ? opt : opt.value) === value) : null) ||
           placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const label = typeof option === "string" ? option : option.label;
                const val = typeof option === "string" ? option : option.value;

                return (
                  <CommandItem
                    key={val}
                    value={label}
                    onSelect={() => {
                      onSelect(val);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === val ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const roleOptions = [
  { label: "Doctor", value: "doctor" },
  { label: "Receptionist", value: "receptionist" },
  { label: "Admin", value: "admin" },
];

const designationOptions = [
  "Senior Consultant",
  "Junior Consultant",
  "Resident Doctor",
  "Staff Nurse",
  "Head Nurse",
  "Medical Officer",
  "Accountant",
  "HR Manager",
];

const roleColors = {
  admin: "bg-violet-100 text-violet-700",
  receptionist: "bg-cyan-100 text-cyan-700",
  doctor: "bg-teal-100 text-teal-700",
};

export default function Staff() {
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", role: "doctor", designation: "", phone: "", doctor_fee: "", photo_url: "", password: "", password2: "" });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("doctor");
  const [inviting, setInviting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortField, setSortField] = useState("full_name");
  const [sortOrder, setSortOrder] = useState("asc");

  const queryClient = useQueryClient();
  const { can } = usePermission();
  const { toast } = useToast();
  const generatePassword = () => {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%^&*";
    const all = upper + lower + digits + symbols;
    const pick = (pool, n) => Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)]).join("");
    let pwd = pick(upper, 2) + pick(lower, 4) + pick(digits, 3) + pick(symbols, 1);
    for (let i = pwd.length; i < 12; i++) pwd += all[Math.floor(Math.random() * all.length)];
    pwd = pwd.split("").sort(() => Math.random() - 0.5).join("");
    return pwd;
  };

  const { data: rolesMaster = [] } = useQuery({
    queryKey: ["masters", "staff_role"],
    queryFn: () => base44.entities.Master.filter({ type: "staff_role" }),
  });

  const { data: designationsMaster = [] } = useQuery({
    queryKey: ["masters", "staff_designation"],
    queryFn: () => base44.entities.Master.filter({ type: "staff_designation" }),
  });

  const finalRoleOptions = rolesMaster.length > 0 
    ? rolesMaster.map(r => ({ label: r.name, value: r.name.toLowerCase() }))
    : roleOptions;

  const finalDesignationOptions = designationsMaster.length > 0
    ? designationsMaster.map(d => d.name)
    : designationOptions;

  const handlePhotoUpload = (e, isEdit = false) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isEdit) {
          setEditUser({ ...editUser, photo_url: reader.result });
        } else {
          setAddForm({ ...addForm, photo_url: reader.result });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditModalOpen(false);
      toast({ title: "Success", description: "Staff details updated" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Success", description: "Staff member removed" });
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(deleteConfirmId);
        return next;
      });
      setDeleteConfirmId(null);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.User.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Success", description: `${selectedIds.size} staff members removed` });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.User.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setAddOpen(false);
      setAddForm({ name: "", email: "", role: "doctor", designation: "", phone: "", doctor_fee: "", photo_url: "", password: "", password2: "" });
      toast({ title: "Success", description: "Staff member added" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleInvite = async () => {
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail, inviteRole === "admin" ? "admin" : "user");
      toast({ title: "Success", description: `Invite sent to ${inviteEmail}` });
      setInviteOpen(false);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = users.filter((u) =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.phone?.includes(search)
    );

    result.sort((a, b) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [users, search, sortField, sortOrder]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAndSorted.length / pageSize);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(paginated.map(u => u.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canView = can("Staff", "view");
  const canEdit = can("Staff", "edit");
  const canAdd = can("Staff", "add");
  const canPasswordAdd = can("Staff.Password", "add");
  const canPasswordEdit = can("Staff.Password", "edit");
  const canDelete = can("Staff", "delete");

  if (!canView) return <div className="p-8 text-center text-slate-500">Access Denied</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Management"
        description={`${users.length} staff members`}
        actions={
          canAdd && (
            <div className="flex gap-2">
              <Button onClick={() => setAddOpen(true)} className="bg-cyan-600 hover:bg-cyan-700">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Staff
              </Button>
              <Button variant="outline" onClick={() => setInviteOpen(true)}>
                <Mail className="w-4 h-4 mr-2" />
                Invite
              </Button>
            </div>
          )
        }
      />

      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search staff..." 
              value={search} 
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} 
              className="pl-10 h-9" 
            />
          </div>
          
          {selectedIds.size > 0 && canDelete && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
              <span className="text-xs font-medium text-slate-500">{selectedIds.size} selected</span>
              <Button 
                variant="destructive" 
                size="sm" 
                className="h-8"
                onClick={() => setBulkDeleteConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Bulk Delete
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-400">No staff members found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="w-12">
                      <Checkbox 
                        checked={paginated.length > 0 && paginated.every(u => selectedIds.has(u.id))}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("full_name")}>
                      <div className="flex items-center gap-1">Staff Member <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Role</TableHead>
                    <TableHead className="hidden md:table-cell">Designation</TableHead>
                    <TableHead className="w-32 text-right px-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((u, idx) => (
                    <TableRow key={u.id} className={cn("hover:bg-slate-50/50 transition-colors", selectedIds.has(u.id) && "bg-cyan-50/30")}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedIds.has(u.id)}
                          onCheckedChange={() => toggleSelect(u.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-400 text-center">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {u.photo_url ? (
                            <img src={u.photo_url} alt={u.full_name || u.name} className="h-8 w-8 rounded-full object-cover border border-slate-200 shadow-sm" />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                              {(u.full_name || u.name || "?")[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-700 text-sm truncate">{u.full_name || u.name || "Pending"}</p>
                            <p className="text-[10px] text-slate-400 truncate">{u.email || "-"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge className={cn("text-[10px] font-bold uppercase border-0", roleColors[u.role] || "bg-slate-100 text-slate-600")}>
                          {u.role || "user"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-500">{u.designation || "-"}</TableCell>
                      <TableCell className="text-right px-6">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" title="View" onClick={() => { setViewUser(u); setViewModalOpen(true); }}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEdit && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-cyan-600" title="Edit" onClick={() => { setEditUser(u); setEditModalOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Delete" onClick={() => setDeleteConfirmId(u.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium">
                Showing {Math.min(filteredAndSorted.length, (currentPage - 1) * pageSize + 1)} to {Math.min(filteredAndSorted.length, currentPage * pageSize)} of {filteredAndSorted.length} entries
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, i) => (
                    <Button
                      key={i}
                      variant={currentPage === i + 1 ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCurrentPage(i + 1)}
                      className={cn("h-8 w-8 p-0 text-xs", currentPage === i + 1 && "bg-cyan-600 hover:bg-cyan-700")}
                    >
                      {i + 1}
                    </Button>
                  )).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* View User Modal */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Staff Details</DialogTitle>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-4">
                {viewUser.photo_url ? (
                  <img src={viewUser.photo_url} alt={viewUser.full_name} className="h-16 w-16 rounded-full object-cover border-2 border-cyan-100" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-xl font-bold">
                    {(viewUser.full_name || viewUser.name || "?")[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{viewUser.full_name || viewUser.name || "N/A"}</h3>
                  <Badge className={`${roleColors[viewUser.role] || "bg-slate-100 text-slate-600"} text-xs border-0 capitalize`}>
                    {viewUser.role}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div>
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Designation</p>
                  <p className="text-slate-700 mt-1">{viewUser.designation || "-"}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Phone</p>
                  <p className="text-slate-700 mt-1">{viewUser.phone || "-"}</p>
                </div>
                {viewUser.role === "doctor" && (
                  <div className="col-span-2">
                    <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Doctor Fee</p>
                    <p className="text-slate-700 mt-1">₹{Number(viewUser.doctor_fee || 0).toFixed(2)}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Email Address</p>
                  <p className="text-slate-700 mt-1 flex items-center gap-2">
                    <Mail className="w-3 h-3 text-slate-400" />
                    {viewUser.email || "-"}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" className="w-full" onClick={() => setViewModalOpen(false)}>Close</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div>
                <Label>Role *</Label>
                <SearchableSelect
                  options={finalRoleOptions}
                  value={editUser.role}
                  onSelect={(v) => setEditUser({ ...editUser, role: v, doctor_fee: v === "doctor" ? (editUser.doctor_fee || "") : "" })}
                  placeholder="Select role"
                />
              </div>
              {editUser.role === "doctor" && (
                <div>
                  <Label>Doctor Fee</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editUser.doctor_fee ?? ""}
                    onChange={(e) => setEditUser({ ...editUser, doctor_fee: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              )}
              <div>
                <Label>Designation</Label>
                <SearchableSelect
                  options={finalDesignationOptions}
                  value={editUser.designation}
                  onSelect={(v) => setEditUser({ ...editUser, designation: v })}
                  placeholder="Select designation"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={editUser.phone || ""} onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })} />
              </div>
              <div>
                <Label>Photo</Label>
                <div className="flex items-center gap-3 mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => document.getElementById("edit-photo-upload").click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload from device
                  </Button>
                  <input
                    id="edit-photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e, true)}
                  />
                </div>
              </div>
              {editUser.photo_url && (
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  <img src={editUser.photo_url} alt="Preview" className="h-10 w-10 rounded-full object-cover border" />
                </div>
              )}
              {canPasswordEdit && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Set New Password</Label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="Leave blank to keep current"
                        value={editUser.new_password || ""}
                        onChange={(e) => setEditUser({ ...editUser, new_password: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const p = generatePassword();
                          setEditUser({ ...editUser, new_password: p, new_password2: p });
                          toast({ title: "Password generated", description: "A strong password has been filled for you" });
                        }}
                      >
                        Generate
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          if (editUser.new_password) {
                            try {
                              await navigator.clipboard.writeText(editUser.new_password);
                              toast({ title: "Copied", description: "Password copied to clipboard" });
                            } catch {}
                          }
                        }}
                        disabled={!editUser.new_password}
                      >
                        <Copy className="w-4 h-4 mr-2" /> Copy
                      </Button>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label>Confirm New Password</Label>
                    <Input
                      type="password"
                      placeholder="Confirm new password"
                      value={editUser.new_password2 || ""}
                      onChange={(e) => setEditUser({ ...editUser, new_password2: e.target.value })}
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
                <Button
                  className="bg-cyan-600 hover:bg-cyan-700"
                  onClick={() => updateMut.mutate({
                    id: editUser.id,
                    data: { 
                      role: editUser.role, 
                      designation: editUser.designation, 
                      phone: editUser.phone, 
                      doctor_fee: editUser.role === "doctor" ? editUser.doctor_fee : null, 
                      photo_url: editUser.photo_url,
                      ...(editUser.new_password && editUser.new_password === editUser.new_password2 ? { password: editUser.new_password } : {})
                    }
                  })}
                  disabled={!editUser.role || (editUser.new_password && editUser.new_password !== editUser.new_password2)}
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite Modal */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Staff Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email *</Label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="staff@hospital.com" />
            </div>
            <div>
              <Label>Role *</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Super Admin</SelectItem>
                  <SelectItem value="receptionist">Receptionist</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-400">An invitation email will be sent to the staff member. After they sign up, you can set their role and details.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleInvite} disabled={!inviteEmail || inviting}>
                {inviting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Mail className="w-4 h-4 mr-2" /> Send Invite
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Staff Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Full name" required />
              </div>
              <div className="col-span-2">
                <Label>Email</Label>
                <Input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="staff@hospital.com" />
              </div>
              <div className="col-span-2">
                <Label>Role *</Label>
                <SearchableSelect
                  options={finalRoleOptions}
                  value={addForm.role}
                  onSelect={(v) => setAddForm({ ...addForm, role: v, doctor_fee: v === "doctor" ? (addForm.doctor_fee || "") : "" })}
                  placeholder="Select role"
                />
              </div>
              {addForm.role === "doctor" && (
                <div className="col-span-2">
                  <Label>Doctor Fee</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={addForm.doctor_fee}
                    onChange={(e) => setAddForm({ ...addForm, doctor_fee: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              )}
              <div className="col-span-2">
                <Label>Designation</Label>
                <SearchableSelect
                  options={finalDesignationOptions}
                  value={addForm.designation}
                  onSelect={(v) => setAddForm({ ...addForm, designation: v })}
                  placeholder="Select designation"
                />
              </div>
              <div className="col-span-2">
                <Label>Phone</Label>
                <Input value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} placeholder="e.g. 9876543210" />
              </div>
              <div className="col-span-2">
                <Label>Photo</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => document.getElementById("add-photo-upload").click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload
                  </Button>
                  <input
                    id="add-photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e)}
                  />
                </div>
              </div>
            </div>
            {addForm.photo_url && (
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <img src={addForm.photo_url} alt="Preview" className="h-10 w-10 rounded-full object-cover border" />
              </div>
            )}
            {canPasswordAdd && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Password</Label>
                  <div className="flex gap-2">
                    <Input 
                      type="password" 
                      value={addForm.password || ""} 
                      onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} 
                      placeholder="Optional; random if left blank" 
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const p = generatePassword();
                        setAddForm({ ...addForm, password: p, password2: p });
                        toast({ title: "Password generated", description: "A strong password has been filled for you" });
                      }}
                    >
                      Generate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        if (addForm.password) {
                          try {
                            await navigator.clipboard.writeText(addForm.password);
                            toast({ title: "Copied", description: "Password copied to clipboard" });
                          } catch {}
                        }
                      }}
                      disabled={!addForm.password}
                    >
                      <Copy className="w-4 h-4 mr-2" /> Copy
                    </Button>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>Confirm Password</Label>
                  <Input 
                    type="password" 
                    value={addForm.password2 || ""} 
                    onChange={(e) => setAddForm({ ...addForm, password2: e.target.value })} 
                    placeholder="Confirm password" 
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button
                className="bg-cyan-600 hover:bg-cyan-700"
                onClick={() => {
                  const payload = { ...addForm };
                  if (!payload.password) delete payload.password;
                  delete payload.password2;
                  createMut.mutate(payload);
                }}
                disabled={!addForm.name || !addForm.role || (addForm.password && addForm.password !== addForm.password2)}
              >
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently remove the staff member from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMut.mutate(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Staff
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedIds.size} staff members?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove all selected staff members? This action is permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => bulkDeleteMut.mutate([...selectedIds])}
              className="bg-red-600 hover:bg-red-700"
            >
              Confirm Bulk Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
