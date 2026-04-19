import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import AppointmentFormModal from "@/components/appointments/AppointmentFormModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarPlus, Search, Pencil, Trash2, CheckCircle, XCircle, Loader2, Video, Eye, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import VideoCallModal from "@/components/video/VideoCallModal";
import AppointmentViewModal from "@/components/appointments/AppointmentViewModal";
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

const statusColors = {
  Scheduled: "bg-blue-100 text-blue-700",
  Approved: "bg-cyan-100 text-cyan-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-slate-100 text-slate-500",
};

function formatDoctorName(name) {
  const value = String(name || "").trim();
  if (!value) return "-";
  return /^dr\.?\s/i.test(value) ? value : `Dr. ${value}`;
}

export default function Appointments() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editAppt, setEditAppt] = useState(null);
  const [videoAppt, setVideoAppt] = useState(null);
  const [viewAppt, setViewAppt] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  
  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortField, setSortField] = useState("appointment_date");
  const [sortOrder, setSortOrder] = useState("desc");

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermission();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  useEffect(() => {
    if (urlParams.get("action") === "new") setModalOpen(true);
  }, []);

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => base44.entities.Appointment.list("-appointment_date", 1000),
  });

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 1000),
  });

  const uhidByPatientId = React.useMemo(() => {
    const map = {};
    for (const p of patients) {
      map[p.id] = p.uhid || null;
    }
    return map;
  }, [patients]);

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
  });

  const doctors = users.filter((u) => u.role === "doctor");

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Appointment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment scheduled successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Appointment.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment updated successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Appointment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment deleted successfully" });
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
        await base44.entities.Appointment.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: `${selectedIds.size} appointments deleted successfully` });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSave = async (data) => {
    if (editAppt) {
      await updateMut.mutateAsync({ id: editAppt.id, data });
    } else {
      await createMut.mutateAsync(data);
    }
  };

  const handleStatusChange = async (appt, status) => {
    await updateMut.mutateAsync({ id: appt.id, data: { status } });
  };

  const filteredAndSorted = useMemo(() => {
    let result = appointments;
    if (user?.role === "doctor") {
      result = result.filter((a) => a.doctor_id === user?.id);
    }
    if (tab !== "all") {
      result = result.filter((a) => a.status === tab);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((a) => {
        const uhid = (uhidByPatientId[a.patient_id] || "").toLowerCase();
        return (
          a.patient_name?.toLowerCase().includes(s) ||
          a.doctor_name?.toLowerCase().includes(s) ||
          uhid.includes(s)
        );
      });
    }

    result.sort((a, b) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [appointments, search, tab, user, sortField, sortOrder]);

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
      setSelectedIds(new Set(paginated.map(a => a.id)));
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

  const canView = can("Appointments", "view");
  const canAdd = can("Appointments", "add");
  const canEdit = can("Appointments", "edit");
  const canDelete = can("Appointments", "delete");

  if (!canView) return <div className="p-8 text-center text-slate-500">Access Denied</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description={user?.role === "doctor" ? "Your appointments" : `${appointments.length} total appointments`}
        actions={
          canAdd && (
            <Button onClick={() => { setEditAppt(null); setModalOpen(true); }} className="bg-cyan-600 hover:bg-cyan-700">
              <CalendarPlus className="w-4 h-4 mr-2" />
              Schedule
            </Button>
          )
        }
      />

      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search appointments..." 
                value={search} 
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} 
                className="pl-10 h-9" 
              />
            </div>
            <Tabs value={tab} onValueChange={(v) => { setTab(v); setCurrentPage(1); }}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="Scheduled" className="text-xs">Scheduled</TabsTrigger>
                <TabsTrigger value="Approved" className="text-xs">Approved</TabsTrigger>
                <TabsTrigger value="Completed" className="text-xs">Completed</TabsTrigger>
                <TabsTrigger value="Cancelled" className="text-xs">Cancelled</TabsTrigger>
              </TabsList>
            </Tabs>
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
            <p className="text-slate-400">No appointments found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="w-12">
                      <Checkbox 
                        checked={paginated.length > 0 && paginated.every(a => selectedIds.has(a.id))}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("patient_name")}>
                      <div className="flex items-center gap-1">Patient Name <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">UHID</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("doctor_name")}>
                      <div className="flex items-center gap-1">Doctor <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("appointment_date")}>
                      <div className="flex items-center gap-1">Date & Time <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="w-40 text-right px-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((a, idx) => (
                    <TableRow key={a.id} className={cn("hover:bg-slate-50/50 transition-colors", selectedIds.has(a.id) && "bg-cyan-50/30")}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedIds.has(a.id)}
                          onCheckedChange={() => toggleSelect(a.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-400 text-center">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </TableCell>
                      <TableCell className="font-medium text-sm text-slate-700">{a.patient_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-600">{uhidByPatientId[a.patient_id] || "-"}</TableCell>
                      <TableCell className="text-sm text-slate-600">{formatDoctorName(a.doctor_name)}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {a.appointment_date ? format(new Date(a.appointment_date), "MMM d, yyyy") : ""} · {a.appointment_time}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColors[a.status]} text-[10px] font-bold uppercase border-0`}>{a.status}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {a.type === "Video Call" ? (
                          <Badge className="bg-cyan-100 text-cyan-700 border-0 text-[10px] uppercase font-bold flex items-center gap-1 w-fit">
                            <Video className="w-3 h-3" /> Video
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px] uppercase font-bold w-fit">In-Person</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" title="View" onClick={() => setViewAppt(a)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEdit && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-cyan-600" title="Edit" onClick={() => { setEditAppt(a); setModalOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {(a.status === "Scheduled" || a.status === "Approved") && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" title="Mark Done" onClick={() => handleStatusChange(a, "Completed")}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" title="Cancel" onClick={() => handleStatusChange(a, "Cancelled")}>
                                <XCircle className="w-4 h-4" />
                              </Button>
                              {a.type === "Video Call" && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-cyan-600" title="Join Video" onClick={() => setVideoAppt(a)}>
                                  <Video className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Delete" onClick={() => setDeleteConfirmId(a.id)}>
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

      <AppointmentFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        appointment={editAppt}
        patients={patients}
        doctors={doctors}
        onSave={handleSave}
      />

      <VideoCallModal
        open={!!videoAppt}
        appointment={videoAppt}
        appointmentId={videoAppt?.id}
        currentUser={user}
        onClose={() => setVideoAppt(null)}
      />
      <AppointmentViewModal open={!!viewAppt} onOpenChange={(o) => { if (!o) setViewAppt(null); }} appointment={viewAppt} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the appointment record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMut.mutate(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} appointments?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all selected appointment records? This action is permanent.
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
