import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

async function ensureMasterValue(tableName, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const [refRows] = await pool.query(
    `SELECT name
     FROM \`${tableName}\`
     WHERE legacy_id = ? OR (legacy_id IS NULL AND id = ?)
     ORDER BY CASE WHEN legacy_id = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    [normalized, normalized, normalized]
  );
  if (refRows.length) return refRows[0].name;
  const [nameRows] = await pool.query(
    `SELECT name FROM \`${tableName}\` WHERE name = ? LIMIT 1`,
    [normalized]
  );
  if (nameRows.length) return nameRows[0].name;
  await pool.query(
    `INSERT INTO \`${tableName}\` (id, name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [uuidv4(), normalized]
  );
  return normalized;
}

function escapeSortField(field) {
  const f = field.replace(/^-/, '').replace(/[^a-zA-Z0-9_]/g, '');
  return f || 'created_date';
}

// Distinct medicine categories (for GRN dropdown)
router.get('/categories', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT name FROM medicine_category_master ORDER BY name ASC`
  );
  if (rows.length > 0) {
    return res.json(rows.map((r) => r.name));
  }
  // Fallback to existing data if master is empty
  const [dist] = await pool.query(
    `SELECT DISTINCT category FROM medicines
     WHERE category IS NOT NULL AND TRIM(category) <> ''
     ORDER BY category ASC`
  );
  res.json(dist.map((r) => r.category));
});

