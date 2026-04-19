import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value);
  return text.trim() === '' ? null : text;
}

function parseNotesMeta(rawMeta) {
  if (!rawMeta) return null;
  try {
    return typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
  } catch {
    return null;
  }
}

// List prescriptions
router.get('/', requireAuth, async (req, res) => {
  const { sort, limit, id, patient_id, doctor_id, appointment_id } = req.query;
  const conditions = [];
  const params = [];

  if (id) {
    conditions.push('id = ?');
    params.push(id);
  }
  if (patient_id) {
    conditions.push('patient_id = ?');
    params.push(patient_id);
  }
  if (doctor_id) {
    conditions.push('doctor_id = ?');
    params.push(doctor_id);
  }
  if (appointment_id) {
    conditions.push('appointment_id = ?');
    params.push(appointment_id);
  }

  let sql = `
    SELECT p.*, COALESCE(u.full_name, u.name) as doctor_name, pat.name as patient_name
    FROM prescriptions p
    LEFT JOIN users u ON p.doctor_id = u.id
    LEFT JOIN patients pat ON p.patient_id = pat.id
  `;
  if (conditions.length) sql += ` WHERE ${conditions.map(c => `p.${c}`).join(' AND ')}`;
  if (sort) {
    const sortField = sort.replace(/^-/, '');
    const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
    sql += ` ORDER BY p.${sortField} ${direction}`;
  } else {
    sql += ' ORDER BY p.created_date DESC';
  }
  if (limit) sql += ` LIMIT ${Number(limit)}`;

  const [rows] = await pool.query(sql, params);
  
  // Parse JSON columns before sending to UI
  const parsedRows = rows.map(row => {
    try {
      if (row.notes_meta && typeof row.notes_meta === 'string') {
        row.notes_meta = JSON.parse(row.notes_meta);
      }
      if (row.medicines && typeof row.medicines === 'string') {
        row.medicines = JSON.parse(row.medicines);
      }
    } catch (e) {
      console.error("Failed to parse JSON columns for row:", row.id, e);
    }
    return row;
  });

  res.json(parsedRows);
});

// Create prescription
router.post('/', requireAuth, async (req, res) => {
  const body = req.body || {};
  const {
    patient_id,
    doctor_id,
    appointment_id,
    legacy_id,
    diagnosis,
    notes,
    notes_meta,
    medicines,
  } = body;

  if (!patient_id) {
    return res.status(400).json({ message: 'patient_id is required' });
  }

  const id = uuidv4();
  const normalizedLegacyId = legacy_id == null || String(legacy_id).trim() === '' ? null : String(legacy_id).trim();
  let rxCode = null;
  const parsedMeta = parseNotesMeta(notes_meta);
  if (parsedMeta) {
    rxCode = parsedMeta.rx_code || null;
  }
  const normalizedNotes = normalizeText(notes) ?? normalizeText(parsedMeta?.notes);

  const medicinesJson = Array.isArray(medicines) ? JSON.stringify(medicines) : null;
  const metaJson = notes_meta ? (typeof notes_meta === 'string' ? notes_meta : JSON.stringify(notes_meta)) : null;

  await pool.query(
    'INSERT INTO prescriptions (id, legacy_id, patient_id, doctor_id, appointment_id, rx_code, diagnosis, notes, notes_meta, medicines) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, normalizedLegacyId, patient_id, doctor_id || null, appointment_id || null, rxCode, normalizeText(diagnosis), normalizedNotes, metaJson, medicinesJson]
  );
  
  // Update appointment status to 'Completed' if it exists
  if (appointment_id) {
    try {
      await pool.query('UPDATE appointments SET status = "Completed" WHERE id = ?', [appointment_id]);
    } catch (e) {
      console.error("Failed to update appointment status:", e);
    }
  }
  
  const [rows] = await pool.query('SELECT * FROM prescriptions WHERE id = ?', [id]);
  return res.status(201).json(rows[0]);
});

// Update prescription
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { patient_id, doctor_id, appointment_id, diagnosis, notes, notes_meta, medicines } = req.body;
  const changes = [];
  const params = [];
  
  if (patient_id !== undefined) { changes.push('patient_id = ?'); params.push(patient_id); }
  if (doctor_id !== undefined) { changes.push('doctor_id = ?'); params.push(doctor_id); }
  if (appointment_id !== undefined) { changes.push('appointment_id = ?'); params.push(appointment_id); }
  if (diagnosis !== undefined) { changes.push('diagnosis = ?'); params.push(normalizeText(diagnosis)); }
  
  if (notes_meta !== undefined) { 
    changes.push('notes_meta = ?'); 
    params.push(typeof notes_meta === 'string' ? notes_meta : JSON.stringify(notes_meta));
    
    // Also update rx_code from meta
    try {
      const meta = typeof notes_meta === 'string' ? JSON.parse(notes_meta) : notes_meta;
      if (meta.rx_code) {
        changes.push('rx_code = ?');
        params.push(meta.rx_code);
      }
    } catch (e) {}
  }

  if (notes !== undefined || notes_meta !== undefined) {
    const parsedMeta = notes_meta !== undefined ? parseNotesMeta(notes_meta) : null;
    const nextNotes = notes !== undefined ? normalizeText(notes) : normalizeText(parsedMeta?.notes);
    changes.push('notes = ?');
    params.push(nextNotes);
  }
  
  if (medicines !== undefined) { 
    changes.push('medicines = ?'); 
    params.push(Array.isArray(medicines) ? JSON.stringify(medicines) : medicines); 
  }

  if (!changes.length) return res.status(400).json({ message: 'No changes provided' });
  params.push(id);
  await pool.query(`UPDATE prescriptions SET ${changes.join(', ')} WHERE id = ?`, params);
  const [rows] = await pool.query('SELECT * FROM prescriptions WHERE id = ?', [id]);
  res.json(rows[0]);
});

// Delete prescription
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM prescriptions WHERE id = ?', [id]);
  res.json({ success: true });
});

export default router;
