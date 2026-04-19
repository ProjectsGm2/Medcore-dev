import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { sort, limit } = req.query;
  let sql = 'SELECT * FROM suppliers';
  if (sort) {
    const sortField = sort.replace(/^-/, '').replace(/[^a-zA-Z0-9_]/g, '');
    const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
    sql += ` ORDER BY \`${sortField}\` ${direction}`;
  } else {
    sql += ' ORDER BY name ASC';
  }
  if (limit) sql += ` LIMIT ${Number(limit)}`;
  const [rows] = await pool.query(sql);
  res.json(rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Supplier not found' });
  res.json(rows[0]);
});

router.post('/', requireAuth, async (req, res) => {
  const { name, email, phone, drug_license_number, poc_name, address, notes, legacy_id } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Supplier name is required' });
  }
  const id = uuidv4();
  const normalizedLegacyId = legacy_id == null || String(legacy_id).trim() === '' ? null : String(legacy_id).trim();
  await pool.query(
    'INSERT INTO suppliers (id, legacy_id, name, email, phone, drug_license_number, poc_name, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      normalizedLegacyId,
      name.trim(),
      email || null,
      phone || null,
      drug_license_number || null,
      poc_name || null,
      address || null,
      notes || null,
    ]
  );
  const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
  res.status(201).json(rows[0]);
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, drug_license_number, poc_name, address, notes, legacy_id } = req.body || {};
  const changes = [];
  const params = [];
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ message: 'Name cannot be empty' });
    changes.push('name = ?');
    params.push(name.trim());
  }
  if (email !== undefined) { changes.push('email = ?'); params.push(email || null); }
  if (phone !== undefined) { changes.push('phone = ?'); params.push(phone); }
  if (drug_license_number !== undefined) { changes.push('drug_license_number = ?'); params.push(drug_license_number || null); }
  if (poc_name !== undefined) { changes.push('poc_name = ?'); params.push(poc_name || null); }
  if (address !== undefined) { changes.push('address = ?'); params.push(address); }
  if (notes !== undefined) { changes.push('notes = ?'); params.push(notes); }
  if (legacy_id !== undefined) {
    changes.push('legacy_id = ?');
    params.push(legacy_id == null || String(legacy_id).trim() === '' ? null : String(legacy_id).trim());
  }
  if (!changes.length) return res.status(400).json({ message: 'No changes provided' });
  params.push(id);
  await pool.query(`UPDATE suppliers SET ${changes.join(', ')} WHERE id = ?`, params);
  const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ message: 'Supplier not found' });
  res.json(rows[0]);
});

router.delete('/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;