// List medicines
router.get('/', requireAuth, async (req, res) => {
  const { sort, limit, id, name, category } = req.query;
  const conditions = [];
  const params = [];

  if (id) {
    conditions.push('m.id = ?');
    params.push(id);
  }
  if (name) {
    conditions.push('m.name LIKE ?');
    params.push(`%${name}%`);
  }
  if (category) {
    conditions.push('m.category = ?');
    params.push(category);
  }

  let sql = `
    SELECT
      m.*,
      CASE
        WHEN EXISTS (SELECT 1 FROM grn_lines l WHERE l.medicine_id = m.id AND COALESCE(l.quantity_remaining, 0) > 0)
          THEN COALESCE((SELECT SUM(l2.quantity_remaining) FROM grn_lines l2 WHERE l2.medicine_id = m.id AND COALESCE(l2.quantity_remaining, 0) > 0), 0)
        ELSE COALESCE(m.stock, 0)
      END AS stock,
      (
        SELECT l3.batch_number
        FROM grn_lines l3
        WHERE l3.medicine_id = m.id AND COALESCE(l3.quantity_remaining, 0) > 0
        ORDER BY (l3.expiry_date IS NULL) ASC, l3.expiry_date ASC, l3.created_date ASC
        LIMIT 1
      ) AS next_batch_number,
      CASE
        WHEN EXISTS (SELECT 1 FROM grn_lines l4 WHERE l4.medicine_id = m.id AND COALESCE(l4.quantity_remaining, 0) > 0)
          THEN (
            SELECT l5.expiry_date
            FROM grn_lines l5
            WHERE l5.medicine_id = m.id AND COALESCE(l5.quantity_remaining, 0) > 0
            ORDER BY (l5.expiry_date IS NULL) ASC, l5.expiry_date ASC, l5.created_date ASC
            LIMIT 1
          )
        ELSE m.expiry_date
      END AS expiry_date,
      CASE
        WHEN EXISTS (SELECT 1 FROM grn_lines l6 WHERE l6.medicine_id = m.id AND COALESCE(l6.quantity_remaining, 0) > 0)
          THEN COALESCE((
            SELECT l7.sale_price
            FROM grn_lines l7
            WHERE l7.medicine_id = m.id AND COALESCE(l7.quantity_remaining, 0) > 0
            ORDER BY (l7.expiry_date IS NULL) ASC, l7.expiry_date ASC, l7.created_date ASC
            LIMIT 1
          ), 0)
        ELSE m.price
      END AS price
    FROM medicines m
  `;
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  const sortField = escapeSortField(sort || '-created_date');
  const direction = (sort || '').startsWith('-') ? 'DESC' : 'ASC';
  sql += ` ORDER BY \`${sortField}\` ${direction}`;
  if (limit) sql += ` LIMIT ${Number(limit)}`;

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// Get medicine by id
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query('SELECT * FROM medicines WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ message: 'Medicine not found' });
  res.json(rows[0]);
});

// Create medicine (master metadata — stock/price via GRN)
router.post('/', requireAuth, async (req, res) => {
  const {
    name,
    legacy_id,
    category,
    company,
    composition,
    medicine_group,
    units,
    min_level,
    reorder_level,
    box_packaging,
    rack_number,
    notes_description,
    description,
  } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Medicine name is required' });
  }
  if (!units || !String(units).trim()) {
    return res.status(400).json({ message: 'Units is required' });
  }

  const id = uuidv4();
  const normalizedLegacyId = legacy_id == null || String(legacy_id).trim() === '' ? null : String(legacy_id).trim();
  const notes = notes_description ?? description ?? null;
  const normalizedCategory = await ensureMasterValue('medicine_category_master', category);
  const normalizedCompany = await ensureMasterValue('medicine_manufacturer_master', company);
  const normalizedGroup = await ensureMasterValue('medicine_group_master', medicine_group);
  const normalizedUnits = await ensureMasterValue('medicine_unit_master', units);

  await pool.query(
    `INSERT INTO medicines (
      id, legacy_id, name, category, company, composition, medicine_group, units,
      min_level, reorder_level, box_packaging, rack_number, notes_description, description,
      price, stock, expiry_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      normalizedLegacyId,
      name.trim(),
      normalizedCategory,
      normalizedCompany,
      composition || null,
      normalizedGroup,
      normalizedUnits,
      min_level != null ? Math.max(0, Number(min_level)) : 0,
      reorder_level != null ? Math.max(0, Number(reorder_level)) : 0,
      box_packaging || null,
      rack_number || null,
      notes,
      notes,
      0,
      0,
      null,
    ]
  );
  const [rows] = await pool.query('SELECT * FROM medicines WHERE id = ?', [id]);
  res.status(201).json(rows[0]);
});

// Update medicine (metadata only — do not use for stock; use GRN)
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const allowed = [
    'name', 'category', 'company', 'composition', 'medicine_group', 'units',
    'min_level', 'reorder_level', 'box_packaging', 'rack_number', 'notes_description', 'description',
    'price', 'stock', 'expiry_date',
  ];
  const changes = [];
  const params = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      changes.push(`${key} = ?`);
      if (key === 'min_level' || key === 'reorder_level' || key === 'stock') {
        params.push(body[key] == null ? null : Number(body[key]));
      } else if (key === 'category') {
        params.push(await ensureMasterValue('medicine_category_master', body[key]));
      } else if (key === 'company') {
        params.push(await ensureMasterValue('medicine_manufacturer_master', body[key]));
      } else if (key === 'medicine_group') {
        params.push(await ensureMasterValue('medicine_group_master', body[key]));
      } else if (key === 'units') {
        params.push(await ensureMasterValue('medicine_unit_master', body[key]));
      } else {
        params.push(body[key]);
      }
    }
  }

  if (body.notes_description !== undefined && body.description === undefined) {
    changes.push('description = ?');
    params.push(body.notes_description);
  }

  if (!changes.length) return res.status(400).json({ message: 'No changes provided' });
  params.push(id);
  await pool.query(`UPDATE medicines SET ${changes.join(', ')} WHERE id = ?`, params);
  const [rows] = await pool.query('SELECT * FROM medicines WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ message: 'Medicine not found' });
  res.json(rows[0]);
});

// Delete medicine
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [[medicine]] = await pool.query('SELECT id, name FROM medicines WHERE id = ?', [id]);
  if (!medicine) return res.status(404).json({ message: 'Medicine not found' });

  const [[grnRef]] = await pool.query('SELECT COUNT(*) AS count FROM grn_lines WHERE medicine_id = ?', [id]);
  const [[saleRef]] = await pool.query('SELECT COUNT(*) AS count FROM sales WHERE medicine_id = ?', [id]);
  const [[billRef]] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM sales_bill_lines l
     JOIN grn_lines gl ON gl.id = l.grn_line_id
     WHERE gl.medicine_id = ?`,
    [id]
  );

  const grnCount = Number(grnRef?.count || 0);
  const saleCount = Number(saleRef?.count || 0);
  const billCount = Number(billRef?.count || 0);

  if (grnCount > 0 || saleCount > 0 || billCount > 0) {
    return res.status(409).json({
      message: `${medicine.name || 'This medicine'} cannot be deleted because it is already used in ${grnCount} GRN line(s), ${saleCount} sale record(s), and ${billCount} bill line(s).`,
    });
  }

  await pool.query('DELETE FROM medicines WHERE id = ?', [id]);
  res.json({ success: true });
});

export default router;
