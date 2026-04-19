import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import PatientFormModal from "@/components/patients/PatientFormModal";
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
import { UserPlus, Search, Pencil, Trash2, Eye, Loader2, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { usePermission } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import PatientDetailModal from "@/components/patients/PatientDetailModal";
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

export default function Patients() {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editPatient, setEditPatient] = useState(null);
  const [viewPatientId, setViewPatientId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  
  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortField, setSortField] = useState("created_date");
  const [sortOrder, setSortOrder] = useState("desc");

  const queryClient = useQueryClient();
  const { can } = usePermission();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  useEffect(() => {
    if (urlParams.get("action") === "new") setModalOpen(true);
  }, []);

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 1000),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Patient.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast({ title: "Success", description: "Patient registered successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Patient.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast({ title: "Success", description: "Patient updated successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Patient.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast({ title: "Success", description: "Patient deleted successfully" });
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
        await base44.entities.Patient.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast({ title: "Success", description: `${selectedIds.size} patients deleted successfully` });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSave = async (data) => {
    if (editPatient) {
      await updateMut.mutateAsync({ id: editPatient.id, data });
    } else {
      await createMut.mutateAsync(data);
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = patients.filter((p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.phone?.includes(search) ||
      p.id?.toLowerCase().includes(search.toLowerCase()) ||
      p.uhid?.toLowerCase().includes(search.toLowerCase())
    );

    result.sort((a, b) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [patients, search, sortField, sortOrder]);

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
      setSelectedIds(new Set(paginated.map(p => p.id)));
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

  const canView = can("Patients", "view");
  const canAdd = can("Patients", "add");
  const canEdit = can("Patients", "edit");
  const canDelete = can("Patients", "delete");

  if (!canView) return <div className="p-8 text-center text-slate-500">Access Denied</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        description={`${patients.length} registered patients`}
        actions={
          canAdd && (
            <Button onClick={() => { setEditPatient(null); setModalOpen(true); }} className="bg-cyan-600 hover:bg-cyan-700">
              <UserPlus className="w-4 h-4 mr-2" />
              Register Patient
            </Button>
          )
        }
      />

      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search by name, phone, UHID..." 
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
            <p className="text-slate-400">No patients found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="w-12">
                      <Checkbox 
                        checked={paginated.length > 0 && paginated.every(p => selectedIds.has(p.id))}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("uhid")}>
                      <div className="flex items-center gap-1">UHID <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>
                      <div className="flex items-center gap-1">Patient <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">DOB / Age</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden lg:table-cell">Blood Group</TableHead>
                    <TableHead className="w-32 text-right px-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((p, idx) => (
                    <TableRow key={p.id} className={cn("hover:bg-slate-50/50 transition-colors", selectedIds.has(p.id) && "bg-cyan-50/30")}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-400 text-center">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </TableCell>
                      <TableCell className="text-sm font-mono text-slate-700">{p.uhid || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-xs font-semibold shrink-0 shadow-sm">
                            {p.name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-700 text-sm">{p.name}</p>
                            <p className="text-xs text-slate-400 sm:hidden">
                              {p.date_of_birth
                                ? `${format(new Date(p.date_of_birth), "MMM d, yyyy")}${p.age != null ? ` · ${p.age}y` : ""}`
                                : `${p.age != null ? `${p.age}y` : "—"} · ${p.gender || "—"}`}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-slate-600">
                        <div>
                          {p.date_of_birth && (
                            <p>{format(new Date(p.date_of_birth), "MMM d, yyyy")}</p>
                          )}
                          <p className="text-slate-500">
                            {p.age != null ? `${p.age}y` : "—"} · {p.gender || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-600">{p.phone || "-"}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {p.blood_group && <Badge variant="outline" className="text-[10px] uppercase font-bold">{p.blood_group}</Badge>}
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" title="View" onClick={() => setViewPatientId(p.id)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEdit && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-cyan-600" title="Edit" onClick={() => { setEditPatient(p); setModalOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Delete" onClick={() => setDeleteConfirmId(p.id)}>
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

      <PatientFormModal open={modalOpen} onOpenChange={setModalOpen} patient={editPatient} onSave={handleSave} />
      <PatientDetailModal open={!!viewPatientId} onOpenChange={(o) => { if (!o) setViewPatientId(null); }} patientId={viewPatientId} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the patient record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMut.mutate(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Patient
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} patients?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all selected patient records? This action is permanent.
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
