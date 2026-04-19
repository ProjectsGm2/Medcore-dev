import React, { useMemo, useState } from "react";
import { base44 } from "@/api/apiClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, Pencil, Printer, Receipt, Loader2, ArrowUpDown, ChevronLeft, ChevronRight, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import PrescriptionFormModal from "@/components/opd/PrescriptionFormModal";
import SaleFormModal from "@/components/dispensary/SaleFormModal";
import { usePermission, useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { cn, resolveImageSrc } from "@/lib/utils";
import { createPageUrl } from "@/utils";

const statusColors = {
  Scheduled: "bg-blue-100 text-blue-700",
  Approved: "bg-cyan-100 text-cyan-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-slate-100 text-slate-500",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDoctorName = (name) => {
  const value = String(name || "").trim();
  if (!value) return "-";
  return /^dr\.?\s/i.test(value) ? value : `Dr. ${value}`;
};

export default function OPD() {
  const [search, setSearch] = useState("");
  const [rxModalOpen, setRxModalOpen] = useState(false);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [selectedApt, setSelectedApt] = useState(null);
  const [selectedRx, setSelectedRx] = useState(null);
  
  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortField, setSortField] = useState("appointment_date");
  const [sortOrder, setSortOrder] = useState("desc");

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermission();
  const { toast } = useToast();

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => base44.entities.Appointment.list("-appointment_date", 1000),
  });

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => base44.entities.Prescription.list("-created_date", 1000),
  });

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 1000),
  });

  const { data: medicines = [] } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => base44.entities.Medicine.list("-created_date", 1000),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["medicine-categories"],
    queryFn: () => base44.dispensary.medicineCategories(),
  });

  const { data: settings = {} } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.settings.all(),
    staleTime: 5 * 60 * 1000,
  });

  const deleteRxMut = useMutation({
    mutationFn: (id) => base44.entities.Prescription.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Prescription deleted successfully" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rxByAptId = useMemo(() => {
    const m = {};
    for (const rx of prescriptions) {
      if (rx.appointment_id) m[rx.appointment_id] = rx;
    }
    return m;
  }, [prescriptions]);

  const uhidByPatientId = useMemo(() => {
    const m = {};
    for (const p of patients) m[p.id] = p.uhid || null;
    return m;
  }, [patients]);

  const patientById = useMemo(() => {
    const m = {};
    for (const p of patients) m[p.id] = p;
    return m;
  }, [patients]);

  const filteredAndSorted = useMemo(() => {
    let list = appointments;
    if (user?.role === "doctor") {
      list = list.filter((a) => a.doctor_id === user?.id);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a) => {
        const uhid = (uhidByPatientId[a.patient_id] || "").toLowerCase();
        return (
          a.patient_name?.toLowerCase().includes(s) ||
          a.doctor_name?.toLowerCase().includes(s) ||
          uhid.includes(s)
        );
      });
    }

    list.sort((a, b) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [appointments, user, search, uhidByPatientId, sortField, sortOrder]);

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

  const handleAddRx = (apt) => {
    setSelectedApt(apt);
    setSelectedRx(null);
    setRxModalOpen(true);
  };

  const handleEditRx = (apt) => {
    const rx = rxByAptId[apt.id];
    if (rx) {
      setSelectedApt(apt);
      setSelectedRx(rx);
      setRxModalOpen(true);
    }
  };

  const handleViewRx = (apt) => {
    const rx = rxByAptId[apt.id];
    if (rx) {
      window.location.href = `${createPageUrl("PrescriptionDetail")}?id=${encodeURIComponent(rx.id)}`;
    }
  };

  const handlePrintRx = (apt) => {
    const rx = rxByAptId[apt.id];
    if (rx) {
      const clinicName = String(settings.clinic_name || "").trim() || "Clinic";
      const clinicAddress = String(settings.address || "").trim();
      const clinicPhone = String(settings.phone || "").trim();
      const clinicEmail = String(settings.email || "").trim();
      const logoUrl = resolveImageSrc(settings.logo || settings.small_logo || "");
      const patient = patientById[rx.patient_id] || {};
      const meta = typeof rx.notes_meta === "string"
        ? (() => {
            try {
              return JSON.parse(rx.notes_meta);
            } catch {
              return {};
            }
          })()
        : (rx.notes_meta || {});
      const vitals = meta.vitals || {};
      const vitalEntries = [
        ["HR", vitals.hr],
        ["RR", vitals.rr],
        ["BP", vitals.bp],
        ["SpO2", vitals.spo2],
        ["Temp", vitals.temp],
        ["Weight", vitals.weight],
        ["Height", vitals.height],
      ].filter(([, value]) => String(value || "").trim());
      const services = Array.isArray(meta.services) ? meta.services.filter((s) => s?.name || s?.price) : [];
      const medicinesList = Array.isArray(rx.medicines) ? rx.medicines : [];
      const ageGender = [patient.age ? `${patient.age} yrs` : "", patient.gender || ""].filter(Boolean).join(" / ") || "-";
      const contactLine = [clinicPhone, clinicEmail].filter(Boolean).join(" | ");

      // Create a print window
      const printWin = window.open("", "_blank");
      if (!printWin) return;
      const content = `
        <html>
          <head>
            <title>Prescription - ${rx.patient_name}</title>
            <style>
              * { box-sizing: border-box; }
              body { font-family: Arial, sans-serif; margin: 0; padding: 28px; color: #0f172a; background: #fff; }
              .sheet { width: 100%; }
              .header { display: flex; align-items: center; gap: 18px; border-bottom: 3px solid #0891b2; padding-bottom: 18px; margin-bottom: 18px; }
              .header-logo { width: 90px; text-align: center; }
              .header-logo img { max-width: 90px; max-height: 90px; object-fit: contain; }
              .header-copy { flex: 1; }
              .header-copy h1 { margin: 0; font-size: 28px; color: #0f766e; }
              .header-copy p { margin: 4px 0 0; color: #475569; font-size: 13px; }
              .rx-title { margin-top: 10px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
              .rx-title h2 { margin: 0; font-size: 22px; color: #0891b2; letter-spacing: 0.08em; }
              .rx-meta { text-align: right; font-size: 12px; color: #475569; }
              .section { border: 1px solid #dbeafe; border-radius: 12px; padding: 14px 16px; margin-top: 14px; }
              .section h3 { margin: 0 0 12px; font-size: 13px; color: #0369a1; text-transform: uppercase; letter-spacing: 0.06em; }
              .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; }
              .info-row { font-size: 13px; line-height: 1.5; }
              .label { font-weight: 700; color: #334155; }
              .value { color: #0f172a; }
              .muted { color: #64748b; }
              .vitals { display: flex; flex-wrap: wrap; gap: 8px; }
              .vital-chip { border: 1px solid #cbd5e1; border-radius: 999px; padding: 6px 10px; font-size: 12px; background: #f8fafc; }
              .text-block { font-size: 13px; line-height: 1.65; white-space: pre-wrap; color: #0f172a; }
              .rx-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
              .rx-table th { background: #f0f9ff; border: 1px solid #dbeafe; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #0369a1; }
              .rx-table td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 13px; vertical-align: top; }
              .footer { margin-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
              .footer-note { font-size: 12px; color: #64748b; max-width: 60%; }
              .signature { min-width: 220px; text-align: center; }
              .signature-line { border-top: 1px solid #94a3b8; padding-top: 10px; margin-top: 42px; font-size: 13px; font-weight: 700; }
              @media print {
                body { padding: 20px; }
              }
            </style>
          </head>
          <body>
            <div class="sheet">
              <div class="header">
                ${logoUrl ? `<div class="header-logo"><img src="${logoUrl}" alt="${escapeHtml(clinicName)}" /></div>` : ""}
                <div class="header-copy">
                  <h1>${escapeHtml(clinicName)}</h1>
                  ${clinicAddress ? `<p>${escapeHtml(clinicAddress)}</p>` : ""}
                  ${contactLine ? `<p>${escapeHtml(contactLine)}</p>` : ""}
                </div>
              </div>

              <div class="rx-title">
                <h2>PRESCRIPTION</h2>
                <div class="rx-meta">
                  <div><strong>Prescription ID:</strong> ${escapeHtml(rx.rx_code || "N/A")}</div>
                  <div><strong>Date:</strong> ${escapeHtml(format(new Date(rx.created_date), "dd MMM yyyy"))}</div>
                </div>
              </div>

              <div class="section">
                <h3>Patient Details</h3>
                <div class="grid">
                  <div class="info-row"><span class="label">Patient Name:</span> <span class="value">${escapeHtml(rx.patient_name || "-")}</span></div>
                  <div class="info-row"><span class="label">Doctor:</span> <span class="value">${escapeHtml(formatDoctorName(rx.doctor_name))}</span></div>
                  <div class="info-row"><span class="label">UHID:</span> <span class="value">${escapeHtml(uhidByPatientId[rx.patient_id] || "-")}</span></div>
                  <div class="info-row"><span class="label">Age / Gender:</span> <span class="value">${escapeHtml(ageGender)}</span></div>
                  <div class="info-row"><span class="label">Phone:</span> <span class="value">${escapeHtml(patient.phone || "-")}</span></div>
                  <div class="info-row"><span class="label">Blood Group:</span> <span class="value">${escapeHtml(patient.blood_group || "-")}</span></div>
                </div>
              </div>

              ${vitalEntries.length ? `
                <div class="section">
                  <h3>Vitals</h3>
                  <div class="vitals">
                    ${vitalEntries.map(([label, value]) => `<div class="vital-chip"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`).join("")}
                  </div>
                </div>
              ` : ""}

              <div class="section">
                <h3>Clinical Details</h3>
                <div class="grid">
                  <div class="info-row">
                    <div class="label">Symptoms</div>
                    <div class="text-block">${escapeHtml(meta.symptoms || "-")}</div>
                  </div>
                  <div class="info-row">
                    <div class="label">Past History</div>
                    <div class="text-block">${escapeHtml(meta.past_history || "-")}</div>
                  </div>
                  <div class="info-row">
                    <div class="label">Diagnosis</div>
                    <div class="text-block">${escapeHtml(rx.diagnosis || "-")}</div>
                  </div>
                  <div class="info-row">
                    <div class="label">Plan</div>
                    <div class="text-block">${escapeHtml(meta.plan || "-")}</div>
                  </div>
                </div>
                <div style="margin-top: 12px;">
                  <div class="label">Notes</div>
                  <div class="text-block">${escapeHtml(rx.notes || "-")}</div>
                </div>
              </div>

              <div class="section">
                <h3>Medicines</h3>
                <table class="rx-table">
                  <thead>
                    <tr>
                      <th style="width: 40px;">#</th>
                      <th>Medicine</th>
                      <th style="width: 90px;">Dose</th>
                      <th style="width: 110px;">Frequency</th>
                      <th style="width: 110px;">Duration</th>
                      <th>Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${medicinesList.length ? medicinesList.map((m, index) => `
                      <tr>
                        <td>${index + 1}</td>
                        <td><strong>${escapeHtml(m.medicine_name || "-")}</strong>${m.category ? `<div class="muted">${escapeHtml(m.category)}</div>` : ""}</td>
                        <td>${escapeHtml(m.dose || "-")}</td>
                        <td>${escapeHtml(m.interval || "-")}</td>
                        <td>${escapeHtml(m.duration || "-")}</td>
                        <td>${escapeHtml(m.instructions || "-")}</td>
                      </tr>
                    `).join("") : `
                      <tr>
                        <td colspan="6" style="text-align:center;color:#64748b;">No medicines added</td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </div>

              ${services.length ? `
                <div class="section">
                  <h3>Services</h3>
                  <table class="rx-table">
                    <thead>
                      <tr>
                        <th style="width: 40px;">#</th>
                        <th>Service</th>
                        <th style="width: 120px;">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${services.map((service, index) => `
                        <tr>
                          <td>${index + 1}</td>
                          <td>${escapeHtml(service.name || "-")}</td>
                          <td>${escapeHtml(service.price || "-")}</td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>
              ` : ""}

              <div class="footer">
                <div class="footer-note">
                  This prescription is issued electronically by ${escapeHtml(clinicName)}. Please follow the dosage and follow-up instructions provided by the doctor.
                </div>
                <div class="signature">
                  <div class="signature-line">${escapeHtml(formatDoctorName(rx.doctor_name))}</div>
                </div>
              </div>
            </div>
            <script>window.print(); setTimeout(() => window.close(), 500);</script>
          </body>
        </html>
      `;
      printWin.document.write(content);
      printWin.document.close();
    }
  };

  const handleGenerateBill = (apt) => {
    const rx = rxByAptId[apt.id];
    if (rx) {
      setSelectedRx(rx);
      setBillModalOpen(true);
    }
  };

  const handleDeleteRx = async (apt) => {
    const rx = rxByAptId[apt.id];
    if (!rx) return;
    const confirmed = window.confirm("Delete this prescription?");
    if (!confirmed) return;
    await deleteRxMut.mutateAsync(rx.id);
  };

  const canView = can("OPD", "view");
  const canAdd = can("OPD", "add");
  const canEdit = can("OPD", "edit");
  const canDelete = can("OPD", "delete");

  if (!canView) return <div className="p-8 text-center text-slate-500">Access Denied</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="OPD — Out Patient"
        description={user?.role === "doctor" ? "Your outpatient queue" : "All outpatients"}
      />

      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search outpatients..." 
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
            <p className="text-slate-400">No outpatients found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("patient_name")}>
                      <div className="flex items-center gap-1">Patient <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">UHID</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("doctor_name")}>
                      <div className="flex items-center gap-1">Doctor <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("appointment_date")}>
                      <div className="flex items-center gap-1">Date & Time <ArrowUpDown className="w-3 h-3" /></div>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32 text-right px-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((a, idx) => (
                    <TableRow key={a.id} className="hover:bg-slate-50/50 transition-colors">
                      {(() => {
                        const hasPrescription = !!rxByAptId[a.id];
                        const displayStatus = hasPrescription ? "Completed" : a.status;
                        return (
                          <>
                      <TableCell className="text-xs font-medium text-slate-400 text-center">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </TableCell>
                      <TableCell className="font-medium text-sm text-slate-700">{a.patient_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-600">{uhidByPatientId[a.patient_id] || "-"}</TableCell>
                      <TableCell className="text-sm text-slate-600">Dr. {a.doctor_name}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {a.appointment_date ? format(new Date(a.appointment_date), "MMM d, yyyy") : ""} · {a.appointment_time}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColors[displayStatus]} text-[10px] font-bold uppercase border-0`}>{displayStatus}</Badge>
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <div className="flex items-center gap-1 justify-end">
                          {hasPrescription ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-600"
                                title="View Prescription"
                                onClick={() => handleViewRx(a)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-amber-600"
                                  title="Edit Prescription"
                                  onClick={() => handleEditRx(a)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600"
                                  title="Delete Prescription"
                                  onClick={() => handleDeleteRx(a)}
                                  disabled={deleteRxMut.isPending}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-600"
                                title="Print Prescription"
                                onClick={() => handlePrintRx(a)}
                              >
                                <Printer className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-600"
                                title="Generate Bill"
                                onClick={() => handleGenerateBill(a)}
                              >
                                <Receipt className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : a.status === "Scheduled" || a.status === "Approved" ? (
                            canAdd && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-cyan-600"
                                title="Add Prescription"
                                onClick={() => handleAddRx(a)}
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                            )
                          ) : a.status === "Completed" ? (
                            <div className="flex items-center gap-1">
                              {canAdd && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-cyan-600"
                                  title="Add Prescription"
                                  onClick={() => handleAddRx(a)}
                                >
                                  <FileText className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </div>
                      </TableCell>
                          </>
                        );
                      })()}
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

      <PrescriptionFormModal
        open={rxModalOpen}
        onOpenChange={setRxModalOpen}
        appointment={selectedApt}
        prescription={selectedRx}
        currentUser={user}
      />

      <SaleFormModal
        open={billModalOpen}
        onOpenChange={setBillModalOpen}
        medicines={medicines}
        categories={categories}
        currentUser={user}
        prescription={selectedRx}
        onSave={async (payload) => {
          try {
            await base44.dispensary.salesBillCreate(payload);
            toast({ title: "Success", description: "Bill generated successfully" });
            setBillModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["sales-bills"] });
          } catch (err) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
          }
        }}
      />
    </div>
  );
}
