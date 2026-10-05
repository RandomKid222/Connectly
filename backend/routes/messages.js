const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, saveImage, deleteImage, readPrivateImage } = require('../media');
const { canMessage } = require('../access');
const { notify } = require('../notifications');
const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
function publicMessage(row) {
  const { image_public_id, ...message } = row;
  return { ...message, image_url: message.image_url ? '/messages/' + message.id + '/image' : '' };
}
router.get('/unread', async (req, res) => {
  const row = await db.get('SELECT COUNT(*) AS count FROM messages WHERE receiver_id = ? AND read_at IS NULL', req.userId);
  res.json({ unreadCount: Number(row.count) });
});
router.get('/conversations', async (req, res) => {
  const conversations = await db.all('SELECT u.id, u.username, u.avatar_url, ' +
    "(SELECT CASE WHEN m2.image_url <> '' THEN CASE WHEN m2.content <> '' THEN 'Photo: ' || m2.content ELSE 'Photo' END ELSE m2.content END " +
    'FROM messages m2 WHERE (m2.sender_id = u.id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = u.id) ' +
    'ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1) AS lastMessage, ' +
    '(SELECT created_at FROM messages m3 WHERE (m3.sender_id = u.id AND m3.receiver_id = ?) OR (m3.sender_id = ? AND m3.receiver_id = u.id) ' +
    'ORDER BY m3.created_at DESC, m3.id DESC LIMIT 1) AS lastAt, ' +
    '(SELECT COUNT(*) FROM messages unread WHERE unread.sender_id = u.id AND unread.receiver_id = ? AND unread.read_at IS NULL) AS unreadCount ' +
    'FROM users u WHERE u.id IN (SELECT sender_id FROM messages WHERE receiver_id = ? UNION SELECT receiver_id FROM messages WHERE sender_id = ?) ' +
    'ORDER BY lastAt DESC, u.id DESC LIMIT 100', req.userId, req.userId, req.userId, req.userId, req.userId, req.userId, req.userId);
  res.json({ conversations });
});
router.get('/:id/image', async (req, res) => {
  const message = await db.get('SELECT * FROM messages WHERE id = ? AND (sender_id = ? OR receiver_id = ?)',
    req.params.id, req.userId, req.userId);
  if (!message?.image_url) return res.status(404).json({ error: 'Image not found' });
  const bytes = await readPrivateImage(message.image_url, message.image_public_id);
  res.type('image/webp').send(bytes);
});
router.get('/:userId', async (req, res) => {
  const otherId = Number(req.params.userId);
  if (!Number.isSafeInteger(otherId) || otherId <= 0) return res.status(400).json({ error: 'Invalid user' });
  const owner = await db.get('SELECT * FROM users WHERE id = ?', otherId);
  if (!owner) return res.status(404).json({ error: 'User not found' });
  const messages = await db.all('SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ' +
    'ORDER BY created_at DESC, id DESC LIMIT 100', req.userId, otherId, otherId, req.userId);
  res.json({ otherUser: { id: owner.id, username: owner.username, avatar_url: owner.avatar_url },
    canSend: await canMessage(owner, req.userId), messages: messages.reverse().map(publicMessage) });
});
router.put('/:userId/read', async (req, res) => {
  const otherId = Number(req.params.userId);
  const upToId = Number(req.body?.upToId);
  if (!Number.isSafeInteger(otherId) || otherId <= 0 || !Number.isSafeInteger(upToId) || upToId <= 0) {
    return res.status(400).json({ error: 'Invalid conversation or message' });
  }
  const results = await db.batch([
    { sql: 'UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE sender_id = ? AND receiver_id = ? AND id <= ? AND read_at IS NULL',
      args: [otherId, req.userId, upToId] },
    { sql: "UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND actor_id = ? AND kind = 'message' AND message_id <= ?",
      args: [req.userId, otherId, upToId] }
  ]);
  res.json({ markedRead: results[0].rowsAffected });
});
router.post('/:userId', upload.single('image'), async (req, res) => {
  const otherId = Number(req.params.userId);
  const content = req.body?.content;
  if (!Number.isSafeInteger(otherId) || otherId <= 0) return res.status(400).json({ error: 'Invalid user' });
  if ((content !== undefined && (typeof content !== 'string' || content.length > 5000)) || (!content?.trim() && !req.file)) {
    return res.status(400).json({ error: 'Message needs text of at most 5000 characters or a photo' });
  }
  const owner = await db.get('SELECT * FROM users WHERE id = ?', otherId);
  if (!owner) return res.status(404).json({ error: 'User not found' });
  if (!(await canMessage(owner, req.userId))) return res.status(403).json({ error: 'This member is not accepting messages from you' });
  const image = req.file ? await saveImage(req.file.buffer, { privateImage: true, folder: 'connectly/messages' }) : { url: '', publicId: '' };
  let info;
  try {
    info = await db.run('INSERT INTO messages (sender_id, receiver_id, content, image_url, image_public_id) VALUES (?, ?, ?, ?, ?)',
      req.userId, otherId, content?.trim() || '', image.url, image.publicId);
  } catch (error) {
    if (image.url) await deleteImage(image.url, image.publicId, { privateImage: true }).catch(console.error);
    throw error;
  }
  const message = await db.get('SELECT * FROM messages WHERE id = ?', info.lastInsertRowid);
  await notify({ userId: otherId, actorId: req.userId, kind: 'message', messageId: message.id });
  res.status(201).json({ message: publicMessage(message) });
});
module.exports = router;
