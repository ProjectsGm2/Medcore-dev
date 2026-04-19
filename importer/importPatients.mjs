import { readFile } from "node:fs/promises";
import path from "node:path";

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function normalizeDate(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeGender(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s === "m" || s === "male") return "Male";
  if (s === "f" || s === "female") return "Female";
  if (s === "o" || s === "other") return "Other";
  return String(input).trim();
}

function normalizeBloodGroup(input) {
  if (input == null) return null;
  const s = String(input).trim().toUpperCase().replace(/\s+/g, "");
  return s || null;
}

function mapPatient(raw) {
  const name = pick(raw, ["name", "full_name", "fullName", "patient_name", "patientName", "patient_name", "patient_name"]);
  const phone = pick(raw, ["phone", "mobile", "mobile_no", "mobileNo", "contact", "contact_no", "contactNo", "mobileno"]);
  const age = pick(raw, ["age", "Age"]);
  const dob = pick(raw, ["date_of_birth", "dob", "DOB", "dateOfBirth"]);

  const payload = {
    name: name != null ? String(name).trim() : "",
    phone: phone != null ? String(phone).trim() : null,
    age: age != null && String(age).trim() !== "" ? Number(age) : null,
    gender: normalizeGender(pick(raw, ["gender", "Gender", "sex"])),
    blood_group: normalizeBloodGroup(pick(raw, ["blood_group", "bloodGroup", "blood", "bloodgroup"])),
    date_of_birth: normalizeDate(dob),
    known_allergies: pick(raw, ["known_allergies", "allergies", "knownAllergies"]),
    marital_status: pick(raw, ["marital_status", "maritalStatus"]),
    guardian_name: pick(raw, ["guardian_name", "guardianName", "guardian"]),
    address: pick(raw, ["address", "Address"]),
    emergency_contact: pick(raw, ["emergency_contact", "emergencyContact", "emergency_phone", "emergencyPhone"]),
    medical_notes: pick(raw, ["medical_notes", "medicalNotes", "notes", "note"]),
  };

  if (!payload.name) return { ok: false, reason: "Missing name" };
  if (payload.age == null && !payload.date_of_birth) return { ok: false, reason: "Missing age or date_of_birth" };
  if (payload.age != null && (Number.isNaN(payload.age) || payload.age < 0 || payload.age > 150)) return { ok: false, reason: "Invalid age" };
  return { ok: true, payload };
}

async function apiFetch(baseUrl, token, apiPath, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${apiPath}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function login(baseUrl, { email, password, token }) {
  if (token) return token;
  if (!email || !password) throw new Error("Provide --token OR both --email and --password");
  const data = await apiFetch(baseUrl, null, "/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!data?.token) throw new Error("Login failed: token not returned");
  return data.token;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    new Array(Math.max(1, concurrency)).fill(0).map(async () => {
      while (next < items.length) {
        const idx = next++;
        results[idx] = await worker(items[idx], idx);
      }
    })
  );
  return results;
}

async function main() {
  const baseUrl = (getArg("--base") || "http://localhost:4001").replace(/\/+$/, "");
  const file = getArg("--file");
  const email = getArg("--email");
  const password = getArg("--password");
  const tokenArg = getArg("--token");
  const concurrency = Math.max(1, Number(getArg("--concurrency") || 5));
  const dryRun = hasFlag("--dry-run");

  if (!file) throw new Error("Missing --file <path-to-json>");
  const filePath = path.resolve(process.cwd(), file);
  const jsonText = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(jsonText);
  const records = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.patients) ? parsed.patients : [];
  if (!Array.isArray(records) || records.length === 0) throw new Error("JSON must be an array, or an object with a 'patients' array");

  const token = await login(baseUrl, { email, password, token: tokenArg });

  const brand = await apiFetch(baseUrl, token, "/api/settings/brand_name").catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  const brandValue = brand?.value != null ? String(brand.value).trim() : "";
  if (!brandValue) throw new Error("Settings.brand_name is missing. Set it in Setup → Settings before importing patients.");

  const mapped = records.map(mapPatient);
  const toImport = [];
  const skipped = [];
  for (let i = 0; i < mapped.length; i++) {
    if (mapped[i].ok) toImport.push({ idx: i, payload: mapped[i].payload });
    else skipped.push({ idx: i, reason: mapped[i].reason });
  }

  if (dryRun) {
    console.log(JSON.stringify({ total: records.length, valid: toImport.length, skipped: skipped.length }, null, 2));
    return;
  }

  const imported = await runPool(toImport, concurrency, async ({ idx, payload }) => {
    const created = await apiFetch(baseUrl, token, "/api/patients", { method: "POST", body: JSON.stringify(payload) });
    return { idx, id: created?.id, uhid: created?.uhid };
  });

  console.log(JSON.stringify({ total: records.length, imported: imported.length, skipped: skipped.length }, null, 2));
  if (skipped.length) console.log(JSON.stringify({ skipped }, null, 2));
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
