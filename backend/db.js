const { createClient } = require('@libsql/client');
const path = require('path');

if (process.env.NODE_ENV === 'production' &&
    (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)) {
  throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required in production');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'social.db')}`,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined
});

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    bio TEXT DEFAULT '', avatar_url TEXT DEFAULT '', avatar_public_id TEXT DEFAULT '',
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    content TEXT DEFAULT '', image_url TEXT DEFAULT '', image_public_id TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS likes (
    post_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL, content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL, receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    read_at TEXT,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`
];

async function init() {
  await client.execute('PRAGMA foreign_keys = ON');
  for (const sql of schema) await client.execute(sql);
  const cols = await client.execute('PRAGMA table_info(posts)');
  if (!cols.rows.some(row => row.name === 'image_public_id')) {
    await client.execute("ALTER TABLE posts ADD COLUMN image_public_id TEXT DEFAULT ''");
  }
  const userCols = await client.execute('PRAGMA table_info(users)');
  if (!userCols.rows.some(row => row.name === 'avatar_public_id')) {
    await client.execute("ALTER TABLE users ADD COLUMN avatar_public_id TEXT DEFAULT ''");
  }
  if (!userCols.rows.some(row => row.name === 'token_version')) {
    await client.execute('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
  }
  const messageCols = await client.execute('PRAGMA table_info(messages)');
  if (!messageCols.rows.some(row => row.name === 'read_at')) {
    await client.execute('ALTER TABLE messages ADD COLUMN read_at TEXT');
    // Messages from before this feature were already available to read.
    await client.execute('UPDATE messages SET read_at = created_at WHERE read_at IS NULL');
  }
  await client.execute('CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(receiver_id, read_at, sender_id)');
}
async function all(sql, ...args) {
  return (await client.execute({ sql, args })).rows;
}
async function get(sql, ...args) { return (await all(sql, ...args))[0] || null; }
async function run(sql, ...args) {
  const result = await client.execute({ sql, args });
  return { lastInsertRowid: result.lastInsertRowid ? Number(result.lastInsertRowid) : null,
    changes: result.rowsAffected };
}
async function resetPassword(tokenHash, passwordHash, now) {
  const tx = await client.transaction('write');
  try {
    const result = await tx.execute({
      sql: 'DELETE FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ? RETURNING user_id',
      args: [tokenHash, now]
    });
    if (!result.rows.length) {
      await tx.rollback();
      return false;
    }
    await tx.execute({
      sql: 'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
      args: [passwordHash, result.rows[0].user_id]
    });
    await tx.commit();
    return true;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}
module.exports = { init, get, all, run, resetPassword };
