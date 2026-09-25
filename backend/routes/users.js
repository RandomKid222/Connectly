const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, saveImage, deleteImage } = require('../media');
const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

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
  if (avatar_url !== undefined) {
    return res.status(400).json({ error: 'Use the profile photo upload to change your picture' });
  }
  if (bio !== undefined && (typeof bio !== 'string' || bio.length > 5000)) {
    return res.status(400).json({ error: 'Bio must be at most 5000 characters' });
  }
  await db.run('UPDATE users SET bio = COALESCE(?, bio) WHERE id = ?', bio ?? null, req.userId);
  const user = await db.get('SELECT id, username, email, bio, avatar_url, created_at FROM users WHERE id = ?', req.userId);
  res.json({ user });
});
router.post('/me/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, or WebP image' });
  const image = await saveImage(req.file.buffer, { maxDimension: 512, folder: 'connectly/avatars' });
  let previous;
  try {
    previous = await db.get('SELECT avatar_url, avatar_public_id FROM users WHERE id = ?', req.userId);
    if (!previous) {
      await deleteImage(image.url, image.publicId).catch(console.error);
      return res.status(404).json({ error: 'User not found' });
    }
    await db.run('UPDATE users SET avatar_url = ?, avatar_public_id = ? WHERE id = ?',
      image.url, image.publicId, req.userId);
  } catch (err) {
    await deleteImage(image.url, image.publicId).catch(console.error);
    throw err;
  }
  if (previous.avatar_url) {
    await deleteImage(previous.avatar_url, previous.avatar_public_id).catch(console.error);
  }
  const user = await db.get('SELECT id, username, email, bio, avatar_url, created_at FROM users WHERE id = ?', req.userId);
  res.json({ user });
});
router.delete('/me/avatar', async (req, res) => {
  const previous = await db.get('SELECT avatar_url, avatar_public_id FROM users WHERE id = ?', req.userId);
  if (!previous) return res.status(404).json({ error: 'User not found' });
  await db.run("UPDATE users SET avatar_url = '', avatar_public_id = '' WHERE id = ?", req.userId);
  if (previous.avatar_url) {
    await deleteImage(previous.avatar_url, previous.avatar_public_id).catch(console.error);
  }
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
