import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

function isSelectOnly(sql) {
  if (!sql) return false;
  const s = String(sql).trim().toLowerCase();
  if (s.includes(';')) return false;
  if (!s.startsWith('select')) return false;
  if (/\b(update|delete|insert|drop|alter|truncate|create)\b/.test(s)) return false;
  return true;
}

function ageFromDob(dateOfBirth) {
  if (!dateOfBirth) return null;
  const d = new Date(typeof dateOfBirth === 'string' ? `${dateOfBirth}T12:00:00` : dateOfBirth);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age;
}

async function resolveImportedReference(tableName, key) {
  const normalized = key == null ? '' : String(key).trim();
  if (!normalized) return null;
  const [rows] = await pool.query(
    `SELECT id
     FROM \`${tableName}\`
     WHERE legacy_id = ? OR (legacy_id IS NULL AND id = ?)
     ORDER BY CASE WHEN legacy_id = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    [normalized, normalized, normalized]
  );
  return rows[0]?.id || null;
}

async function resolveImportedLegacyReference(tableName, key) {
  const normalized = key == null ? '' : String(key).trim();
  if (!normalized) return null;
  const [rows] = await pool.query(
    `SELECT id
     FROM \`${tableName}\`
     WHERE legacy_id = ?
     LIMIT 1`,
    [normalized]
  );
  return rows[0]?.id || null;
}

router.get('/tables', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SHOW TABLES');
  const key = Object.keys(rows[0] || {})[0];
  const tables = rows.map(r => r[key]).sort();
  res.json({ tables });
});

router.get('/columns', requireAuth, async (req, res) => {
  const { table } = req.query;
  if (!table) return res.status(400).json({ message: 'table is required' });
  const [rows] = await pool.query(`DESCRIBE \`${table}\``);
  const cols = rows.map(r => ({ name: r.Field, type: r.Type, nullable: String(r.Null).toLowerCase() === 'yes', key: r.Key || '' }));
  res.json({ columns: cols });
});

router.get('/preview', requireAuth, async (req, res) => {
  const { table, limit = 50, offset = 0 } = req.query;
  if (!table) return res.status(400).json({ message: 'table is required' });
  const lim = Math.max(1, Math.min(500, Number(limit)));
  const off = Math.max(0, Number(offset));
  const [rows] = await pool.query(`SELECT * FROM \`${table}\` LIMIT ${lim} OFFSET ${off}`);
  res.json({ rows });
});

router.post('/query', requireAuth, async (req, res) => {
  const { sql } = req.body || {};
  if (!isSelectOnly(sql)) return res.status(400).json({ message: 'Only single SELECT statements are allowed' });
  const [rows] = await pool.query(sql);
  res.json({ rows });
});

router.post('/export', requireAuth, async (req, res) => {
  const { table, sql, limit, offset } = req.body || {};
  if (sql) {
    if (!isSelectOnly(sql)) return res.status(400).json({ message: 'Only single SELECT statements are allowed' });
    const [rows] = await pool.query(sql);
    return res.json({ rows });
  }
  if (!table) return res.status(400).json({ message: 'table is required' });
  const lim = limit != null ? Math.max(1, Math.min(10000, Number(limit))) : null;
  const off = offset != null ? Math.max(0, Number(offset)) : 0;
  const q = lim != null ? `SELECT * FROM \`${table}\` LIMIT ${lim} OFFSET ${off}` : `SELECT * FROM \`${table}\``;
  const [rows] = await pool.query(q);
  res.json({ rows });
});

