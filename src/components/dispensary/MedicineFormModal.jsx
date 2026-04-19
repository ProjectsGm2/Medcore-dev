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
import { Loader2, Check, ChevronsUpDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
           options.find((opt) => (typeof opt === "string" ? opt : opt.value) === value) ||
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

const emptyMedicine = {
  name: "",
  category: "",
  company: "",
  composition: "",
  medicine_group: "",
  units: "",
  min_level: "",
  reorder_level: "",
  box_packaging: "",
  rack_number: "",
  notes_description: "",
};

export default function MedicineFormModal({ open, onOpenChange, medicine, onSave }) {
  const [form, setForm] = useState(emptyMedicine);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const { data: categories = [] } = useQuery({
    queryKey: ["masters", "medicine_category"],
    queryFn: () => base44.entities.Master.filter({ type: "medicine_category" }),
    enabled: open,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["masters", "medicine_manufacturer"],
    queryFn: () => base44.entities.Master.filter({ type: "medicine_manufacturer" }),
    enabled: open,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["masters", "medicine_group"],
    queryFn: () => base44.entities.Master.filter({ type: "medicine_group" }),
    enabled: open,
  });

  const { data: units = [] } = useQuery({
    queryKey: ["masters", "medicine_unit"],
    queryFn: () => base44.entities.Master.filter({ type: "medicine_unit" }),
    enabled: open,
  });

  useEffect(() => {
    if (medicine) {
      setForm({
        ...emptyMedicine,
        ...medicine,
        min_level: medicine.min_level != null ? String(medicine.min_level) : "",
        reorder_level: medicine.reorder_level != null ? String(medicine.reorder_level) : "",
        notes_description: medicine.notes_description || medicine.description || "",
      });
    } else {
      setForm(emptyMedicine);
    }
  }, [medicine, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (!form.units || !String(form.units).trim()) {
        toast({ title: "Validation", description: "Units is required", variant: "destructive" });
        return;
      }
      const payload = {
        name: form.name.trim(),
        category: form.category?.trim() || null,
        company: form.company?.trim() || null,
        composition: form.composition?.trim() || null,
        medicine_group: form.medicine_group?.trim() || null,
        units: form.units.trim(),
        min_level: form.min_level === "" ? 0 : Math.max(0, Number(form.min_level)),
        reorder_level: form.reorder_level === "" ? 0 : Math.max(0, Number(form.reorder_level)),
        box_packaging: form.box_packaging?.trim() || null,
        rack_number: form.rack_number?.trim() || null,
        notes_description: form.notes_description?.trim() || null,
        description: form.notes_description?.trim() || null,
      };
      await onSave(payload);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err?.message || "Failed to save medicine",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{medicine ? "Edit medicine (master data)" : "Add medicine (master data)"}</DialogTitle>
          <p className="text-xs text-slate-500">
            Stock and purchase pricing are added via <strong>GRN (Purchase stock)</strong>. Sale price / stock on the main list update when you post a GRN.
          </p>
        </DialogHeader>
        {medicine && (
          <div className="flex flex-wrap gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
            <span className="text-slate-600">Current stock: <strong>{Number(medicine.stock || 0)}</strong></span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600">List price: <strong>₹{Number(medicine.price || 0).toFixed(2)}</strong></span>
            {medicine.expiry_date && (
              <>
                <span className="text-slate-400">|</span>
                <span className="text-slate-600">Expiry (next): <strong>{medicine.expiry_date}</strong></span>
              </>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Medicine name"
              />
            </div>
            <div>
              <Label>Category</Label>
              <SearchableSelect
                options={categories.map(c => ({ label: c.name, value: c.name }))}
                value={form.category}
                onSelect={(v) => setForm({ ...form, category: v })}
                placeholder="Select category"
              />
            </div>
            <div>
              <Label>Company</Label>
              <SearchableSelect
                options={companies.map(c => ({ label: c.name, value: c.name }))}
                value={form.company}
                onSelect={(v) => setForm({ ...form, company: v })}
                placeholder="Select company"
              />
            </div>
            <div>
              <Label>Medicine group</Label>
              <SearchableSelect
                options={groups.map(g => ({ label: g.name, value: g.name }))}
                value={form.medicine_group}
                onSelect={(v) => setForm({ ...form, medicine_group: v })}
                placeholder="Select group"
              />
            </div>
            <div className="col-span-2">
              <Label>Composition</Label>
              <Textarea
                value={form.composition}
                onChange={(e) => setForm({ ...form, composition: e.target.value })}
                rows={2}
                placeholder="Salt / composition"
              />
            </div>
            <div>
              <Label>Units *</Label>
              <SearchableSelect
                options={units.map(u => ({ label: u.name, value: u.name }))}
                value={form.units}
                onSelect={(v) => setForm({ ...form, units: v })}
                placeholder="Select units"
              />
            </div>
            <div>
              <Label>Min level</Label>
              <Input
                type="number"
                min={0}
                value={form.min_level}
                onChange={(e) => setForm({ ...form, min_level: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Reorder level</Label>
              <Input
                type="number"
                min={0}
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Box / packaging</Label>
              <Input value={form.box_packaging} onChange={(e) => setForm({ ...form, box_packaging: e.target.value })} placeholder="e.g. 10x10 strip" />
            </div>
            <div>
              <Label>Rack number</Label>
              <Input value={form.rack_number} onChange={(e) => setForm({ ...form, rack_number: e.target.value })} placeholder="Shelf / rack" />
            </div>
            <div className="col-span-2">
              <Label>Notes / description</Label>
              <Textarea
                value={form.notes_description}
                onChange={(e) => setForm({ ...form, notes_description: e.target.value })}
                rows={3}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {medicine ? "Save changes" : "Create medicine"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
