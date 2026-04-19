import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function computeLineSubtotal(quantity, purchasePrice) {
  const q = Math.max(0, Number(quantity) || 0);
  const p = Math.max(0, Number(purchasePrice) || 0);
  return roundMoney(q * p);
}

function computeLineTax(quantity, purchasePrice, taxPercent) {
  const subtotal = computeLineSubtotal(quantity, purchasePrice);
  const t = Math.max(0, Number(taxPercent) || 0);
  return roundMoney(subtotal * t / 100);
}

function computeLineAmount(quantity, purchasePrice, taxPercent) {
  return roundMoney(computeLineSubtotal(quantity, purchasePrice) + computeLineTax(quantity, purchasePrice, taxPercent));
}

function computeSalePriceFromMrp(mrp, taxPercent) {
  const m = Number(mrp) || 0;
  const t = Math.max(0, Number(taxPercent) || 0);
  if (m <= 0) return 0;
  if (t <= 0) return roundMoney(m);
  // MRP tax-inclusive: sale (ex-tax) = MRP / (1 + tax/100)
  return roundMoney(m / (1 + t / 100));
}

// List GRN headers
router.get('/', requireAuth, async (req, res) => {
  const { limit } = req.query;
  let sql = `
    SELECT g.*, s.name AS supplier_name,
      (SELECT COUNT(*) FROM grn_lines l WHERE l.grn_id = g.id) AS line_count
    FROM grn g
    LEFT JOIN suppliers s ON s.id = g.supplier_id
    ORDER BY g.created_date DESC
  `;
  if (limit) sql += ` LIMIT ${Number(limit)}`;
  const [rows] = await pool.query(sql);
  res.json(rows);
});

// Available batches for a medicine (with tax and sale price)
router.get('/batches', requireAuth, async (req, res) => {
  const { medicine_id, include_id } = req.query;
  if (!medicine_id) return res.status(400).json({ message: 'medicine_id is required' });
  const includeId = include_id == null || String(include_id).trim() === '' ? null : String(include_id).trim();
  const [rows] = await pool.query(
    `SELECT l.id, l.batch_number, l.expiry_date, l.quantity_remaining, l.sale_price,
            COALESCE(l.tax_percent, 0) AS tax_percent
     FROM grn_lines l
     WHERE (l.medicine_id = ? AND COALESCE(l.quantity_remaining, 0) > 0)
        OR (l.medicine_id = ? AND ? IS NOT NULL AND l.id = ?)
     ORDER BY (l.expiry_date IS NULL) ASC, l.expiry_date ASC, l.created_date ASC`,
    [medicine_id, medicine_id, includeId, includeId]
  );
  res.json(rows);
});

// Get GRN with lines
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [headers] = await pool.query(
    `SELECT g.*, s.name AS supplier_name FROM grn g
     LEFT JOIN suppliers s ON s.id = g.supplier_id WHERE g.id = ?`,
    [id]
  );
  if (!headers.length) return res.status(404).json({ message: 'GRN not found' });
  const [lines] = await pool.query(
    `SELECT l.*, m.name AS medicine_name, m.category AS medicine_category FROM grn_lines l
     JOIN medicines m ON m.id = l.medicine_id WHERE l.grn_id = ? ORDER BY l.created_date ASC`,
    [id]
  );
  res.json({ ...headers[0], lines });
});

/**
 * POST body: {
 *   supplier_id, bill_number, bill_date?, notes?, discount?, payment_mode?, payment_note?,
 *   lines: [{ medicine_id, batch_number, expiry_date, mrp, batch_amount?, sale_price?, packing_quantity?, quantity, purchase_price, tax_percent? }]
 * }
 */