router.post('/import', requireAuth, async (req, res) => {
  try {
    const { table, rows } = req.body || {};
    if (!table || !Array.isArray(rows)) return res.status(400).json({ message: 'table and rows[] are required' });
    if (rows.length === 0) return res.json({ imported: 0 });
    if (table === 'patients') {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [brandRows] = await conn.query("SELECT `value` FROM settings WHERE `key` = 'brand_name' FOR UPDATE");
        if (!brandRows.length || !String(brandRows[0].value || '').trim()) {
          await conn.rollback();
          return res.status(428).json({ message: 'brand_name is required in settings' });
        }
        const brandRaw = String(brandRows[0].value).trim();
        const brand = brandRaw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const year = new Date().getFullYear();
        const seqKey = `patient_uhid_${year}_${brand}`;
        const prefix = `${year}${brand}`;
        const [seqRows] = await conn.query('SELECT current FROM sequences WHERE name = ? FOR UPDATE', [seqKey]);
        let current = Number(seqRows[0]?.current || 0);
        const [maxRows] = await conn.query('SELECT MAX(uhid) AS max_uhid FROM patients WHERE uhid LIKE ?', [`${prefix}%`]);
        if (maxRows[0]?.max_uhid) {
          const suf = String(maxRows[0].max_uhid).slice(prefix.length);
          const n = parseInt(suf, 10);
          if (!Number.isNaN(n) && current < n) current = n;
        }
        let imported = 0;
        for (const r of rows) {
          const name = String(r.name || r.patient_name || '').trim();
          if (!name) continue;
          const legacyId = r.legacy_id == null || String(r.legacy_id).trim() === ''
            ? (r.id == null || String(r.id).trim() === '' ? null : String(r.id).trim())
            : String(r.legacy_id).trim();
          let age = r.age != null && String(r.age).trim() !== '' ? Number(r.age) : null;
          let date_of_birth = r.date_of_birth || r.dob || null;
          if (!age && date_of_birth) age = ageFromDob(date_of_birth);
          if (!age && !date_of_birth) continue;
          let done = false;
          while (!done) {
            current += 1;
            await conn.query('UPDATE sequences SET current = ? WHERE name = ? ON DUPLICATE KEY UPDATE current = VALUES(current)', [current, seqKey]);
            const seqStr = String(current).padStart(3, '0');
            const uhid = `${prefix}${seqStr}`;
            const id = uuidv4();
            try {
              await conn.query(
                `INSERT INTO patients (
                  id, uhid, legacy_id, name, phone, age, gender, blood_group,
                  date_of_birth, known_allergies, marital_status, guardian_name,
                  address, emergency_contact, medical_notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  id,
                  uhid,
                  legacyId,
                  name,
                  r.phone || r.mobileno || null,
                  age,
                  r.gender || null,
                  r.blood_group || null,
                  date_of_birth || null,
                  r.known_allergies || null,
                  r.marital_status || null,
                  r.guardian_name || null,
                  r.address || null,
                  r.emergency_contact || null,
                  r.medical_notes || r.note || null,
                ]
              );
              imported += 1;
              done = true;
            } catch (e) {
              if (e && e.code === 'ER_DUP_ENTRY') {
                continue;
              }
              throw e;
            }
          }
        }
        await conn.commit();
        return res.json({ imported });
      } catch (err) {
        try { await conn.rollback(); } catch {}
        throw err;
      } finally {
        conn.release();
      }
    }

    const [desc] = await pool.query(`DESCRIBE \`${table}\``);
    const colSet = new Set(desc.map(d => d.Field));
    let imported = 0;
    for (const r of rows) {
      const row = { ...r };
      if (table === 'grn') {
        const supplierKey = row.supplier_id == null ? '' : String(row.supplier_id).trim();
        const createdByKey = row.created_by == null ? '' : String(row.created_by).trim();
        row.supplier_id = supplierKey ? await resolveImportedReference('suppliers', supplierKey) : null;
        row.created_by = createdByKey ? await resolveImportedReference('users', createdByKey) : null;
      }
      if (table === 'grn_lines') {
        const grnKey = row.grn_id == null ? '' : String(row.grn_id).trim();
        const medicineKey = row.medicine_id == null ? '' : String(row.medicine_id).trim();
        if (!grnKey || !medicineKey) continue;
        const grnId = await resolveImportedReference('grn', grnKey);
        const medicineId = await resolveImportedReference('medicines', medicineKey);
        if (!grnId || !medicineId) continue;
        row.grn_id = grnId;
        row.medicine_id = medicineId;
        delete row.medicine_category;
        // Convert packing_quantity to integer, default to 1 if empty
        const packingQtyVal = row.packing_quantity != null && String(row.packing_quantity).trim() !== ''
          ? Math.max(1, Math.floor(Number(row.packing_quantity)))
          : 1;
        row.packing_quantity = packingQtyVal;
        if (row.quantity_remaining == null || String(row.quantity_remaining).trim() === '') {
          row.quantity_remaining = row.quantity == null || String(row.quantity).trim() === '' ? 0 : Math.max(0, Math.floor(Number(row.quantity)));
        }
      }
      if (table === 'prescriptions') {
        const patientKey = row.patient_id == null ? '' : String(row.patient_id).trim();
        const doctorKey = row.doctor_id == null ? '' : String(row.doctor_id).trim();
        const appointmentSource = row.appointment_id ?? row.appoinment_id ?? null;
        const appointmentKey = appointmentSource == null ? '' : String(appointmentSource).trim();
        row.patient_id = patientKey ? await resolveImportedLegacyReference('patients', patientKey) : null;
        row.doctor_id = doctorKey ? await resolveImportedLegacyReference('users', doctorKey) : null;
        row.appointment_id = appointmentKey ? await resolveImportedLegacyReference('appointments', appointmentKey) : null;
        delete row.appoinment_id;
      }
      if (table === 'sales_bills') {
        const doctorKey = row.doctor_id == null ? '' : String(row.doctor_id).trim();
        const patientKey = row.patient_id == null ? '' : String(row.patient_id).trim();
        const prescriptionKey = row.prescription_id == null ? '' : String(row.prescription_id).trim();
        const generatedByKey = row.generated_by == null ? '' : String(row.generated_by).trim();
        row.doctor_id = doctorKey ? await resolveImportedReference('users', doctorKey) : null;
        row.patient_id = patientKey ? await resolveImportedReference('patients', patientKey) : null;
        row.prescription_id = prescriptionKey ? await resolveImportedReference('prescriptions', prescriptionKey) : null;
        row.generated_by = generatedByKey ? await resolveImportedReference('users', generatedByKey) : null;
      }
      if (table === 'sales_bill_lines') {
        const billKey = row.bill_id == null ? '' : String(row.bill_id).trim();
        const grnLineSource = row.grn_line_id ?? row.batch_id ?? null;
        const grnLineKey = grnLineSource == null ? '' : String(grnLineSource).trim();
        const billId = billKey ? await resolveImportedReference('sales_bills', billKey) : null;
        if (!billId) continue;
        row.bill_id = billId;
        row.grn_line_id = grnLineKey ? await resolveImportedReference('grn_lines', grnLineKey) : null;
        delete row.batch_id;
      }
      if (colSet.has('legacy_id')) {
        const rawLegacyId = row.legacy_id == null || String(row.legacy_id).trim() === ''
          ? (row.id == null || String(row.id).trim() === '' ? null : String(row.id).trim())
          : String(row.legacy_id).trim();
        if (rawLegacyId) row.legacy_id = rawLegacyId;
        if (colSet.has('id')) row.id = uuidv4();
      }
      const keys = Object.keys(row).filter(k => colSet.has(k));
      if (!keys.length) continue;
      const vals = keys.map(k => row[k]);
      const placeholders = keys.map(() => '?').join(', ');
      await pool.query(`INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`, vals);
      if (table === 'prescriptions' && row.appointment_id) {
        await pool.query('UPDATE appointments SET status = "Completed" WHERE id = ?', [row.appointment_id]);
      }
      imported += 1;
    }
    return res.json({ imported });
  } catch (err) {
    const detail = err?.sqlMessage || err?.message || 'Import failed';
    return res.status(err?.statusCode || 500).json({ message: detail });
  }
});

export default router;
