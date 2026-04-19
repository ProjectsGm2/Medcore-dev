import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// List diagnosis records
router.get('/', requireAuth, async (req, res) => {
  const { sort, limit, id, patient_id, doctor_id } = req.query;
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

  let sql = 'SELECT * FROM diagnosis_records';
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  if (sort) {
    const sortField = sort.replace(/^-/, '');
    const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${sortField} ${direction}`;
  } else {
    sql += ' ORDER BY created_date DESC';
  }
  if (limit) sql += ` LIMIT ${Number(limit)}`;

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// Create diagnosis record
router.post('/', requireAuth, async (req, res) => {
  const { patient_id, doctor_id, symptoms, diagnosis } = req.body;
  if (!patient_id) {
    return res.status(400).json({ message: 'patient_id is required' });
  }
  const id = uuidv4();
  await pool.query(
    'INSERT INTO diagnosis_records (id, patient_id, doctor_id, symptoms, diagnosis) VALUES (?, ?, ?, ?, ?)',
    [id, patient_id, doctor_id || null, symptoms || null, diagnosis || null]
  );
  const [rows] = await pool.query('SELECT * FROM diagnosis_records WHERE id = ?', [id]);
  res.status(201).json(rows[0]);
});

// Update diagnosis record
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { patient_id, doctor_id, symptoms, diagnosis } = req.body;
  const changes = [];
  const params = [];
  if (patient_id !== undefined) { changes.push('patient_id = ?'); params.push(patient_id); }
  if (doctor_id !== undefined) { changes.push('doctor_id = ?'); params.push(doctor_id); }
  if (symptoms !== undefined) { changes.push('symptoms = ?'); params.push(symptoms); }
  if (diagnosis !== undefined) { changes.push('diagnosis = ?'); params.push(diagnosis); }
  if (!changes.length) return res.status(400).json({ message: 'No changes provided' });
  params.push(id);
  await pool.query(`UPDATE diagnosis_records SET ${changes.join(', ')} WHERE id = ?`, params);
  const [rows] = await pool.query('SELECT * FROM diagnosis_records WHERE id = ?', [id]);
  res.json(rows[0]);
});

// Delete diagnosis record
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM diagnosis_records WHERE id = ?', [id]);
  res.json({ success: true });
});

export default router;
