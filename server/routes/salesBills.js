import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

// List sales bills
router.get('/', requireAuth, async (req, res) => {
  const { limit } = req.query;
  let sql = `
    SELECT b.*, COALESCE(b.generated_by_name, u.full_name, u.name) AS generated_by_name
    FROM sales_bills b
    LEFT JOIN users u ON u.id = b.generated_by
    ORDER BY b.created_date DESC
  `;
  if (limit) sql += ` LIMIT ${Number(limit)}`;
  const [rows] = await pool.query(sql);
  res.json(rows);
});

// Get sales bill with lines
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [headers] = await pool.query(
    `SELECT b.*, COALESCE(b.generated_by_name, u.full_name, u.name) AS generated_by_name
     FROM sales_bills b
     LEFT JOIN users u ON u.id = b.generated_by
     WHERE b.id = ?`,
    [id]
  );
  if (!headers.length) return res.status(404).json({ message: 'Sales bill not found' });
  const [lines] = await pool.query(
    `SELECT
        l.*,
        l.grn_line_id AS batch_id,
        gl.medicine_id,
        CASE
          WHEN l.item_type = 'medicine' THEN m.name
          ELSE l.item_name
        END AS item_name,
        gl.batch_number,
        gl.expiry_date,
        gl.quantity_remaining AS quantity_remaining_now,
        COALESCE(gl.tax_percent, 0) AS tax_percent,
        ROUND(l.line_subtotal * (COALESCE(gl.tax_percent, 0) / 100), 2) AS line_tax
     FROM sales_bill_lines l
     LEFT JOIN grn_lines gl ON gl.id = l.grn_line_id
     LEFT JOIN medicines m ON m.id = gl.medicine_id
     WHERE l.bill_id = ?
     ORDER BY l.created_date ASC`,
    [id]
  );
  res.json({ ...headers[0], lines });
});

// List flattened bill lines with bill header context
router.get('/lines/all', requireAuth, async (req, res) => {
  const { limit } = req.query;
  let sql = `
    SELECT
      l.*,
      l.grn_line_id AS batch_id,
      gl.medicine_id,
      CASE
        WHEN l.item_type = 'medicine' THEN m.name
        ELSE l.item_name
      END AS item_name,
      gl.batch_number,
      gl.expiry_date,
      COALESCE(gl.tax_percent, 0) AS tax_percent,
      ROUND(l.line_subtotal * (COALESCE(gl.tax_percent, 0) / 100), 2) AS line_tax,
      b.created_date AS bill_created_date
    FROM sales_bill_lines l
    JOIN sales_bills b ON b.id = l.bill_id
    LEFT JOIN grn_lines gl ON gl.id = l.grn_line_id
    LEFT JOIN medicines m ON m.id = gl.medicine_id
    ORDER BY b.created_date DESC, l.created_date DESC
  `;
  if (limit) sql += ` LIMIT ${Number(limit)}`;
  const [rows] = await pool.query(sql);
  res.json(rows);
});

async function recomputeMedicineStock(conn, medicineId) {
  const [[row]] = await conn.query(
    'SELECT COALESCE(SUM(quantity_remaining), 0) AS remaining FROM grn_lines WHERE medicine_id = ? FOR UPDATE',
    [medicineId]
  );
  const remaining = Number(row?.remaining || 0);
  await conn.query('UPDATE medicines SET stock = ? WHERE id = ?', [Math.max(0, remaining), medicineId]);
  return remaining;
}

async function restoreBillInventory(conn, billId) {
  const [lines] = await conn.query(
    'SELECT * FROM sales_bill_lines WHERE bill_id = ? ORDER BY created_date ASC FOR UPDATE',
    [billId]
  );
  const medicineIds = new Set();
  for (const L of lines) {
    if (L.item_type !== 'medicine') continue;
    if (!L.grn_line_id) continue;
    const [[gl]] = await conn.query('SELECT medicine_id FROM grn_lines WHERE id = ? FOR UPDATE', [L.grn_line_id]);
    const medicineId = gl?.medicine_id || null;
    if (!medicineId) continue;
    medicineIds.add(medicineId);
    const qty = Math.max(0, Number(L.quantity) || 0);
    if (!qty) continue;
    if (L.grn_line_id) {
      await conn.query(
        'UPDATE grn_lines SET quantity_remaining = LEAST(quantity, quantity_remaining + ?) WHERE id = ?',
        [qty, L.grn_line_id]
      );
    }
  }
  for (const mid of medicineIds) {
    await recomputeMedicineStock(conn, mid);
  }
}

