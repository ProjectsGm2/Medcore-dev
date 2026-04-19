import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
let settingsStorageReady = false;

async function ensureSettingsStorage() {
  if (settingsStorageReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(100) PRIMARY KEY,
      \`value\` LONGTEXT,
      updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);
  await pool.query('ALTER TABLE settings MODIFY COLUMN `value` LONGTEXT');
  settingsStorageReady = true;
}

router.get('/public/branding', async (req, res) => {
  await ensureSettingsStorage();
  const [rows] = await pool.query(
    "SELECT `key`, `value` FROM settings WHERE `key` IN ('clinic_name', 'clinic_code', 'logo', 'small_logo')"
  );
  const branding = {
    clinic_name: '',
    clinic_code: '',
    logo: '',
    small_logo: '',
  };
  for (const row of rows) branding[row.key] = row.value;
  res.json(branding);
});

router.get('/', requireAuth, async (req, res) => {
  await ensureSettingsStorage();
  const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

router.get('/:key', requireAuth, async (req, res) => {
  await ensureSettingsStorage();
  const { key } = req.params;
  const [rows] = await pool.query('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  if (!rows.length) return res.status(404).json({ message: 'Setting not found' });
  res.json({ key, value: rows[0].value });
});

router.put('/:key', requireAuth, async (req, res) => {
  await ensureSettingsStorage();
  const { key } = req.params;
  const { value } = req.body || {};
  if (value == null) return res.status(400).json({ message: 'value is required' });
  await pool.query(
    'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    [key, String(value)]
  );
  res.json({ key, value: String(value) });
});

export default router;
