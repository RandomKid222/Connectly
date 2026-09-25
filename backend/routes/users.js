const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

router.get('/:username', async (req, res) => {
  const user = await db.get('SELECT id, username, bio, avatar_url, created_at FROM users WHERE username = ?', req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const followerCount = (await db.get('SELECT COUNT(*) c FROM follows WHERE following_id = ?', user.id)).c;
  const followingCount = (await db.get('SELECT COUNT(*) c FROM follows WHERE follower_id = ?', user.id)).c;
  const postCount = (await db.get('SELECT COUNT(*) c FROM posts WHERE user_id = ?', user.id)).c;
  const isFollowing = !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', req.userId, user.id));
  res.json({ user: { ...user, followerCount, followingCount, postCount,
    isFollowing, isSelf: user.id === req.userId } });
});
router.put('/me/update', async (req, res) => {
  const { bio, avatar_url } = req.body || {};
  if ((bio !== undefined && (typeof bio !== 'string' || bio.length > 5000)) ||
      (avatar_url !== undefined && (typeof avatar_url !== 'string' ||
        avatar_url.length > 2048 || (avatar_url && !/^https:\/\//i.test(avatar_url))))) {
    return res.status(400).json({ error: 'Bio must be at most 5000 characters; avatar must be an HTTPS URL' });
  }
  await db.run('UPDATE users SET bio = COALESCE(?, bio), avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
    bio ?? null, avatar_url ?? null, req.userId);
  const user = await db.get('SELECT id, username, email, bio, avatar_url, created_at FROM users WHERE id = ?', req.userId);
  res.json({ user });
});
router.post('/:id/follow', async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Invalid user' });
  if (targetId === req.userId) return res.status(400).json({ error: "You can't follow yourself" });
  if (!(await db.get('SELECT id FROM users WHERE id = ?', targetId))) return res.status(404).json({ error: 'User not found' });
  await db.run('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', req.userId, targetId);
  res.json({ following: true });
});
router.delete('/:id/follow', async (req, res) => {
  await db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', req.userId, req.params.id);
  res.json({ following: false });
});
router.get('/:id/followers', async (req, res) => {
  const followers = await db.all(`SELECT u.id, u.username, u.avatar_url FROM follows f
    JOIN users u ON u.id = f.follower_id WHERE f.following_id = ? LIMIT 100`, req.params.id);
  res.json({ followers });
});
router.get('/:id/following', async (req, res) => {
  const following = await db.all(`SELECT u.id, u.username, u.avatar_url FROM follows f
    JOIN users u ON u.id = f.following_id WHERE f.follower_id = ? LIMIT 100`, req.params.id);
  res.json({ following });
});
router.get('/', async (req, res) => {
  const term = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : '';
  if (!term) return res.json({ users: [] });
  const escaped = term.replace(/[!%_]/g, char => `!${char}`);
  const users = await db.all(`SELECT id, username, avatar_url, bio FROM users
    WHERE id <> ? AND username LIKE ? ESCAPE '!' ORDER BY username COLLATE NOCASE LIMIT 8`,
    req.userId, `%${escaped}%`);
  res.json({ users });
});
module.exports = router;
