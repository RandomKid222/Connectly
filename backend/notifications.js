const db = require('./db');

async function notify({ userId, actorId, kind, postId = null, commentId = null, messageId = null }) {
  if (!userId || userId === actorId) return;
  await db.run('INSERT OR IGNORE INTO notifications ' +
    '(user_id, actor_id, kind, post_id, comment_id, message_id) VALUES (?, ?, ?, ?, ?, ?)',
  userId, actorId, kind, postId, commentId, messageId);
}

module.exports = { notify };
