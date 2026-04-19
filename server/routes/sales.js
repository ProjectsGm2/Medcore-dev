import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// List sales
router.get('/', requireAuth, async (req, res) => {
  const { sort, limit, medicine_id } = req.query;
  const conditions = [];
  const params = [];

  if (medicine_id) {
    conditions.push('medicine_id = ?');
    params.push(medicine_id);
  }

  let sql = 'SELECT * FROM sales';
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

// Create sale (also decrements medicine stock)
router.post('/', requireAuth, async (req, res) => {
  const {
    medicine_id,
    medicine_name,
    quantity_sold,
    unit_price,
    total_amount,
    sale_date,
    patient_name,
    notes,
    sold_by,
    sold_by_name,
  } = req.body || {};

  if (!medicine_id) return res.status(400).json({ message: 'medicine_id is required' });

  const qty = Math.max(1, Number(quantity_sold || 1));
  const id = uuidv4();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [medRows] = await conn.query('SELECT stock, name, price FROM medicines WHERE id = ? FOR UPDATE', [medicine_id]);
    if (!Array.isArray(medRows) || medRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Medicine not found' });
    }

    const currentStock = Number(medRows[0].stock || 0);
    if (currentStock < qty) {
      await conn.rollback();
      return res.status(400).json({ message: `Insufficient stock. Available: ${currentStock}` });
    }

    const safeUnitPrice = Number(unit_price ?? medRows[0].price ?? 0);
    const safeTotal = Number(total_amount ?? safeUnitPrice * qty);

    await conn.query(
      `INSERT INTO sales (
        id, medicine_id, medicine_name, quantity_sold, unit_price, total_amount,
        sale_date, patient_name, notes, sold_by, sold_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        medicine_id,
        medicine_name || medRows[0].name || null,
        qty,
        safeUnitPrice,
        safeTotal,
        sale_date || null,
        patient_name || null,
        notes || null,
        sold_by || null,
        sold_by_name || null,
      ]
    );

    await conn.query('UPDATE medicines SET stock = stock - ? WHERE id = ?', [qty, medicine_id]);

    const [rows] = await conn.query('SELECT * FROM sales WHERE id = ?', [id]);
    await conn.commit();
    res.status(201).json(rows[0]);
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
});

export default router;

