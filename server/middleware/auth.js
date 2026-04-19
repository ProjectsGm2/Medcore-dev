import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { pool } from '../db.js';

dotenv.config();
const { JWT_SECRET = 'change-me' } = process.env;

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

export async function getCurrentUser() {
  if (!this.user?.id) return null;
  const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ?', [this.user.id]);
  return rows[0] || null;
}
