import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { base44 } from "@/api/apiClient";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
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
import BillDetailModal from "@/components/dispensary/BillDetailModal";

const NONE = "__none__";

function dateOnly(value) {
  if (!value) return "";
  return String(value).split("T")[0];
}

function formatExpiry(value) {
  if (!value) return "";
  try {
    return format(new Date(value), "dd-MMM-yy");
  } catch {
    return dateOnly(value);
  }
}

function SearchableSelect({
  options,
  value,
  onSelect,
  placeholder,
  emptyMessage = "No options found.",
  className,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between text-xs font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {options.find((opt) => opt.value === value)?.label || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onSelect(option.value);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const emptyLine = (type = "medicine") => ({
  item_type: type,
  item_name: "",
  category_filter: NONE,
  medicine_id: NONE,
  batch_id: NONE,
  original_batch_id: NONE,
  original_quantity: "0",
  expiry_date: "",
  available: 0,
  sale_price: "",
  tax_percent: "0",
  quantity: "1",
});

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function computeLineAmounts(qty, salePrice, taxPercent) {
  const q = Math.max(0, Number(qty) || 0);
  const p = Math.max(0, Number(salePrice) || 0);
  const t = Math.max(0, Number(taxPercent) || 0);
  const sub = round2(q * p);
  const tax = round2(sub * (t / 100));
  const gross = round2(sub + tax);
  return { sub, tax, gross, total: gross };
}

export default function SaleFormModal({
  open,
  onOpenChange,
  medicines = [],
  categories = [],
  currentUser,
  onSave,
  onUpdate,
  bill,
  defaultDoctorId,
  defaultPatientId,
  prescription,
}) {
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
    enabled: open,
  });
  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 500),
    enabled: open,
  });

  const [doctorId, setDoctorId] = useState(NONE);
  const [patientId, setPatientId] = useState(NONE);
  const [patientUhid, setPatientUhid] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [billDiscount, setBillDiscount] = useState("0");
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savedBillId, setSavedBillId] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const initRef = useRef(null);

  const handlePatientSelect = (id) => {
    setPatientId(id);
    const p = patients.find((p) => p.id === id);
    setPatientUhid(p?.uhid || "");
  };

  const handleUhidSelect = (uhid) => {
    const p = patients.find((p) => p.uhid === uhid);
    if (p) {
      setPatientId(p.id);
      setPatientUhid(uhid);
    }
  };

  useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }

    const initKey = bill?.id ? `bill:${bill.id}` : prescription?.id ? `rx:${prescription.id}` : "new";
    if (initRef.current === initKey) return;
    initRef.current = initKey;

    if (open) {
      setSavedBillId(null);
      setPrintOpen(false);
      if (bill) {
        const docId = bill.doctor_id || NONE;
        const patId = bill.patient_id || NONE;

        setDoctorId(docId);
        setPatientId(patId);

        if (patId !== NONE) {
          const p = patients.find(pat => pat.id === patId);
          setPatientUhid(p?.uhid || "");
        } else {
          setPatientUhid("");
        }

        setNotes(bill.notes || "");
        setPaymentMode(bill.payment_mode || "");
        setPaymentAmount(bill.payment_amount == null ? "" : String(bill.payment_amount));
        setBillDiscount(bill.discount_total == null ? "0" : String(bill.discount_total));

        const initialLines = (bill.lines || []).map((L) => {
          const type = L.item_type || (L.medicine_id ? "medicine" : "service");
          if (type === "service") {
            return {
              ...emptyLine("service"),
              item_type: "service",
              item_name: L.item_name || "",
              sale_price: L.sale_price == null ? "" : String(L.sale_price),
              tax_percent: L.tax_percent == null ? "0" : String(L.tax_percent),
              quantity: L.quantity == null ? "1" : String(L.quantity),
            };
          }
          const med = medicines.find((m) => m.id === L.medicine_id);
          return {
            ...emptyLine("medicine"),
            item_type: "medicine",
            category_filter: med?.category || NONE,
            medicine_id: L.medicine_id || NONE,
            batch_id: L.batch_id || NONE,
            original_batch_id: L.batch_id || NONE,
            original_quantity: L.quantity == null ? "0" : String(L.quantity),
            expiry_date: L.expiry_date || "",
            available: 0,
            sale_price: L.sale_price == null ? "" : String(L.sale_price),
            tax_percent: L.tax_percent == null ? "0" : String(L.tax_percent),
            quantity: L.quantity == null ? "1" : String(L.quantity),
          };
        });

        setLines(initialLines.length ? initialLines : [emptyLine()]);
      } else {
        const docId = prescription?.doctor_id || defaultDoctorId || NONE;
        const patId = prescription?.patient_id || defaultPatientId || NONE;

        setDoctorId(docId);
        setPatientId(patId);

        if (patId !== NONE) {
          const p = patients.find(pat => pat.id === patId);
          setPatientUhid(p?.uhid || "");
        } else {
          setPatientUhid("");
        }

        setNotes(prescription ? `Linked to Prescription: ${prescription.rx_code || prescription.id}` : "");
        setPaymentMode("");
        setPaymentAmount("");
        setBillDiscount("0");

        const initialLines = [];

        if (prescription && prescription.medicines?.length > 0) {
          const medLines = prescription.medicines.map((m) => ({
            ...emptyLine("medicine"),
            category_filter: m.category || NONE,
            medicine_id: m.medicine_id || NONE,
            quantity: 1,
          }));
          initialLines.push(...medLines);
        }

        if (prescription?.notes_meta) {
          try {
            const meta = typeof prescription.notes_meta === "string" ? JSON.parse(prescription.notes_meta) : prescription.notes_meta;
            if (meta.services?.length > 0) {
              const serviceLines = meta.services.map((s) => ({
                ...emptyLine("service"),
                item_name: s.name,
                sale_price: s.price,
                quantity: 1,
              }));
              initialLines.push(...serviceLines);
            }
          } catch (e) {
            console.error("Failed to parse prescription services:", e);
          }
        }

        setLines(initialLines.length ? initialLines : [emptyLine()]);
      }
    }
  }, [open, currentUser, defaultDoctorId, defaultPatientId, prescription, patients, bill, medicines]);

  useEffect(() => {
    if (!open) return;
    if (!patientId || patientId === NONE) {
      setPatientUhid("");
      return;
    }
    const p = patients.find((p) => p.id === patientId);
    setPatientUhid(p?.uhid || "");
  }, [open, patientId, patients]);

  useEffect(() => {
    if (!open) return;
    if (!Array.isArray(medicines) || medicines.length === 0) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((L) => {
        if (L.item_type !== "medicine") return L;
        if (!L.medicine_id || L.medicine_id === NONE) return L;
        if (L.category_filter && L.category_filter !== NONE) return L;
        const med = medicines.find((m) => m.id === L.medicine_id);
        if (!med?.category) return L;
        changed = true;
        return { ...L, category_filter: med.category };
      });
      return changed ? next : prev;
    });
  }, [open, medicines]);

  const medsByCategory = (cat) => {
    if (!cat || cat === NONE) return medicines;
    return medicines.filter((m) => (m.category || "").toLowerCase() === String(cat).toLowerCase());
  };

  const [batchesByLine, setBatchesByLine] = useState({});
  const [batchesLoading, setBatchesLoading] = useState({});
  const [batchesError, setBatchesError] = useState({});
  const [batchesLoadedFor, setBatchesLoadedFor] = useState({});

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

  const loadBatches = async (idx, medicineId) => {
    if (!medicineId || medicineId === NONE) {
      setBatchesByLine((b) => ({ ...b, [idx]: [] }));
      setBatchesLoading((s) => ({ ...s, [idx]: false }));
      setBatchesError((e) => ({ ...e, [idx]: null }));
      return;
    }
    setBatchesLoading((s) => ({ ...s, [idx]: true }));
    setBatchesError((e) => ({ ...e, [idx]: null }));
    try {
      const includeId = lines[idx]?.batch_id && lines[idx]?.batch_id !== NONE ? lines[idx].batch_id : null;
      const rows = await base44.dispensary.batches(medicineId, includeId);
      setBatchesByLine((b) => ({ ...b, [idx]: rows || [] }));

      const list = Array.isArray(rows) ? rows : [];
      const selected = (lines[idx]?.batch_id && lines[idx]?.batch_id !== NONE)
        ? list.find((r) => r.id === lines[idx].batch_id)
        : null;
      if (selected?.id) {
        setLines((prev) => {
          if (!prev[idx]) return prev;
          const current = prev[idx];
          if (current.item_type !== "medicine") return prev;
          if (current.medicine_id !== medicineId) return prev;
          const baseAvail = Number(selected.quantity_remaining || 0);
          const extra =
            bill && current.original_batch_id === selected.id
              ? Math.max(0, Number(current.original_quantity || 0))
              : 0;
          const next = [...prev];
          next[idx] = {
            ...current,
            expiry_date: selected.expiry_date || current.expiry_date,
            available: baseAvail + extra,
            sale_price: String(selected.sale_price ?? current.sale_price ?? ""),
            tax_percent: String(selected.tax_percent ?? current.tax_percent ?? "0"),
          };
          return next;
        });
        return;
      }
      const candidate =
        list.find((r) => Number(r.quantity_remaining || 0) > 0) ||
        list[0] ||
        null;

      if (candidate?.id) {
        setLines((prev) => {
          if (!prev[idx]) return prev;
          const current = prev[idx];
          if (current.item_type !== "medicine") return prev;
          if (current.medicine_id !== medicineId) return prev;
          if (current.batch_id && current.batch_id !== NONE) return prev;
          const baseAvail = Number(candidate.quantity_remaining || 0);
          const next = [...prev];
          next[idx] = {
            ...current,
            batch_id: candidate.id,
            expiry_date: candidate.expiry_date || "",
            available: baseAvail,
            sale_price: String(candidate.sale_price || 0),
            tax_percent: String(candidate.tax_percent || 0),
          };
          return next;
        });
      }
    } catch (err) {
      setBatchesByLine((b) => ({ ...b, [idx]: [] }));
      setBatchesError((e) => ({ ...e, [idx]: err?.message || "Failed to load batches" }));
    } finally {
      setBatchesLoading((s) => ({ ...s, [idx]: false }));
    }
  };

  useEffect(() => {
    if (!open) return;
    lines.forEach((L, idx) => {
      if (L.medicine_id && L.medicine_id !== NONE) {
        loadBatches(idx, L.medicine_id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    lines.forEach((L, idx) => {
      const currentId = L.medicine_id;
      const prevId = batchesLoadedFor[idx];
      if (currentId && currentId !== NONE && currentId !== prevId) {
        loadBatches(idx, currentId);
        setBatchesLoadedFor((m) => ({ ...m, [idx]: currentId }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);
  const updateLine = (idx, patch) => {
    setLines((prev) => {
      const next = [...prev];
      const row = { ...next[idx], ...patch };
      if (patch.medicine_id !== undefined) {
        row.batch_id = NONE;
        row.expiry_date = "";
        row.available = 0;
        row.sale_price = "";
        row.tax_percent = "";
        loadBatches(idx, patch.medicine_id);
      }
      if (patch.batch_id !== undefined) {
        const batch = (batchesByLine[idx] || []).find((b) => b.id === patch.batch_id);
        row.expiry_date = batch?.expiry_date || "";
        const baseAvail = batch ? Number(batch.quantity_remaining || 0) : 0;
        const extra =
          bill && row.original_batch_id === patch.batch_id
            ? Math.max(0, Number(row.original_quantity || 0))
            : 0;
        row.available = baseAvail + extra;
        row.sale_price = batch ? String(batch.sale_price || 0) : row.sale_price;
        row.tax_percent = batch ? String(batch.tax_percent || 0) : row.tax_percent;
      }
      next[idx] = row;
      return next;
    });
  };

  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (i) => setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  const totals = useMemo(() => {
    const billDisc = Math.max(0, Number(billDiscount) || 0);
    const computed = lines.reduce(
      (acc, L) => {
        const { sub, tax, gross } = computeLineAmounts(L.quantity, L.sale_price, L.tax_percent);
        return {
          subtotal: round2(acc.subtotal + sub),
          tax_total: round2(acc.tax_total + tax),
          gross_total: round2(acc.gross_total + gross),
        };
      },
      { subtotal: 0, tax_total: 0, gross_total: 0 }
    );
    return {
      subtotal: computed.subtotal,
      tax_total: computed.tax_total,
      discount_total: round2(billDisc),
      gross_total: computed.gross_total,
      net_total: round2(Math.max(0, computed.gross_total - billDisc)),
    };
  }, [lines, billDiscount]);

  const handlePreSubmit = (e) => {
    e.preventDefault();
    if (savedBillId) return;
    if (!prescription && (!patientId || patientId === NONE)) {
      setSaveError("Patient is required.");
      return;
    }
    if (lines.some(l => l.item_type === "medicine" && l.medicine_id !== NONE && Number(l.quantity) > l.available)) {
       setSaveError("One or more items exceed available stock.");
       return;
    }
    setConfirmOpen(true);
  };

  const handleSubmit = async () => {
    setConfirmOpen(false);
    setSaving(true);
    setSaveError("");
    const discountTotal = Math.max(0, Number(billDiscount) || 0);
    const payloadLines = lines
      .map((L) => ({
        item_type: L.item_type || "medicine",
        item_name: L.item_name || "",
        medicine_id: L.medicine_id === NONE ? null : L.medicine_id,
        batch_id: L.batch_id === NONE ? null : L.batch_id,
        quantity: Math.max(0, parseInt(L.quantity, 10) || 0),
        sale_price: Number(L.sale_price) || 0,
        tax_percent: Number(L.tax_percent) || 0,
      }))
      .filter((l) => (l.item_type === "service" && l.item_name) || (l.item_type === "medicine" && l.medicine_id && l.quantity > 0));

    if (!payloadLines.length) {
      setSaveError("At least one valid line item is required");
      setSaving(false);
      return;
    }
    const doctorName = users.find((u) => u.id === doctorId)?.full_name || prescription?.doctor_name || null;
    const patientName = patients.find((p) => p.id === patientId)?.name || prescription?.patient_name || null;
    if (!patientName) {
      setSaveError("Patient is required.");
      setSaving(false);
      return;
    }
    const payload = {
      doctor_name: doctorName,
      doctor_id: doctorId && doctorId !== NONE ? doctorId : null,
      patient_name: patientName,
      patient_id: patientId && patientId !== NONE ? patientId : null,
      prescription_id: prescription?.id || null,
      notes: notes || null,
      payment_mode: paymentMode || null,
      payment_amount: paymentAmount === "" ? 0 : Number(paymentAmount),
      discount_total: discountTotal,
      lines: payloadLines,
    };
    try {
      const saved = bill && onUpdate ? await onUpdate(bill.id, payload) : await onSave(payload);
      const id = bill?.id || saved?.id || saved?.bill_id || null;
      if (!id) {
        setSaveError("Bill saved but no bill ID was returned");
      } else {
        setSavedBillId(id);
      }
    } catch (err) {
      setSaveError(err?.message || "Failed to save bill");
    } finally {
      setSaving(false);
    }
  };

  const medicineLines = lines.filter(l => l.item_type === "medicine");
  const serviceLines = lines.filter(l => l.item_type === "service");

  const patientOptions = patients.map((p) => ({ label: p.name, value: p.id }));
  const uhidOptions = patients
    .filter((p) => p.uhid)
    .map((p) => ({ label: p.uhid, value: p.uhid }));
  const doctorOptions = users
    .filter((u) => u.role === "doctor")
    .map((u) => ({ label: `Dr. ${u.full_name}`, value: u.id }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1600px] max-h-[98vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between px-2">
            <DialogTitle>{bill ? "Edit Bill" : "Generate Bill"}</DialogTitle>
            {prescription && (
              <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">
                Prescription: {prescription.rx_code || prescription.id}
              </Badge>
            )}
          </div>
        </DialogHeader>
        <form onSubmit={handlePreSubmit} className="space-y-4 pt-2 px-2">
          {/* Patient & Doctor Info */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 p-4 bg-slate-100/50 rounded-lg border">
            <div>
              <Label className="text-[10px] uppercase font-bold text-slate-500">Patient Name</Label>
              {prescription ? (
                <Input value={patients.find(p => p.id === patientId)?.name || prescription?.patient_name || ""} disabled className="bg-white h-9" />
              ) : (
                <SearchableSelect
                  options={patientOptions}
                  value={patientId}
                  onSelect={handlePatientSelect}
                  placeholder="Select patient"
                  className="bg-white"
                />
              )}
            </div>
            <div>
              <Label className="text-[10px] uppercase font-bold text-slate-500">UHID</Label>
              {prescription ? (
                <Input value={patientUhid || ""} disabled className="bg-white font-mono h-9" />
              ) : (
                <SearchableSelect
                  options={uhidOptions}
                  value={patientUhid}
                  onSelect={handleUhidSelect}
                  placeholder="Select UHID"
                  className="bg-white font-mono"
                />
              )}
            </div>
            <div>
              <Label className="text-[10px] uppercase font-bold text-slate-500">Doctor</Label>
              {prescription ? (
                <Input value={users.find(u => u.id === doctorId)?.full_name || prescription?.doctor_name || ""} disabled className="bg-white h-9" />
              ) : (
                <SearchableSelect
                  options={doctorOptions}
                  value={doctorId}
                  onSelect={setDoctorId}
                  placeholder="Select doctor"
                  className="bg-white"
                />
              )}
            </div>
            <div>
              <Label className="text-[10px] uppercase font-bold text-slate-500">Billing Date</Label>
              <Input value={new Date().toLocaleDateString()} disabled className="bg-white h-9" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-3 p-4 bg-slate-50 rounded-lg border space-y-3">
              <h3 className="font-semibold text-sm border-bottom pb-2">Payment Details</h3>
              <div>
                <Label className="text-xs">Payment Mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Select mode" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Bank">Bank</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Amount Paid</Label>
                <Input className="h-9 bg-white" type="number" step="0.01" min="0" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Discount (overall)</Label>
                <Input className="h-9 bg-white" type="number" step="0.01" min="0" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input className="h-9 bg-white" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>

            <div className="lg:col-span-9 space-y-4">
              {/* Medicine Card */}
              <div className="p-4 bg-white rounded-lg border shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2 text-cyan-700">
                    <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    Medicines
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine("medicine")])} className="h-8 gap-1">
                    <Plus className="w-4 h-4" /> Add Medicine
                  </Button>
                </div>
                
                {medicineLines.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No medicines added.</p>
                ) : (
                  <div className="space-y-2">
                    {lines.map((L, idx) => {
                      if (L.item_type !== "medicine") return null;
                      const meds = medsByCategory(L.category_filter);
                      const batches = batchesByLine[idx] || [];
                      const isLoadingBatches = !!batchesLoading[idx];
                      const { total } = computeLineAmounts(L.quantity, L.sale_price, L.tax_percent);
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-end w-full p-2 rounded border bg-slate-50/50">
                          <div className="col-span-1">
                            <Label className="text-[9px] uppercase text-slate-500">Category</Label>
                            <Select value={L.category_filter} onValueChange={(v) => updateLine(idx, { category_filter: v, medicine_id: NONE })}>
                              <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="All" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>All</SelectItem>
                                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-4">
                            <Label className="text-[9px] uppercase text-slate-500">Medicine</Label>
                            <Select value={L.medicine_id} onValueChange={(v) => updateLine(idx, { medicine_id: v })}>
                              <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                {(meds || []).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Label className="text-[9px] uppercase text-slate-500">Batch</Label>
                            <Select value={L.batch_id} onValueChange={(v) => updateLine(idx, { batch_id: v })} disabled={!L.medicine_id || L.medicine_id === NONE}>
                              <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Batch" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>None</SelectItem>
                                {isLoadingBatches && <div className="px-2 py-1 text-xs text-slate-500">Loading…</div>}
                                {batches.map((b) => (
                                  <SelectItem key={b.id} value={b.id}>
                                    {(b.batch_number || "N/A")}{b.expiry_date ? ` • Exp ${formatExpiry(b.expiry_date)}` : ""} • Available {Number(b.quantity_remaining || 0)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-1">
                            <Label className="text-[9px] uppercase text-slate-500">Expiry</Label>
                            <Input className="h-8 text-[10px] px-1 bg-white" value={formatExpiry(L.expiry_date)} readOnly />
                          </div>
                          <div className="col-span-1 text-center">
                            <Label className="text-[9px] uppercase text-slate-500">Available</Label>
                            <div className="h-8 flex items-center justify-center text-[10px] font-mono border rounded bg-white">{L.available}</div>
                          </div>
                          <div className="col-span-1">
                            <Label className="text-[9px] uppercase text-slate-500">Price</Label>
                            <Input className="h-8 text-xs px-1 bg-white" type="number" value={L.sale_price} onChange={(e) => updateLine(idx, { sale_price: e.target.value })} />
                          </div>
                          <div className="col-span-1">
                            <Label className="text-[9px] uppercase text-slate-500">Quantity</Label>
                            <Input className="h-8 text-xs px-1 border-cyan-200 bg-white" type="number" value={L.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                          </div>
                          <div className="col-span-1">
                            <Label className="text-[9px] uppercase text-slate-500 text-right">Total</Label>
                            <div className="h-8 flex items-center justify-end gap-1">
                              <div className="text-xs font-bold text-cyan-700">₹{total.toFixed(2)}</div>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => removeLine(idx)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Services Card */}
              <div className="p-4 bg-white rounded-lg border shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2 text-emerald-700">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Services
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine("service")])} className="h-8 gap-1">
                    <Plus className="w-4 h-4" /> Add Service
                  </Button>
                </div>

                {serviceLines.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No services added.</p>
                ) : (
                  <div className="space-y-2">
                    {lines.map((L, idx) => {
                      if (L.item_type !== "service") return null;
                      const { total } = computeLineAmounts(L.quantity, L.sale_price, L.tax_percent);
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-3 items-end w-full p-2 rounded border bg-slate-50/50">
                          <div className="col-span-6">
                            <Label className="text-[9px] uppercase text-slate-500">Service Description</Label>
                            <Input className="h-8 text-xs px-2 bg-white" value={L.item_name} onChange={(e) => updateLine(idx, { item_name: e.target.value })} placeholder="Consultation, Dressing, etc." />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-[9px] uppercase text-slate-500">Price</Label>
                            <Input className="h-8 text-xs px-2 bg-white" type="number" value={L.sale_price} onChange={(e) => updateLine(idx, { sale_price: e.target.value })} />
                          </div>
                          <div className="col-span-1">
                            <Label className="text-[9px] uppercase text-slate-500 text-center">Qty</Label>
                            <Input className="h-8 text-xs px-2 bg-white text-center" type="number" value={L.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-[9px] uppercase text-slate-500 text-right">Total</Label>
                            <div className="h-8 flex items-center justify-end text-xs font-bold text-emerald-700 pr-1">₹{total.toFixed(2)}</div>
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => removeLine(idx)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 p-4 bg-slate-100 rounded-lg border">
            <div>
              <Label className="text-[10px] uppercase font-bold text-slate-500">Subtotal</Label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-white text-sm font-medium">₹{totals.subtotal.toFixed(2)}</div>
            </div>
            <div>
              <Label className="text-[10px] uppercase font-bold text-slate-500">Tax</Label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-white text-sm font-medium">₹{totals.tax_total.toFixed(2)}</div>
            </div>
            <div>
              <Label className="text-[10px] uppercase font-bold text-slate-500">Discount</Label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-white text-sm font-medium">₹{totals.discount_total.toFixed(2)}</div>
            </div>
            <div>
              <Label className="text-[10px] uppercase font-bold text-slate-500">Gross</Label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-white text-sm font-medium">₹{totals.gross_total.toFixed(2)}</div>
            </div>
            <div>
              <Label className="text-[10px] uppercase font-bold text-slate-500">Net Payable</Label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-cyan-600 text-white text-sm font-bold shadow-inner">₹{totals.net_total.toFixed(2)}</div>
            </div>
          </div>

          <DialogFooter className="px-2 pb-2">
            {saveError && (
              <div className="text-xs text-red-600 mr-auto flex items-center bg-red-50 px-3 py-1 rounded-full border border-red-100">
                {saveError}
              </div>
            )}
            {!saveError && savedBillId && (
              <div className="text-xs text-emerald-700 mr-auto flex items-center bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                Bill saved successfully
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {savedBillId ? (
              <Button type="button" onClick={() => setPrintOpen(true)} className="bg-cyan-600 hover:bg-cyan-700 min-w-[120px]">
                Print Bill
              </Button>
            ) : (
              <Button type="submit" disabled={saving || lines.length === 0} className="bg-cyan-600 hover:bg-cyan-700 min-w-[120px]">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : bill ? "Save Bill" : "Finalize Bill"}
              </Button>
            )}
          </DialogFooter>
        </form>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{bill ? "Confirm Bill Update" : "Confirm Final Bill"}</AlertDialogTitle>
              <AlertDialogDescription>
                {bill
                  ? "Are you sure you want to update this bill? This will adjust inventory based on the updated quantities and batches."
                  : "Are you sure you want to finalize this bill? This will deduct stock from the dispensary and cannot be easily reversed."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Review Bill</AlertDialogCancel>
              <AlertDialogAction onClick={handleSubmit} className="bg-cyan-600 hover:bg-cyan-700">Confirm & Save</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <BillDetailModal
          open={printOpen}
          onOpenChange={setPrintOpen}
          billId={savedBillId}
        />
      </DialogContent>
    </Dialog>
  );
}
