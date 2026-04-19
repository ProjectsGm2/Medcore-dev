import express from 'express';
import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const router = express.Router();

async function ensureMasterValue(tableName, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const resolved = await findMasterValue(tableName, normalized);
  if (resolved) return resolved;
  await pool.query(
    `INSERT INTO \`${tableName}\` (id, name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [uuidv4(), normalized]
  );
  return normalized;
}

async function findMasterValue(tableName, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const [nameRows] = await pool.query(
    `SELECT name FROM \`${tableName}\` WHERE name = ? LIMIT 1`,
    [normalized]
  );
  if (nameRows.length) return nameRows[0].name;
  const [legacyRows] = await pool.query(
    `SELECT name FROM \`${tableName}\` WHERE legacy_id = ? LIMIT 1`,
    [normalized]
  );
  if (legacyRows.length) return legacyRows[0].name;
  const [idRows] = await pool.query(
    `SELECT name FROM \`${tableName}\` WHERE legacy_id IS NULL AND id = ? LIMIT 1`,
    [normalized]
  );
  if (idRows.length) return idRows[0].name;
  return null;
}

function normalizeUserRole(role) {
  const raw = String(role || '').trim().toLowerCase();
  const compact = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!compact) return 'doctor';
  if (compact === 'admin' || compact === 'administrator' || compact === 'super admin' || compact === 'superadmin') return 'admin';
  if (compact === 'doctor' || compact === 'dr' || compact === 'physician' || compact === 'consultant' || compact === 'medical officer') return 'doctor';
  if (compact === 'receptionist' || compact === 'reception' || compact === 'front office' || compact === 'front desk' || compact === 'frontoffice' || compact === 'frontdesk') return 'receptionist';
  if (compact.includes('admin')) return 'admin';
  if (compact.includes('doctor') || compact.includes('physician') || compact.includes('consult')) return 'doctor';
  if (compact.includes('front') || compact.includes('reception') || compact.includes('desk') || compact.includes('office')) return 'receptionist';
  return 'doctor';
}

function mapUserRow(row) {
  if (!row) return row;
  return { ...row, role: normalizeUserRole(row.role) };
}

// List users (no auth required)
router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT id, legacy_id, name, COALESCE(full_name, name) AS full_name, email, role, phone, designation, specialization, doctor_fee, photo_url, created_at, updated_at FROM users ORDER BY created_at DESC');
  res.json(rows.map(mapUserRow));
});

// Create user (no auth required)
router.post('/', async (req, res) => {
  const { name, full_name, email, password, role, phone, designation, specialization, doctor_fee, photo_url, legacy_id } = req.body;
  if (!name || !email || !role) {
    return res.status(400).json({ message: 'Missing required fields (name, email, role)' });
  }
  const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exists.length) {
    return res.status(409).json({ message: 'User already exists' });
  }
  const pw = password && String(password).trim() ? password : Math.random().toString(36).slice(-10);
  const password_hash = await bcrypt.hash(pw, 10);
  const id = uuidv4();
  const normalizedLegacyId = legacy_id == null || String(legacy_id).trim() === '' ? null : String(legacy_id).trim();
  const normalizedRole = normalizeUserRole((await findMasterValue('staff_role_master', role)) || role);
  const normalizedDesignation = await ensureMasterValue('staff_designation_master', designation);
  await ensureMasterValue('staff_role_master', normalizedRole);
  await pool.query(
    'INSERT INTO users (id, legacy_id, name, full_name, email, password_hash, role, phone, designation, specialization, doctor_fee, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, normalizedLegacyId, name, full_name || name, email, password_hash, normalizedRole, phone || null, normalizedDesignation, specialization || null, doctor_fee == null || doctor_fee === '' ? null : Number(doctor_fee), photo_url || null]
  );
  res.status(201).json(mapUserRow({ id, legacy_id: normalizedLegacyId, name, full_name: full_name || name, email, role: normalizedRole, phone, designation: normalizedDesignation, specialization, doctor_fee, photo_url }));
});

// Update user
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, full_name, email, password, role, phone, designation, specialization, doctor_fee, photo_url } = req.body;
  const changes = [];
  const values = [];
  if (name !== undefined) { changes.push('name = ?'); values.push(name); }
  if (full_name !== undefined) { changes.push('full_name = ?'); values.push(full_name); }
  if (email !== undefined) { changes.push('email = ?'); values.push(email); }
  if (role !== undefined) {
    const normalizedRole = normalizeUserRole((await findMasterValue('staff_role_master', role)) || role);
    await ensureMasterValue('staff_role_master', normalizedRole);
    changes.push('role = ?');
    values.push(normalizedRole);
  }
  if (phone !== undefined) { changes.push('phone = ?'); values.push(phone); }
  if (designation !== undefined) {
    changes.push('designation = ?');
    values.push(await ensureMasterValue('staff_designation_master', designation));
  }
  if (specialization !== undefined) { changes.push('specialization = ?'); values.push(specialization); }
  if (doctor_fee !== undefined) { changes.push('doctor_fee = ?'); values.push(doctor_fee == null || doctor_fee === '' ? null : Number(doctor_fee)); }
  if (photo_url !== undefined) { changes.push('photo_url = ?'); values.push(photo_url); }
  if (password) { changes.push('password_hash = ?'); values.push(await bcrypt.hash(password, 10)); }
  if (!changes.length) return res.status(400).json({ message: 'No changes provided' });
  values.push(id);
  await pool.query(`UPDATE users SET ${changes.join(', ')} WHERE id = ?`, values);
  const [rows] = await pool.query('SELECT id, legacy_id, name, COALESCE(full_name, name) AS full_name, email, role, phone, designation, specialization, doctor_fee, photo_url FROM users WHERE id = ?', [id]);
  res.json(mapUserRow(rows[0]));
});

// Delete user
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
  res.json({ success: true });
});

export default router;
