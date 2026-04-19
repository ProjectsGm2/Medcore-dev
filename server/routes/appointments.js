import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// List appointments
router.get('/', requireAuth, async (req, res) => {
  const { sort, limit, id, patient_id, doctor_id, status, type } = req.query;
  const conditions = [];
  const params = [];

  if (id) {
    conditions.push('a.id = ?');
    params.push(id);
  }
  if (patient_id) {
    conditions.push('a.patient_id = ?');
    params.push(patient_id);
  }
  if (doctor_id) {
    conditions.push('a.doctor_id = ?');
    params.push(doctor_id);
  }
  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  if (type) {
    conditions.push('a.type = ?');
    params.push(type);
  }

  let sql = `
    SELECT a.*, p.name AS patient_name, COALESCE(a.doctor_names, u.full_name, u.name) AS doctor_name
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id
    LEFT JOIN users u ON u.id = a.doctor_id
  `;
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;

  if (sort) {
    const sortField = sort.replace(/^-/, '');
    const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
    sql += ` ORDER BY a.${sortField} ${direction}`;
  } else {
    sql += ' ORDER BY a.appointment_date DESC';
  }
  if (limit) sql += ` LIMIT ${Number(limit)}`;

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// Get appointment
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(
    `SELECT a.*, p.name AS patient_name, COALESCE(a.doctor_names, u.full_name, u.name) AS doctor_name
     FROM appointments a
     LEFT JOIN patients p ON p.id = a.patient_id
     LEFT JOIN users u ON u.id = a.doctor_id
     WHERE a.id = ?`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Appointment not found' });
  res.json(rows[0]);
});

// Create appointment
router.post('/', requireAuth, async (req, res) => {
  const {
    patient_id,
    doctor_id,
    legacy_id,
    doctor_ids_json,
    doctor_names,
    appointment_date,
    appointment_time,
    reason,
    status = 'Scheduled',
    type = 'In-Person',
    payment_mode,
    discount = 0,
    priority = 'Normal',
    video_room_id,
    video_status,
    notes,
  } = req.body;
  if (!patient_id || !appointment_date) {
    return res.status(400).json({ message: 'patient_id and appointment_date are required' });
  }
  const id = uuidv4();
  const normalizedLegacyId = legacy_id == null || String(legacy_id).trim() === '' ? null : String(legacy_id).trim();
  await pool.query(
    `INSERT INTO appointments (
      id, legacy_id, patient_id, doctor_id, doctor_ids_json, doctor_names, appointment_date, appointment_time,
      reason, status, type, payment_mode, discount, priority, video_room_id, video_status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      normalizedLegacyId,
      patient_id,
      doctor_id || null,
      doctor_ids_json || null,
      doctor_names || null,
      appointment_date,
      appointment_time || null,
      reason || null,
      status,
      type,
      payment_mode || null,
      discount != null ? Number(discount) : 0,
      priority || 'Normal',
      video_room_id || null,
      video_status || null,
      notes || null,
    ]
  );
  const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [id]);
  res.status(201).json(rows[0]);
});

// Update appointment
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const updates = [];
  const params = [];

  for (const key of [
    'patient_id',
    'doctor_id',
    'doctor_ids_json',
    'doctor_names',
    'appointment_date',
    'appointment_time',
    'reason',
    'status',
    'type',
    'payment_mode',
    'discount',
    'priority',
    'video_room_id',
    'video_status',
    'notes',
  ]) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      if (key === 'doctor_id' || key === 'patient_id' || key === 'appointment_time' || key === 'reason' || key === 'video_room_id' || key === 'video_status' || key === 'notes' || key === 'payment_mode' || key === 'doctor_ids_json' || key === 'doctor_names') {
        const v = req.body[key];
        params.push(v === '' ? null : v);
      } else if (key === 'discount') {
        const v = req.body[key];
        params.push(v == null || v === '' ? 0 : Number(v));
      } else {
        params.push(req.body[key]);
      }
    }
  }

  if (!updates.length) {
    return res.status(400).json({ message: 'No changes provided' });
  }

  params.push(id);
  await pool.query(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`, params);

  const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [id]);
  res.json(rows[0]);
});

// Delete appointment
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM appointments WHERE id = ?', [id]);
  res.json({ success: true });
});

export default router;
