const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/unread', async (req, res) => {
  const row = await db.get('SELECT COUNT(*) AS count FROM messages WHERE receiver_id = ? AND read_at IS NULL', req.userId);
  res.json({ unreadCount: Number(row.count) });
});
router.get('/conversations', async (req, res) => {
  const conversations = await db.all(`
    SELECT u.id, u.username, u.avatar_url,
      (SELECT content FROM messages m2
        WHERE (m2.sender_id = u.id AND m2.receiver_id = ?)
           OR (m2.sender_id = ? AND m2.receiver_id = u.id)
        ORDER BY m2.created_at DESC LIMIT 1) AS lastMessage,
      (SELECT created_at FROM messages m3
        WHERE (m3.sender_id = u.id AND m3.receiver_id = ?)
           OR (m3.sender_id = ? AND m3.receiver_id = u.id)
        ORDER BY m3.created_at DESC LIMIT 1) AS lastAt,
      (SELECT COUNT(*) FROM messages unread
        WHERE unread.sender_id = u.id AND unread.receiver_id = ?
          AND unread.read_at IS NULL) AS unreadCount
    FROM users u
    WHERE u.id IN (
      SELECT sender_id FROM messages WHERE receiver_id = ?
      UNION SELECT receiver_id FROM messages WHERE sender_id = ?
    ) ORDER BY lastAt DESC LIMIT 100`,
    req.userId, req.userId, req.userId, req.userId, req.userId,
    req.userId, req.userId);
  res.json({ conversations });
});
router.get('/:userId', async (req, res) => {
  const otherId = Number(req.params.userId);
  if (!Number.isSafeInteger(otherId) || otherId <= 0) return res.status(400).json({ error: 'Invalid user' });
  const otherUser = await db.get('SELECT id, username, avatar_url FROM users WHERE id = ?', otherId);
  if (!otherUser) return res.status(404).json({ error: 'User not found' });
  const messages = await db.all(`SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at DESC, id DESC LIMIT 100`, req.userId, otherId, otherId, req.userId);
  res.json({ otherUser, messages: messages.reverse() });
});
router.put('/:userId/read', async (req, res) => {
  const otherId = Number(req.params.userId);
  const upToId = Number(req.body?.upToId);
  if (!Number.isSafeInteger(otherId) || otherId <= 0 ||
      !Number.isSafeInteger(upToId) || upToId <= 0) {
    return res.status(400).json({ error: 'Invalid conversation or message' });
  }
  const result = await db.run(`UPDATE messages SET read_at = CURRENT_TIMESTAMP
    WHERE sender_id = ? AND receiver_id = ? AND id <= ? AND read_at IS NULL`,
    otherId, req.userId, upToId);
  res.json({ markedRead: result.changes });
});
router.post('/:userId', async (req, res) => {
  const otherId = Number(req.params.userId);
  const { content } = req.body || {};
  if (!Number.isSafeInteger(otherId) || otherId <= 0 ||
      typeof content !== 'string' || !content.trim() || content.length > 5000) {
    return res.status(400).json({ error: 'Message must be 1–5000 characters' });
  }
  if (!(await db.get('SELECT id FROM users WHERE id = ?', otherId))) return res.status(404).json({ error: 'User not found' });
  const info = await db.run('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
    req.userId, otherId, content.trim());
  const message = await db.get('SELECT * FROM messages WHERE id = ?', info.lastInsertRowid);
  res.status(201).json({ message });
});
module.exports = router;
