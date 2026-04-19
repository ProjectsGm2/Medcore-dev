import React, { useMemo, useState } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Loader2, Database, Users, Pill, Truck, Search, Boxes, Building2, X } from "lucide-react";
import SupplierFormModal from "@/components/dispensary/SupplierFormModal";
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

const MASTER_TYPES = {
  MEDICINE: [
    { label: "Category", type: "medicine_category", description: "Used for medicine classification" },
    { label: "Group", type: "medicine_group", description: "Broad therapeutic grouping" },
    { label: "Unit", type: "medicine_unit", description: "Packaging or dispensing unit" },
    { label: "Manufacturer", type: "medicine_manufacturer", description: "Drug manufacturer names" },
  ],
  SERVICES: [
    { label: "Service", type: "service", description: "Chargeable OPD and billing services" },
  ],
  STAFF: [
    { label: "Role", type: "staff_role", description: "Access and responsibility groups" },
    { label: "Designation", type: "staff_designation", description: "Job titles used across staff records" },
  ]
};

function MasterSection({ title, type, description, queryClient, searchTerm = "" }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const { can } = usePermission();
  const { toast } = useToast();
  const isServiceType = type === "service";

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["masters", type],
    queryFn: () => base44.entities.Master.filter({ type }),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Master.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masters", type] });
      setName("");
      setPrice("");
      toast({ title: "Success", description: `${title} added successfully` });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Master.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masters", type] });
      toast({ title: "Success", description: `${title} deleted successfully` });
      setDeleteConfirmId(null);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
  const filteredItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    if (!normalizedSearch) return sorted;
    return sorted.filter((item) =>
      String(item.name || "").toLowerCase().includes(normalizedSearch) ||
      (isServiceType && String(item.price ?? "").toLowerCase().includes(normalizedSearch))
    );
  }, [items, normalizedSearch, isServiceType]);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isServiceType && (price === "" || Number(price) < 0)) return;
    if (!can("Master", "add")) {
      toast({ title: "Denied", description: "You don't have permission to add master data", variant: "destructive" });
      return;
    }
    createMut.mutate({
      type,
      name: name.trim(),
      ...(isServiceType ? { price: Number(price) || 0 } : {}),
    });
  };

  const handleDelete = (id) => {
    if (!can("Master", "delete")) {
      toast({ title: "Denied", description: "You don't have permission to delete master data", variant: "destructive" });
      return;
    }
    setDeleteConfirmId(id);
  };

  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base text-slate-800">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {filteredItems.length}{filteredItems.length !== items.length ? ` / ${items.length}` : ""}
          </Badge>
        </div>

        {can("Master", "add") && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              placeholder={isServiceType ? "Service name" : `Add new ${title.toLowerCase()}...`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
            {isServiceType && (
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-9 w-28 shrink-0"
              />
            )}
            <Button type="submit" size="sm" disabled={createMut.isPending} className="bg-cyan-600 hover:bg-cyan-700 shrink-0">
              {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </form>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="rounded-lg border border-slate-200 bg-slate-50/50">
          {isLoading ? (
            <div className="py-10">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No entries yet</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No matching entries</div>
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="divide-y divide-slate-200">
                {filteredItems.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/80 transition-colors">
                    <div className="w-7 shrink-0 text-xs font-semibold text-slate-400">{String(index + 1).padStart(2, "0")}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-700">{item.name}</div>
                      {isServiceType && (
                        <div className="text-xs text-slate-500">Price: ₹{Number(item.price || 0).toFixed(2)}</div>
                      )}
                    </div>
                    {can("Master", "delete") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-500"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will permanently delete this {title.toLowerCase()} entry.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMut.mutate(deleteConfirmId)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export default function Master() {
  const queryClient = useQueryClient();
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierDeleteId, setSupplierDeleteId] = useState(null);
  const [search, setSearch] = useState("");
  const { can } = usePermission();
  const { toast } = useToast();

  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("name", 500),
  });

  const deleteSupplierMut = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Success", description: "Supplier deleted successfully" });
      setSupplierDeleteId(null);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const normalizedSearch = String(search || "").trim().toLowerCase();
  const filteredSuppliers = useMemo(() => {
    const sorted = [...suppliers].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    if (!normalizedSearch) return sorted;
    return sorted.filter((supplier) =>
      [
        supplier.name,
        supplier.email,
        supplier.phone,
        supplier.drug_license_number,
        supplier.poc_name,
        supplier.address,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch))
    );
  }, [suppliers, normalizedSearch]);

  if (!can("Master", "view")) {
    return <div className="p-8 text-center text-slate-500 font-medium">Access Denied</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader 
        title="Master Data Management" 
        description="Configure reference data used in dropdowns across the system"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">Better list management</div>
              <div className="text-sm text-slate-500">Search once and narrow down master entries across the current tab.</div>
            </div>
            <div className="relative w-full md:w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search names, suppliers, phone..."
                className="h-10 pl-9 pr-9"
              />
              {search && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-400"
                  onClick={() => setSearch("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-cyan-50 p-2 text-cyan-700"><Pill className="w-4 h-4" /></div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Medicine</div>
                <div className="text-sm font-semibold text-slate-800">{MASTER_TYPES.MEDICINE.length} Lists</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Database className="w-4 h-4" /></div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Services</div>
                <div className="text-sm font-semibold text-slate-800">{MASTER_TYPES.SERVICES.length} List</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-700"><Users className="w-4 h-4" /></div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Staff</div>
                <div className="text-sm font-semibold text-slate-800">{MASTER_TYPES.STAFF.length} Lists</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="medicine" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 md:grid-cols-4">
          <TabsTrigger value="medicine" className="gap-2"><Pill className="w-4 h-4" /> Medicine</TabsTrigger>
          <TabsTrigger value="services" className="gap-2"><Database className="w-4 h-4" /> Services</TabsTrigger>
          <TabsTrigger value="grn" className="gap-2"><Truck className="w-4 h-4" /> GRN</TabsTrigger>
          <TabsTrigger value="staff" className="gap-2"><Users className="w-4 h-4" /> Staff</TabsTrigger>
        </TabsList>

        <TabsContent value="medicine" className="mt-6 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <div className="text-sm font-semibold text-slate-800">Medicine masters</div>
              <div className="text-sm text-slate-500">Manage the most-used medicine reference lists without leaving the page.</div>
            </div>
            <Badge variant="outline" className="gap-1 text-slate-600"><Boxes className="w-3.5 h-3.5" /> {MASTER_TYPES.MEDICINE.length} sections</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {MASTER_TYPES.MEDICINE.map((m) => (
              <MasterSection key={m.type} title={m.label} type={m.type} description={m.description} queryClient={queryClient} searchTerm={search} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="services" className="mt-6 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <div className="text-sm font-semibold text-slate-800">Service masters</div>
              <div className="text-sm text-slate-500">Keep service names easier to maintain as the billing catalogue grows.</div>
            </div>
            <Badge variant="outline" className="text-slate-600">Search active</Badge>
          </div>
          <div className="max-w-2xl">
            {MASTER_TYPES.SERVICES.map((m) => (
              <MasterSection
                key={m.type}
                title={`${m.label} Name`}
                type={m.type}
                description={m.description}
                queryClient={queryClient}
                searchTerm={search}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="grn" className="mt-6 space-y-6">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  Suppliers
                </CardTitle>
                <CardDescription>Manage a larger supplier directory with search and a denser table layout.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {filteredSuppliers.length}{filteredSuppliers.length !== suppliers.length ? ` / ${suppliers.length}` : ""}
                </Badge>
                {can("Master", "edit") && (
                  <Button onClick={() => setSupplierModalOpen(true)} className="bg-cyan-600 hover:bg-cyan-700 gap-2">
                    <Plus className="w-4 h-4" /> Add Supplier
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="text-xs uppercase font-bold">Supplier Name</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Email</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Phone</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Drug License</TableHead>
                  <TableHead className="text-xs uppercase font-bold">POC Name</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Address</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliersLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-600" /></TableCell>
                  </TableRow>
                ) : suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400">No suppliers found</TableCell>
                  </TableRow>
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400">No suppliers match the current search</TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((s) => (
                    <TableRow key={s.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="text-sm font-medium text-slate-700">{s.name}</TableCell>
                      <TableCell className="text-sm text-slate-500">{s.email || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-500">{s.phone || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-500">{s.drug_license_number || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-500">{s.poc_name || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-500 truncate max-w-[200px]">{s.address || "—"}</TableCell>
                      <TableCell>
                        {can("Master", "delete") && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-slate-300 hover:text-red-500"
                            onClick={() => setSupplierDeleteId(s.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-6 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <div className="text-sm font-semibold text-slate-800">Staff masters</div>
              <div className="text-sm text-slate-500">Quickly maintain the lists used for roles and designations.</div>
            </div>
            <Badge variant="outline" className="text-slate-600">Search active</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
            {MASTER_TYPES.STAFF.map((m) => (
              <MasterSection key={m.type} title={m.label} type={m.type} description={m.description} queryClient={queryClient} searchTerm={search} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <SupplierFormModal 
        open={supplierModalOpen} 
        onOpenChange={setSupplierModalOpen}
        onSave={async (data) => {
          await base44.entities.Supplier.create(data);
          queryClient.invalidateQueries({ queryKey: ["suppliers"] });
          toast({ title: "Success", description: "Supplier added successfully" });
        }}
      />

      <AlertDialog open={!!supplierDeleteId} onOpenChange={(o) => !o && setSupplierDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete this supplier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteSupplierMut.mutate(supplierDeleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
