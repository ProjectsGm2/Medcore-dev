import React, { useState, useEffect } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2, Pill, Stethoscope, Sparkles, Check, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

const CONSULTATION_SERVICE_NAME = "Consultation Fee";

const normalizeServiceName = (value) => String(value || "").trim().toLowerCase();

function SearchableSelect({
  options,
  value,
  selectedValue,
  onSelect,
  placeholder,
  emptyMessage = "No options found.",
  className,
}) {
  const [open, setOpen] = useState(false);
  const activeValue = selectedValue ?? value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between text-xs font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const label = typeof option === "string" ? option : option.label;
                const val = typeof option === "string" ? option : option.value;

                return (
                  <CommandItem
                    key={val}
                    value={label}
                    onSelect={() => {
                      onSelect(val);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        activeValue === val ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function PrescriptionFormModal({ open, onOpenChange, appointment, prescription, currentUser }) {
  const queryClient = useQueryClient();
  const appointmentId = appointment?.id;
  const prePatientId = appointment?.patient_id;
  const formatDoctorName = (name) => {
    const value = String(name || "").trim();
    if (!value) return "";
    return /^dr\.?\s/i.test(value) ? value : `Dr. ${value}`;
  };

  const [form, setForm] = useState({
    patient_id: prePatientId || "",
    patient_name: appointment?.patient_name || "",
    uhid: "",
    doctor_id: currentUser?.id || "",
    doctor_name: currentUser?.full_name || "",
    diagnosis: appointment?.reason || "",
    notes: appointment?.notes || "",
    appointment_id: appointmentId || "",
    medicines: [],
    vitals: { hr: "", rr: "", bp: "", spo2: "", temp: "", weight: "", height: "" },
    symptoms: "",
    past_history: "",
    plan: "",
    services: [],
    rx_code: "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 500),
    enabled: open,
  });

  const { data: medicines = [] } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => base44.entities.Medicine.list("-created_date", 1000),
    enabled: open,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["medicine-categories"],
    queryFn: () => base44.dispensary.medicineCategories(),
    enabled: open,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
    enabled: open,
  });

  const { data: serviceMasters = [] } = useQuery({
    queryKey: ["masters", "service"],
    queryFn: () => base44.entities.Master.filter({ type: "service" }),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      if (prescription) {
        // Edit mode
        const meta = typeof prescription.notes_meta === 'string' ? JSON.parse(prescription.notes_meta) : (prescription.notes_meta || {});
        const patient = patients.find((p) => p.id === prescription.patient_id);
        const doctor = users.find((u) => u.id === prescription.doctor_id);

        setForm({
          patient_id: prescription.patient_id,
          patient_name: prescription.patient_name,
          uhid: patient?.uhid || "",
          doctor_id: prescription.doctor_id,
          doctor_name: prescription.doctor_name || doctor?.full_name || doctor?.name || (prescription.doctor_id === currentUser?.id ? currentUser.full_name : "Unknown"),
          diagnosis: prescription.diagnosis,
          notes: prescription.notes,
          appointment_id: prescription.appointment_id,
          medicines: (typeof prescription.medicines === 'string' ? JSON.parse(prescription.medicines) : (prescription.medicines || [])).map((m) => {
            if (!m.medicine_name || !m.category) {
              const medData = medicines.find((dm) => dm.id === m.medicine_id);
              return {
                ...m,
                medicine_name: m.medicine_name || medData?.name || "",
                category: m.category || medData?.category || "",
              };
            }
            return m;
          }),
          vitals: meta.vitals || { hr: "", rr: "", bp: "", spo2: "", temp: "", weight: "", height: "" },
          symptoms: meta.symptoms || "",
          past_history: meta.past_history || "",
          plan: meta.plan || "",
          services: Array.isArray(meta.services)
            ? meta.services.filter(
                (service) =>
                  !service?.is_consultation &&
                  normalizeServiceName(service?.name) !== normalizeServiceName(CONSULTATION_SERVICE_NAME)
              )
            : [],
          rx_code: meta.rx_code || prescription.rx_code || "",
        });
      } else {
        // New mode
        const y = new Date().getFullYear();
        const rand = Math.random().toString(36).slice(-6).toUpperCase();
        const patient = patients.find((p) => p.id === appointment?.patient_id);
        setForm({
          patient_id: appointment?.patient_id || "",
          patient_name: appointment?.patient_name || "",
          uhid: patient?.uhid || "",
          doctor_id: appointment?.doctor_id || currentUser?.id || "",
          doctor_name: appointment?.doctor_name || currentUser?.full_name || "",
          diagnosis: appointment?.reason || "",
          notes: appointment?.notes || "",
          appointment_id: appointment?.id || "",
          medicines: [],
          vitals: { hr: "", rr: "", bp: "", spo2: "", temp: "", weight: "", height: "" },
          symptoms: "",
          past_history: "",
          plan: "",
          services: [],
          rx_code: `RX-${y}-${rand}`,
        });
      }
    } else {
      // Clear form when closing
      setForm({
        patient_id: "",
        patient_name: "",
        uhid: "",
        doctor_id: "",
        doctor_name: "",
        diagnosis: "",
        notes: "",
        appointment_id: "",
        medicines: [],
        vitals: { hr: "", rr: "", bp: "", spo2: "", temp: "", weight: "", height: "" },
        symptoms: "",
        past_history: "",
        plan: "",
        services: [],
        rx_code: "",
      });
    }
  }, [open, prescription, appointment, currentUser, patients, medicines, users]);

  const doctorOptions = users
    .filter((u) => String(u.role || "").toLowerCase() === "doctor")
    .map((u) => ({
      value: u.id,
      label: formatDoctorName(u.full_name || u.name || ""),
      rawName: u.full_name || u.name || "",
    }));

  const serviceOptions = serviceMasters
    .map((service) => ({
      value: service.id,
      label: `${service.name}${service.price != null ? ` - Rs ${Number(service.price || 0).toFixed(2)}` : ""}`,
      rawName: service.name || "",
      price: Number(service.price || 0),
    }))
    .sort((a, b) => a.rawName.localeCompare(b.rawName));

  const selectedDoctor = users.find((u) => u.id === form.doctor_id);
  const consultationFee = Math.max(0, Number(selectedDoctor?.doctor_fee || 0));
  const consultationService = {
    name: CONSULTATION_SERVICE_NAME,
    price: consultationFee.toFixed(2),
    is_consultation: true,
    doctor_id: form.doctor_id || null,
    doctor_name: form.doctor_name || "",
  };

  const handleDoctorChange = (doctorId) => {
    const doctor = users.find((u) => u.id === doctorId);
    setForm({
      ...form,
      doctor_id: doctorId,
      doctor_name: doctor?.full_name || doctor?.name || "",
    });
  };

  const handlePatientChange = (patientId) => {
    const patient = patients.find((p) => p.id === patientId);
    setForm({ ...form, patient_id: patientId, patient_name: patient?.name || "", uhid: patient?.uhid || "" });
  };

  const addMedicine = () => {
    setForm({
      ...form,
      medicines: [...form.medicines, { category: "", medicine_id: "", medicine_name: "", dose: "", interval: "", duration: "", instructions: "" }],
    });
  };

  const updateMedicine = (index, field, value) => {
    const updated = [...form.medicines];
    if (field === "medicine_id") {
      const med = medicines.find((m) => m.id === value);
      updated[index] = { ...updated[index], medicine_id: value, medicine_name: med?.name || "", category: med?.category || updated[index].category };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setForm({ ...form, medicines: updated });
  };

  const removeMedicine = (index) => {
    setForm({ ...form, medicines: form.medicines.filter((_, i) => i !== index) });
  };

  const addService = () => {
    setForm({ ...form, services: [...form.services, { service_id: "", name: "", price: "" }] });
  };

  const updateService = (index, serviceId) => {
    const selected = serviceMasters.find((service) => service.id === serviceId);
    const updated = [...form.services];
    updated[index] = {
      ...updated[index],
      service_id: serviceId,
      name: selected?.name || "",
      price: selected?.price == null ? "" : Number(selected.price).toFixed(2),
    };
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

  const handlePreSubmit = (e) => {
    e.preventDefault();
    if (!form.patient_id || !form.diagnosis.trim()) return;
    setConfirmOpen(true);
  };

  const handleSubmit = async () => {
    setConfirmOpen(false);
    setSaving(true);
    try {
      const payload = {
        patient_id: form.patient_id,
        patient_name: form.patient_name,
        doctor_id: form.doctor_id,
        doctor_name: form.doctor_name,
        diagnosis: form.diagnosis,
        notes: form.notes,
        appointment_id: form.appointment_id || null,
        rx_code: form.rx_code,
        medicines: form.medicines.filter((m) => m.medicine_id),
        notes_meta: {
          vitals: form.vitals,
          symptoms: form.symptoms,
          past_history: form.past_history,
          plan: form.plan,
          services: [
            consultationService,
            ...form.services
              .filter((service) => service.service_id && service.name)
              .map((service) => ({
                service_id: service.service_id,
                name: service.name,
                price: service.price === "" ? "0.00" : String(service.price),
              })),
          ],
          rx_code: form.rx_code,
        },
      };

      if (prescription) {
        await base44.entities.Prescription.update(prescription.id, payload);
        toast({ title: "Success", description: "Prescription updated successfully" });
      } else {
        await base44.entities.Prescription.create(payload);
        if (form.appointment_id) {
          await base44.entities.Appointment.update(form.appointment_id, { status: "Completed" });
        }
        toast({ title: "Success", description: "Prescription saved successfully" });
      }

      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      onOpenChange(false);
    } catch (e) {
      console.error("Save failed", e);
      toast({ title: "Error", description: e.message || "Failed to save prescription", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[80vw] w-[80vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prescription ? "Edit Prescription" : "New Prescription"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handlePreSubmit} className="space-y-6 py-4">
          {/* Patient & Basic Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800">Patient Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <Label>Patient *</Label>
                <Input value={form.patient_name || ""} disabled className="bg-slate-50" />
              </div>
              <div>
                <Label>UHID</Label>
                <Input value={form.uhid || ""} disabled className="bg-slate-50 font-mono" />
              </div>
              <div>
                <Label>Doctor</Label>
                <SearchableSelect
                  options={doctorOptions}
                  value={formatDoctorName(form.doctor_name)}
                  selectedValue={form.doctor_id}
                  onSelect={handleDoctorChange}
                  placeholder="Select doctor"
                  emptyMessage="No doctors found."
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <Label>Prescription ID</Label>
                <Input value={form.rx_code} disabled className="bg-slate-50 font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1"><Stethoscope className="w-3 h-3" /> HR</Label>
                <Input value={form.vitals.hr} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, hr: e.target.value } })} placeholder="bpm" className="h-8 text-xs px-2" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">RR</Label>
                <Input value={form.vitals.rr} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, rr: e.target.value } })} placeholder="rpm" className="h-8 text-xs px-2" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">BP</Label>
                <Input value={form.vitals.bp} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, bp: e.target.value } })} placeholder="e.g. 120/80" className="h-8 text-xs px-2" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">SpO₂</Label>
                <Input value={form.vitals.spo2} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, spo2: e.target.value } })} placeholder="%" className="h-8 text-xs px-2" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Temp</Label>
                <Input value={form.vitals.temp} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, temp: e.target.value } })} placeholder="°C/°F" className="h-8 text-xs px-2" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Weight</Label>
                <Input value={form.vitals.weight} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, weight: e.target.value } })} placeholder="kg" className="h-8 text-xs px-2" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Height</Label>
                <Input value={form.vitals.height} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, height: e.target.value } })} placeholder="cm" className="h-8 text-xs px-2" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Symptoms</Label>
                <Textarea value={form.symptoms} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} rows={5} placeholder="Presenting symptoms..." />
              </div>
              <div>
                <Label>Past History</Label>
                <Textarea value={form.past_history} onChange={(e) => setForm({ ...form, past_history: e.target.value })} rows={5} placeholder="Past medical/surgical history (optional)..." />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Plan</Label>
                <Textarea value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} rows={2} placeholder="Plan (optional)..." />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Additional notes (optional)..." />
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
          </div>

          {/* Medicines */}
          <div className="space-y-4">
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
              <div className="space-y-2">
                {form.medicines.map((med, index) => {
                  const filteredMeds = med.category
                    ? medicines.filter((m) => m.category === med.category)
                    : medicines;

                  return (
                    <div key={index} className="flex items-end gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex-1 min-w-[140px]">
                        <Label className="text-[10px] text-slate-500">Medicine Category</Label>
                        <SearchableSelect
                          options={categories}
                          value={med.category}
                          onSelect={(val) => updateMedicine(index, "category", val)}
                          placeholder="Select category"
                          emptyMessage="No category found."
                        />
                      </div>

                      <div className="flex-[1.5] min-w-[180px]">
                        <Label className="text-[10px] text-slate-500">Medicine Name</Label>
                        <SearchableSelect
                          options={filteredMeds.map((m) => ({ label: `${m.name} ${m.stock ? `(${m.stock})` : ""}`, value: m.id }))}
                          value={med.medicine_name}
                          onSelect={(val) => updateMedicine(index, "medicine_id", val)}
                          placeholder="Select medicine"
                          emptyMessage="No medicine found."
                        />
                      </div>

                      <div className="w-24">
                        <Label className="text-[10px] text-slate-500">Dose</Label>
                        <Input
                          value={med.dose}
                          onChange={(e) => updateMedicine(index, "dose", e.target.value)}
                          placeholder="e.g. 500mg"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="w-24">
                        <Label className="text-[10px] text-slate-500">Interval</Label>
                        <Input
                          value={med.interval}
                          onChange={(e) => updateMedicine(index, "interval", e.target.value)}
                          placeholder="e.g. 1-0-1"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="w-24">
                        <Label className="text-[10px] text-slate-500">Duration</Label>
                        <Input
                          value={med.duration}
                          onChange={(e) => updateMedicine(index, "duration", e.target.value)}
                          placeholder="e.g. 5 days"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-[10px] text-slate-500">Route/Instruction</Label>
                        <Input
                          value={med.instructions}
                          onChange={(e) => updateMedicine(index, "instructions", e.target.value)}
                          placeholder="e.g. After meals"
                          className="h-9 text-xs"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-red-500 shrink-0"
                        onClick={() => removeMedicine(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Services */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Services</h3>
              <Button type="button" variant="outline" size="sm" onClick={addService}>
                <Plus className="w-4 h-4 mr-1" /> Add Service
              </Button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="sm:col-span-4">
                  <Label className="text-xs">Service</Label>
                  <Input value={consultationService.name} disabled className="bg-white" />
                </div>
                <div className="sm:col-span-1">
                  <Label className="text-xs">Price</Label>
                  <Input value={consultationService.price} disabled className="bg-white" />
                </div>
                <div className="sm:col-span-1 text-xs text-slate-500 pb-2">From doctor fee</div>
              </div>

              {form.services.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No additional services added</p>
              ) : (
                <div className="space-y-3">
                  {form.services.map((s, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
                      <div className="sm:col-span-4">
                        <Label className="text-xs">Service</Label>
                        <SearchableSelect
                          options={serviceOptions}
                          value={s.name}
                          selectedValue={s.service_id}
                          onSelect={(serviceId) => updateService(idx, serviceId)}
                          placeholder="Select service"
                          emptyMessage="No services found."
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <Label className="text-xs">Price</Label>
                        <Input value={s.price} disabled className="bg-slate-50" placeholder="0.00" />
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
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Prescription
            </Button>
          </DialogFooter>
        </form>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Confirm Prescription
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to save this prescription? This will finalize the details and mark the appointment as completed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Review Again</AlertDialogCancel>
              <AlertDialogAction onClick={handleSubmit} className="bg-cyan-600 hover:bg-cyan-700">
                Confirm & Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
