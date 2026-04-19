import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const MASTER_TABLES = {
  medicine_category: 'medicine_category_master',
  medicine_group: 'medicine_group_master',
  medicine_unit: 'medicine_unit_master',
  medicine_manufacturer: 'medicine_manufacturer_master',
  staff_role: 'staff_role_master',
  staff_designation: 'staff_designation_master',
  service: 'service_master',
};

function getMasterTable(type) {
  return MASTER_TABLES[type] || null;
}

function normalizeMasterName(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizeLegacyId(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizePrice(value) {
  if (value == null || String(value).trim() === '') return 0;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

function sanitizeSort(sort) {
  const field = String(sort || 'name').replace(/^-/, '').replace(/[^a-zA-Z0-9_]/g, '');
  const allowed = new Set(['type', 'name', 'price', 'created_at', 'updated_at']);
  return {
    field: allowed.has(field) ? field : 'name',
    direction: String(sort || '').startsWith('-') ? 'DESC' : 'ASC',
  };
}

async function findMasterById(id) {
  for (const [type, table] of Object.entries(MASTER_TABLES)) {
    const includePrice = type === 'service';
    const [rows] = await pool.query(
      `SELECT id, legacy_id, ? AS type, name, ${includePrice ? 'price,' : 'NULL AS price,'} created_at, updated_at FROM \`${table}\` WHERE id = ?`,
      [type, id]
    );
    if (rows.length) return rows[0];
  }
  return null;
}

router.get('/', requireAuth, async (req, res) => {
  const { type, name, sort } = req.query;
  const requestedType = type ? String(type) : null;
  const searchName = normalizeMasterName(name);
  const { field, direction } = sanitizeSort(sort);
  const targets = requestedType ? [requestedType] : Object.keys(MASTER_TABLES);
  const selects = [];
  const params = [];

  for (const currentType of targets) {
    const table = getMasterTable(currentType);
    if (!table) continue;
    selects.push(`SELECT id, legacy_id, ? AS type, name, ${currentType === 'service' ? 'price' : 'NULL AS price'}, created_at, updated_at FROM \`${table}\``);
    params.push(currentType);
  }

  if (!selects.length) {
    return res.json([]);
  }

  let sql = `SELECT * FROM (${selects.join(' UNION ALL ')}) master_rows`;
  if (searchName) {
    sql += ' WHERE name LIKE ?';
    params.push(`%${searchName}%`);
  }
  sql += ` ORDER BY \`${field}\` ${direction}`;

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.post('/', requireAuth, async (req, res) => {
  const { type, name, legacy_id, price } = req.body || {};
  const table = getMasterTable(type);
  const normalizedName = normalizeMasterName(name);
  const normalizedLegacyId = normalizeLegacyId(legacy_id);
  const normalizedPrice = type === 'service' ? normalizePrice(price) : null;

  if (!table || !normalizedName) {
    return res.status(400).json({ message: 'Type and name are required' });
  }
  if (type === 'service' && normalizedPrice == null) {
    return res.status(400).json({ message: 'A valid service price is required' });
  }

  const id = uuidv4();
  try {
    if (type === 'service') {
      await pool.query(
        `INSERT INTO \`${table}\` (id, legacy_id, name, price) VALUES (?, ?, ?, ?)`,
        [id, normalizedLegacyId, normalizedName, normalizedPrice]
      );
    } else {
      await pool.query(
        `INSERT INTO \`${table}\` (id, legacy_id, name) VALUES (?, ?, ?)`,
        [id, normalizedLegacyId, normalizedName]
      );
    }
    const [rows] = await pool.query(
      `SELECT id, legacy_id, ? AS type, name, ${type === 'service' ? 'price,' : 'NULL AS price,'} created_at, updated_at FROM \`${table}\` WHERE id = ?`,
      [type, id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Entry already exists for this type' });
    }
    throw err;
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, type, legacy_id, price } = req.body || {};
  const existing = await findMasterById(id);
  if (!existing) return res.status(404).json({ message: 'Master entry not found' });

  const nextType = type !== undefined ? String(type) : existing.type;
  const nextTable = getMasterTable(nextType);
  if (!nextTable) return res.status(400).json({ message: 'Invalid master type' });

  const nextName = name !== undefined ? normalizeMasterName(name) : existing.name;
  const nextLegacyId = legacy_id !== undefined ? normalizeLegacyId(legacy_id) : existing.legacy_id || null;
  const nextPrice = nextType === 'service'
    ? (price !== undefined ? normalizePrice(price) : normalizePrice(existing.price))
    : null;
  if (!nextName) return res.status(400).json({ message: 'Name is required' });
  if (nextType === 'service' && nextPrice == null) return res.status(400).json({ message: 'A valid service price is required' });

  try {
    if (nextType === existing.type) {
      if (nextType === 'service') {
        await pool.query(
          `UPDATE \`${nextTable}\` SET name = ?, legacy_id = ?, price = ? WHERE id = ?`,
          [nextName, nextLegacyId, nextPrice, id]
        );
      } else {
        await pool.query(
          `UPDATE \`${nextTable}\` SET name = ?, legacy_id = ? WHERE id = ?`,
          [nextName, nextLegacyId, id]
        );
      }
    } else {
      if (nextType === 'service') {
        await pool.query(
          `INSERT INTO \`${nextTable}\` (id, legacy_id, name, price) VALUES (?, ?, ?, ?)`,
          [id, nextLegacyId, nextName, nextPrice]
        );
      } else {
        await pool.query(
          `INSERT INTO \`${nextTable}\` (id, legacy_id, name) VALUES (?, ?, ?)`,
          [id, nextLegacyId, nextName]
        );
      }
      const currentTable = getMasterTable(existing.type);
      await pool.query(`DELETE FROM \`${currentTable}\` WHERE id = ?`, [id]);
    }
    const updated = await findMasterById(id);
    res.json(updated);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Entry already exists for this type' });
    }
    throw err;
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const existing = await findMasterById(id);
  if (!existing) return res.status(404).json({ message: 'Master entry not found' });
  try {
    await pool.query(`DELETE FROM \`${getMasterTable(existing.type)}\` WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ message: 'This master entry is already used in other records' });
    }
    throw err;
  }
});

export default router;
