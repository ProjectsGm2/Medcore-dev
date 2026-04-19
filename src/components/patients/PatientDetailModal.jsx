import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/apiClient";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Calendar, Phone, Droplets, MapPin, FileText } from "lucide-react";

export default function PatientDetailModal({ open, onOpenChange, patientId }) {
  const { data: patients = [], isLoading: pLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 500),
    enabled: open,
  });
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => base44.entities.Appointment.list("-appointment_date", 500),
    enabled: open,
  });
  const { data: prescriptions = [] } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => base44.entities.Prescription.list("-created_date", 500),
    enabled: open,
  });

  const patient = patients.find((p) => p.id === patientId);
  const patientAppts = appointments.filter((a) => a.patient_id === patientId);
  const patientRxs = prescriptions.filter((r) => r.patient_id === patientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Patient Details</DialogTitle>
        </DialogHeader>
        {pLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
          </div>
        ) : !patient ? (
          <div className="text-sm text-slate-500 py-6">Patient not found</div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200/60 p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-xl font-bold shrink-0">
                  {patient.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 space-y-1">
                  <h2 className="text-lg font-semibold text-slate-800">{patient.name}</h2>
                  <p className="text-xs text-slate-500">UHID: {patient.uhid || "-"}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600 mt-1">
                    <span className="flex items-center gap-1.5">
                      <User className="w-4 h-4 text-slate-400" />
                      {patient.gender || "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {patient.date_of_birth
                        ? `${format(new Date(patient.date_of_birth), "MMM d, yyyy")}${patient.age != null ? ` (${patient.age}y)` : ""}`
                        : patient.age != null
                        ? `${patient.age}y`
                        : "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4 text-slate-400" />
                      {patient.phone || "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Droplets className="w-4 h-4 text-slate-400" />
                      {patient.blood_group ? <Badge variant="outline" className="text-xs">{patient.blood_group}</Badge> : "—"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Address</p>
                    <p className="text-slate-700">{patient.address || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Emergency Contact</p>
                    <p className="text-slate-700">{patient.emergency_contact || "—"}</p>
                  </div>
                </div>
                <div className="sm:col-span-2 flex items-start gap-2">
                  <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Known Allergies</p>
                    <p className="text-slate-700">{patient.known_allergies || "—"}</p>
                  </div>
                </div>
                {patient.medical_notes && (
                  <div className="sm:col-span-2 flex items-start gap-2">
                    <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Medical Notes</p>
                      <p className="text-slate-700">{patient.medical_notes}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/60 p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Appointments ({patientAppts.length})</h3>
              {patientAppts.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No appointments</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {patientAppts.map((a) => (
                    <div key={a.id} className="p-2 rounded-md border border-slate-100">
                      <div className="flex items-center justify-between text-sm">
                        <p className="font-medium text-slate-700">{a.status}</p>
                        <p className="text-xs text-slate-500">{a.appointment_date ? format(new Date(a.appointment_date), "MMM d, yyyy HH:mm") : "—"}</p>
                      </div>
                      {a.reason && <p className="text-xs text-slate-500 mt-1">{a.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200/60 p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Prescriptions ({patientRxs.length})</h3>
              {patientRxs.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No prescriptions</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {patientRxs.map((rx) => (
                    <div key={rx.id} className="p-2 rounded-md border border-slate-100">
                      <div className="flex items-center justify-between text-sm">
                        <p className="font-medium text-slate-700">{rx.diagnosis || "Prescription"}</p>
                        <p className="text-xs text-slate-500">{rx.created_date ? format(new Date(rx.created_date), "MMM d, yyyy") : "—"}</p>
                      </div>
                      {rx.medicines?.length ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {rx.medicines.slice(0, 5).map((m, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{m.medicine_name}</Badge>
                          ))}
                          {rx.medicines.length > 5 && (
                            <Badge variant="outline" className="text-xs">+{rx.medicines.length - 5}</Badge>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

