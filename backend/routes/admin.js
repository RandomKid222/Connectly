const express = require('express');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { deleteImage, readPrivateImage } = require('../media');
const router = express.Router();
router.use(requireAuth, requireAdmin);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const mutationLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many administrative changes. Try again shortly.' } });

function listQuery(req, res) {
  const pageValue = req.query.page ?? '1';
  const term = req.query.q ?? '';
  if (typeof pageValue !== 'string' || !/^[1-9][0-9]{0,4}$/.test(pageValue) ||
      typeof term !== 'string' || term.length > 100) {
    res.status(400).json({ error: 'Use a valid page and search of at most 100 characters' });
    return null;
  }
  return { page: Number(pageValue), search: '%' + term.trim().replace(/[!%_]/g, char => '!' + char) + '%', limit: 20 };
}
function validId(value) { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }

router.get('/users', async (req, res) => {
  const query = listQuery(req, res);
  if (!query) return;
  const where = "WHERE username LIKE ? ESCAPE '!'";
  const users = await db.all('SELECT id, username, avatar_url, is_verified, role, created_at FROM users ' +
    where + ' ORDER BY username COLLATE NOCASE LIMIT ? OFFSET ?', query.search, query.limit, (query.page - 1) * query.limit);
  const total = await db.get('SELECT COUNT(*) c FROM users ' + where, query.search);
  res.json({ users: users.map(user => ({ ...user, is_verified: !!user.is_verified })), total: Number(total.c), page: query.page, limit: query.limit });
});
router.put('/users/:id/verification', mutationLimit, async (req, res) => {
  const id = validId(req.params.id);
  const body = req.body;
  if (!id || !body || Array.isArray(body) || Object.keys(body).some(key => key !== 'verified') || typeof body.verified !== 'boolean') {
    return res.status(400).json({ error: 'Choose an account and a true or false verification value' });
  }
  const user = await db.get('SELECT id, username FROM users WHERE id = ?', id);
  if (!user) return res.status(404).json({ error: 'Account not found' });
  const verified = Number(body.verified);
  await db.batch([
    { sql: 'INSERT INTO admin_actions (actor_id, action, target_id, target_label, details) ' +
      "SELECT ?, 'verification', id, username, ? FROM users WHERE id = ? AND is_verified <> ?",
      args: [req.userId, body.verified ? 'Badge granted' : 'Badge removed', id, verified] },
    { sql: 'UPDATE users SET is_verified = ? WHERE id = ?', args: [verified, id] }
  ]);
  res.json({ user: { ...user, is_verified: body.verified } });
});
router.get('/threads', async (req, res) => {
  const query = listQuery(req, res);
  if (!query) return;
  const where = "WHERE p.title LIKE ? ESCAPE '!' OR p.content LIKE ? ESCAPE '!' OR u.username LIKE ? ESCAPE '!'";
  const terms = [query.search, query.search, query.search];
  const rows = await db.all('SELECT p.id, p.title, p.content, p.created_at, p.image_url, p.image_private, ' +
    'u.username, u.is_verified, u.profile_visibility FROM posts p JOIN users u ON u.id = p.user_id ' + where +
    ' ORDER BY p.id DESC LIMIT ? OFFSET ?', ...terms, query.limit, (query.page - 1) * query.limit);
  const total = await db.get('SELECT COUNT(*) c FROM posts p JOIN users u ON u.id = p.user_id ' + where, ...terms);
  const threads = rows.map(row => ({ ...row, content: (row.content || '').slice(0, 500),
    is_verified: !!row.is_verified, image_private: !!row.image_private,
    image_url: row.image_private && row.image_url ? '/admin/threads/' + row.id + '/image' : row.image_url }));
  res.json({ threads, total: Number(total.c), page: query.page, limit: query.limit });
});
router.get('/threads/:id/image', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid thread' });
  const post = await db.get('SELECT image_url, image_public_id, image_private FROM posts WHERE id = ?', id);
  if (!post?.image_url || !post.image_private) return res.status(404).json({ error: 'Image not found' });
  res.type('image/webp').send(await readPrivateImage(post.image_url, post.image_public_id));
});
router.delete('/threads/:id', mutationLimit, async (req, res) => {
  const id = validId(req.params.id);
  const body = req.body;
  if (!id || !body || Array.isArray(body) || Object.keys(body).some(key => key !== 'reason') ||
      typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 300) {
    return res.status(400).json({ error: 'Enter a removal reason of 1–300 characters' });
  }
  const post = await db.get('SELECT id, image_url, image_public_id, image_private FROM posts WHERE id = ?', id);
  if (!post) return res.status(404).json({ error: 'Thread not found' });
  const results = await db.batch([
    { sql: 'INSERT INTO admin_actions (actor_id, action, target_id, target_label, details) ' +
      "SELECT ?, 'remove_thread', id, CASE WHEN title <> '' THEN title ELSE 'Untitled thread' END, ? FROM posts WHERE id = ?",
      args: [req.userId, body.reason.trim(), id] },
    { sql: 'DELETE FROM posts WHERE id = ?', args: [id] }
  ]);
  if (!results[1].rowsAffected) return res.status(404).json({ error: 'Thread not found' });
  if (post.image_url) await deleteImage(post.image_url, post.image_public_id, { privateImage: !!post.image_private })
    .catch(error => console.error('Moderated thread image cleanup failed:', error.message));
  res.json({ deleted: true });
});
router.get('/comments', async (req, res) => {
  const query = listQuery(req, res);
  if (!query) return;
  const where = "WHERE c.content LIKE ? ESCAPE '!' OR u.username LIKE ? ESCAPE '!'";
  const terms = [query.search, query.search];
  const comments = await db.all('SELECT c.id, c.post_id, c.parent_id, c.content, c.created_at, u.username, u.is_verified ' +
    'FROM comments c JOIN users u ON u.id = c.user_id ' + where + ' ORDER BY c.id DESC LIMIT ? OFFSET ?',
    ...terms, query.limit, (query.page - 1) * query.limit);
  const total = await db.get('SELECT COUNT(*) c FROM comments c JOIN users u ON u.id = c.user_id ' + where, ...terms);
  res.json({ comments, total: Number(total.c), page: query.page, limit: query.limit });
});
router.delete('/comments/:id', mutationLimit, async (req, res) => {
  const id = validId(req.params.id);
  const body = req.body;
  if (!id || !body || Array.isArray(body) || Object.keys(body).some(key => key !== 'reason') ||
      typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 300) {
    return res.status(400).json({ error: 'Enter a removal reason of 1–300 characters' });
  }
  const results = await db.batch([
    { sql: 'INSERT INTO admin_actions (actor_id, action, target_id, target_label, details) ' +
      "SELECT ?, 'remove_comment', id, substr(content, 1, 80), ? FROM comments WHERE id = ?",
      args: [req.userId, body.reason.trim(), id] },
    { sql: 'DELETE FROM comments WHERE id = ?', args: [id] }
  ]);
  if (!results[1].rowsAffected) return res.status(404).json({ error: 'Comment not found' });
  res.json({ deleted: true });
});
router.get('/history', async (req, res) => {
  const query = listQuery(req, res);
  if (!query) return;
  const actions = await db.all('SELECT a.*, u.username AS actor_name FROM admin_actions a ' +
    'LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ? OFFSET ?', query.limit, (query.page - 1) * query.limit);
  const total = await db.get('SELECT COUNT(*) c FROM admin_actions');
  res.json({ actions, total: Number(total.c), page: query.page, limit: query.limit });
});
module.exports = router;