// Create sales bill with lines, decrementing batch and medicine stock
router.post('/', requireAuth, async (req, res) => {
  const {
    doctor_name,
    doctor_id,
    patient_name,
    patient_id,
    prescription_id,
    notes,
    payment_mode,
    payment_amount,
    discount_total,
    lines,
  } = req.body || {};

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ message: 'At least one line item is required' });
  }
  if (!patient_id && !patient_name) {
    return res.status(400).json({ message: 'Patient is required' });
  }

  const billId = uuidv4();
  const userId = req.user?.id || null;
  let subtotal = 0, taxTotal = 0, grossTotal = 0, netTotal = 0;
  const billDiscount = Math.max(0, Number(discount_total) || 0);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let generatedByName = null;
    if (userId) {
      const [[u]] = await conn.query('SELECT full_name, name FROM users WHERE id = ? LIMIT 1', [userId]);
      generatedByName = u?.full_name || u?.name || null;
    }

    await conn.query(
      `INSERT INTO sales_bills (
        id, doctor_name, doctor_id, patient_name, patient_id, prescription_id, notes, payment_mode, payment_amount,
        subtotal, tax_total, discount_total, gross_total, net_total, generated_by, generated_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?)`,
      [
        billId,
        doctor_name || null,
        doctor_id || null,
        patient_name || null,
        patient_id || null,
        prescription_id || null,
        notes || null,
        payment_mode || null,
        Number(payment_amount) || 0,
        userId,
        generatedByName,
      ]
    );

    for (const L of lines) {
      const {
        item_type = 'medicine',
        item_name,
        medicine_id,
        batch_id,
        quantity,
        sale_price,
      } = L || {};

      const qty = Math.max(1, Number(quantity) || 0);
      const sp = Number(sale_price) || 0;
      let tax = 0;
      const disc = 0;
      const lineSub = roundMoney(qty * sp);
      let lineTax = 0;
      const lineGross = roundMoney(lineSub + lineTax);
      const lineTotal = roundMoney(lineGross);

      let batchRow = null;
      const itemNameToStore = item_type === 'service' ? (item_name || null) : null;
      let selectedBatchId = batch_id || null;

      if (item_type === 'medicine') {
        if (!medicine_id) {
          await conn.rollback();
          return res.status(400).json({ message: 'Each medicine line requires medicine_id' });
        }

        if (selectedBatchId) {
          const [brows] = await conn.query('SELECT * FROM grn_lines WHERE id = ? FOR UPDATE', [selectedBatchId]);
          if (!brows.length) {
            await conn.rollback();
            return res.status(404).json({ message: `Batch not found: ${selectedBatchId}` });
          }
          batchRow = brows[0];
          if (String(batchRow.medicine_id) !== String(medicine_id)) {
            await conn.rollback();
            return res.status(400).json({ message: 'Selected batch does not belong to the selected medicine' });
          }
          if (Number(batchRow.quantity_remaining || 0) < qty) {
            await conn.rollback();
            return res.status(400).json({ message: `Batch ${batchRow.batch_number} has only ${batchRow.quantity_remaining} remaining` });
          }
        } else {
          const [brows] = await conn.query(
            `SELECT *
             FROM grn_lines
             WHERE medicine_id = ? AND quantity_remaining >= ?
             ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, created_date ASC
             LIMIT 1
             FOR UPDATE`,
            [medicine_id, qty]
          );
          if (brows.length) {
            batchRow = brows[0];
            selectedBatchId = batchRow.id;
          }
        }
        if (!batchRow || !selectedBatchId) {
          await conn.rollback();
          return res.status(400).json({ message: 'No available batch for this medicine' });
        }

        const [mrows] = await conn.query('SELECT name FROM medicines WHERE id = ? FOR UPDATE', [medicine_id]);
        if (!mrows.length) {
          await conn.rollback();
          return res.status(404).json({ message: `Medicine not found: ${medicine_id}` });
        }
        // item_name will be derived from medicines via grn_line_id at read time

        tax = Number(batchRow?.tax_percent || 0);
        lineTax = roundMoney(lineSub * (tax / 100));
        const [[rem]] = await conn.query(
          'SELECT COALESCE(SUM(quantity_remaining), 0) AS remaining FROM grn_lines WHERE medicine_id = ? FOR UPDATE',
          [medicine_id]
        );
        const remainingBefore = Number(rem?.remaining || 0);
        if (remainingBefore < qty) {
          await conn.rollback();
          return res.status(400).json({ message: `Insufficient medicine stock (remaining: ${remainingBefore})` });
        }

        if (batchRow && selectedBatchId) {
          await conn.query('UPDATE grn_lines SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [qty, selectedBatchId]);
        }
        await conn.query('UPDATE medicines SET stock = ? WHERE id = ?', [Math.max(0, remainingBefore - qty), medicine_id]);
      }
      if (item_type !== 'medicine') {
        tax = 0;
        lineTax = 0;
      }

      subtotal += lineSub;
      taxTotal += lineTax;
      grossTotal += lineGross;
      netTotal += lineTotal;

      const lineId = uuidv4();
      await conn.query(
        `INSERT INTO sales_bill_lines (
          id, bill_id, item_type, item_name, grn_line_id, sale_price, quantity,
          line_subtotal, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId,
          billId,
          item_type,
          itemNameToStore,
          selectedBatchId || null,
          sp,
          qty,
          lineSub,
          lineTotal,
        ]
      );
    }

    subtotal = roundMoney(subtotal);
    taxTotal = roundMoney(taxTotal);
    grossTotal = roundMoney(grossTotal);
    const discountTotal = roundMoney(billDiscount);
    netTotal = roundMoney(Math.max(0, grossTotal - billDiscount));

    await conn.query(
      'UPDATE sales_bills SET subtotal = ?, tax_total = ?, discount_total = ?, gross_total = ?, net_total = ? WHERE id = ?',
      [subtotal, taxTotal, discountTotal, grossTotal, netTotal, billId]
    );

    const [out] = await conn.query(
      `SELECT b.*, COALESCE(b.generated_by_name, u.full_name, u.name) AS generated_by_name
       FROM sales_bills b
       LEFT JOIN users u ON u.id = b.generated_by
       WHERE b.id = ?`,
      [billId]
    );
    await conn.commit();
    res.status(201).json(out[0]);
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    doctor_name,
    doctor_id,
    patient_name,
    patient_id,
    prescription_id,
    notes,
    payment_mode,
    payment_amount,
    discount_total,
    lines,
  } = req.body || {};

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ message: 'At least one line item is required' });
  }
  if (!patient_id && !patient_name) {
    return res.status(400).json({ message: 'Patient is required' });
  }

  const userId = req.user?.id || null;
  const billDiscount = Math.max(0, Number(discount_total) || 0);
  let subtotal = 0, taxTotal = 0, grossTotal = 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT * FROM sales_bills WHERE id = ? FOR UPDATE', [id]);
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: 'Sales bill not found' });
    }

    await restoreBillInventory(conn, id);
    await conn.query('DELETE FROM sales_bill_lines WHERE bill_id = ?', [id]);

    let generatedByName = null;
    if (userId) {
      const [[u]] = await conn.query('SELECT full_name, name FROM users WHERE id = ? LIMIT 1', [userId]);
      generatedByName = u?.full_name || u?.name || null;
    }

    for (const L of lines) {
      const {
        item_type = 'medicine',
        item_name,
        medicine_id,
        batch_id,
        quantity,
        sale_price,
      } = L || {};

      const qty = Math.max(1, Number(quantity) || 0);
      const sp = Number(sale_price) || 0;
      let tax = 0;
      const lineSub = roundMoney(qty * sp);
      let lineTax = 0;
      const lineGross = roundMoney(lineSub + lineTax);

      let batchRow = null;
      const itemNameToStore = item_type === 'service' ? (item_name || null) : null;
      let selectedBatchId = batch_id || null;

      if (item_type === 'medicine') {
        if (!medicine_id) {
          await conn.rollback();
          return res.status(400).json({ message: 'Each medicine line requires medicine_id' });
        }

        if (selectedBatchId) {
          const [brows] = await conn.query('SELECT * FROM grn_lines WHERE id = ? FOR UPDATE', [selectedBatchId]);
          if (!brows.length) {
            await conn.rollback();
            return res.status(404).json({ message: `Batch not found: ${selectedBatchId}` });
          }
          batchRow = brows[0];
          if (String(batchRow.medicine_id) !== String(medicine_id)) {
            await conn.rollback();
            return res.status(400).json({ message: 'Selected batch does not belong to the selected medicine' });
          }
          if (Number(batchRow.quantity_remaining || 0) < qty) {
            await conn.rollback();
            return res.status(400).json({ message: `Batch ${batchRow.batch_number} has only ${batchRow.quantity_remaining} remaining` });
          }
        } else {
          const [brows] = await conn.query(
            `SELECT *
             FROM grn_lines
             WHERE medicine_id = ? AND quantity_remaining >= ?
             ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, created_date ASC
             LIMIT 1
             FOR UPDATE`,
            [medicine_id, qty]
          );
          if (brows.length) {
            batchRow = brows[0];
            selectedBatchId = batchRow.id;
          }
        }
        if (!batchRow || !selectedBatchId) {
          await conn.rollback();
          return res.status(400).json({ message: 'No available batch for this medicine' });
        }

        const [mrows] = await conn.query('SELECT name FROM medicines WHERE id = ? FOR UPDATE', [medicine_id]);
        if (!mrows.length) {
          await conn.rollback();
          return res.status(404).json({ message: `Medicine not found: ${medicine_id}` });
        }
        // item_name will be derived from medicines via grn_line_id at read time

        tax = Number(batchRow?.tax_percent || 0);
        lineTax = roundMoney(lineSub * (tax / 100));
        const remainingBefore = await recomputeMedicineStock(conn, medicine_id);
        if (remainingBefore < qty) {
          await conn.rollback();
          return res.status(400).json({ message: `Insufficient medicine stock (remaining: ${remainingBefore})` });
        }

        await conn.query('UPDATE grn_lines SET quantity_remaining = quantity_remaining - ? WHERE id = ?', [qty, selectedBatchId]);
        await conn.query('UPDATE medicines SET stock = ? WHERE id = ?', [Math.max(0, remainingBefore - qty), medicine_id]);
      }
      if (item_type !== 'medicine') {
        tax = 0;
        lineTax = 0;
      }

      subtotal += lineSub;
      taxTotal += lineTax;
      grossTotal += lineGross;

      const lineId = uuidv4();
      await conn.query(
        `INSERT INTO sales_bill_lines (
          id, bill_id, item_type, item_name, grn_line_id, sale_price, quantity,
          line_subtotal, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId,
          id,
          item_type,
          itemNameToStore,
          selectedBatchId || null,
          sp,
          qty,
          lineSub,
          lineGross,
        ]
      );
    }

    subtotal = roundMoney(subtotal);
    taxTotal = roundMoney(taxTotal);
    grossTotal = roundMoney(grossTotal);
    const discountFinal = roundMoney(billDiscount);
    const netTotal = roundMoney(Math.max(0, grossTotal - billDiscount));

    await conn.query(
      `UPDATE sales_bills
       SET doctor_name = ?, doctor_id = ?, patient_name = ?, patient_id = ?, prescription_id = ?,
           notes = ?, payment_mode = ?, payment_amount = ?, discount_total = ?, subtotal = ?, tax_total = ?, gross_total = ?, net_total = ?,
           generated_by = ?, generated_by_name = ?
       WHERE id = ?`,
      [
        doctor_name || null,
        doctor_id || null,
        patient_name || null,
        patient_id || null,
        prescription_id || null,
        notes || null,
        payment_mode || null,
        Number(payment_amount) || 0,
        discountFinal,
        subtotal,
        taxTotal,
        grossTotal,
        netTotal,
        userId,
        generatedByName,
        id,
      ]
    );

    const [out] = await conn.query(
      `SELECT b.*, COALESCE(b.generated_by_name, u.full_name, u.name) AS generated_by_name
       FROM sales_bills b
       LEFT JOIN users u ON u.id = b.generated_by
       WHERE b.id = ?`,
      [id]
    );
    await conn.commit();
    res.json(out[0] || null);
  } catch (err) {
    try { await conn.rollback(); } catch {}
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
    const [[existing]] = await conn.query('SELECT id FROM sales_bills WHERE id = ? FOR UPDATE', [id]);
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: 'Sales bill not found' });
    }

    await restoreBillInventory(conn, id);
    await conn.query('DELETE FROM sales_bill_lines WHERE bill_id = ?', [id]);
    await conn.query('DELETE FROM sales_bills WHERE id = ?', [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
});

export default router;
