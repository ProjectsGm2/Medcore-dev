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
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp, Check, ChevronsUpDown, Pencil } from "lucide-react";
import { format } from "date-fns";
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

const NONE = "__none__";

const emptyLine = () => ({
  medicine_id: NONE,
  category_filter: NONE,
  batch_number: "",
  expiry_date: "",
  mrp: "",
  batch_amount: "",
  sale_price: "",
  sale_price_manual: false,
  packing_quantity: "1",
  quantity: "",
  purchase_price: "",
  tax_percent: "0",
});

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function computeLineSubtotal(qty, purchasePrice) {
  const q = Math.max(0, Number(qty) || 0);
  const p = Math.max(0, Number(purchasePrice) || 0);
  return round2(q * p);
}

function computeLineTax(qty, purchasePrice, taxPercent) {
  const subtotal = computeLineSubtotal(qty, purchasePrice);
  const t = Math.max(0, Number(taxPercent) || 0);
  return round2(subtotal * t / 100);
}

function computeLineAmount(qty, purchasePrice, taxPercent) {
  return round2(computeLineSubtotal(qty, purchasePrice) + computeLineTax(qty, purchasePrice, taxPercent));
}

function computeSaleFromMrp(mrp, taxPercent) {
  const m = Number(mrp) || 0;
  const t = Math.max(0, Number(taxPercent) || 0);
  if (m <= 0) return "";
  if (t <= 0) return round2(m);
  return round2(m / (1 + t / 100));
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
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-9 w-full justify-between text-xs font-normal", className)}
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

export default function GrnFormModal({
  open,
  onOpenChange,
  suppliers = [],
  medicines = [],
  categories = [],
  grn = null,
  onSave,
  onAddSupplier,
}) {
  const [supplierId, setSupplierId] = useState(NONE);
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [discount, setDiscount] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) {
      if (grn) {
        setSupplierId(grn.supplier_id || NONE);
        setBillNumber(grn.bill_number || "");
        setBillDate(grn.bill_date ? format(new Date(grn.bill_date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
        setNotes(grn.notes || "");
        setLines(
          Array.isArray(grn.lines) && grn.lines.length > 0
            ? grn.lines.map((line) => ({
                medicine_id: line.medicine_id || NONE,
                category_filter: line.medicine_category || medicines.find((m) => m.id === line.medicine_id)?.category || NONE,
                batch_number: line.batch_number || "",
                expiry_date: line.expiry_date ? format(new Date(line.expiry_date), "yyyy-MM-dd") : "",
                mrp: line.mrp == null ? "" : String(line.mrp),
                batch_amount: line.batch_amount == null ? "" : String(line.batch_amount),
                sale_price: line.sale_price == null ? "" : String(line.sale_price),
                sale_price_manual: true,
                packing_quantity: line.packing_quantity == null ? "1" : String(line.packing_quantity),
                quantity: line.quantity == null ? "" : String(line.quantity),
                purchase_price: line.purchase_price == null ? "" : String(line.purchase_price),
                tax_percent: line.tax_percent == null ? "0" : String(line.tax_percent),
                legacy_id: line.legacy_id || null,
              }))
            : [emptyLine()]
        );
        setDiscount(grn.discount == null ? "" : String(grn.discount));
        setPaymentMode(grn.payment_mode || "");
        setPaymentNote(grn.payment_note || "");
      } else {
        setSupplierId(NONE);
        setBillNumber("");
        setBillDate(format(new Date(), "yyyy-MM-dd"));
        setNotes("");
        setLines([emptyLine()]);
        setDiscount("");
        setPaymentMode("");
        setPaymentNote("");
      }
      setSummaryCollapsed(false);
      setCollapsed({});
    }
  }, [open, grn, medicines]);

  const medsForLine = (L) => {
    if (!L.category_filter || L.category_filter === NONE) return medicines;
    return medicines.filter(
      (m) => (m.category || "").toLowerCase() === String(L.category_filter).toLowerCase()
    );
  };

  const updateLine = (idx, patch) => {
    setLines((prev) => {
      const next = [...prev];
      const row = { ...next[idx], ...patch };
      if (patch.mrp !== undefined || patch.tax_percent !== undefined) {
        row.sale_price_manual = false;
        const auto = computeSaleFromMrp(row.mrp, row.tax_percent);
        row.sale_price = auto === "" ? "" : String(auto);
      }
      if (patch.sale_price_manual === true) {
        row.sale_price_manual = true;
      }
      next[idx] = row;
      return next;
    });
  };

  const addLine = () => {
    setLines((p) => {
      const next = [...p, emptyLine()];
      setCollapsed(() => {
        const c = {};
        for (let i = 0; i < p.length; i++) c[i] = true;
        c[p.length] = false;
        return c;
      });
      return next;
    });
  };
  const removeLine = (idx) => {
    if (lines.length <= 1) return;
    setLines((p) => p.filter((_, i) => i !== idx));
    setCollapsed((prev) => {
      const n = { ...prev };
      delete n[idx];
      return n;
    });
  };

  const handlePreSubmit = (e) => {
    e.preventDefault();
    if (!billNumber.trim()) return;
    if (lines.every(l => l.medicine_id === NONE || !l.quantity)) return;
    setConfirmOpen(true);
  };

  const handleSubmit = async () => {
    setConfirmOpen(false);
    const payloadLines = lines
      .map((L) => {
        const medicine_id = L.medicine_id === NONE ? "" : L.medicine_id;
        return {
          medicine_id,
          batch_number: L.batch_number?.trim() || null,
          expiry_date: L.expiry_date || null,
          mrp: Number(L.mrp) || 0,
          batch_amount: L.batch_amount === "" ? null : Number(L.batch_amount),
          sale_price: L.sale_price === "" ? null : Number(L.sale_price),
          packing_quantity: Math.max(1, parseInt(L.packing_quantity, 10) || 1),
          quantity: Math.max(0, parseInt(L.quantity, 10) || 0),
          purchase_price: Number(L.purchase_price) || 0,
          tax_percent: Number(L.tax_percent) || 0,
          legacy_id: L.legacy_id || null,
        };
      })
      .filter((l) => l.medicine_id && l.quantity > 0);

    if (!payloadLines.length) return;

    setSaving(true);
    try {
      await onSave({
        supplier_id: supplierId === NONE ? null : supplierId,
        bill_number: billNumber.trim(),
        bill_date: billDate || null,
        notes: notes.trim() || null,
        discount: discount === "" ? 0 : Number(discount),
        payment_mode: paymentMode || null,
        payment_note: paymentNote?.trim() || null,
        lines: payloadLines,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const subtotal = lines.reduce(
    (sum, L) => sum + computeLineSubtotal(L.quantity, L.purchase_price),
    0
  );
  const taxTotal = lines.reduce(
    (sum, L) => sum + computeLineTax(L.quantity, L.purchase_price, L.tax_percent),
    0
  );
  const discountNum = discount === "" ? 0 : Math.max(0, Number(discount) || 0);
  const totalAfter = Math.max(0, round2(subtotal + taxTotal - discountNum));
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name || "Not specified";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1600px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{grn ? "Edit GRN" : "GRN — Purchase stock"}</DialogTitle>
          <p className="text-xs text-slate-500">
            Sale price defaults to <strong>MRP ÷ (1 + %Tax/100)</strong> when MRP is tax-inclusive. Amount = Quantity × Purchase price × (1 + %Tax/100).
          </p>
        </DialogHeader>
        <form onSubmit={handlePreSubmit} className="space-y-4">
          <div className="bg-slate-50 rounded-lg border">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <Label className="text-sm">Overall GRN</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSummaryCollapsed((v) => !v)}>
                {summaryCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </Button>
            </div>
            {summaryCollapsed ? (
              <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-4 text-sm">
                  <span className="text-slate-500">Supplier: </span>
                  <span className="font-medium">{supplierName}</span>
                </div>
                <div className="lg:col-span-2 text-sm">
                  <span className="text-slate-500">Bill #: </span>
                  <span className="font-medium">{billNumber || "-"}</span>
                </div>
                <div className="lg:col-span-2 text-sm">
                  <span className="text-slate-500">Subtotal: </span>
                  <span className="font-medium">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="lg:col-span-2 text-sm">
                  <span className="text-slate-500">Tax: </span>
                  <span className="font-medium">₹{taxTotal.toFixed(2)}</span>
                </div>
                <div className="lg:col-span-2 text-sm">
                  <span className="text-slate-500">Discount: </span>
                  <span className="font-medium">₹{discountNum.toFixed(2)}</span>
                </div>
                <div className="lg:col-span-2 text-sm">
                  <span className="text-slate-500">Net Total: </span>
                  <span className="font-semibold">₹{totalAfter.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3">
                  <div className="sm:col-span-2 flex flex-col gap-2">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label>Supplier</Label>
                        <Select value={supplierId} onValueChange={setSupplierId}>
                          <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Not specified</SelectItem>
                            {suppliers.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {onAddSupplier && (
                        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onAddSupplier}>
                          New supplier
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Bill number *</Label>
                    <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} required placeholder="Invoice / bill #" />
                  </div>
                  <div>
                    <Label>Bill date</Label>
                    <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Label>Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 border-t">
                  <div className="lg:col-span-2">
                    <Label className="text-xs">Subtotal (calc.)</Label>
                    <div className="h-9 px-3 flex items-center rounded-md border bg-white text-sm font-medium">
                      ₹{subtotal.toFixed(2)}
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <Label className="text-xs">Tax total (calc.)</Label>
                    <div className="h-9 px-3 flex items-center rounded-md border bg-white text-sm font-medium">
                      ₹{taxTotal.toFixed(2)}
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <Label className="text-xs">Discount</Label>
                    <Input
                      className="h-9"
                      type="number"
                      step="0.01"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <Label className="text-xs">Net total amount</Label>
                    <div className="h-9 px-3 flex items-center rounded-md border bg-white text-sm font-semibold text-slate-800">
                      ₹{totalAfter.toFixed(2)}
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <Label className="text-xs">Payment mode</Label>
                    <Select value={paymentMode} onValueChange={setPaymentMode}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select mode" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Bank">Bank</SelectItem>
                        <SelectItem value="Credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="lg:col-span-12">
                    <Label className="text-xs">Payment note</Label>
                    <Input
                      className="h-9"
                      placeholder="Optional payment reference/notes"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Line items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1">
                <Plus className="w-4 h-4" /> Add line
              </Button>
            </div>

            {lines.map((L, idx) => {
              const meds = medsForLine(L);
              const lineAmount = computeLineAmount(L.quantity, L.purchase_price, L.tax_percent);
              const medName = medicines.find((m) => m.id === L.medicine_id)?.name || "Select medicine";
              const isCollapsed = !!collapsed[idx];
              return (
                <div key={idx} className="p-3 border rounded-lg space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="px-2 py-1 rounded-md border text-xs text-slate-600">#{idx + 1}</div>
                      <div className="text-sm text-slate-700">
                        {medName}
                        {isCollapsed && (
                          <span className="text-slate-500 text-xs ml-2">
                            Qty {L.quantity || 0} × ₹{Number(L.purchase_price || 0).toFixed(2)} • Tax {Number(L.tax_percent || 0)}% • ₹{lineAmount.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCollapsed((c) => ({ ...c, [idx]: false }))}
                        disabled={!isCollapsed}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCollapsed((c) => ({ ...c, [idx]: !isCollapsed }))}
                      >
                        {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeLine(idx)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-2">
                      <div className="lg:col-span-2">
                        <Label className="text-xs">Medicine category</Label>
                        <Select
                          value={L.category_filter}
                          onValueChange={(v) => {
                            updateLine(idx, { category_filter: v, medicine_id: NONE });
                          }}
                        >
                          <SelectTrigger className="h-9"><SelectValue placeholder="All categories" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>All categories</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 md:col-span-3 lg:col-span-4">
                        <Label className="text-xs">Medicine name *</Label>
                        <SearchableSelect
                          options={meds.map((m) => ({ label: `${m.name}${m.category ? ` — ${m.category}` : ""}`, value: m.id }))}
                          value={L.medicine_id}
                          onSelect={(v) => updateLine(idx, { medicine_id: v })}
                          placeholder="Select medicine"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <Label className="text-xs">Batch number</Label>
                        <Input className="h-9" value={L.batch_number} onChange={(e) => updateLine(idx, { batch_number: e.target.value })} />
                      </div>
                      <div className="lg:col-span-2">
                        <Label className="text-xs">Expiry date</Label>
                        <Input className="h-9" type="date" value={L.expiry_date} onChange={(e) => updateLine(idx, { expiry_date: e.target.value })} />
                      </div>
                      <div className="lg:col-span-1">
                        <Label className="text-xs">Packing qty</Label>
                        <Input className="h-9" type="number" min="1" value={L.packing_quantity} onChange={(e) => updateLine(idx, { packing_quantity: e.target.value })} />
                      </div>
                      <div className="lg:col-span-1">
                        <Label className="text-xs">Quantity *</Label>
                        <Input className="h-9" type="number" min="1" value={L.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                      </div>
                      <div className="lg:col-span-1">
                        <Label className="text-xs">MRP</Label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.01"
                          min="0"
                          value={L.mrp}
                          onChange={(e) => updateLine(idx, { mrp: e.target.value })}
                        />
                      </div>
                      <div className="lg:col-span-1">
                        <Label className="text-xs">Batch amount</Label>
                        <Input className="h-9" type="number" step="0.01" min="0" value={L.batch_amount} onChange={(e) => updateLine(idx, { batch_amount: e.target.value })} />
                      </div>
                      <div className="lg:col-span-2">
                        <Label className="text-xs">Purchase price</Label>
                        <Input className="h-9" type="number" step="0.01" min="0" value={L.purchase_price} onChange={(e) => updateLine(idx, { purchase_price: e.target.value })} />
                      </div>
                      <div className="lg:col-span-1">
                        <Label className="text-xs">% Tax</Label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.01"
                          min="0"
                          value={L.tax_percent}
                          onChange={(e) => updateLine(idx, { tax_percent: e.target.value })}
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <Label className="text-xs">Sale price (ex-tax)</Label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.01"
                          min="0"
                          value={L.sale_price}
                          onChange={(e) => updateLine(idx, { sale_price: e.target.value, sale_price_manual: true })}
                        />
                      </div>
                      <div className="flex items-center lg:col-span-2">
                        <div className="w-full">
                          <Label className="text-xs">Amount (calc.)</Label>
                          <div className="h-9 px-3 flex items-center rounded-md border bg-slate-50 text-sm font-medium">
                            ₹{lineAmount.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {grn ? "Save GRN" : "Post GRN"}
            </Button>
          </DialogFooter>
        </form>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Stock Entry (GRN)</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to post this GRN? This will update your inventory and cannot be easily reversed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Review GRN</AlertDialogCancel>
              <AlertDialogAction onClick={handleSubmit} className="bg-cyan-600 hover:bg-cyan-700">{grn ? "Confirm & Save" : "Confirm & Post"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
