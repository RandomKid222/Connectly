const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { protectExistingImage, deleteImage } = require('../media');
const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const fields = ['profile_visibility', 'message_permission', 'searchable', 'show_in_explore', 'share_follow_lists', 'theme'];
function settingsOf(user) {
  return {
    profile_visibility: user.profile_visibility, message_permission: user.message_permission,
    searchable: !!user.searchable, show_in_explore: !!user.show_in_explore,
    share_follow_lists: !!user.share_follow_lists, theme: user.theme
  };
}
async function sessionResponse(userId) {
  const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
  const token = jwt.sign({ userId, tokenVersion: Number(user.token_version) }, JWT_SECRET, { expiresIn: '7d' });
  return { token };
}
router.get('/', async (req, res) => {
  res.json({ settings: settingsOf(await db.get('SELECT * FROM users WHERE id = ?', req.userId)) });
});
router.put('/', async (req, res) => {
  const body = req.body;
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key)) ||
      (body.profile_visibility !== undefined && !['public', 'private'].includes(body.profile_visibility)) ||
      (body.message_permission !== undefined && !['everyone', 'following', 'none'].includes(body.message_permission)) ||
      (body.theme !== undefined && !['light', 'dark', 'system'].includes(body.theme)) ||
      ['searchable', 'show_in_explore', 'share_follow_lists'].some(key => body[key] !== undefined && typeof body[key] !== 'boolean')) {
    return res.status(400).json({ error: 'Invalid settings' });
  }
  const current = await db.get('SELECT * FROM users WHERE id = ?', req.userId);
  if (body.profile_visibility === 'private' && current.profile_visibility !== 'private') {
    // Protect older photos before hiding the profile; partial conversions remain readable.
    const photos = await db.all("SELECT * FROM posts WHERE user_id = ? AND image_url <> '' AND image_private = 0", req.userId);
    for (const post of photos) {
      const image = await protectExistingImage(post.image_url, post.image_public_id);
      await db.run('UPDATE posts SET image_url = ?, image_public_id = ?, image_private = 1 WHERE id = ?',
        image.url, image.publicId, post.id);
      await deleteImage(post.image_url, post.image_public_id).catch(error => console.error('Old image cleanup failed:', error.message));
    }
  }
  const changes = fields.filter(key => body[key] !== undefined);
  if (changes.length) {
    await db.run('UPDATE users SET ' + changes.map(key => key + ' = ?').join(', ') + ' WHERE id = ?',
      ...changes.map(key => typeof body[key] === 'boolean' ? Number(body[key]) : body[key]), req.userId);
  }
  if (body.profile_visibility === 'public') {
    await db.batch([
      { sql: 'INSERT OR IGNORE INTO follows (follower_id, following_id) SELECT follower_id, following_id FROM follow_requests WHERE following_id = ?', args: [req.userId] },
      { sql: 'DELETE FROM follow_requests WHERE following_id = ?', args: [req.userId] }
    ]);
  }
  res.json({ settings: settingsOf(await db.get('SELECT * FROM users WHERE id = ?', req.userId)) });
});

const securityLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many security changes. Try again in 15 minutes.' } });
router.post('/password', securityLimit, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || currentPassword.length > 128 ||
      typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
    return res.status(400).json({ error: 'Enter your current password and a new password of 12–128 characters' });
  }
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.userId);
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    return res.status(400).json({ error: 'The current password is incorrect' });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  const result = await db.run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ? AND password_hash = ?',
    hash, req.userId, user.password_hash);
  if (!result.changes) return res.status(409).json({ error: 'Your password changed in another session. Log in again.' });
  res.json({ ...(await sessionResponse(req.userId)), message: 'Password changed. Other sessions have been signed out.' });
});
router.post('/sessions', securityLimit, async (req, res) => {
  await db.run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', req.userId);
  res.json({ ...(await sessionResponse(req.userId)), message: 'Other sessions have been signed out.' });
});
router.get('/export', async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.userId);
  const posts = await db.all('SELECT id, title, content, created_at FROM posts WHERE user_id = ? ORDER BY id', req.userId);
  const comments = await db.all('SELECT id, post_id, parent_id, content, created_at FROM comments WHERE user_id = ? ORDER BY id', req.userId);
  const messages = await db.all('SELECT id, sender_id, receiver_id, content, created_at, read_at, ' +
    "(image_url <> '') AS has_image FROM messages WHERE sender_id = ? OR receiver_id = ? ORDER BY id", req.userId, req.userId);
  const following = await db.all('SELECT following_id AS user_id, created_at FROM follows WHERE follower_id = ?', req.userId);
  const followers = await db.all('SELECT follower_id AS user_id, created_at FROM follows WHERE following_id = ?', req.userId);
  const bookmarks = await db.all('SELECT post_id, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at', req.userId);
  const pollVotes = await db.all('SELECT post_id, option_id, created_at FROM poll_votes WHERE user_id = ? ORDER BY post_id', req.userId);
  res.set('Content-Disposition', 'attachment; filename="connectly-data.json"');
  res.json({ exported_at: new Date().toISOString(), account: {
    id: user.id, username: user.username, email: user.email, bio: user.bio,
    created_at: user.created_at, settings: settingsOf(user)
  }, posts, comments, messages, following, followers, bookmarks, pollVotes });
});
module.exports = router;
