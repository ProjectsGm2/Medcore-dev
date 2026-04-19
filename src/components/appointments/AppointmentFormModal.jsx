import React, { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Video, MapPin, Check, ChevronsUpDown } from "lucide-react";
import PatientFormModal from "@/components/patients/PatientFormModal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/apiClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
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

function SearchableSelect({
  options,
  value,
  onSelect,
  placeholder,
  emptyMessage = "No options found.",
  className,
}) {
  const [open, setOpen] = useState(false);

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
          {options.find((opt) => (typeof opt === "string" ? opt : opt.value) === value)?.label || 
           (typeof options.find((opt) => (typeof opt === "string" ? opt : opt.value) === value) === "string" ? options.find((opt) => (typeof opt === "string" ? opt : opt.value) === value) : null) ||
           placeholder}
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
                        value === val ? "opacity-100" : "opacity-0"
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

const emptyForm = {
  patient_id: "",
  patient_name: "",
  doctor_id: "",
  doctor_name: "",
  doctor_ids: [],
  doctor_ids_json: null,
  doctor_names: "",
  appointment_date: "",
  appointment_time: "",
  status: "Scheduled",
  type: "In-Person",
  payment_mode: "",
  discount: "",
  priority: "Normal",
  reason: "",
  notes: "",
};

function normalizeDateInput(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AppointmentFormModal({ open, onOpenChange, appointment, patients, doctors, onSave }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createPatientMut = useMutation({
    mutationFn: (data) => base44.entities.Patient.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["patients"] }),
  });

  useEffect(() => {
    if (appointment) {
      let doctorIds = [];
      if (appointment.doctor_ids_json) {
        try {
          const parsed = typeof appointment.doctor_ids_json === "string" ? JSON.parse(appointment.doctor_ids_json) : appointment.doctor_ids_json;
          if (Array.isArray(parsed)) doctorIds = parsed.filter(Boolean);
        } catch {
          doctorIds = [];
        }
      }
      if (doctorIds.length === 0 && appointment.doctor_id) {
        doctorIds = [appointment.doctor_id];
      }

      const doctorNames = appointment.doctor_names || appointment.doctor_name || "";

      setForm({
        ...emptyForm,
        ...appointment,
        appointment_date: normalizeDateInput(appointment.appointment_date),
        doctor_ids: doctorIds,
        doctor_ids_json: doctorIds.length ? JSON.stringify(doctorIds) : null,
        doctor_names: doctorNames,
        doctor_id: doctorIds[0] || appointment.doctor_id || "",
        doctor_name: doctorNames,
      });
    } else {
      setForm(emptyForm);
    }
  }, [appointment, open]);

  const handlePatientChange = (patientId) => {
    const patient = patients.find((p) => p.id === patientId);
    setForm({ ...form, patient_id: patientId, patient_name: patient?.name || "" });
  };

  const toggleDoctor = (doctorId) => {
    setForm((prev) => {
      const nextIds = new Set(prev.doctor_ids || []);
      if (nextIds.has(doctorId)) nextIds.delete(doctorId);
      else nextIds.add(doctorId);
      const doctorIds = Array.from(nextIds);
      const selected = doctors.filter((d) => doctorIds.includes(d.id));
      const doctorNames = selected.map((d) => `Dr. ${d.full_name}`).join(", ");
      return {
        ...prev,
        doctor_ids: doctorIds,
        doctor_ids_json: doctorIds.length ? JSON.stringify(doctorIds) : null,
        doctor_names: doctorNames,
        doctor_id: doctorIds[0] || "",
        doctor_name: doctorNames,
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const doctorIds = form.doctor_ids || [];
      if (!doctorIds.length) {
        toast({ title: "Validation", description: "Please select at least one doctor", variant: "destructive" });
        return;
      }
      if (!form.appointment_date) {
        toast({ title: "Validation", description: "Please select appointment date", variant: "destructive" });
        return;
      }
      if (!form.appointment_time) {
        toast({ title: "Validation", description: "Please select appointment time", variant: "destructive" });
        return;
      }

      const now = new Date();
      const dt = new Date(`${form.appointment_date}T${form.appointment_time}`);
      if (form.status === "Scheduled" && dt.getTime() < now.getTime()) {
        toast({ title: "Validation", description: "Appointment time cannot be in the past", variant: "destructive" });
        return;
      }

      const discountPct = form.discount === "" ? 0 : Number(form.discount);
      if (Number.isNaN(discountPct) || discountPct < 0 || discountPct > 100) {
        toast({ title: "Validation", description: "Discount must be between 0 and 100", variant: "destructive" });
        return;
      }

      // Don't overwrite notes field (used for WebRTC signaling) on updates
      const { notes, ...saveData } = form;

      saveData.doctor_id = doctorIds[0] || null;
      saveData.doctor_ids_json = doctorIds.length ? JSON.stringify(doctorIds) : null;
      saveData.doctor_names = form.doctor_names || null;

      saveData.appointment_time = saveData.appointment_time || null;
      saveData.reason = saveData.reason || null;
      saveData.discount = discountPct;

      await onSave(saveData);
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Error", description: err?.message || "Failed to save appointment", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const doctorOptions = doctors.map((d) => ({
    label: `Dr. ${d.full_name} ${d.specialization ? `(${d.specialization})` : ""}`,
    value: d.id,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appointment ? "Edit Appointment" : "Schedule Appointment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Patient *</Label>
            <div className="flex gap-2">
              <SearchableSelect
                options={patients.map((p) => ({ label: p.name, value: p.id }))}
                value={form.patient_id}
                onSelect={handlePatientChange}
                placeholder="Select patient"
              />
              <Button type="button" variant="outline" onClick={() => setPatientModalOpen(true)}>
                Add
              </Button>
            </div>
          </div>
          <div>
            <Label>Doctor *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className={cn("h-9 w-full justify-between text-xs font-normal", !form.doctor_ids?.length && "text-muted-foreground")}>
                  {form.doctor_ids?.length
                    ? doctors
                        .filter((d) => form.doctor_ids.includes(d.id))
                        .map((d) => `Dr. ${d.full_name}`)
                        .join(", ")
                    : "Select doctors"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="Search doctor..." className="h-8 text-xs" />
                  <CommandList>
                    <CommandEmpty>No doctors found.</CommandEmpty>
                    <CommandGroup>
                      {doctorOptions.map((opt) => (
                        <CommandItem
                          key={opt.value}
                          value={opt.label}
                          onSelect={() => toggleDoctor(opt.value)}
                          className="text-xs"
                        >
                          <Check className={cn("mr-2 h-4 w-4", form.doctor_ids?.includes(opt.value) ? "opacity-100" : "opacity-0")} />
                          {opt.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={form.appointment_date} onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} required />
            </div>
            <div>
              <Label>Time *</Label>
              <Input
                type="time"
                value={form.appointment_time || ""}
                onChange={(e) => setForm({ ...form, appointment_time: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Payment Mode</Label>
              <Select value={form.payment_mode} onValueChange={(v) => setForm({ ...form, payment_mode: v })}>
                <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank">Bank</SelectItem>
                  <SelectItem value="Insurance">Insurance</SelectItem>
                  <SelectItem value="Credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Discount (%)</Label>
              <Input type="number" min={0} max={100} step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {appointment && (
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Appointment Type</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {["In-Person", "Video Call"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-all ${
                    form.type === t
                      ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {t === "Video Call" ? <Video className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Reason for Visit</Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {appointment ? "Update" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
        <PatientFormModal
          open={patientModalOpen}
          onOpenChange={setPatientModalOpen}
          onSave={async (data) => {
            const created = await createPatientMut.mutateAsync(data);
            setPatientModalOpen(false);
            if (created?.id) {
              setForm((f) => ({ ...f, patient_id: created.id, patient_name: created.name }));
            } else {
              await queryClient.invalidateQueries({ queryKey: ["patients"] });
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
