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
import { Loader2 } from "lucide-react";
import { Dialog as UiDialog, DialogContent as UiDialogContent, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle, DialogFooter as UiDialogFooter } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const NONE = "__none__";

const emptyPatient = {
  name: "",
  date_of_birth: "",
  age: "",
  gender: NONE,
  phone: "",
  blood_group: NONE,
  known_allergies: "",
  marital_status: NONE,
  guardian_name: "",
  address: "",
  medical_notes: "",
  emergency_contact: "",
};

function dobToInputValue(dob) {
  if (!dob) return "";
  const s = String(dob);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default function PatientFormModal({ open, onOpenChange, patient, onSave }) {
  const [form, setForm] = useState(emptyPatient);
  const [saving, setSaving] = useState(false);
  const [brandPrompt, setBrandPrompt] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (patient) {
      setForm({
        ...emptyPatient,
        ...patient,
        date_of_birth: dobToInputValue(patient.date_of_birth),
        age: patient.age != null ? String(patient.age) : "",
        gender: patient.gender || NONE,
        blood_group: patient.blood_group || NONE,
        marital_status: patient.marital_status || NONE,
      });
    } else {
      setForm(emptyPatient);
    }
  }, [patient, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date_of_birth && (form.age === "" || form.age == null)) return;
    setSaving(true);
    setErrorMsg("");
    try {
      const payload = {
        name: form.name,
        date_of_birth: form.date_of_birth || null,
        age: form.age === "" ? null : Number(form.age),
        gender: form.gender === NONE ? null : form.gender,
        phone: form.phone?.trim() || null,
        blood_group: form.blood_group === NONE ? null : form.blood_group,
        known_allergies: form.known_allergies || null,
        marital_status: form.marital_status === NONE ? null : form.marital_status,
        guardian_name: form.guardian_name || null,
        address: form.address || null,
        medical_notes: form.medical_notes || null,
        emergency_contact: form.emergency_contact || null,
      };
      await onSave(payload);
      onOpenChange(false);
    } catch (err) {
      const msg = err?.message || "Failed to save";
      setErrorMsg(msg);
      if (/brand name/i.test(msg)) {
        setBrandPrompt(true);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{patient ? "Edit Patient" : "Register New Patient"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Full name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Patient full name"
              />
            </div>
            <div>
              <Label>Date of birth</Label>
              <Input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => {
                  const val = e.target.value;
                  let ageStr = form.age;
                  if (val) {
                    const d = new Date(`${val}T12:00:00`);
                    if (!isNaN(d.getTime())) {
                      const today = new Date();
                      let a = today.getFullYear() - d.getFullYear();
                      const m = today.getMonth() - d.getMonth();
                      if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a -= 1;
                      ageStr = String(a);
                    }
                  }
                  setForm({ ...form, date_of_birth: val, age: ageStr });
                }}
              />
            </div>
            <div>
              <Label>Age *</Label>
              <Input
                type="number"
                min={0}
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                required
                placeholder="Years"
              />
              <p className="text-xs text-slate-500 mt-1">Age is required. It auto-calculates when DOB is provided.</p>
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not specified</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Blood group</Label>
              <Select value={form.blood_group} onValueChange={(v) => setForm({ ...form, blood_group: v })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not specified</SelectItem>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                    <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Any known allergies</Label>
              <Textarea
                value={form.known_allergies}
                onChange={(e) => setForm({ ...form, known_allergies: e.target.value })}
                rows={2}
                placeholder="e.g. Penicillin, peanuts (optional)"
              />
            </div>
            <div>
              <Label>Marital status</Label>
              <Select value={form.marital_status} onValueChange={(v) => setForm({ ...form, marital_status: v })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not specified</SelectItem>
                  <SelectItem value="Single">Single</SelectItem>
                  <SelectItem value="Married">Married</SelectItem>
                  <SelectItem value="Divorced">Divorced</SelectItem>
                  <SelectItem value="Widowed">Widowed</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Guardian name</Label>
              <Input
                value={form.guardian_name}
                onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Emergency contact</Label>
              <Input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Medical notes</Label>
              <Textarea value={form.medical_notes} onChange={(e) => setForm({ ...form, medical_notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {patient ? "Update" : "Register"}
            </Button>
          </DialogFooter>
          {errorMsg && (
            <p className="text-xs text-red-600 mt-2">{errorMsg}</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
    <UiDialog open={brandPrompt} onOpenChange={setBrandPrompt}>
      <UiDialogContent>
        <UiDialogHeader>
          <UiDialogTitle>Brand Name Required</UiDialogTitle>
        </UiDialogHeader>
        <div className="text-sm text-slate-600">
          Please set your clinic Brand Name in Settings to auto-generate UHID for patients.
        </div>
        <UiDialogFooter>
          <Button variant="outline" onClick={() => setBrandPrompt(false)}>Close</Button>
          <Link to={createPageUrl("Settings")}>
            <Button className="bg-cyan-600 hover:bg-cyan-700">Open Settings</Button>
          </Link>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
    </>
  );
}
