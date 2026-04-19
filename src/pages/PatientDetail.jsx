import React from "react";
import { base44 } from "@/api/apiClient";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Droplets,
  Calendar,
  FileText,
  Loader2,
  User,
} from "lucide-react";

export default function PatientDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get("id");

  const { data: patients = [], isLoading: pLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 500),
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => base44.entities.Appointment.list("-appointment_date", 500),
  });

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => base44.entities.Prescription.list("-created_date", 500),
  });

  const patient = patients.find((p) => p.id === patientId);
  const patientAppts = appointments.filter((a) => a.patient_id === patientId);
  const patientRxs = prescriptions.filter((r) => r.patient_id === patientId);

  if (pLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">Patient not found</p>
        <Link to={createPageUrl("Patients")}>
          <Button variant="outline" className="mt-4">Back to Patients</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to={createPageUrl("Patients")}>
        <Button variant="ghost" className="text-slate-500 -ml-2">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Patients
        </Button>
      </Link>

      {/* Patient Info Card */}
      <div className="bg-white rounded-xl border border-slate-200/60 p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {patient.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="text-xl font-bold text-slate-800">{patient.name}</h2>
              <p className="text-sm text-slate-400">ID: {patient.id} · Registered {patient.created_date ? format(new Date(patient.created_date), "MMM d, yyyy") : "-"}</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-400" />
                {patient.date_of_birth
                  ? `${format(new Date(patient.date_of_birth), "MMM d, yyyy")}${patient.age != null ? ` (${patient.age}y)` : ""}`
                  : patient.age != null
                    ? `${patient.age}y`
                    : "—"}
                {patient.gender ? ` · ${patient.gender}` : ""}
              </span>
              <span className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-slate-400" />{patient.phone || "—"}</span>
              {patient.blood_group && <span className="flex items-center gap-1.5"><Droplets className="w-4 h-4 text-slate-400" />{patient.blood_group}</span>}
              {patient.marital_status && (
                <span className="text-slate-600">Marital: <span className="font-medium">{patient.marital_status}</span></span>
              )}
              {patient.guardian_name && (
                <span className="text-slate-600">Guardian: <span className="font-medium">{patient.guardian_name}</span></span>
              )}
              {patient.address && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" />{patient.address}</span>}
              {patient.emergency_contact && (
                <span className="text-slate-600">Emergency: <span className="font-medium">{patient.emergency_contact}</span></span>
              )}
            </div>
            {patient.known_allergies && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <p className="text-xs text-amber-800 font-medium mb-1">Known allergies</p>
                <p className="text-sm text-amber-900">{patient.known_allergies}</p>
              </div>
            )}
            {patient.medical_notes && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-400 mb-1">Medical Notes</p>
                <p className="text-sm text-slate-600">{patient.medical_notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appointments */}
        <div className="bg-white rounded-xl border border-slate-200/60 p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-600" /> Appointments ({patientAppts.length})
          </h3>
          {patientAppts.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No appointments</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {patientAppts.map((a) => (
                <div key={a.id} className="p-3 rounded-lg bg-slate-50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Dr. {a.doctor_name}</p>
                    <Badge variant={a.status === "Scheduled" || a.status === "Approved" ? "default" : a.status === "Completed" ? "secondary" : "destructive"} className="text-xs">{a.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {a.appointment_date ? format(new Date(a.appointment_date), "MMM d, yyyy") : ""} at {a.appointment_time}
                  </p>
                  {a.reason && <p className="text-xs text-slate-500 mt-1">{a.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prescriptions */}
        <div className="bg-white rounded-xl border border-slate-200/60 p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600" /> Prescriptions ({patientRxs.length})
          </h3>
          {patientRxs.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No prescriptions</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {patientRxs.map((rx) => (
                <div key={rx.id} className="p-3 rounded-lg bg-slate-50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">{rx.diagnosis}</p>
                    <p className="text-xs text-slate-400">{rx.created_date ? format(new Date(rx.created_date), "MMM d") : ""}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Dr. {rx.doctor_name}</p>
                  {rx.medicines?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rx.medicines.map((m, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{m.medicine_name}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
