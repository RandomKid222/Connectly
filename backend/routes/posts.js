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

const postSelect = `SELECT p.*, u.username AS author_name, u.avatar_url AS author_avatar,
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likeCount,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentCount,
  EXISTS(SELECT 1 FROM likes mine WHERE mine.post_id = p.id AND mine.user_id = ?) AS likedByMe
  FROM posts p JOIN users u ON u.id = p.user_id`;
function publicPost(row) {
  const { image_public_id, author_name, author_avatar, ...post } = row;
  return { ...post, likedByMe: !!post.likedByMe,
    author: { id: post.user_id, username: author_name, avatar_url: author_avatar } };
}

router.get('/feed', async (req, res) => {
  const rows = await db.all(`${postSelect} WHERE p.user_id = ?
    OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
    ORDER BY p.created_at DESC, p.id DESC LIMIT 50`, req.userId, req.userId, req.userId);
  res.json({ posts: rows.map(publicPost) });
});
router.get('/explore', async (req, res) => {
  const rows = await db.all(`${postSelect} ORDER BY p.created_at DESC, p.id DESC LIMIT 50`, req.userId);
  res.json({ posts: rows.map(publicPost) });
});
router.get('/user/:userId', async (req, res) => {
  const rows = await db.all(`${postSelect} WHERE p.user_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT 50`, req.userId, req.params.userId);
  res.json({ posts: rows.map(publicPost) });
});
router.post('/', upload.single('image'), async (req, res) => {
  const { content } = req.body || {};
  if (content !== undefined && (typeof content !== 'string' || content.length > 5000)) {
    return res.status(400).json({ error: 'Post text must be at most 5000 characters' });
  }
  if (!content?.trim() && !req.file) return res.status(400).json({ error: 'Post needs text or an image' });
  const image = req.file ? await saveImage(req.file.buffer) : { url: '', publicId: '' };
  try {
    const info = await db.run('INSERT INTO posts (user_id, content, image_url, image_public_id) VALUES (?, ?, ?, ?)',
      req.userId, content?.trim() || '', image.url, image.publicId);
    const post = await db.get(`${postSelect} WHERE p.id = ?`, req.userId, info.lastInsertRowid);
    res.status(201).json({ post: publicPost(post) });
  } catch (err) {
    if (image.url) await deleteImage(image.url, image.publicId).catch(console.error);
    throw err;
  }
});
router.delete('/:id', async (req, res) => {
  const post = await db.get('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.userId) return res.status(403).json({ error: 'Not your post' });
  await db.run('DELETE FROM posts WHERE id = ?', req.params.id);
  if (post.image_url) await deleteImage(post.image_url, post.image_public_id).catch(console.error);
  res.json({ deleted: true });
});
router.post('/:id/like', async (req, res) => {
  if (!(await db.get('SELECT id FROM posts WHERE id = ?', req.params.id))) return res.status(404).json({ error: 'Post not found' });
  await db.run('INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)', req.params.id, req.userId);
  res.json({ liked: true });
});
router.delete('/:id/like', async (req, res) => {
  await db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', req.params.id, req.userId);
  res.json({ liked: false });
});
router.get('/:id/comments', async (req, res) => {
  const comments = await db.all(`SELECT c.*, u.username, u.avatar_url FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.post_id = ?
    ORDER BY c.created_at DESC, c.id DESC LIMIT 100`, req.params.id);
  res.json({ comments: comments.reverse() });
});
router.post('/:id/comments', async (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== 'string' || !content.trim() || content.length > 5000) {
    return res.status(400).json({ error: 'Comment must be 1–5000 characters' });
  }
  if (!(await db.get('SELECT id FROM posts WHERE id = ?', req.params.id))) return res.status(404).json({ error: 'Post not found' });
  const info = await db.run('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
    req.params.id, req.userId, content.trim());
  const comment = await db.get(`SELECT c.*, u.username, u.avatar_url FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.id = ?`, info.lastInsertRowid);
  res.status(201).json({ comment });
});
module.exports = router;
