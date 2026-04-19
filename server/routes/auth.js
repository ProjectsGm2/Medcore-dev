import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import dotenv from 'dotenv';

dotenv.config();
const { JWT_SECRET = 'change-me', JWT_EXPIRES_IN = '7d' } = process.env;

const router = express.Router();

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

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const [rows] = await pool.query('SELECT id, name, email, password_hash, role FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const normalizedRole = normalizeUserRole(user.role);
  const token = jwt.sign({ id: user.id, email: user.email, role: normalizedRole }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: normalizedRole } });
});

// Register a new user (public)
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'doctor' } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exists.length) {
    return res.status(409).json({ message: 'User already exists' });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const id = uuidv4();
  const normalizedRole = normalizeUserRole(role);
  await pool.query('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [id, name, email, password_hash, normalizedRole]);

  const token = jwt.sign({ id, email, role: normalizedRole }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.status(201).json({ token, user: { id, name, email, role: normalizedRole } });
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ?', [payload.id]);
    if (!rows.length) return res.status(401).json({ message: 'User not found' });
    return res.json({ user: { ...rows[0], role: normalizeUserRole(rows[0].role) } });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

export default router;
