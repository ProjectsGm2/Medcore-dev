import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/apiClient";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Eye, ShoppingCart, ArrowUpDown, ChevronLeft, ChevronRight, Pencil, Trash2, Printer } from "lucide-react";
import { format } from "date-fns";
import SaleFormModal from "@/components/dispensary/SaleFormModal";
import BillDetailModal from "@/components/dispensary/BillDetailModal";
import { cn } from "@/lib/utils";
import { useAuth, usePermission } from "@/lib/AuthContext";
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

function shortId(id) {
  if (!id) return "-";
  return String(id).replace(/-/g, "").slice(0, 8);
}

function safeLower(s) {
  return String(s || "").toLowerCase();
}

export default function Bills() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [viewBillId, setViewBillId] = useState(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortField, setSortField] = useState("created_date");
  const [sortOrder, setSortOrder] = useState("desc");

  const { user } = useAuth();
  const { can } = usePermission();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canView = can("Dispensary", "view");
  const canAdd = can("Dispensary", "add");
  const canEdit = can("Dispensary", "edit");
  const canDelete = can("Dispensary", "delete");

  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ["sales-bills"],
    queryFn: () => base44.dispensary.salesBills(1000),
    enabled: canView,
  });

  const { data: billLines = [], isLoading: linesLoading } = useQuery({
    queryKey: ["sales-bill-lines"],
    queryFn: () => base44.dispensary.salesBillLines(5000),
    enabled: canView,
  });

  const { data: medicines = [], isLoading: medicinesLoading } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => base44.entities.Medicine.list("-created_date", 1000),
    enabled: billModalOpen && canView,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["medicine-categories"],
    queryFn: () => base44.dispensary.medicineCategories(),
    enabled: billModalOpen && canView,
  });

  const { data: editingBill = null, isLoading: editingBillLoading } = useQuery({
    queryKey: ["bill-detail", editingBillId],
    queryFn: () => (editingBillId ? base44.dispensary.salesBillGet(editingBillId) : Promise.resolve(null)),
    enabled: billModalOpen && !!editingBillId,
  });

  const flagsByBill = useMemo(() => {
    const map = {};
    for (const L of billLines || []) {
      const billId = L.bill_id;
      if (!billId) continue;
      if (!map[billId]) map[billId] = { hasMedicine: false, hasService: false, lines: 0 };
      map[billId].lines += 1;
      if (L.item_type === "service") map[billId].hasService = true;
      if (L.item_type === "medicine") map[billId].hasMedicine = true;
      if (!L.item_type && L.medicine_id) map[billId].hasMedicine = true;
    }
    return map;
  }, [billLines]);

  const getSource = (bill) => {
    if (bill?.prescription_id) return "OPD";
    const flags = flagsByBill[bill?.id] || null;
    if (flags?.hasService) return "Bill";
    return "Pharmacy";
  };

  const filteredSorted = useMemo(() => {
    let list = Array.isArray(bills) ? [...bills] : [];
    if (source !== "all") {
      list = list.filter((b) => getSource(b) === source);
    }
    if (search.trim()) {
      const s = safeLower(search.trim());
      list = list.filter((b) => {
        return (
          safeLower(b.id).includes(s) ||
          safeLower(shortId(b.id)).includes(s) ||
          safeLower(b.patient_name).includes(s) ||
          safeLower(b.doctor_name).includes(s) ||
          safeLower(b.attendee_name).includes(s) ||
          safeLower(b.generated_by_name).includes(s)
        );
      });
    }
    list.sort((a, b) => {
      const aVal = a?.[sortField];
      const bVal = b?.[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortOrder === "asc" ? -1 : 1;
      if (bVal == null) return sortOrder === "asc" ? 1 : -1;
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [bills, source, search, sortField, sortOrder, flagsByBill]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSorted.slice(start, start + pageSize);
  }, [filteredSorted, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize));

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const saleMut = useMutation({
    mutationFn: (data) => base44.dispensary.salesBillCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-bills"] });
      queryClient.invalidateQueries({ queryKey: ["sales-bill-lines"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      toast({ title: "Success", description: "Bill generated successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.dispensary.salesBillUpdate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-bills"] });
      queryClient.invalidateQueries({ queryKey: ["sales-bill-lines"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      toast({ title: "Success", description: "Bill updated successfully" });
      setEditingBillId(null);
      setBillModalOpen(false);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.dispensary.salesBillDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-bills"] });
      queryClient.invalidateQueries({ queryKey: ["sales-bill-lines"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      toast({ title: "Success", description: "Bill deleted successfully" });
      setDeleteConfirmId(null);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!canView) return <div className="p-8 text-center text-slate-500">Access Denied</div>;

  const loading = billsLoading || linesLoading;
  const modalBusy = medicinesLoading || (editingBillId ? editingBillLoading : false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bills"
        description="All bills generated from OPD, Pharmacy, and Billing"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {canAdd && (
              <Button
                onClick={() => {
                  setEditingBillId(null);
                  setBillModalOpen(true);
                }}
                className="bg-cyan-600 hover:bg-cyan-700 gap-2"
              >
                <ShoppingCart className="w-4 h-4" /> Generate Bill
              </Button>
            )}
          </div>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative flex-1 max-w-sm">
            <Input
              placeholder="Search bills (patient/doctor/id)…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={source}
              onValueChange={(v) => {
                setSource(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="OPD">OPD</SelectItem>
                <SelectItem value="Pharmacy">Pharmacy</SelectItem>
                <SelectItem value="Bill">Bill</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
          </div>
        ) : filteredSorted.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-400">No bills found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("created_date")}>
                      <div className="flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead className="hidden md:table-cell">Doctor</TableHead>
                    <TableHead className="hidden md:table-cell">Staff</TableHead>
                    <TableHead className="hidden md:table-cell">Source</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("net_total")}>
                      <div className="flex items-center justify-end gap-1">Net <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="w-40 text-right px-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((b) => {
                    const src = getSource(b);
                    const flags = flagsByBill[b.id] || null;
                    return (
                      <TableRow key={b.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="text-sm text-slate-600">
                          {b.created_date ? format(new Date(b.created_date), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-slate-700">
                          {shortId(b.id)}
                          {flags?.lines ? (
                            <span className="text-xs text-slate-400 ml-2">{flags.lines} line(s)</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">{b.patient_name || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-slate-600">{b.doctor_name || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-slate-600">{b.generated_by_name || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-xs border",
                              src === "OPD" && "bg-violet-50 text-violet-700 border-violet-200",
                              src === "Pharmacy" && "bg-cyan-50 text-cyan-700 border-cyan-200",
                              src === "Bill" && "bg-emerald-50 text-emerald-700 border-emerald-200"
                            )}
                          >
                            {src}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium text-slate-700">
                          ₹{Number(b.net_total || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-slate-600"
                              title="View"
                              onClick={() => {
                                setAutoPrint(false);
                                setViewBillId(b.id);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-slate-600"
                              title="Print"
                              onClick={() => {
                                setAutoPrint(true);
                                setViewBillId(b.id);
                              }}
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                            {canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-cyan-700"
                                title="Edit"
                                onClick={() => {
                                  setEditingBillId(b.id);
                                  setBillModalOpen(true);
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
                                title="Delete"
                                onClick={() => setDeleteConfirmId(b.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium">
                Showing {Math.min(filteredSorted.length, (currentPage - 1) * pageSize + 1)} to{" "}
                {Math.min(filteredSorted.length, currentPage * pageSize)} of {filteredSorted.length} entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)]
                    .map((_, i) => (
                      <Button
                        key={i}
                        variant={currentPage === i + 1 ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setCurrentPage(i + 1)}
                        className={cn(
                          "h-8 w-8 p-0 text-xs",
                          currentPage === i + 1 && "bg-cyan-600 hover:bg-cyan-700"
                        )}
                      >
                        {i + 1}
                      </Button>
                    ))
                    .slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <SaleFormModal
        open={billModalOpen}
        onOpenChange={(o) => {
          setBillModalOpen(o);
          if (!o) setEditingBillId(null);
        }}
        medicines={medicines}
        categories={categories}
        currentUser={user}
        onSave={(data) => saleMut.mutateAsync(data)}
        onUpdate={(id, data) => updateMut.mutateAsync({ id, data })}
        bill={editingBillId ? editingBill : null}
      />

      <BillDetailModal
        open={!!viewBillId}
        onOpenChange={(o) => {
          if (!o) setViewBillId(null);
        }}
        billId={viewBillId}
        autoPrint={autoPrint}
      />

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the bill and restore consumed stock back to inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMut.mutate(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {modalBusy ? (
        <div className="hidden" aria-hidden>
          {String(modalBusy)}
        </div>
      ) : null}
    </div>
  );
}

