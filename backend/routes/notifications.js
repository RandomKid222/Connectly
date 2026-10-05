const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { visibleProfileSQL } = require('../access');
const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const visibleEvent = '(n.post_id IS NULL OR EXISTS (SELECT 1 FROM posts p JOIN users u ON u.id = p.user_id ' +
  'WHERE p.id = n.post_id AND ' + visibleProfileSQL + '))';
router.get('/', async (req, res) => {
  const notifications = await db.all('SELECT n.*, a.username, a.avatar_url, ' +
    "EXISTS(SELECT 1 FROM follow_requests f WHERE f.follower_id = n.actor_id AND f.following_id = n.user_id) AS pendingRequest " +
    'FROM notifications n JOIN users a ON a.id = n.actor_id WHERE n.user_id = ? AND ' + visibleEvent +
    ' ORDER BY n.id DESC LIMIT 30', req.userId, req.userId, req.userId);
  const count = await db.get('SELECT COUNT(*) AS count FROM notifications n WHERE n.user_id = ? ' +
    'AND n.read_at IS NULL AND ' + visibleEvent, req.userId, req.userId, req.userId);
  res.json({ notifications, unreadCount: Number(count.count) });
});
router.put('/read', async (req, res) => {
  const id = Number(req.body?.upToId);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid notification' });
  await db.run('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id <= ? AND read_at IS NULL', req.userId, id);
  res.json({ ok: true });
});
router.put('/:id/read', async (req, res) => {
  await db.run('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?', req.userId, req.params.id);
  res.json({ ok: true });
});
module.exports = router;
