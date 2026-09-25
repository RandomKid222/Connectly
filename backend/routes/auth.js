const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { RESET_LINK_MINUTES, emailConfigured, sendPasswordResetEmail } = require('../email');

const router = express.Router();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many unsuccessful login attempts. Try again in 15 minutes.' },
  standardHeaders: 'draft-7', legacyHeaders: false });
const signupLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5,
  message: { error: 'Too many signup attempts. Try again in an hour.' },
  standardHeaders: 'draft-7', legacyHeaders: false });
const passwordResetRequestLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  message: { error: 'Too many password reset requests. Try again in 15 minutes.' },
  standardHeaders: 'draft-7', legacyHeaders: false });
const passwordResetSubmitLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  message: { error: 'Too many password reset attempts. Try again in 15 minutes.' },
  standardHeaders: 'draft-7', legacyHeaders: false });
function publicUser(u) {
  const { password_hash, avatar_public_id, token_version, ...rest } = u;
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
  const token = jwt.sign({ userId: user.id, tokenVersion: Number(user.token_version) }, JWT_SECRET, { expiresIn: '7d' });
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
  const token = jwt.sign({ userId: user.id, tokenVersion: Number(user.token_version) }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: publicUser(user) });
});

router.post('/forgot-password', passwordResetRequestLimit, async (req, res) => {
  const email = req.body?.email;
  if (typeof email !== 'string' || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (!emailConfigured()) {
    return res.status(503).json({ error: 'Password reset is temporarily unavailable' });
  }

  const message = 'If an account exists for that email, a reset link will arrive shortly.';
  const user = await db.get('SELECT id, email FROM users WHERE email = ?', email.trim().toLowerCase());
  if (user) {
    const last = await db.get('SELECT created_at FROM password_reset_tokens WHERE user_id = ?', user.id);
    if (!last || Date.now() - Number(last.created_at) >= 2 * 60 * 1000) {
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      await db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', user.id);
      await db.run('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
        hash, user.id, Date.now() + RESET_LINK_MINUTES * 60 * 1000, Date.now());
      try {
        await sendPasswordResetEmail(user.email, token);
      } catch (err) {
        await db.run('DELETE FROM password_reset_tokens WHERE token_hash = ?', hash);
        console.error('Password reset email failed:', err.message);
      }
    }
  }
  res.json({ message });
});

router.post('/reset-password', passwordResetSubmitLimit, async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: 'Use a password between 12 and 128 characters' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  // Verify before the expensive password hash; consume and change the password in a transaction.
  const valid = await db.get('SELECT 1 FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?',
    tokenHash, Date.now());
  if (!valid) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await db.resetPassword(tokenHash, passwordHash, Date.now());
  if (!updated) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
  }
  res.json({ message: 'Password updated. Log in with your new password.' });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});
module.exports = router;
