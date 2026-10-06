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
    profile_visibility TEXT NOT NULL DEFAULT 'public',
    message_permission TEXT NOT NULL DEFAULT 'everyone',
    searchable INTEGER NOT NULL DEFAULT 1,
    show_in_explore INTEGER NOT NULL DEFAULT 1,
    share_follow_lists INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'system',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    content TEXT DEFAULT '', image_url TEXT DEFAULT '', image_public_id TEXT DEFAULT '',
    title TEXT NOT NULL DEFAULT '', image_private INTEGER NOT NULL DEFAULT 0,
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
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL, receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '',
    image_public_id TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    read_at TEXT,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS follow_requests (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id)
  )`,
  `CREATE TABLE IF NOT EXISTS bookmarks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id)
  )`,
  `CREATE TABLE IF NOT EXISTS poll_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL, label TEXT NOT NULL,
    UNIQUE (post_id, position), UNIQUE (post_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS poll_votes (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id, option_id) REFERENCES poll_options(post_id, id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    read_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
  const additions = {
    users: [
      ["profile_visibility", "TEXT NOT NULL DEFAULT 'public'"],
      ["message_permission", "TEXT NOT NULL DEFAULT 'everyone'"],
      ["searchable", "INTEGER NOT NULL DEFAULT 1"],
      ["show_in_explore", "INTEGER NOT NULL DEFAULT 1"],
      ["share_follow_lists", "INTEGER NOT NULL DEFAULT 1"],
      ["theme", "TEXT NOT NULL DEFAULT 'system'"]
    ],
    posts: [["title", "TEXT NOT NULL DEFAULT ''"], ["image_private", "INTEGER NOT NULL DEFAULT 0"]],
    comments: [["parent_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE"]],
    messages: [["image_url", "TEXT NOT NULL DEFAULT ''"], ["image_public_id", "TEXT NOT NULL DEFAULT ''"]]
  };
  for (const [table, columns] of Object.entries(additions)) {
    const existing = new Set((await client.execute('PRAGMA table_info(' + table + ')')).rows.map(row => row.name));
    for (const [name, definition] of columns) {
      if (!existing.has(name)) await client.execute('ALTER TABLE ' + table + ' ADD COLUMN ' + name + ' ' + definition);
    }
  }
  await client.execute('CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(post_id, parent_id, id)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at, post_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON poll_votes(option_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, id)');
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event ON notifications ' +
    '(user_id, actor_id, kind, COALESCE(post_id, 0), COALESCE(comment_id, 0), COALESCE(message_id, 0))');
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
async function batch(statements) { return client.batch(statements, 'write'); }
async function createPollPost(userId, title, content, image, options) {
  const tx = await client.transaction('write');
  try {
    const result = await tx.execute({
      sql: 'INSERT INTO posts (user_id, title, content, image_url, image_public_id, image_private) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      args: [userId, title, content, image.url, image.publicId, Number(!!image.url)]
    });
    const id = Number(result.rows[0].id);
    for (let position = 0; position < options.length; position++) {
      await tx.execute({ sql: 'INSERT INTO poll_options (post_id, position, label) VALUES (?, ?, ?)', args: [id, position, options[position]] });
    }
    await tx.commit();
    return id;
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}
module.exports = { init, get, all, run, batch, resetPassword, createPollPost };
