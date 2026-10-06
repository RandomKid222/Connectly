const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, saveImage, deleteImage, readPrivateImage } = require('../media');
const { visibleProfileSQL, accessiblePost } = require('../access');
const { notify } = require('../notifications');
const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const postSelect = 'SELECT p.*, u.username AS author_name, u.avatar_url AS author_avatar, u.is_verified AS author_verified, ' +
  '(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likeCount, ' +
  '(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentCount, ' +
  'EXISTS(SELECT 1 FROM likes mine WHERE mine.post_id = p.id AND mine.user_id = ?) AS likedByMe ' +
  'FROM posts p JOIN users u ON u.id = p.user_id';
function publicPost(row) {
  const { image_public_id, image_private, author_name, author_avatar, author_verified, ...post } = row;
  return { ...post, image_url: image_private && post.image_url ? '/posts/' + post.id + '/image' : post.image_url,
    image_private: !!image_private, likedByMe: !!post.likedByMe,
    author: { id: post.user_id, username: author_name, avatar_url: author_avatar, is_verified: !!author_verified } };
}
async function addExtras(posts, viewerId) {
  if (!posts.length) return posts;
  const ids = posts.map(post => Number(post.id));
  const placeholders = ids.map(() => '?').join(',');
  const [saved, options] = await Promise.all([
    db.all('SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (' + placeholders + ')', viewerId, ...ids),
    db.all('SELECT o.id, o.post_id, o.label, o.position, COUNT(v.user_id) AS votes, ' +
      'MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS votedByMe FROM poll_options o ' +
      'LEFT JOIN poll_votes v ON v.post_id = o.post_id AND v.option_id = o.id ' +
      'WHERE o.post_id IN (' + placeholders + ') GROUP BY o.id ORDER BY o.position', viewerId, ...ids)
  ]);
  const savedIds = new Set(saved.map(row => Number(row.post_id)));
  const polls = new Map();
  for (const option of options) {
    const id = Number(option.post_id);
    if (!polls.has(id)) polls.set(id, { options: [], totalVotes: 0, myVote: null });
    const poll = polls.get(id);
    poll.options.push({ id: Number(option.id), label: option.label, votes: Number(option.votes) });
    poll.totalVotes += Number(option.votes);
    if (option.votedByMe) poll.myVote = Number(option.id);
  }
  return posts.map(post => ({ ...post, savedByMe: savedIds.has(Number(post.id)), poll: polls.get(Number(post.id)) || null }));
}
async function getPost(id, viewerId) {
  const row = await db.get(postSelect + ' WHERE p.id = ? AND ' + visibleProfileSQL, viewerId, id, viewerId, viewerId);
  return row ? (await addExtras([publicPost(row)], viewerId))[0] : null;
}
router.get('/saved', async (req, res) => {
  const rows = await db.all(postSelect + ' JOIN bookmarks b ON b.post_id = p.id AND b.user_id = ? ' +
    'WHERE ' + visibleProfileSQL + ' ORDER BY b.created_at DESC, b.post_id DESC LIMIT 100',
    req.userId, req.userId, req.userId, req.userId);
  res.json({ posts: await addExtras(rows.map(publicPost), req.userId) });
});
router.get('/feed', async (req, res) => {
  const rows = await db.all(postSelect + ' WHERE ' + visibleProfileSQL +
    ' AND (p.user_id = ? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)) ' +
    'ORDER BY p.created_at DESC, p.id DESC LIMIT 50', req.userId, req.userId, req.userId, req.userId, req.userId);
  res.json({ posts: await addExtras(rows.map(publicPost), req.userId) });
});
router.get('/explore', async (req, res) => {
  const rows = await db.all(postSelect + ' WHERE ' + visibleProfileSQL +
    ' AND (u.show_in_explore = 1 OR u.id = ?) ORDER BY p.created_at DESC, p.id DESC LIMIT 50',
    req.userId, req.userId, req.userId, req.userId);
  res.json({ posts: await addExtras(rows.map(publicPost), req.userId) });
});
router.get('/user/:userId', async (req, res) => {
  const rows = await db.all(postSelect + ' WHERE p.user_id = ? AND ' + visibleProfileSQL +
    ' ORDER BY p.created_at DESC, p.id DESC LIMIT 50', req.userId, req.params.userId, req.userId, req.userId);
  res.json({ posts: await addExtras(rows.map(publicPost), req.userId) });
});
router.post('/', upload.single('image'), async (req, res) => {
  const { content, title } = req.body || {};
  if ((content !== undefined && (typeof content !== 'string' || content.length > 5000)) ||
      (title !== undefined && (typeof title !== 'string' || title.length > 200))) {
    return res.status(400).json({ error: 'Use a title of at most 200 characters and text of at most 5000 characters' });
  }
  if (!title?.trim() && !content?.trim() && !req.file) return res.status(400).json({ error: 'Thread needs a title, text, or a photo' });
  let pollOptions;
  if (req.body.pollOptions !== undefined) {
    try { pollOptions = typeof req.body.pollOptions === 'string' ? JSON.parse(req.body.pollOptions) : req.body.pollOptions; }
    catch { return res.status(400).json({ error: 'Invalid poll options' }); }
    if (!title?.trim() || !Array.isArray(pollOptions) || pollOptions.length < 2 || pollOptions.length > 6 ||
        pollOptions.some(option => typeof option !== 'string' || !option.trim() || option.length > 80)) {
      return res.status(400).json({ error: 'A poll needs a question as its title and 2–6 choices of 1–80 characters' });
    }
    pollOptions = pollOptions.map(option => option.trim());
    if (new Set(pollOptions.map(option => option.toLowerCase())).size !== pollOptions.length) {
      return res.status(400).json({ error: 'Each poll choice must be different' });
    }
  }
  const image = req.file ? await saveImage(req.file.buffer, { privateImage: true, folder: 'connectly/posts' }) : { url: '', publicId: '' };
  let info;
  try {
    if (pollOptions) {
      info = { lastInsertRowid: await db.createPollPost(req.userId, title.trim(), content?.trim() || '', image, pollOptions) };
    } else {
      info = await db.run('INSERT INTO posts (user_id, title, content, image_url, image_public_id, image_private) VALUES (?, ?, ?, ?, ?, ?)',
        req.userId, title?.trim() || '', content?.trim() || '', image.url, image.publicId, Number(!!req.file));
    }
  } catch (error) {
    if (image.url) await deleteImage(image.url, image.publicId, { privateImage: true }).catch(console.error);
    throw error;
  }
  res.status(201).json({ post: await getPost(info.lastInsertRowid, req.userId) });
});
router.post('/:id/bookmark', async (req, res) => {
  const post = await accessiblePost(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Thread not found or private' });
  await db.run('INSERT OR IGNORE INTO bookmarks (user_id, post_id) VALUES (?, ?)', req.userId, post.id);
  res.json({ saved: true });
});
router.delete('/:id/bookmark', async (req, res) => {
  // A member may remove their own saved reference after losing access to a thread.
  await db.run('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?', req.userId, req.params.id);
  res.json({ saved: false });
});
router.post('/:id/vote', async (req, res) => {
  const { option_id } = req.body || {};
  if (!Number.isSafeInteger(option_id) || option_id <= 0) return res.status(400).json({ error: 'Choose a valid poll option' });
  const post = await accessiblePost(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Thread not found or private' });
  if (!(await db.get('SELECT id FROM poll_options WHERE post_id = ? AND id = ?', post.id, option_id))) {
    return res.status(400).json({ error: 'This choice is not in this poll' });
  }
  await db.run('INSERT INTO poll_votes (post_id, user_id, option_id) VALUES (?, ?, ?) ' +
    'ON CONFLICT(post_id, user_id) DO UPDATE SET option_id = excluded.option_id', post.id, req.userId, option_id);
  const updated = await getPost(post.id, req.userId);
  if (!updated) return res.status(404).json({ error: 'Thread not found or private' });
  res.json({ poll: updated.poll });
});
router.delete('/:id/vote', async (req, res) => {
  const post = await accessiblePost(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Thread not found or private' });
  await db.run('DELETE FROM poll_votes WHERE post_id = ? AND user_id = ?', post.id, req.userId);
  const updated = await getPost(post.id, req.userId);
  if (!updated) return res.status(404).json({ error: 'Thread not found or private' });
  res.json({ poll: updated.poll });
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
    'SELECT c.*, u.username, u.avatar_url, u.is_verified FROM comments c JOIN users u ON u.id = c.user_id ' +
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
  const comment = await db.get('SELECT c.*, u.username, u.avatar_url, u.is_verified FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?', info.lastInsertRowid);
  await notify({ userId: post.user_id, actorId: req.userId, kind: 'comment', postId: post.id, commentId: comment.id });
  if (parent && parent.user_id !== post.user_id) {
    await notify({ userId: parent.user_id, actorId: req.userId, kind: 'reply', postId: post.id, commentId: comment.id });
  }
  res.status(201).json({ comment });
});
module.exports = router;
