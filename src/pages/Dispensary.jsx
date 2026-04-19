import React, { useState, useMemo } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import MedicineFormModal from "@/components/dispensary/MedicineFormModal";
import SaleFormModal from "@/components/dispensary/SaleFormModal";
import GrnFormModal from "@/components/dispensary/GrnFormModal";
import SupplierFormModal from "@/components/dispensary/SupplierFormModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, AlertTriangle, Loader2, TrendingUp, ShoppingCart, Package, ClipboardList, Eye, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format, isBefore, addMonths } from "date-fns";
import { Link } from "react-router-dom";
import GrnDetailModal from "@/components/dispensary/GrnDetailModal";
import { usePermission, useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
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

export default function Dispensary() {
  const [search, setSearch] = useState("");
  const [dispensaryTab, setDispensaryTab] = useState("medicines");
  const [modalOpen, setModalOpen] = useState(false);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [grnOpen, setGrnOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [editMed, setEditMed] = useState(null);
  const [editGrnId, setEditGrnId] = useState(null);
  const [viewGrnId, setViewGrnId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteGrnConfirmId, setDeleteGrnConfirmId] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermission();
  const { toast } = useToast();

  const { data: medicines = [], isLoading } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => base44.entities.Medicine.list("-created_date", 1000),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("name", 500),
    enabled: dispensaryTab === "grn" || grnOpen || supplierOpen,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["medicine-categories"],
    queryFn: () => base44.dispensary.medicineCategories(),
    enabled: dispensaryTab === "grn" || grnOpen || saleModalOpen,
  });

  const { data: grnList = [], isLoading: grnLoading } = useQuery({
    queryKey: ["grn"],
    queryFn: () => base44.dispensary.grnList(100),
    enabled: dispensaryTab === "grn",
  });

  const { data: editGrnData = null } = useQuery({
    queryKey: ["grn-detail", editGrnId],
    queryFn: () => (editGrnId ? base44.dispensary.grnGet(editGrnId) : Promise.resolve(null)),
    enabled: !!editGrnId,
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Medicine.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["medicine-categories"] });
      toast({ title: "Success", description: "Medicine added successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Medicine.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["medicine-categories"] });
      toast({ title: "Success", description: "Medicine updated successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Medicine.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["medicine-categories"] });
      toast({ title: "Success", description: "Medicine deleted successfully" });
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
        await base44.entities.Medicine.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      toast({ title: "Success", description: `${selectedIds.size} medicines deleted successfully` });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const saleMut = useMutation({
    mutationFn: (data) => base44.dispensary.salesBillCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      toast({ title: "Success", description: "Bill generated successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const supplierCreateMut = useMutation({
    mutationFn: (data) => base44.entities.Supplier.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Success", description: "Supplier added successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const grnCreateMut = useMutation({
    mutationFn: (data) => base44.dispensary.grnCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grn"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      toast({ title: "Success", description: "GRN posted successfully" });
      setGrnOpen(false);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const grnUpdateMut = useMutation({
    mutationFn: ({ id, data }) => base44.dispensary.grnUpdate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grn"] });
      queryClient.invalidateQueries({ queryKey: ["grn-detail"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      toast({ title: "Success", description: "GRN updated successfully" });
      setEditGrnId(null);
      setGrnOpen(false);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const grnDeleteMut = useMutation({
    mutationFn: (id) => base44.dispensary.grnDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grn"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      toast({ title: "Success", description: "GRN deleted successfully" });
      setDeleteGrnConfirmId(null);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSave = async (data) => {
    if (editMed) {
      await updateMut.mutateAsync({ id: editMed.id, data });
    } else {
      await createMut.mutateAsync(data);
    }
  };

  const handleSaleSave = async (data) => {
    await saleMut.mutateAsync(data);
  };

  const handleGrnSave = async (data) => {
    if (editGrnId) {
      await grnUpdateMut.mutateAsync({ id: editGrnId, data });
    } else {
      await grnCreateMut.mutateAsync(data);
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = medicines;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((m) =>
        m.name?.toLowerCase().includes(s) ||
        m.category?.toLowerCase().includes(s) ||
        m.company?.toLowerCase().includes(s) ||
        (m.notes_description || m.description || "")?.toLowerCase().includes(s)
      );
    }

    result.sort((a, b) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [medicines, search, sortField, sortOrder]);

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
      setSelectedIds(new Set(paginated.map(m => m.id)));
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

  const isExpiringSoon = (date) => date && isBefore(new Date(date), addMonths(new Date(), 3));
  const isExpired = (date) => date && isBefore(new Date(date), new Date());
  
  const canView = can("Dispensary", "view");
  const canAdd = can("Dispensary", "add");
  const canEdit = can("Dispensary", "edit");
  const canDelete = can("Dispensary", "delete");

  const belowReorder = (m) => {
    const rl = Number(m.reorder_level);
    if (!rl) return false;
    return Number(m.stock || 0) <= rl;
  };

  if (!canView) return <div className="p-8 text-center text-slate-500">Access Denied</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispensary"
        description="Medicine master data, GRN purchase stock, and inventory"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/DispensaryAnalytics">
              <Button variant="outline" className="gap-2">
                <TrendingUp className="w-4 h-4" /> Sales Analytics
              </Button>
            </Link>
            {canAdd && dispensaryTab === "medicines" && (
              <>
                <Button variant="outline" onClick={() => setSaleModalOpen(true)} className="gap-2">
                  <ShoppingCart className="w-4 h-4" /> Generate Bill
                </Button>
                <Button onClick={() => { setEditMed(null); setModalOpen(true); }} className="bg-cyan-600 hover:bg-cyan-700">
                  <Plus className="w-4 h-4 mr-2" /> Add medicine
                </Button>
              </>
            )}
            {canAdd && dispensaryTab === "grn" && (
              <>
                <Button variant="outline" onClick={() => setSupplierOpen(true)} className="gap-2">
                  <Package className="w-4 h-4" /> New supplier
                </Button>
                <Button onClick={() => setGrnOpen(true)} className="bg-cyan-600 hover:bg-cyan-700 gap-2">
                  <ClipboardList className="w-4 h-4" /> New GRN
                </Button>
              </>
            )}
          </div>
        }
      />

      <Tabs value={dispensaryTab} onValueChange={(v) => { setDispensaryTab(v); setCurrentPage(1); }}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="medicines" className="gap-2">
            <Package className="w-4 h-4" /> Medicines
          </TabsTrigger>
          <TabsTrigger value="grn" className="gap-2">
            <ClipboardList className="w-4 h-4" /> GRN
          </TabsTrigger>
        </TabsList>

        <TabsContent value="medicines" className="mt-6 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search medicines..." 
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
                <p className="text-slate-400">No medicines found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead className="w-12">
                          <Checkbox 
                            checked={paginated.length > 0 && paginated.every(m => selectedIds.has(m.id))}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>
                          <div className="flex items-center gap-1">Medicine <ArrowUpDown className="w-3 h-3" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => toggleSort("stock")}>
                          <div className="flex items-center gap-1">Stock <ArrowUpDown className="w-3 h-3" /></div>
                        </TableHead>
                        <TableHead className="hidden md:table-cell cursor-pointer" onClick={() => toggleSort("category")}>
                          <div className="flex items-center gap-1">Category <ArrowUpDown className="w-3 h-3" /></div>
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">Company</TableHead>
                        <TableHead className="hidden md:table-cell cursor-pointer" onClick={() => toggleSort("expiry_date")}>
                          <div className="flex items-center gap-1">Expiry <ArrowUpDown className="w-3 h-3" /></div>
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">Sale price</TableHead>
                        <TableHead className="w-32 text-right px-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.map((m) => (
                        <TableRow key={m.id} className={cn("hover:bg-slate-50/50 transition-colors", selectedIds.has(m.id) && "bg-cyan-50/30")}>
                          <TableCell>
                            <Checkbox 
                              checked={selectedIds.has(m.id)}
                              onCheckedChange={() => toggleSelect(m.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm text-slate-700">{m.name}</p>
                              <p className="text-xs text-slate-400">{m.units || "—"}{m.rack_number ? ` · Rack ${m.rack_number}` : ""}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {(Number(m.stock || 0) < Number(m.min_level || 0) || belowReorder(m)) && (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              )}
                              <span className={`text-sm font-medium ${belowReorder(m) || Number(m.stock || 0) < Number(m.min_level || 0) ? "text-amber-600" : "text-slate-700"}`}>
                                {Number(m.stock || 0)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-slate-600">{m.category || "—"}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-slate-600">{m.company || "—"}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {m.expiry_date ? (
                              <span className={`text-sm ${isExpired(m.expiry_date) ? "text-red-600 font-medium" : isExpiringSoon(m.expiry_date) ? "text-amber-600" : "text-slate-600"}`}>
                                {format(new Date(m.expiry_date), "MMM d, yyyy")}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-slate-600">
                            ₹{Number(m.price || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-cyan-600" title="Edit master" onClick={() => { setEditMed(m); setModalOpen(true); }}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Delete" onClick={() => setDeleteConfirmId(m.id)}>
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
        </TabsContent>

        <TabsContent value="grn" className="mt-6">
          <div className="bg-white rounded-xl border border-slate-200/60 p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Recent GRNs</h3>
            {grnLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-cyan-600" /></div>
            ) : grnList.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No purchase receipts yet. Create a medicine first, then post a GRN.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Bill #</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="hidden md:table-cell">Lines</TableHead>
                      <TableHead className="w-32 text-right px-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grnList.map((g, idx) => (
                      <TableRow key={g.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="text-xs font-medium text-slate-400 text-center">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {g.created_date ? format(new Date(g.created_date), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-slate-700">{g.bill_number}</TableCell>
                        <TableCell className="text-sm text-slate-600">{g.supplier_name || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-slate-600">{g.line_count ?? "—"}</TableCell>
                        <TableCell className="text-right px-6">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600" title="View GRN" onClick={() => setViewGrnId(g.id)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            {canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-cyan-600"
                                title="Edit GRN"
                                onClick={() => {
                                  setEditGrnId(g.id);
                                  setGrnOpen(true);
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-600"
                                title="Delete GRN"
                                onClick={() => setDeleteGrnConfirmId(g.id)}
                              >
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
            )}
          </div>
        </TabsContent>
      </Tabs>

      <MedicineFormModal open={modalOpen} onOpenChange={setModalOpen} medicine={editMed} onSave={handleSave} />
      <SaleFormModal open={saleModalOpen} onOpenChange={setSaleModalOpen} medicines={medicines} categories={categories} currentUser={user} onSave={handleSaleSave} />
      <SupplierFormModal
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        onSave={(data) => supplierCreateMut.mutateAsync(data)}
      />
      <GrnFormModal
        open={grnOpen}
        onOpenChange={(open) => {
          setGrnOpen(open);
          if (!open) setEditGrnId(null);
        }}
        suppliers={suppliers}
        medicines={medicines}
        categories={categories}
        grn={editGrnData}
        onSave={handleGrnSave}
        onAddSupplier={() => setSupplierOpen(true)}
      />
      <GrnDetailModal open={!!viewGrnId} onOpenChange={(o) => { if (!o) setViewGrnId(null); }} grnId={viewGrnId} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the medicine record from the master database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMut.mutate(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Medicine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} medicines?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all selected medicine records? This action is permanent.
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

      <AlertDialog open={!!deleteGrnConfirmId} onOpenChange={(o) => !o && setDeleteGrnConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this GRN?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the GRN and reverses its stock impact. If any stock from this GRN has already been consumed, deletion will be blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => grnDeleteMut.mutate(deleteGrnConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete GRN
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
