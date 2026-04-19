import React, { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { usePermission } from "@/lib/AuthContext";
import { Loader2, Download, Upload, Eye, Database, FileJson, Play, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL, base44 } from "@/api/apiClient";
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

export default function ImportExport() {
  const API_BASE = API_BASE_URL;
  const TOKEN_KEY = "medcore_access_token";
  const req = async (path, options = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const snippet = text?.slice(0, 80) || "";
      throw new Error("API returned non-JSON. Check API_BASE and server status. " + snippet);
    }
    if (!res.ok) {
      throw new Error(data?.message || res.statusText || "Request failed");
    }
    return data;
  };
  const { can } = usePermission();
  const { toast } = useToast();
  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [activeTab, setActiveTab] = useState("export");

  const [table, setTable] = useState("");
  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [sql, setSql] = useState("");
  const [sqlRows, setSqlRows] = useState([]);
  const [sqlLoading, setSqlLoading] = useState(false);

  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importFormat, setImportFormat] = useState("simple");
  const [sourceFields, setSourceFields] = useState([]);
  const [targetColumns, setTargetColumns] = useState([]);
  const [fieldMap, setFieldMap] = useState({});
  const [parsedRows, setParsedRows] = useState([]);
  const [patientIdPairs, setPatientIdPairs] = useState([{ from: "", to: "" }]);
  const [doctorIdPairs, setDoctorIdPairs] = useState([{ from: "", to: "" }]);

  const canView = can("Settings", "view") || can("ImportExport", "view") || can("Master", "view");
  const canEdit = can("Settings", "edit") || can("ImportExport", "edit") || can("Master", "edit");

  useEffect(() => {
    if (!canView) return;
    setLoadingTables(true);
    req("/api/import-export/tables")
      .then(data => setTables(data.tables || []))
      .catch(err => toast({ title: "Error", description: err.message, variant: "destructive" }))
      .finally(() => setLoadingTables(false));
  }, [canView]);

  useEffect(() => {
    if (!table) {
      setTargetColumns([]);
      return;
    }
    req(`/api/import-export/columns?table=${encodeURIComponent(table)}`)
      .then(data => setTargetColumns((data.columns || []).map(c => c.name)))
      .catch(() => setTargetColumns([]));
  }, [table]);

  const loadPreview = async () => {
    if (!table) return;
    setPreviewLoading(true);
    try {
      const data = await req(`/api/import-export/preview?table=${encodeURIComponent(table)}&limit=50`);
      setPreviewRows(data.rows || []);
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadJson = async (rows, filename) => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (!table) return;
    try {
      const data = await req(`/api/import-export/export`, {
        method: "POST",
        body: JSON.stringify({ table }),
      });
      await downloadJson(data.rows || [], `${table}.json`);
      toast({ title: "Export ready", description: `Downloaded ${table}.json` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleSqlPreview = async () => {
    if (!sql.trim()) return;
    setSqlLoading(true);
    try {
      const data = await req(`/api/import-export/query`, {
        method: "POST",
        body: JSON.stringify({ sql }),
      });
      setSqlRows(data.rows || []);
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSqlLoading(false);
    }
  };

  const handleSqlExport = async () => {
    if (!sql.trim()) return;
    try {
      const data = await req(`/api/import-export/export`, {
        method: "POST",
        body: JSON.stringify({ sql }),
      });
      await downloadJson(data.rows || [], `export.json`);
      toast({ title: "Export ready", description: "Downloaded export.json" });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const applyMapping = (rows, mapping) => {
    if (!mapping || Array.isArray(mapping) || typeof mapping !== "object") return rows;
    const out = [];
    for (const r of rows) {
      const o = {};
      for (const [src, dst] of Object.entries(mapping)) {
        if (dst && r[src] !== undefined) o[dst] = r[src];
      }
      if (Object.keys(o).length > 0) out.push(o);
      else out.push(r);
    }
    return out;
  };

  const buildFieldMappingFromUI = () => {
    const m = {};
    for (const s of sourceFields) {
      const t = fieldMap[s];
      if (t && t !== "__ignore__") m[s] = t;
    }
    return Object.keys(m).length ? m : null;
  };

  const buildIdMapsFromUI = () => {
    const pm = {};
    const dm = {};
    for (const p of patientIdPairs) {
      const from = String(p.from || "").trim();
      const to = String(p.to || "").trim();
      if (from && to) pm[from] = to;
    }
    for (const d of doctorIdPairs) {
      const from = String(d.from || "").trim();
      const to = String(d.to || "").trim();
      if (from && to) dm[from] = to;
    }
    return { patient: pm, doctor: dm };
  };

  const autoMap = () => {
    if (!sourceFields.length || !targetColumns.length) return;
    const next = { ...fieldMap };
    const norm = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, "");
    const tNorm = targetColumns.map(t => ({ t, n: norm(t) }));
    const synonyms = {
      patientname: "name",
      mobileno: "phone",
      phone: "phone",
      dob: "date_of_birth",
      bloodgroup: "blood_group",
      note: "medical_notes",
    };
    for (const s of sourceFields) {
      let target = null;
      const sn = norm(s);
      const syn = synonyms[sn];
      const best = tNorm.find(x => x.n === sn) || (syn ? tNorm.find(x => x.n === norm(syn)) : null);
      if (best) target = best.t;
      next[s] = target || "__ignore__";
    }
    setFieldMap(next);
  };

  const updatePreviewWithMapping = () => {
    if (!parsedRows.length) return;
    const fm = buildFieldMappingFromUI();
    const mapped = applyMapping(parsedRows, fm || {});
    setImportPreview(mapped.slice(0, 50));
  };

  const MapSelect = ({ value, onValueChange, options }) => {
    const [open, setOpen] = React.useState(false);
    const current = options.find(o => o.value === value);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-full justify-between text-xs"
          >
            {current ? current.label : "Select target"}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder="Search columns..." className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>No columns found.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => {
                      onValueChange(opt.value);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")} />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const parsePhpMyAdminJson = (json, targetTable) => {
    const arr = Array.isArray(json) ? json : [];
    const tables = arr.filter(x => x && x.type === "table");
    if (!tables.length) return [];
    let t = tables.find(x => x.name === targetTable) || tables[0];
    let data = t?.data || [];
    if (!Array.isArray(data)) return [];
    if (data.length > 0 && Array.isArray(data[0]) && Array.isArray(t.columns)) {
      const cols = t.columns;
      data = data.map(row => {
        const o = {};
        row.forEach((v, i) => { o[cols[i]] = v; });
        return o;
      });
    }
    return data;
  };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    setImportFile(f || null);
    setImportPreview([]);
    if (!f) return;
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      let arr = [];
      if (importFormat === "phpmyadmin") {
        // Auto-detect table if not selected
        if (!table) {
          const bundle = Array.isArray(json) ? json : [];
          const firstTable = bundle.find((x) => x && x.type === "table");
          if (firstTable?.name) {
            setTable(firstTable.name);
            arr = parsePhpMyAdminJson(json, firstTable.name);
            toast({ title: "Detected table", description: `Using "${firstTable.name}" from phpMyAdmin export` });
          } else {
            toast({ title: "Error", description: "No table found in phpMyAdmin JSON. Please select a table.", variant: "destructive" });
            return;
          }
        } else {
          arr = parsePhpMyAdminJson(json, table);
        }
      } else {
        arr = Array.isArray(json) ? json : Array.isArray(json?.rows) ? json.rows : Array.isArray(json?.patients) ? json.patients : [];
      }
      const first = arr[0] || {};
      const srcFields = Object.keys(first);
      setSourceFields(srcFields);
      setParsedRows(arr);
      const fm = buildFieldMappingFromUI();
      const mapped = applyMapping(arr, fm || {});
      setImportPreview(mapped.slice(0, 50));
    } catch (err) {
      toast({ title: "Error", description: "Invalid JSON file", variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!table || !importFile) return;
    setImporting(true);
    try {
      const text = await importFile.text();
      const json = JSON.parse(text);
      let arr = [];
      if (importFormat === "phpmyadmin") {
        arr = parsePhpMyAdminJson(json, table);
      } else {
        arr = Array.isArray(json) ? json : Array.isArray(json?.rows) ? json.rows : Array.isArray(json?.patients) ? json.patients : [];
      }
      const fm = buildFieldMappingFromUI();
      const mapped = applyMapping(arr, fm || {});
      // Prefer regular API endpoints used by forms to ensure auto-generated fields are applied
      let imported = 0;
      let skipped = 0;
      const runPool = async (items, size, worker) => {
        let i = 0;
        const runners = new Array(Math.max(1, size)).fill(0).map(async () => {
          while (i < items.length) {
            const idx = i++;
            await worker(items[idx], idx);
          }
        });
        await Promise.all(runners);
      };
      const entityImport = async (entityName, rows) => {
        await runPool(rows, 5, async (row) => {
          try {
            await base44.entities[entityName].create(row);
            imported += 1;
          } catch (e) {
            // Skip bad rows but continue; optionally collect errors in future
            skipped += 1;
          }
        });
      };
      const splitRowsForImport = (rows, maxBytes = 1024 * 1024, maxRows = 250) => {
        const encoder = new TextEncoder();
        const chunks = [];
        let current = [];
        let currentBytes = 0;
        for (const row of rows) {
          const rowBytes = encoder.encode(JSON.stringify(row)).length;
          const shouldFlush = current.length > 0 && (current.length >= maxRows || currentBytes + rowBytes > maxBytes);
          if (shouldFlush) {
            chunks.push(current);
            current = [];
            currentBytes = 0;
          }
          current.push(row);
          currentBytes += rowBytes;
        }
        if (current.length > 0) chunks.push(current);
        return chunks;
      };
      const genericImport = async (rows) => {
        const chunks = splitRowsForImport(rows);
        for (const chunk of chunks) {
          const data = await req(`/api/import-export/import`, {
            method: "POST",
            body: JSON.stringify({ table, rows: chunk }),
          });
          imported += data.imported || 0;
        }
      };
      const tableLower = String(table).toLowerCase();
      const supportedEntities = {
        patients: "Patient",
        appointments: "Appointment",
        users: "User",
        prescriptions: "Prescription",
        medicines: "Medicine",
        suppliers: "Supplier",
      };
      const normalizeLegacyRow = (row) => {
        const next = { ...row };
        const rawLegacyId = next.legacy_id ?? next.id ?? null;
        const normalizedLegacyId = rawLegacyId == null || String(rawLegacyId).trim() === "" ? null : String(rawLegacyId).trim();
        if (normalizedLegacyId) next.legacy_id = normalizedLegacyId;
        else delete next.legacy_id;
        delete next.id;
        return next;
      };
      const isUuid = (v) => typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
      if (supportedEntities[tableLower]) {
        if (tableLower === "patients" || tableLower === "users" || tableLower === "medicines" || tableLower === "suppliers") {
          const prepared = mapped.map(normalizeLegacyRow);
          await entityImport(supportedEntities[tableLower], prepared);
        } else if (tableLower === "appointments") {
          const lim = 10000;
          const patients = await base44.entities.Patient.list("-created_date", lim).catch(() => []);
          const doctors = await base44.entities.User.list("-created_at", lim).catch(() => []);
          const patientIdMap = new Map();
          const patientLegacyIdMap = new Map();
          const uhidMap = new Map();
          const phoneMap = new Map();
          const namePhoneMap = new Map();
          for (const p of patients || []) {
            if (p.id) patientIdMap.set(String(p.id).trim(), p.id);
            if (p.legacy_id != null && String(p.legacy_id).trim() !== "") {
              patientLegacyIdMap.set(String(p.legacy_id).trim(), p.id);
            }
            const patientRef = p.legacy_id == null || String(p.legacy_id).trim() === ""
              ? String(p.uhid || "").trim()
              : String(p.id || "").trim();
            if (patientRef) patientIdMap.set(patientRef, p.id);
            if (p.uhid) uhidMap.set(String(p.uhid).trim(), p.id);
            if (p.phone) {
              const pn = String(p.phone).replace(/\D+/g, "");
              if (pn) phoneMap.set(pn, p.id);
            }
            const key = `${String(p.name || "").trim().toLowerCase()}#${String(p.phone || "").replace(/\D+/g, "")}`;
            if (key !== "#") namePhoneMap.set(key, p.id);
          }
          const doctorIdMap = new Map();
          const doctorLegacyIdMap = new Map();
          const doctorByEmail = new Map();
          const doctorByName = new Map();
          for (const d of doctors || []) {
            if (d.id) doctorIdMap.set(String(d.id).trim(), d.id);
            if (d.legacy_id != null && String(d.legacy_id).trim() !== "") {
              doctorLegacyIdMap.set(String(d.legacy_id).trim(), d.id);
            }
            if (String(d.role || "").toLowerCase() !== "doctor") continue;
            if (d.email) doctorByEmail.set(String(d.email).trim().toLowerCase(), d.id);
            const nm = String(d.full_name || d.name || "").trim().toLowerCase();
            if (nm) doctorByName.set(nm, d.id);
          }
          const maps = buildIdMapsFromUI();
          const idMaps = { patient: maps.patient, doctor: maps.doctor };
          const asTime = (t) => {
            if (!t && t !== 0) return null;
            const s = String(t).trim();
            if (!s) return null;
            if (/^\d{1,2}:\d{2}$/.test(s)) return s;
            if (/^\d{1,2}$/.test(s)) return `${s.padStart(2, "0")}:00`;
            return s;
          };
          const isUuid = (v) => typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
          const prepared = [];
          for (const r of mapped) {
            let patientId = r.patient_id;
            if (!patientId || !isUuid(patientId)) {
              if (idMaps.patient && idMaps.patient[patientId]) patientId = idMaps.patient[patientId];
              else if (patientId != null && patientLegacyIdMap.has(String(patientId).trim())) patientId = patientLegacyIdMap.get(String(patientId).trim());
              else if (patientId != null && patientIdMap.has(String(patientId).trim())) patientId = patientIdMap.get(String(patientId).trim());
              else if (r.uhid && uhidMap.has(String(r.uhid).trim())) patientId = uhidMap.get(String(r.uhid).trim());
              else {
                const nm = String(r.patient_name || r.name || "").trim().toLowerCase();
                const ph = String(r.mobileno || r.phone || "").replace(/\D+/g, "");
                const key = `${nm}#${ph}`;
                patientId = namePhoneMap.get(key) || phoneMap.get(ph) || patientId;
              }
            }
            if (!patientId || !isUuid(patientId)) {
              skipped += 1;
              continue;
            }
            let doctorId = r.doctor_id;
            if (!doctorId || !isUuid(doctorId)) {
              if (idMaps.doctor && idMaps.doctor[doctorId]) doctorId = idMaps.doctor[doctorId];
              else if (doctorId != null && doctorLegacyIdMap.has(String(doctorId).trim())) doctorId = doctorLegacyIdMap.get(String(doctorId).trim());
              else if (doctorId != null && doctorIdMap.has(String(doctorId).trim())) doctorId = doctorIdMap.get(String(doctorId).trim());
              else {
                const em = String(r.doctor_email || "").trim().toLowerCase();
                const dn = String(r.doctor_name || "").trim().toLowerCase();
                doctorId = (em && doctorByEmail.get(em)) || (dn && doctorByName.get(dn)) || doctorId || null;
              }
            }
            const status = r.status || "Scheduled";
            const type = r.type || "In-Person";
            const discount = r.discount == null || r.discount === "" ? 0 : Number(r.discount);
            const rowWithLegacy = normalizeLegacyRow(r);
            const appointment_date = r.appointment_date || r.date || null;
            const appointment_time = asTime(r.appointment_time || r.time || null);
            prepared.push({
              legacy_id: rowWithLegacy.legacy_id || null,
              patient_id: patientId,
              doctor_id: doctorId || null,
              doctor_ids_json: null,
              doctor_names: null,
              appointment_date,
              appointment_time,
              reason: r.reason || null,
              status,
              type,
              payment_mode: r.payment_mode || null,
              discount,
              priority: r.priority || "Normal",
              video_room_id: r.video_room_id || null,
              video_status: r.video_status || null,
              notes: r.notes || null,
            });
          }
          await entityImport(supportedEntities[tableLower], prepared);
        } else if (tableLower === "prescriptions") {
          const lim = 10000;
          const patients = await base44.entities.Patient.list("-created_date", lim).catch(() => []);
          const doctors = await base44.entities.User.list("-created_at", lim).catch(() => []);
          const appointments = await base44.entities.Appointment.list("-appointment_date", lim).catch(() => []);
          const patientLegacyIdMap = new Map();
          for (const p of patients || []) {
            if (p.legacy_id != null && String(p.legacy_id).trim() !== "") {
              patientLegacyIdMap.set(String(p.legacy_id).trim(), p.id);
            }
          }
          const doctorLegacyIdMap = new Map();
          for (const d of doctors || []) {
            if (d.legacy_id != null && String(d.legacy_id).trim() !== "") {
              doctorLegacyIdMap.set(String(d.legacy_id).trim(), d.id);
            }
          }
          const appointmentLegacyIdMap = new Map();
          for (const a of appointments || []) {
            if (a.legacy_id != null && String(a.legacy_id).trim() !== "") {
              appointmentLegacyIdMap.set(String(a.legacy_id).trim(), a.id);
            }
          }
          const prepared = [];
          for (const r of mapped) {
            let patientId = r.patient_id;
            if (patientId != null && patientLegacyIdMap.has(String(patientId).trim())) {
              patientId = patientLegacyIdMap.get(String(patientId).trim());
            } else {
              patientId = null;
            }
            if (!patientId || !isUuid(patientId)) {
              skipped += 1;
              continue;
            }
            let doctorId = r.doctor_id;
            if (doctorId != null && doctorLegacyIdMap.has(String(doctorId).trim())) {
              doctorId = doctorLegacyIdMap.get(String(doctorId).trim());
            } else {
              doctorId = null;
            }
            let appointmentId = r.appointment_id ?? r.appoinment_id;
            if (appointmentId != null && appointmentLegacyIdMap.has(String(appointmentId).trim())) {
              appointmentId = appointmentLegacyIdMap.get(String(appointmentId).trim());
            } else {
              appointmentId = null;
            }
            const rowWithLegacy = normalizeLegacyRow(r);
            prepared.push({
              legacy_id: rowWithLegacy.legacy_id || null,
              patient_id: patientId,
              doctor_id: doctorId && isUuid(doctorId) ? doctorId : null,
              appointment_id: appointmentId && isUuid(appointmentId) ? appointmentId : null,
              diagnosis: r.diagnosis || null,
              notes: r.notes || null,
              notes_meta: r.notes_meta || null,
              medicines: r.medicines || null,
            });
          }
          await entityImport(supportedEntities[tableLower], prepared);
        } else {
          await entityImport(supportedEntities[tableLower], mapped.map(normalizeLegacyRow));
        }
      } else {
        await genericImport(mapped);
      }
      toast({ title: "Import completed", description: `${imported} rows imported into ${table}${skipped ? ` · ${skipped} skipped` : ""}` });
      setImportFile(null);
      setImportPreview([]);
      await loadPreview();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  if (!canView) {
    return <div className="p-8 text-center text-slate-500">Access Denied</div>;
  }

  const renderRows = (rows) => {
    if (!rows || rows.length === 0) return (
      <div className="py-12 text-center text-slate-400 text-sm">No data</div>
    );
    const colSet = new Set();
    for (const r of rows) {
      Object.keys(r).forEach(k => colSet.add(k));
    }
    const cols = Array.from(colSet);
    return (
      <div className="overflow-x-auto">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow className="bg-slate-50/50 whitespace-nowrap">
              {cols.map(c => <TableHead key={c} className="uppercase text-[11px] font-bold whitespace-nowrap">{c}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} className="hover:bg-slate-50/50 whitespace-nowrap">
                {cols.map(c => <TableCell key={c} className="text-xs whitespace-nowrap">{String(r[c] ?? "")}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Import / Export" description="Move data in and out of the system. Use table selection or custom SQL for export. JSON import provides a preview before committing." />

      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-500" />
              {loadingTables ? (
                <div className="text-sm text-slate-400">Loading tables…</div>
              ) : (
                <Select value={table} onValueChange={setTable}>
                  <SelectTrigger className="w-[260px] h-9 text-sm">
                    <SelectValue placeholder="Select a table" />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map(t => <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadPreview} disabled={!table || previewLoading}>
                {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Preview
              </Button>
              <Button size="sm" onClick={handleExport} disabled={!table}>
                <Download className="w-4 h-4 mr-1" /> Export JSON
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4">
          {renderRows(previewRows)}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="sql">SQL Export</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-6">
          <div className="bg-white rounded-xl border border-slate-200/60 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-xs text-slate-500">Format</div>
                <Select value={importFormat} onValueChange={setImportFormat}>
                  <SelectTrigger className="h-9 text-sm w-full md:w-64">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple" className="text-sm">Simple JSON (array of objects)</SelectItem>
                    <SelectItem value="phpmyadmin" className="text-sm">phpMyAdmin Export JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-slate-500">Field Mapping</div>
                <div className="border rounded-lg p-3 max-h-64 overflow-auto">
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500 mb-1">
                    <div>Source</div>
                    <div>Target</div>
                  </div>
                  {sourceFields.length === 0 ? (
                    <div className="text-xs text-slate-400">Upload a JSON file to populate fields</div>
                  ) : (
                    sourceFields.map((s) => (
                      <div key={s} className="grid grid-cols-2 gap-2 items-center mb-1">
                        <div className="text-xs text-slate-700 truncate">{s}</div>
                        <MapSelect
                          value={fieldMap[s] || "__ignore__"}
                          onValueChange={(v) => setFieldMap((m) => ({ ...m, [s]: v }))}
                          options={[
                            { label: "(ignore)", value: "__ignore__" },
                            ...targetColumns.map(t => ({ label: t, value: t })),
                          ]}
                        />
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={autoMap}>Auto map</Button>
                  <Button variant="outline" size="sm" onClick={updatePreviewWithMapping}>Update Preview</Button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input type="file" accept="application/json" onChange={onPickFile} className="max-w-md" />
              <Button onClick={handleImport} disabled={!table || !importFile || !canEdit || importing} className="bg-cyan-600 hover:bg-cyan-700">
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />} Import to {table || "…"}
              </Button>
              {importFile && (
                <Button variant="outline" size="sm" onClick={() => { setImportFile(null); setImportPreview([]); }}>
                  <Trash2 className="w-4 h-4 mr-1" /> Clear
                </Button>
              )}
            </div>
            {String(table).toLowerCase() === "appointments" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs text-slate-500">Patient ID Mapping</div>
                  <div className="border rounded-lg p-3 max-h-56 overflow-auto">
                    {patientIdPairs.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <Input value={p.from} onChange={(e) => {
                          const v = e.target.value;
                          setPatientIdPairs((arr) => arr.map((r, idx) => idx === i ? { ...r, from: v } : r));
                        }} placeholder="source patient id/uhid" className="h-8 text-xs" />
                        <Input value={p.to} onChange={(e) => {
                          const v = e.target.value;
                          setPatientIdPairs((arr) => arr.map((r, idx) => idx === i ? { ...r, to: v } : r));
                        }} placeholder="target patient UUID" className="h-8 text-xs" />
                        <Button variant="outline" size="sm" onClick={() => setPatientIdPairs((arr) => arr.filter((_, idx) => idx !== i))}>-</Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setPatientIdPairs((arr) => [...arr, { from: "", to: "" }])}>Add</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-slate-500">Doctor ID Mapping</div>
                  <div className="border rounded-lg p-3 max-h-56 overflow-auto">
                    {doctorIdPairs.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <Input value={p.from} onChange={(e) => {
                          const v = e.target.value;
                          setDoctorIdPairs((arr) => arr.map((r, idx) => idx === i ? { ...r, from: v } : r));
                        }} placeholder="source doctor id/email/name" className="h-8 text-xs" />
                        <Input value={p.to} onChange={(e) => {
                          const v = e.target.value;
                          setDoctorIdPairs((arr) => arr.map((r, idx) => idx === i ? { ...r, to: v } : r));
                        }} placeholder="target doctor UUID" className="h-8 text-xs" />
                        <Button variant="outline" size="sm" onClick={() => setDoctorIdPairs((arr) => arr.filter((_, idx) => idx !== i))}>-</Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setDoctorIdPairs((arr) => [...arr, { from: "", to: "" }])}>Add</Button>
                  </div>
                </div>
              </div>
            )}
            <div className="border rounded-lg overflow-hidden">
              <div className="p-2 border-b bg-slate-50/50 text-xs text-slate-500">Import Preview</div>
              <div className="p-2">{renderRows(importPreview)}</div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sql" className="mt-6">
          <div className="bg-white rounded-xl border border-slate-200/60 p-4 space-y-3">
            <Textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="SELECT * FROM patients WHERE age >= 60"
              className="min-h-[120px] font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleSqlPreview} disabled={!sql.trim() || sqlLoading}>
                {sqlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Preview
              </Button>
              <Button onClick={handleSqlExport} disabled={!sql.trim()}>
                <FileJson className="w-4 h-4 mr-1" /> Export JSON
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="p-2 border-b bg-slate-50/50 text-xs text-slate-500">SQL Preview</div>
              <div className="p-2">{renderRows(sqlRows)}</div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <div className="text-sm text-slate-600">Use the table selector above to preview and export table data as JSON.</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
