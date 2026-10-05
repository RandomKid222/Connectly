const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, saveImage, deleteImage } = require('../media');
const { canViewProfile, canMessage } = require('../access');
const { notify } = require('../notifications');
const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

async function accountResponse(id) {
  const user = await db.get('SELECT * FROM users WHERE id = ?', id);
  const { password_hash, avatar_public_id, token_version, ...safe } = user;
  return safe;
}
router.get('/:username', async (req, res) => {
  const owner = await db.get('SELECT * FROM users WHERE username = ?', req.params.username);
  if (!owner) return res.status(404).json({ error: 'User not found' });
  const canViewPosts = await canViewProfile(owner, req.userId);
  const isFollowing = !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', req.userId, owner.id));
  const followRequested = !!(await db.get('SELECT 1 FROM follow_requests WHERE follower_id = ? AND following_id = ?', req.userId, owner.id));
  const counts = canViewPosts ? {
    followerCount: Number((await db.get('SELECT COUNT(*) c FROM follows WHERE following_id = ?', owner.id)).c),
    followingCount: Number((await db.get('SELECT COUNT(*) c FROM follows WHERE follower_id = ?', owner.id)).c),
    postCount: Number((await db.get('SELECT COUNT(*) c FROM posts WHERE user_id = ?', owner.id)).c)
  } : { followerCount: null, followingCount: null, postCount: null };
  res.json({ user: {
    id: owner.id, username: owner.username, avatar_url: owner.avatar_url, created_at: owner.created_at,
    bio: canViewPosts ? owner.bio : '', profile_visibility: owner.profile_visibility,
    share_follow_lists: !!owner.share_follow_lists, canViewPosts, canMessage: await canMessage(owner, req.userId),
    isFollowing, followRequested, isSelf: owner.id === req.userId, ...counts
  } });
});
router.put('/me/update', async (req, res) => {
  const { bio, avatar_url } = req.body || {};
  if (avatar_url !== undefined) return res.status(400).json({ error: 'Use the profile photo upload to change your picture' });
  if (bio !== undefined && (typeof bio !== 'string' || bio.length > 5000)) {
    return res.status(400).json({ error: 'Bio must be at most 5000 characters' });
  }
  await db.run('UPDATE users SET bio = COALESCE(?, bio) WHERE id = ?', bio ?? null, req.userId);
  res.json({ user: await accountResponse(req.userId) });
});
router.post('/me/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, or WebP image' });
  const previous = await db.get('SELECT avatar_url, avatar_public_id FROM users WHERE id = ?', req.userId);
  const image = await saveImage(req.file.buffer, { maxDimension: 512, folder: 'connectly/avatars' });
  try {
    await db.run('UPDATE users SET avatar_url = ?, avatar_public_id = ? WHERE id = ?', image.url, image.publicId, req.userId);
  } catch (error) {
    await deleteImage(image.url, image.publicId).catch(console.error);
    throw error;
  }
  if (previous.avatar_url) await deleteImage(previous.avatar_url, previous.avatar_public_id).catch(console.error);
  res.json({ user: await accountResponse(req.userId) });
});
router.delete('/me/avatar', async (req, res) => {
  const previous = await db.get('SELECT avatar_url, avatar_public_id FROM users WHERE id = ?', req.userId);
  await db.run("UPDATE users SET avatar_url = '', avatar_public_id = '' WHERE id = ?", req.userId);
  if (previous.avatar_url) await deleteImage(previous.avatar_url, previous.avatar_public_id).catch(console.error);
  res.json({ user: await accountResponse(req.userId) });
});
router.post('/:id/follow', async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Invalid user' });
  if (targetId === req.userId) return res.status(400).json({ error: "You can't follow yourself" });
  const owner = await db.get('SELECT * FROM users WHERE id = ?', targetId);
  if (!owner) return res.status(404).json({ error: 'User not found' });
  if (await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', req.userId, targetId)) {
    return res.json({ following: true, requested: false });
  }
  if (owner.profile_visibility === 'private') {
    const requested = await db.run('INSERT OR IGNORE INTO follow_requests (follower_id, following_id) VALUES (?, ?)', req.userId, targetId);
    if (requested.changes) {
      await db.run("DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND kind = 'follow_request'", targetId, req.userId);
      await notify({ userId: targetId, actorId: req.userId, kind: 'follow_request' });
    }
    return res.json({ following: false, requested: true });
  }
  await db.run('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', req.userId, targetId);
  await notify({ userId: targetId, actorId: req.userId, kind: 'follow' });
  res.json({ following: true, requested: false });
});
router.delete('/:id/follow', async (req, res) => {
  await db.batch([
    { sql: 'DELETE FROM follows WHERE follower_id = ? AND following_id = ?', args: [req.userId, req.params.id] },
    { sql: 'DELETE FROM follow_requests WHERE follower_id = ? AND following_id = ?', args: [req.userId, req.params.id] },
    { sql: "DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND kind IN ('follow', 'follow_request')", args: [req.params.id, req.userId] }
  ]);
  res.json({ following: false, requested: false });
});
router.post('/:id/follow-request', async (req, res) => {
  const requester = Number(req.params.id);
  const decision = req.body?.decision;
  if (!Number.isSafeInteger(requester) || requester <= 0 || !['accept', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid follow request' });
  }
  if (!(await db.get('SELECT 1 FROM follow_requests WHERE follower_id = ? AND following_id = ?', requester, req.userId))) {
    return res.status(404).json({ error: 'This follow request is no longer pending' });
  }
  if (decision === 'accept') {
    await db.batch([
      { sql: 'INSERT OR IGNORE INTO follows (follower_id, following_id) SELECT follower_id, following_id FROM follow_requests WHERE follower_id = ? AND following_id = ?', args: [requester, req.userId] },
      { sql: 'DELETE FROM follow_requests WHERE follower_id = ? AND following_id = ?', args: [requester, req.userId] }
    ]);
  } else {
    await db.run('DELETE FROM follow_requests WHERE follower_id = ? AND following_id = ?', requester, req.userId);
  }
  await db.run("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND actor_id = ? AND kind = 'follow_request'", req.userId, requester);
  res.json({ ok: true });
});
async function followList(req, res, direction) {
  const owner = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!owner) return res.status(404).json({ error: 'User not found' });
  if (!(await canViewProfile(owner, req.userId)) || (!owner.share_follow_lists && owner.id !== req.userId)) {
    return res.status(403).json({ error: 'This member keeps their follow lists private' });
  }
  const target = direction === 'followers' ? 'follower_id' : 'following_id';
  const filter = direction === 'followers' ? 'following_id' : 'follower_id';
  const rows = await db.all('SELECT u.id, u.username, u.avatar_url FROM follows f JOIN users u ON u.id = f.' +
    target + ' WHERE f.' + filter + ' = ? ORDER BY u.username LIMIT 100', owner.id);
  res.json({ [direction]: rows });
}
router.get('/:id/followers', (req, res) => followList(req, res, 'followers'));
router.get('/:id/following', (req, res) => followList(req, res, 'following'));
router.get('/', async (req, res) => {
  const term = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : '';
  if (!term) return res.json({ users: [] });
  const escaped = term.replace(/[!%_]/g, char => '!' + char);
  const users = await db.all("SELECT id, username, avatar_url FROM users WHERE id <> ? AND searchable = 1 " +
    "AND username LIKE ? ESCAPE '!' ORDER BY username COLLATE NOCASE LIMIT 8", req.userId, '%' + escaped + '%');
  res.json({ users });
});
module.exports = router;