router.post('/', requireAuth, async (req, res) => {
  const { supplier_id, bill_number, bill_date, notes, discount, payment_mode, payment_note, lines, legacy_id } = req.body || {};
  if (!bill_number || !String(bill_number).trim()) {
    return res.status(400).json({ message: 'Bill number is required' });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ message: 'At least one line item is required' });
  }

  const grnId = uuidv4();
  const normalizedLegacyId = legacy_id == null || String(legacy_id).trim() === '' ? null : String(legacy_id).trim();
  const userId = req.user?.id || null;
  let subtotal = 0;
  let taxTotal = 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO grn (id, legacy_id, supplier_id, bill_number, bill_date, notes, discount, total_amount, payment_mode, payment_note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [grnId, normalizedLegacyId, supplier_id || null, bill_number.trim(), bill_date || null, notes || null, 0, 0, payment_mode || null, payment_note || null, userId]
    );

    for (const line of lines) {
      const {
        medicine_id,
        batch_number,
        expiry_date,
        mrp,
        batch_amount,
        sale_price: salePriceIn,
        packing_quantity,
        quantity,
        purchase_price,
        tax_percent,
      } = line;

      if (!medicine_id) {
        await conn.rollback();
        return res.status(400).json({ message: 'Each line must have medicine_id' });
      }
      const qty = Math.max(0, Math.floor(Number(quantity) || 0));
      if (qty <= 0) {
        await conn.rollback();
        return res.status(400).json({ message: 'Each line must have quantity > 0' });
      }

      const tax = Number(tax_percent) || 0;
      const pp = Number(purchase_price) || 0;
      const mrpVal = Number(mrp) || 0;
      const lineSubtotal = computeLineSubtotal(qty, pp);
      const lineTax = computeLineTax(qty, pp, tax);
      const lineAmount = computeLineAmount(qty, pp, tax);
      subtotal += lineSubtotal;
      taxTotal += lineTax;
      const salePrice =
        salePriceIn != null && salePriceIn !== ''
          ? roundMoney(Number(salePriceIn))
          : computeSalePriceFromMrp(mrpVal, tax);

      const [medRows] = await conn.query(
        'SELECT stock, price, expiry_date FROM medicines WHERE id = ? FOR UPDATE',
        [medicine_id]
      );
      if (!medRows.length) {
        await conn.rollback();
        return res.status(404).json({ message: `Medicine not found: ${medicine_id}` });
      }

      const packQty = Math.max(1, Math.floor(Number(packing_quantity) || 1));
      const lineId = uuidv4();

      await conn.query(
        `INSERT INTO grn_lines (
          id, grn_id, medicine_id, batch_number, expiry_date,
          mrp, batch_amount, sale_price, packing_quantity, quantity, quantity_remaining, purchase_price, tax_percent, line_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId,
          grnId,
          medicine_id,
          batch_number || null,
          expiry_date || null,
          mrpVal,
          batch_amount != null ? Number(batch_amount) : 0,
          salePrice,
          packQty,
          qty,
          qty,
          pp,
          tax,
          lineAmount,
        ]
      );

      const newStock = Number(medRows[0].stock || 0) + qty;
      const newPrice = salePrice > 0 ? salePrice : mrpVal > 0 ? mrpVal : Number(medRows[0].price) || 0;
      let newExpiry = medRows[0].expiry_date;
      if (expiry_date) {
        if (!newExpiry || new Date(expiry_date) < new Date(newExpiry)) {
          newExpiry = expiry_date;
        }
      }

      await conn.query(
        'UPDATE medicines SET stock = ?, price = ?, expiry_date = ? WHERE id = ?',
        [newStock, newPrice, newExpiry || null, medicine_id]
      );
    }

    const disc = Math.max(0, Number(discount) || 0);
    const netTotal = roundMoney(Math.max(0, subtotal + taxTotal - disc));
    await conn.query(
      'UPDATE grn SET discount = ?, tax_amount = ?, net_total_amount = ?, total_amount = ?, payment_mode = ?, payment_note = ? WHERE id = ?',
      [disc, taxTotal, netTotal, netTotal, payment_mode || null, payment_note || null, grnId]
    );

    const [out] = await conn.query('SELECT * FROM grn WHERE id = ?', [grnId]);
    await conn.commit();
    res.status(201).json(out[0]);
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
});

async function getGrnLinesForUpdate(conn, grnId) {
  const [lines] = await conn.query(
    `SELECT l.*
     FROM grn_lines l
     WHERE l.grn_id = ?
     ORDER BY l.created_date ASC`,
    [grnId]
  );
  return lines;
}

function assertGrnEditable(lines) {
  for (const line of lines) {
    const originalQty = Number(line.quantity || 0);
    const remainingQty = Number(line.quantity_remaining ?? originalQty);
    if (remainingQty < originalQty) {
      const medicineName = line.medicine_name || line.medicine_id || 'This GRN';
      const soldQty = originalQty - remainingQty;
      const err = new Error(`${medicineName} already has ${soldQty} units consumed from this GRN`);
      err.statusCode = 409;
      throw err;
    }
  }
}

async function reverseGrnInventory(conn, existingLines) {
  for (const line of existingLines) {
    const qty = Number(line.quantity || 0);
    const [medRows] = await conn.query(
      'SELECT stock FROM medicines WHERE id = ? FOR UPDATE',
      [line.medicine_id]
    );
    if (medRows.length) {
      const nextStock = Math.max(0, Number(medRows[0].stock || 0) - qty);
      await conn.query('UPDATE medicines SET stock = ? WHERE id = ?', [nextStock, line.medicine_id]);
    }
  }
  await conn.query('DELETE FROM grn_lines WHERE grn_id = ?', [existingLines[0]?.grn_id || '']);
}

async function applyGrnLines(conn, grnId, lines) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const {
      medicine_id,
      batch_number,
      expiry_date,
      mrp,
      batch_amount,
      sale_price: salePriceIn,
      packing_quantity,
      quantity,
      purchase_price,
      tax_percent,
      legacy_id,
    } = line;

    if (!medicine_id) {
      const err = new Error('Each line must have medicine_id');
      err.statusCode = 400;
      throw err;
    }
    const qty = Math.max(0, Math.floor(Number(quantity) || 0));
    if (qty <= 0) {
      const err = new Error('Each line must have quantity > 0');
      err.statusCode = 400;
      throw err;
    }

    const tax = Number(tax_percent) || 0;
    const pp = Number(purchase_price) || 0;
    const mrpVal = Number(mrp) || 0;
    const lineSubtotal = computeLineSubtotal(qty, pp);
    const lineTax = computeLineTax(qty, pp, tax);
    const lineAmount = computeLineAmount(qty, pp, tax);
    subtotal += lineSubtotal;
    taxTotal += lineTax;
    const salePrice =
      salePriceIn != null && salePriceIn !== ''
        ? roundMoney(Number(salePriceIn))
        : computeSalePriceFromMrp(mrpVal, tax);

    const [medRows] = await conn.query(
      'SELECT stock, price, expiry_date FROM medicines WHERE id = ? FOR UPDATE',
      [medicine_id]
    );
    if (!medRows.length) {
      const err = new Error(`Medicine not found: ${medicine_id}`);
      err.statusCode = 404;
      throw err;
    }

    const packQty = Math.max(1, Math.floor(Number(packing_quantity) || 1));
    const lineId = uuidv4();
    const normalizedLegacyId = legacy_id == null || String(legacy_id).trim() === '' ? null : String(legacy_id).trim();

    await conn.query(
      `INSERT INTO grn_lines (
        id, legacy_id, grn_id, medicine_id, batch_number, expiry_date,
        mrp, batch_amount, sale_price, packing_quantity, quantity, quantity_remaining, purchase_price, tax_percent, line_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId,
        normalizedLegacyId,
        grnId,
        medicine_id,
        batch_number || null,
        expiry_date || null,
        mrpVal,
        batch_amount != null ? Number(batch_amount) : 0,
        salePrice,
        packQty,
        qty,
        qty,
        pp,
        tax,
        lineAmount,
      ]
    );

    const newStock = Number(medRows[0].stock || 0) + qty;
    const newPrice = salePrice > 0 ? salePrice : mrpVal > 0 ? mrpVal : Number(medRows[0].price) || 0;
    let newExpiry = medRows[0].expiry_date;
    if (expiry_date) {
      if (!newExpiry || new Date(expiry_date) < new Date(newExpiry)) {
        newExpiry = expiry_date;
      }
    }

    await conn.query(
      'UPDATE medicines SET stock = ?, price = ?, expiry_date = ? WHERE id = ?',
      [newStock, newPrice, newExpiry || null, medicine_id]
    );
  }
  return { subtotal, taxTotal };
}

