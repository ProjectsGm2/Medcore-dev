import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

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

// List patients
router.get('/', requireAuth, async (req, res) => {
  const { sort, limit, id, name, phone } = req.query;
  const conditions = [];
  const params = [];

  if (id) {
    conditions.push('id = ?');
    params.push(id);
  }
  if (name) {
    conditions.push('name LIKE ?');
    params.push(`%${name}%`);
  }
  if (phone) {
    conditions.push('phone LIKE ?');
    params.push(`%${phone}%`);
  }

  let sql = 'SELECT * FROM patients';
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  if (sort) {
    const sortField = sort.replace(/^-/, '');
    const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${mysqlEscapeId(sortField)} ${direction}`;
  } else {
    sql += ' ORDER BY created_date DESC';
  }
  if (limit) sql += ` LIMIT ${Number(limit)}`;

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// Get patient by id
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query('SELECT * FROM patients WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ message: 'Patient not found' });
  res.json(rows[0]);
});

// Create patient
router.post('/', requireAuth, async (req, res) => {
  const {
    name,
    phone,
    age,
    gender,
    blood_group,
    date_of_birth,
    known_allergies,
    marital_status,
    guardian_name,
    address,
    emergency_contact,
    medical_notes,
    legacy_id,
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Full name is required' });
  }
  // Enforce age availability (DOB optional). If age not provided but DOB is present, compute from DOB.
  let finalAge = null;
  if (age != null && String(age).trim() !== '') {
    finalAge = Number(age);
  } else if (date_of_birth && String(date_of_birth).trim() !== '') {
    finalAge = ageFromDob(date_of_birth);
  } else {
    return res.status(400).json({ message: 'Age is required' });
  }

  const id = uuidv4();
  const normalizedLegacyId = legacy_id == null || String(legacy_id).trim() === '' ? null : String(legacy_id).trim();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure settings and sequences tables exist (safety for upgraded databases)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(100) PRIMARY KEY,
        \`value\` LONGTEXT,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    try {
      await conn.query('ALTER TABLE settings MODIFY COLUMN `value` LONGTEXT');
    } catch (e) {
      if (e.code !== 'ER_PARSE_ERROR') throw e;
    }
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sequences (
        name VARCHAR(100) PRIMARY KEY,
        current INT NOT NULL DEFAULT 0,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    const [brandRows] = await conn.query("SELECT `value` FROM settings WHERE `key` = 'brand_name' FOR UPDATE");
    if (!brandRows.length || !String(brandRows[0].value || '').trim()) {
      await conn.rollback();
      return res.status(428).json({ message: 'Brand name is required. Please set it in Settings.' });
    }
    const brandRaw = String(brandRows[0].value).trim();
    const brand = brandRaw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const year = new Date().getFullYear();
    const seqKey = `patient_uhid_${year}_${brand}`;
    const prefix = `${year}${brand}`;
    const [seqRows] = await conn.query('SELECT current FROM sequences WHERE name = ? FOR UPDATE', [seqKey]);
    let current = 0;
    if (!seqRows.length) {
      await conn.query('INSERT INTO sequences (name, current) VALUES (?, ?)', [seqKey, 0]);
    } else {
      current = Number(seqRows[0].current) || 0;
    }
    const [maxRows] = await conn.query('SELECT MAX(uhid) AS max_uhid FROM patients WHERE uhid LIKE ?', [`${prefix}%`]);
    let maxExisting = 0;
    if (maxRows[0]?.max_uhid) {
      const suf = String(maxRows[0].max_uhid).slice(prefix.length);
      const n = parseInt(suf, 10);
      if (!Number.isNaN(n)) maxExisting = n;
    }
    if (current < maxExisting) current = maxExisting;

    let uhid = null;
    let inserted = false;
    const normalizedDob = (date_of_birth && String(date_of_birth).trim() !== '') ? date_of_birth : null;
    while (!inserted) {
      const next = current + 1;
      await conn.query('UPDATE sequences SET current = ? WHERE name = ?', [next, seqKey]);
      const seqStr = String(next).padStart(3, '0');
      uhid = `${prefix}${seqStr}`;
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
            normalizedLegacyId,
            name.trim(),
            phone || null,
            finalAge,
            gender || null,
            blood_group || null,
            normalizedDob,
            known_allergies || null,
            marital_status || null,
            guardian_name || null,
            address || null,
            emergency_contact || null,
            medical_notes || null,
          ]
        );
        inserted = true;
      } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') {
          current = next;
          continue;
        }
        throw e;
      }
    }

    const [rows] = await conn.query('SELECT * FROM patients WHERE id = ?', [id]);
    await conn.commit();
    res.status(201).json(rows[0]);
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
});

// Update patient
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    phone,
    age,
    gender,
    blood_group,
    date_of_birth,
    known_allergies,
    marital_status,
    guardian_name,
    address,
    emergency_contact,
    medical_notes,
  } = req.body;

  const changes = [];
  const params = [];

  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ message: 'Full name cannot be empty' });
    changes.push('name = ?');
    params.push(name.trim());
  }
  if (phone !== undefined) { changes.push('phone = ?'); params.push(phone); }
  if (gender !== undefined) { changes.push('gender = ?'); params.push(gender); }
  if (blood_group !== undefined) { changes.push('blood_group = ?'); params.push(blood_group); }
  if (date_of_birth !== undefined) {
    if (date_of_birth === null || date_of_birth === '') {
      changes.push('date_of_birth = ?');
      params.push(null);
      if (age !== undefined) {
        changes.push('age = ?');
        params.push(age);
      }
    } else {
      changes.push('date_of_birth = ?');
      params.push(date_of_birth);
      changes.push('age = ?');
      params.push(ageFromDob(date_of_birth));
    }
  }
  if (age !== undefined && date_of_birth === undefined) {
    changes.push('age = ?');
    params.push(age);
  }
  if (known_allergies !== undefined) { changes.push('known_allergies = ?'); params.push(known_allergies); }
  if (marital_status !== undefined) { changes.push('marital_status = ?'); params.push(marital_status); }
  if (guardian_name !== undefined) { changes.push('guardian_name = ?'); params.push(guardian_name); }
  if (address !== undefined) { changes.push('address = ?'); params.push(address); }
  if (emergency_contact !== undefined) { changes.push('emergency_contact = ?'); params.push(emergency_contact); }
  if (medical_notes !== undefined) { changes.push('medical_notes = ?'); params.push(medical_notes); }

  if (!changes.length) return res.status(400).json({ message: 'No changes provided' });
  params.push(id);
  await pool.query(`UPDATE patients SET ${changes.join(', ')} WHERE id = ?`, params);
  const [rows] = await pool.query('SELECT * FROM patients WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ message: 'Patient not found' });
  res.json(rows[0]);
});

// Delete patient
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM patients WHERE id = ?', [id]);
  res.json({ success: true });
});

// Helper for escaping identifier
function mysqlEscapeId(id) {
  return `\`${id.replace(/`/g, '')}\``;
}

export default router;
