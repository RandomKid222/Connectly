const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
  standardHeaders: 'draft-7', legacyHeaders: false });
const signupLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5,
  standardHeaders: 'draft-7', legacyHeaders: false });
function publicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

router.post('/signup', signupLimit, async (req, res) => {
  const { username, email, password } = req.body || {};
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,30}$/.test(username) ||
      typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: 'Use a 3–30 character username, valid email, and a 12–128 character password' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', username, normalizedEmail);
  if (existing) return res.status(409).json({ error: 'Username or email already in use' });
  const password_hash = await bcrypt.hash(password, 12);
  let info;
  try {
    info = await db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      username, normalizedEmail, password_hash);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Username or email already in use' });
    throw err;
  }
  const user = await db.get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', loginLimit, async (req, res) => {
  const { emailOrUsername, password } = req.body || {};
  if (typeof emailOrUsername !== 'string' || emailOrUsername.length > 254 ||
      typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  const user = await db.get('SELECT * FROM users WHERE email = ? OR username = ?', emailOrUsername.trim().toLowerCase(), emailOrUsername);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});
module.exports = router;
