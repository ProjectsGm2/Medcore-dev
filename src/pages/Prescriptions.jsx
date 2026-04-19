import React, { useMemo, useState } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Eye, Loader2, Printer, Trash2, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import BillDetailModal from "@/components/dispensary/BillDetailModal";
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

function shortId(id) {
  if (!id) return "-";
  const hex = String(id).replace(/-/g, "");
  let n = BigInt("0x" + hex);
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  if (n === 0n) return "0";
  let out = "";
  while (n > 0n) {
    out = alphabet[Number(n % 36n)] + out;
    n = n / 36n;
  }
  return out.slice(0, 8);
}

export default function Prescriptions() {
  const [search, setSearch] = useState("");
  const [viewBillId, setViewBillId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortField, setSortField] = useState("created_date");
  const [sortOrder, setSortOrder] = useState("desc");

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermission();
  const { toast } = useToast();

  const { data: prescriptions = [], isLoading: rxLoading } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => base44.entities.Prescription.list("-created_date", 1000),
  });
  
  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ["sales-bills"],
    queryFn: () => base44.dispensary.salesBills(500),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Prescription.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      toast({ title: "Success", description: "Prescription deleted successfully" });
      setDeleteConfirmId(null);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const merged = useMemo(() => {
    const mapPrescriptions = prescriptions.map((r) => ({ ...r, _kind: "rx" }));
    const mapBills = bills.map((b) => ({
      id: b.id,
      bill_number: shortId(b.id),
      patient_name: b.patient_name || "",
      doctor_name: b.doctor_name || "",
      diagnosis: "Dispensary Bill",
      medicines: b.items || [],
      created_date: b.created_date,
      _kind: "bill",
    }));
    return [...mapPrescriptions, ...mapBills];
  }, [prescriptions, bills]);

  const filteredAndSorted = useMemo(() => {
    let list = merged;
    if (user?.role === "doctor") {
      list = list.filter((r) => r.doctor_id === user?.id || r.doctor_name?.includes(user?.full_name || ""));
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((r) =>
        r.patient_name?.toLowerCase().includes(s) ||
        r.diagnosis?.toLowerCase().includes(s) ||
        r.doctor_name?.toLowerCase().includes(s) ||
        (r.rx_code || "").toLowerCase().includes(s)
      );
    }

    list.sort((a, b) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [merged, user, search, sortField, sortOrder]);

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

  const canView = can("OPD", "view") || can("Dispensary", "view");
  const canDelete = can("OPD", "delete");

  if (!canView) return <div className="p-8 text-center text-slate-500">Access Denied</div>;

  const isLoading = rxLoading || billsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prescriptions & Bills"
        description={user?.role === "doctor" ? "Your clinical history" : `${filteredAndSorted.length} total records`}
      />

      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search by patient, doctor, or diagnosis..." 
              value={search} 
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} 
              className="pl-10 h-9" 
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-400">No records found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("rx_code")}>
                      <div className="flex items-center gap-1">Code/Bill # <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("patient_name")}>
                      <div className="flex items-center gap-1">Patient <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("doctor_name")}>
                      <div className="flex items-center gap-1">Doctor <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead className="hidden md:table-cell">Medicines</TableHead>
                    <TableHead className="hidden md:table-cell cursor-pointer" onClick={() => toggleSort("created_date")}>
                      <div className="flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="w-32 text-right px-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((rx, idx) => (
                    <TableRow key={rx.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="text-xs font-medium text-slate-400 text-center">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </TableCell>
                      <TableCell className="text-sm font-mono text-slate-600">
                        {rx._kind === "bill" ? rx.bill_number : (rx.rx_code || "-")}
                        <Badge variant="outline" className={cn("ml-2 text-[10px] px-1.5 py-0", rx._kind === "rx" ? "text-cyan-600 border-cyan-200" : "text-amber-600 border-amber-200")}>
                          {rx._kind === "rx" ? "RX" : "BILL"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm text-slate-700">{rx.patient_name}</TableCell>
                      <TableCell className="text-sm text-slate-600">Dr. {rx.doctor_name}</TableCell>
                      <TableCell className="text-sm text-slate-600 max-w-[200px] truncate">{rx.diagnosis}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {rx.medicines?.slice(0, 2).map((m, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-none">{m.medicine_name}</Badge>
                          ))}
                          {(rx.medicines?.length || 0) > 2 && (
                            <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-none">+{rx.medicines.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-500">
                        {rx.created_date ? format(new Date(rx.created_date), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <div className="flex items-center justify-end gap-1">
                          {rx._kind === "rx" ? (
                            <>
                              <Link to={createPageUrl("PrescriptionDetail") + `?id=${rx.id}`}>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" title="View">
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </Link>
                              {canDelete && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Delete" onClick={() => setDeleteConfirmId(rx.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" title="View Bill" onClick={() => setViewBillId(rx.id)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" title="Print Bill" onClick={() => setViewBillId(rx.id)}>
                                <Printer className="w-4 h-4" />
                              </Button>
                            </>
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
                  {totalPages <= 5 ? (
                    [...Array(totalPages)].map((_, i) => (
                      <Button
                        key={i}
                        variant={currentPage === i + 1 ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setCurrentPage(i + 1)}
                        className={cn("h-8 w-8 p-0 text-xs", currentPage === i + 1 && "bg-cyan-600 hover:bg-cyan-700")}
                      >
                        {i + 1}
                      </Button>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 px-2">Page {currentPage} of {totalPages}</span>
                  )}
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

      <BillDetailModal 
        open={!!viewBillId} 
        onOpenChange={(o) => !o && setViewBillId(null)} 
        billId={viewBillId} 
      />

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete this prescription record.
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
    </div>
  );
}
