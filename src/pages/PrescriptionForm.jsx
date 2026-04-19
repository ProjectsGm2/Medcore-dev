import React, { useState, useEffect } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Loader2, Pill, Stethoscope, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function PrescriptionForm({ currentUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const appointmentId = urlParams.get("appointment_id");
  const prePatientId = urlParams.get("patient_id");
  const lockedFromAppointment = Boolean(appointmentId);

  const [form, setForm] = useState({
    patient_id: prePatientId || "",
    patient_name: "",
    doctor_id: currentUser?.id || "",
    doctor_name: currentUser?.full_name || "",
    diagnosis: "",
    notes: "",
    appointment_id: appointmentId || "",
    medicines: [],
    vitals: { hr: "", rr: "", bp: "", spo2: "", temp: "", weight: "", height: "" },
    past_history: "",
    plan: "",
    services: [],
    rx_code: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 500),
  });

  const { data: medicines = [] } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => base44.entities.Medicine.list("-created_date", 500),
  });
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => base44.entities.Appointment.list("-appointment_date", 500),
  });
  
  const dispensableMeds = medicines;

  useEffect(() => {
    if (!form.rx_code) {
      const y = new Date().getFullYear();
      const rand = Math.random().toString(36).slice(-6).toUpperCase();
      setForm((f) => ({ ...f, rx_code: `RX-${y}-${rand}` }));
    }
    if (prePatientId && patients.length) {
      const patient = patients.find((p) => p.id === prePatientId);
      if (patient) {
        setForm((f) => ({ ...f, patient_name: patient.name }));
      }
    }
    if (appointmentId && appointments.length) {
      const appt = appointments.find((a) => a.id === appointmentId);
      if (appt) {
        setForm((f) => ({
          ...f,
          appointment_id: appt.id,
          patient_id: appt.patient_id || f.patient_id,
          patient_name: appt.patient_name || f.patient_name,
          doctor_id: appt.doctor_id || f.doctor_id,
          doctor_name: appt.doctor_name || f.doctor_name,
          diagnosis: f.diagnosis || appt.reason || "",
          notes: f.notes || appt.notes || "",
        }));
      }
    }
  }, [prePatientId, patients, appointmentId, appointments]);

  const handlePatientChange = (patientId) => {
    const patient = patients.find((p) => p.id === patientId);
    setForm({ ...form, patient_id: patientId, patient_name: patient?.name || "" });
  };

  const addMedicine = () => {
    setForm({
      ...form,
      medicines: [...form.medicines, { medicine_id: "", medicine_name: "", dosage: "", duration: "", instructions: "" }],
    });
  };

  const updateMedicine = (index, field, value) => {
    const updated = [...form.medicines];
    if (field === "medicine_id") {
      const med = dispensableMeds.find((m) => m.id === value);
      updated[index] = { ...updated[index], medicine_id: value, medicine_name: med?.name || "" };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setForm({ ...form, medicines: updated });
  };

  const removeMedicine = (index) => {
    setForm({ ...form, medicines: form.medicines.filter((_, i) => i !== index) });
  };
  const addService = () => {
    setForm({ ...form, services: [...form.services, { name: "", price: "" }] });
  };
  const updateService = (index, field, value) => {
    const updated = [...form.services];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, services: updated });
  };
  const removeService = (index) => {
    setForm({ ...form, services: form.services.filter((_, i) => i !== index) });
  };
  const generateDiagnosis = () => {
    if (!form.diagnosis) {
      setForm({ ...form, diagnosis: "Provisional diagnosis based on presenting complaints." });
    }
  };
  const generateText = (field) => {
    const hints = {
      past_history: "No significant past medical history.",
      plan: "Plan: symptomatic management, follow-up in 7 days.",
      notes: "Patient advised rest and hydration.",
    };
    setForm({ ...form, [field]: form[field] || hints[field] || "" });
  };

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Prescription.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      if (appointmentId) {
        base44.entities.Appointment.update(appointmentId, { status: "Completed" });
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
      }
      navigate(createPageUrl("Prescriptions"));
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const meta = {
      rx_code: form.rx_code,
      vitals: form.vitals,
      past_history: form.past_history,
      plan: form.plan,
      services: form.services,
    };
    const payload = {
      patient_id: form.patient_id,
      doctor_id: form.doctor_id,
      appointment_id: form.appointment_id || null,
      diagnosis: form.diagnosis,
      notes: form.notes,
      notes_meta: JSON.stringify(meta),
      medicines: form.medicines,
    };
    await createMut.mutateAsync(payload);
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to={createPageUrl("Prescriptions")}>
        <Button variant="ghost" className="text-slate-500 -ml-2">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      </Link>

      <PageHeader title="New Prescription" description="Create a prescription for a patient" />

      {!lockedFromAppointment ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 rounded-lg">
          Please start prescriptions from OPD. Select an appointment in OPD and click Add Prescription.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6" hidden={!lockedFromAppointment}>
        {/* Patient & Basic Info */}
        <div className="bg-white rounded-xl border border-slate-200/60 p-6 space-y-4">
          <h3 className="font-semibold text-slate-800">Patient Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Patient *</Label>
              {lockedFromAppointment ? (
                <Input value={form.patient_name || ""} disabled className="bg-slate-50" />
              ) : (
                <Select value={form.patient_id} onValueChange={handlePatientChange}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>Doctor</Label>
              <Input value={`Dr. ${form.doctor_name}`} disabled className="bg-slate-50" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1"><Stethoscope className="w-3 h-3" /> HR</Label>
              <Input value={form.vitals.hr} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, hr: e.target.value } })} placeholder="bpm" />
            </div>
            <div>
              <Label className="text-xs">RR</Label>
              <Input value={form.vitals.rr} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, rr: e.target.value } })} placeholder="rpm" />
            </div>
            <div>
              <Label className="text-xs">BP</Label>
              <Input value={form.vitals.bp} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, bp: e.target.value } })} placeholder="e.g. 120/80" />
            </div>
            <div>
              <Label className="text-xs">SpO₂</Label>
              <Input value={form.vitals.spo2} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, spo2: e.target.value } })} placeholder="%" />
            </div>
            <div>
              <Label className="text-xs">Temp</Label>
              <Input value={form.vitals.temp} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, temp: e.target.value } })} placeholder="°C/°F" />
            </div>
            <div>
              <Label className="text-xs">Weight</Label>
              <Input value={form.vitals.weight} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, weight: e.target.value } })} placeholder="kg" />
            </div>
            <div>
              <Label className="text-xs">Height/Length</Label>
              <Input value={form.vitals.height} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, height: e.target.value } })} placeholder="cm" />
            </div>
            <div>
              <Label className="text-xs">Prescription ID</Label>
              <Input value={form.rx_code} disabled className="bg-slate-50 font-mono" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Diagnosis *</Label>
              <Button type="button" variant="outline" size="sm" onClick={generateDiagnosis} className="gap-1">
                <Sparkles className="w-4 h-4" /> Generate
              </Button>
            </div>
            <Textarea value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} rows={3} required placeholder="Enter diagnosis..." />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Past History</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => generateText("past_history")} className="gap-1">
                <Sparkles className="w-4 h-4" /> Generate
              </Button>
            </div>
            <Textarea value={form.past_history} onChange={(e) => setForm({ ...form, past_history: e.target.value })} rows={2} placeholder="Past medical/surgical history (optional)..." />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Plan</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => generateText("plan")} className="gap-1">
                <Sparkles className="w-4 h-4" /> Generate
              </Button>
            </div>
            <Textarea value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} rows={2} placeholder="Plan (optional)..." />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Notes</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => generateText("notes")} className="gap-1">
                <Sparkles className="w-4 h-4" /> Assist
              </Button>
            </div>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Additional notes (optional)..." />
          </div>
        </div>

        {/* Medicines */}
        <div className="bg-white rounded-xl border border-slate-200/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Pill className="w-4 h-4 text-cyan-600" /> Prescribed Medicines
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={addMedicine}>
              <Plus className="w-4 h-4 mr-1" /> Add Medicine
            </Button>
          </div>

          {form.medicines.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No medicines added yet. Click "Add Medicine" to start.</p>
          ) : (
            <div className="space-y-4">
              {form.medicines.map((med, index) => (
                <div key={index} className="p-4 rounded-lg bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">Medicine #{index + 1}</Badge>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeMedicine(index)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Medicine</Label>
                      <Select value={med.medicine_id} onValueChange={(v) => updateMedicine(index, "medicine_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Select medicine" /></SelectTrigger>
                        <SelectContent>
                          {dispensableMeds.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name} (Stock: {Number(m.stock || 0)})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Dosage</Label>
                      <Input value={med.dosage} onChange={(e) => updateMedicine(index, "dosage", e.target.value)} placeholder="e.g. 1 tablet 3x daily" />
                    </div>
                    <div>
                      <Label className="text-xs">Duration</Label>
                      <Input value={med.duration} onChange={(e) => updateMedicine(index, "duration", e.target.value)} placeholder="e.g. 7 days" />
                    </div>
                    <div>
                      <Label className="text-xs">Instructions</Label>
                      <Input value={med.instructions} onChange={(e) => updateMedicine(index, "instructions", e.target.value)} placeholder="e.g. After meals" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Services */}
        <div className="bg-white rounded-xl border border-slate-200/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Services</h3>
            <Button type="button" variant="outline" size="sm" onClick={addService}>
              <Plus className="w-4 h-4 mr-1" /> Add Service
            </Button>
          </div>
        {form.services.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No services added</p>
          ) : (
            <div className="space-y-3">
              {form.services.map((s, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
                  <div className="sm:col-span-4">
                    <Label className="text-xs">Service / Item name</Label>
                    <Input value={s.name} onChange={(e) => updateService(idx, "name", e.target.value)} placeholder="e.g. Dressing" />
                  </div>
                  <div className="sm:col-span-1">
                    <Label className="text-xs">Price</Label>
                    <Input type="number" step="0.01" min="0" value={s.price} onChange={(e) => updateService(idx, "price", e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="sm:col-span-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeService(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Link to={createPageUrl("Prescriptions")}>
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Prescription
          </Button>
        </div>
      </form>
    </div>
  );
}