router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { supplier_id, bill_number, bill_date, notes, discount, payment_mode, payment_note, lines } = req.body || {};
  if (!bill_number || !String(bill_number).trim()) {
    return res.status(400).json({ message: 'Bill number is required' });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ message: 'At least one line item is required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [headers] = await conn.query('SELECT * FROM grn WHERE id = ? FOR UPDATE', [id]);
    if (!headers.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'GRN not found' });
    }
    const existingLines = await getGrnLinesForUpdate(conn, id);
    assertGrnEditable(existingLines);
    if (existingLines.length) {
      await reverseGrnInventory(conn, existingLines);
    }
    const { subtotal, taxTotal } = await applyGrnLines(conn, id, lines);
    const disc = Math.max(0, Number(discount) || 0);
    const netTotal = roundMoney(Math.max(0, subtotal + taxTotal - disc));
    await conn.query(
      `UPDATE grn
       SET supplier_id = ?, bill_number = ?, bill_date = ?, notes = ?, discount = ?, tax_amount = ?, net_total_amount = ?, total_amount = ?, payment_mode = ?, payment_note = ?
       WHERE id = ?`,
      [supplier_id || null, bill_number.trim(), bill_date || null, notes || null, disc, taxTotal, netTotal, netTotal, payment_mode || null, payment_note || null, id]
    );
    const [out] = await conn.query('SELECT * FROM grn WHERE id = ?', [id]);
    await conn.commit();
    res.json(out[0]);
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    if (err?.statusCode) return res.status(err.statusCode).json({ message: err.message });
    throw err;
  } finally {
    conn.release();
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [headers] = await conn.query('SELECT id FROM grn WHERE id = ? FOR UPDATE', [id]);
    if (!headers.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'GRN not found' });
    }
    const existingLines = await getGrnLinesForUpdate(conn, id);
    assertGrnEditable(existingLines);
    if (existingLines.length) {
      await reverseGrnInventory(conn, existingLines);
    }
    await conn.query('DELETE FROM grn WHERE id = ?', [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    if (err?.statusCode) return res.status(err.statusCode).json({ message: err.message });
    throw err;
  } finally {
    conn.release();
  }
});

export default router;
