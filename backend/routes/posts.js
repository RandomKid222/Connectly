const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, saveImage, deleteImage, readPrivateImage } = require('../media');
const { visibleProfileSQL, accessiblePost } = require('../access');
const { notify } = require('../notifications');
const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const postSelect = 'SELECT p.*, u.username AS author_name, u.avatar_url AS author_avatar, ' +
  '(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likeCount, ' +
  '(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentCount, ' +
  'EXISTS(SELECT 1 FROM likes mine WHERE mine.post_id = p.id AND mine.user_id = ?) AS likedByMe ' +
  'FROM posts p JOIN users u ON u.id = p.user_id';
function publicPost(row) {
  const { image_public_id, image_private, author_name, author_avatar, ...post } = row;
  return { ...post, image_url: image_private && post.image_url ? '/posts/' + post.id + '/image' : post.image_url,
    image_private: !!image_private, likedByMe: !!post.likedByMe,
    author: { id: post.user_id, username: author_name, avatar_url: author_avatar } };
}
async function getPost(id, viewerId) {
  const row = await db.get(postSelect + ' WHERE p.id = ? AND ' + visibleProfileSQL, viewerId, id, viewerId, viewerId);
  return row ? publicPost(row) : null;
}
router.get('/feed', async (req, res) => {
  const rows = await db.all(postSelect + ' WHERE ' + visibleProfileSQL +
    ' AND (p.user_id = ? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)) ' +
    'ORDER BY p.created_at DESC, p.id DESC LIMIT 50', req.userId, req.userId, req.userId, req.userId, req.userId);
  res.json({ posts: rows.map(publicPost) });
});
router.get('/explore', async (req, res) => {
  const rows = await db.all(postSelect + ' WHERE ' + visibleProfileSQL +
    ' AND (u.show_in_explore = 1 OR u.id = ?) ORDER BY p.created_at DESC, p.id DESC LIMIT 50',
    req.userId, req.userId, req.userId, req.userId);
  res.json({ posts: rows.map(publicPost) });
});
router.get('/user/:userId', async (req, res) => {
  const rows = await db.all(postSelect + ' WHERE p.user_id = ? AND ' + visibleProfileSQL +
    ' ORDER BY p.created_at DESC, p.id DESC LIMIT 50', req.userId, req.params.userId, req.userId, req.userId);
  res.json({ posts: rows.map(publicPost) });
});
router.post('/', upload.single('image'), async (req, res) => {
  const { content, title } = req.body || {};
  if ((content !== undefined && (typeof content !== 'string' || content.length > 5000)) ||
      (title !== undefined && (typeof title !== 'string' || title.length > 200))) {
    return res.status(400).json({ error: 'Use a title of at most 200 characters and text of at most 5000 characters' });
  }
  if (!title?.trim() && !content?.trim() && !req.file) return res.status(400).json({ error: 'Thread needs a title, text, or a photo' });
  const image = req.file ? await saveImage(req.file.buffer, { privateImage: true, folder: 'connectly/posts' }) : { url: '', publicId: '' };
  let info;
  try {
    info = await db.run('INSERT INTO posts (user_id, title, content, image_url, image_public_id, image_private) VALUES (?, ?, ?, ?, ?, ?)',
      req.userId, title?.trim() || '', content?.trim() || '', image.url, image.publicId, Number(!!req.file));
  } catch (error) {
    if (image.url) await deleteImage(image.url, image.publicId, { privateImage: true }).catch(console.error);
    throw error;
  }
  res.status(201).json({ post: await getPost(info.lastInsertRowid, req.userId) });
});
router.get('/:id/image', async (req, res) => {
  const post = await accessiblePost(req.params.id, req.userId);
  if (!post || !post.image_url || !post.image_private) return res.status(404).json({ error: 'Image not found' });
  const bytes = await readPrivateImage(post.image_url, post.image_public_id);
  res.type('image/webp').send(bytes);
});
router.get('/:id', async (req, res) => {
  const post = await getPost(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Thread not found or private' });
  res.json({ post });
});
router.delete('/:id', async (req, res) => {
  const post = await db.get('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!post) return res.status(404).json({ error: 'Thread not found' });
  if (post.user_id !== req.userId) return res.status(403).json({ error: 'Not your thread' });
  await db.run('DELETE FROM posts WHERE id = ?', req.params.id);
  if (post.image_url) await deleteImage(post.image_url, post.image_public_id, { privateImage: !!post.image_private }).catch(console.error);
  res.json({ deleted: true });
});
router.post('/:id/like', async (req, res) => {
  const post = await accessiblePost(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Thread not found or private' });
  const result = await db.run('INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)', post.id, req.userId);
  if (result.changes) await notify({ userId: post.user_id, actorId: req.userId, kind: 'like', postId: post.id });
  res.json({ liked: true });
});
router.delete('/:id/like', async (req, res) => {
  if (!(await accessiblePost(req.params.id, req.userId))) return res.status(404).json({ error: 'Thread not found or private' });
  await db.batch([
    { sql: 'DELETE FROM likes WHERE post_id = ? AND user_id = ?', args: [req.params.id, req.userId] },
    { sql: "DELETE FROM notifications WHERE post_id = ? AND actor_id = ? AND kind = 'like'", args: [req.params.id, req.userId] }
  ]);
  res.json({ liked: false });
});
router.get('/:id/comments', async (req, res) => {
  if (!(await accessiblePost(req.params.id, req.userId))) return res.status(404).json({ error: 'Thread not found or private' });
  const comments = await db.all('WITH RECURSIVE recent AS (SELECT id FROM comments WHERE post_id = ? ' +
    'ORDER BY created_at DESC, id DESC LIMIT 100), branch AS (' +
    'SELECT c.id, c.parent_id FROM comments c JOIN recent r ON r.id = c.id UNION ' +
    'SELECT parent.id, parent.parent_id FROM comments parent JOIN branch child ON parent.id = child.parent_id WHERE parent.post_id = ?) ' +
    'SELECT c.*, u.username, u.avatar_url FROM comments c JOIN users u ON u.id = c.user_id ' +
    'WHERE c.id IN (SELECT id FROM branch) ORDER BY c.created_at, c.id', req.params.id, req.params.id);
  res.json({ comments });
});
router.post('/:id/comments', async (req, res) => {
  const { content, parent_id } = req.body || {};
  if (typeof content !== 'string' || !content.trim() || content.length > 5000 ||
      (parent_id != null && (!Number.isSafeInteger(parent_id) || parent_id <= 0))) {
    return res.status(400).json({ error: 'Use a comment of 1–5000 characters and a valid reply' });
  }
  const post = await accessiblePost(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Thread not found or private' });
  let parent;
  if (parent_id != null) {
    parent = await db.get('SELECT * FROM comments WHERE id = ? AND post_id = ?', parent_id, post.id);
    if (!parent) return res.status(400).json({ error: 'The comment you are replying to is not in this thread' });
    const depth = await db.get('WITH RECURSIVE parents AS (SELECT id, parent_id FROM comments WHERE id = ? UNION ' +
      'SELECT c.id, c.parent_id FROM comments c JOIN parents p ON p.parent_id = c.id) SELECT COUNT(*) c FROM parents', parent.id);
    if (Number(depth.c) >= 8) return res.status(400).json({ error: 'This reply chain is full. Add a top-level comment instead.' });
  }
  const info = await db.run('INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
    post.id, req.userId, content.trim(), parent?.id || null);
  const comment = await db.get('SELECT c.*, u.username, u.avatar_url FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?', info.lastInsertRowid);
  await notify({ userId: post.user_id, actorId: req.userId, kind: 'comment', postId: post.id, commentId: comment.id });
  if (parent && parent.user_id !== post.user_id) {
    await notify({ userId: parent.user_id, actorId: req.userId, kind: 'reply', postId: post.id, commentId: comment.id });
  }
  res.status(201).json({ comment });
});
module.exports = router;
