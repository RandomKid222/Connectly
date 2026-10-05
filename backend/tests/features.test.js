const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');

test('migration, threads, photos, privacy, notifications, settings and auth', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'connectly-test-'));
  process.env.NODE_ENV = 'test';
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(temporary, 'test.db');
  process.env.TURSO_AUTH_TOKEN = '';
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.BREVO_API_KEY = 'test-only-never-a-real-key';
  process.env.EMAIL_FROM = 'test@example.com';
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) process.env[key] = '';
  const hash = await bcrypt.hash('first_password_123', 12);
  const old = createClient({ url: process.env.TURSO_DATABASE_URL });
  await old.batch([
    { sql: "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, bio TEXT DEFAULT '', avatar_url TEXT DEFAULT '', avatar_public_id TEXT DEFAULT '', token_version INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)", args: [] },
    { sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT DEFAULT '', image_url TEXT DEFAULT '', image_public_id TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP)", args: [] },
    { sql: "CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)", args: [] },
    { sql: "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL REFERENCES users(id), receiver_id INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, read_at TEXT)", args: [] },
    ...['alice', 'bob', 'carol'].map(name => ({ sql: 'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', args: [name, name + '@example.com', hash] })),
    ...[1, 2, 3, 4].map(id => ({ sql: 'INSERT INTO posts (id, user_id, content) VALUES (?, 1, ?)', args: [id, 'Legacy post ' + id] })),
    { sql: 'DELETE FROM posts WHERE id IN (2, 3)', args: [] },
    { sql: "INSERT INTO comments (post_id, user_id, content) VALUES (1, 2, 'Legacy comment')", args: [] },
    { sql: "INSERT INTO messages (sender_id, receiver_id, content) VALUES (1, 2, 'Legacy message')", args: [] }
  ], 'write');
  old.close();
  const nativeFetch = global.fetch;
  let resetEmail;
  global.fetch = async (url, options) => {
    if (url === 'https://api.brevo.com/v3/smtp/email') {
      resetEmail = JSON.parse(options.body);
      return { ok: true, status: 201 };
    }
    return nativeFetch(url, options);
  };
  const db = require('../db');
  await db.init();
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const tokens = {};
  async function call(method, route, who, body) {
    const headers = who ? { Authorization: 'Bearer ' + tokens[who] } : {};
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + '/api' + route, {
      method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
    });
    const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null;
    return { response, status: response.status, data };
  }
  async function login(name, password = 'first_password_123') {
    const result = await call('POST', '/auth/login', null, { emailOrUsername: name, password });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    tokens[name] = result.data.token;
  }
  const photo = await sharp({ create: { width: 40, height: 24, channels: 3, background: '#5355d1' } }).png().toBuffer();
  function photoForm(content = '', bytes = photo, type = 'image/png') {
    const form = new FormData();
    form.append('content', content);
    form.append('image', new Blob([bytes], { type }), 'photo.png');
    return form;
  }
  try {
    await t.test('old data, IDs and defaults survive migration', async () => {
      assert.deepEqual((await db.all('SELECT id FROM posts ORDER BY id')).map(row => row.id), [1, 4]);
      assert.equal((await db.get('SELECT title FROM posts WHERE id = 1')).title, '');
      assert.equal((await db.get('SELECT parent_id FROM comments WHERE id = 1')).parent_id, null);
      assert.equal((await db.get('SELECT image_url FROM messages WHERE id = 1')).image_url, '');
      await db.init();
      assert.equal((await db.get('SELECT content FROM messages WHERE id = 1')).content, 'Legacy message');
      for (const name of ['alice', 'bob', 'carol']) await login(name);
    });
    let postId;
    let messageId;
    await t.test('threads and safe photo uploads; unrelated people cannot read DM photos', async () => {
      const form = photoForm('Photo and text');
      form.append('title', 'A photo thread');
      const post = await call('POST', '/posts', 'alice', form);
      assert.equal(post.status, 201, JSON.stringify(post.data));
      postId = post.data.post.id;
      assert.equal(postId, 5);
      assert.equal(post.data.post.image_public_id, undefined);
      assert.equal(post.data.post.image_url, '/posts/5/image');
      const viewed = await call('GET', '/posts/5/image', 'bob');
      assert.equal(viewed.status, 200);
      assert.equal((await sharp(Buffer.from(await viewed.response.arrayBuffer())).metadata()).format, 'webp');
      const text = await call('POST', '/messages/2', 'alice', { content: 'A text-only message' });
      assert.equal(text.status, 201);
      const image = await call('POST', '/messages/2', 'alice', photoForm());
      assert.equal(image.status, 201, JSON.stringify(image.data));
      messageId = image.data.message.id;
      assert.equal(image.data.message.content, '');
      assert.equal(image.data.message.image_public_id, undefined);
      const imageRoute = image.data.message.image_url;
      assert.equal((await call('GET', imageRoute)).status, 401);
      assert.equal((await call('GET', imageRoute, 'carol')).status, 404);
      assert.equal((await call('GET', imageRoute, 'bob')).status, 200);
      assert.equal((await call('GET', imageRoute, 'alice')).status, 200);
      const stored = await db.get('SELECT image_url FROM messages WHERE id = ?', messageId);
      assert.equal((await fetch(origin + stored.image_url)).status, 404);
      assert.equal((await call('POST', '/messages/2', 'alice', photoForm('', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')))).status, 400);
      assert.equal((await call('POST', '/messages/2', 'alice', photoForm('', Buffer.alloc(5 * 1024 * 1024 + 1)))).status, 413);
      assert.equal((await call('POST', '/messages/2', 'alice', {})).status, 400);
      assert.equal((await call('POST', '/messages/2', 'alice', { content: 'x'.repeat(5001) })).status, 400);
      const conversation = (await call('GET', '/messages/conversations', 'bob')).data.conversations[0];
      assert.equal(conversation.lastMessage, 'Photo');
      assert.ok(conversation.unreadCount >= 1);
      await call('PUT', '/messages/1/read', 'bob', { upToId: messageId });
      assert.equal((await call('GET', '/messages/unread', 'bob')).data.unreadCount, 0);
      assert.equal((await db.get("SELECT COUNT(*) c FROM notifications WHERE user_id = 2 AND kind = 'message' AND read_at IS NULL")).c, 0);
    });
    let commentId;
    await t.test('nested replies, upvotes and activity are linked to the correct account', async () => {
      const comment = await call('POST', '/posts/' + postId + '/comments', 'bob', { content: 'A comment' });
      assert.equal(comment.status, 201);
      commentId = comment.data.comment.id;
      const reply = await call('POST', '/posts/' + postId + '/comments', 'carol', { content: 'A reply', parent_id: commentId });
      assert.equal(reply.status, 201);
      assert.equal(reply.data.comment.parent_id, commentId);
      assert.equal((await call('POST', '/posts/4/comments', 'carol', { content: 'Wrong thread', parent_id: commentId })).status, 400);
      await call('POST', '/posts/' + postId + '/like', 'bob');
      await call('POST', '/posts/' + postId + '/like', 'bob');
      assert.equal((await db.get("SELECT COUNT(*) c FROM notifications WHERE user_id = 1 AND kind = 'like' AND post_id = ?", postId)).c, 1);
      const activity = (await call('GET', '/notifications', 'alice')).data;
      assert.ok(activity.notifications.some(item => item.kind === 'comment'));
      assert.ok((await call('GET', '/notifications', 'bob')).data.notifications.some(item => item.kind === 'reply'));
      const aliceNotification = activity.notifications.find(item => !item.read_at);
      await call('PUT', '/notifications/' + aliceNotification.id + '/read', 'carol', {});
      assert.equal((await db.get('SELECT read_at FROM notifications WHERE id = ?', aliceNotification.id)).read_at, null);
      let parent = reply.data.comment.id;
      for (let depth = 2; depth <= 7; depth++) {
        const nested = await call('POST', '/posts/' + postId + '/comments', 'bob', { content: 'Nested ' + depth, parent_id: parent });
        assert.equal(nested.status, 201);
        parent = nested.data.comment.id;
      }
      assert.equal((await call('POST', '/posts/' + postId + '/comments', 'bob', { content: 'Too deep', parent_id: parent })).status, 400);
      const discussion = (await call('GET', '/posts/' + postId + '/comments', 'alice')).data.comments;
      assert.ok(discussion.some(item => item.parent_id === commentId));
    });
    await t.test('private profiles, follow approvals and older photo protection', async () => {
      const { saveImage } = require('../media');
      const older = await saveImage(photo);
      await db.run('UPDATE posts SET image_url = ? WHERE id = 1', older.url);
      assert.equal((await fetch(origin + older.url)).status, 200);
      const result = await call('PUT', '/settings', 'alice', { profile_visibility: 'private' });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal((await fetch(origin + older.url)).status, 404);
      assert.equal((await call('GET', '/posts/1/image', 'alice')).status, 200);
      assert.equal((await call('GET', '/posts/' + postId, 'carol')).status, 404);
      assert.equal((await call('GET', '/posts/' + postId + '/image', 'carol')).status, 404);
      await call('POST', '/users/1/follow', 'carol');
      await call('POST', '/users/3/follow-request', 'alice', { decision: 'reject' });
      const previousRequest = await db.get("SELECT id FROM notifications WHERE user_id = 1 AND actor_id = 3 AND kind = 'follow_request'");
      await call('POST', '/users/1/follow', 'carol');
      const newRequest = await db.get("SELECT id, read_at FROM notifications WHERE user_id = 1 AND actor_id = 3 AND kind = 'follow_request'");
      assert.ok(newRequest.id > previousRequest.id);
      assert.equal(newRequest.read_at, null);
      await call('DELETE', '/users/1/follow', 'carol');
      assert.equal((await call('GET', '/posts/' + postId + '/comments', 'carol')).status, 404);
      assert.equal((await call('POST', '/posts/' + postId + '/like', 'carol')).status, 404);
      assert.ok(!(await call('GET', '/posts/explore', 'carol')).data.posts.some(post => post.user_id === 1));
      const restricted = (await call('GET', '/users/alice', 'carol')).data.user;
      assert.equal(restricted.canViewPosts, false);
      assert.equal(restricted.postCount, null);
      const follow = await call('POST', '/users/1/follow', 'bob');
      assert.equal(follow.data.requested, true);
      assert.equal((await call('GET', '/posts/' + postId, 'bob')).status, 404);
      await call('POST', '/users/2/follow-request', 'carol', { decision: 'accept' });
      assert.equal((await call('GET', '/posts/' + postId, 'bob')).status, 404);
      assert.ok((await call('GET', '/notifications', 'alice')).data.notifications.some(item => item.kind === 'follow_request' && item.pendingRequest));
      await call('POST', '/users/2/follow-request', 'alice', { decision: 'accept' });
      assert.equal((await call('GET', '/posts/' + postId, 'bob')).status, 200);
      assert.equal((await call('GET', '/posts/' + postId + '/image', 'bob')).status, 200);
      assert.equal((await call('GET', '/posts/' + postId + '/image', 'carol')).status, 404);
    });
    await t.test('discovery, data sharing and messaging settings are enforced', async () => {
      await call('PUT', '/settings', 'alice', { searchable: false, show_in_explore: false, share_follow_lists: false, theme: 'dark' });
      assert.equal((await call('GET', '/settings', 'alice')).data.settings.theme, 'dark');
      assert.equal((await call('GET', '/users?q=alice', 'bob')).data.users.length, 0);
      assert.ok(!(await call('GET', '/posts/explore', 'bob')).data.posts.some(post => post.user_id === 1));
      assert.ok((await call('GET', '/posts/feed', 'bob')).data.posts.some(post => post.user_id === 1));
      assert.equal((await call('GET', '/users/1/followers', 'bob')).status, 403);
      assert.equal((await call('GET', '/users/1/followers', 'alice')).status, 200);
      assert.equal((await call('PUT', '/settings', 'alice', { theme: 'invalid' })).status, 400);
      assert.equal((await call('PUT', '/settings', 'alice', { searchable: 'false' })).status, 400);
      await call('PUT', '/settings', 'bob', { message_permission: 'none' });
      assert.equal((await call('POST', '/messages/2', 'alice', { content: 'Blocked' })).status, 403);
      await call('PUT', '/settings', 'bob', { message_permission: 'following' });
      assert.equal((await call('POST', '/messages/2', 'alice', { content: 'Allowed' })).status, 201);
      assert.equal((await call('POST', '/messages/2', 'carol', { content: 'Blocked' })).status, 403);
      const exported = (await call('GET', '/settings/export', 'alice')).data;
      assert.equal(exported.account.username, 'alice');
      assert.ok(exported.messages.every(item => item.sender_id === 1 || item.receiver_id === 1));
      assert.ok(!JSON.stringify(exported).includes('password_hash'));
      assert.ok(!JSON.stringify(exported).includes('image_public_id'));
      assert.ok(!JSON.stringify(exported).includes('/private-uploads/'));
      const ownEvent = (await call('GET', '/notifications', 'alice')).data.notifications[0];
      await call('PUT', '/notifications/read', 'alice', { upToId: ownEvent.id });
      assert.equal((await call('GET', '/notifications', 'alice')).data.unreadCount, 0);
    });
    await t.test('password changes and sign-out invalidate old tokens while retaining the current session', async () => {
      assert.equal((await call('POST', '/settings/password', 'bob', { currentPassword: 'wrong', newPassword: 'second_password_123' })).status, 400);
      const oldToken = tokens.bob;
      const changed = await call('POST', '/settings/password', 'bob', { currentPassword: 'first_password_123', newPassword: 'second_password_123' });
      assert.equal(changed.status, 200);
      tokens.bob = changed.data.token;
      assert.equal((await call('GET', '/auth/me', 'bob')).status, 200);
      const oldResponse = await fetch(origin + '/api/auth/me', { headers: { Authorization: 'Bearer ' + oldToken } });
      assert.equal(oldResponse.status, 401);
      assert.equal((await call('POST', '/auth/login', null, { emailOrUsername: 'bob', password: 'first_password_123' })).status, 401);
      await login('bob', 'second_password_123');
      const aliceToken = tokens.alice;
      const signedOut = await call('POST', '/settings/sessions', 'alice', {});
      tokens.alice = signedOut.data.token;
      assert.equal((await call('GET', '/auth/me', 'alice')).status, 200);
      assert.equal((await fetch(origin + '/api/auth/me', { headers: { Authorization: 'Bearer ' + aliceToken } })).status, 401);
      assert.equal((await call('GET', '/auth/me', 'carol')).status, 200);
    });
    await t.test('password reset still sends a one-time link without storing its token', async () => {
      const unknown = await call('POST', '/auth/forgot-password', null, { email: 'unknown@example.com' });
      const known = await call('POST', '/auth/forgot-password', null, { email: 'alice@example.com' });
      assert.deepEqual(known.data, unknown.data);
      const url = new URL(resetEmail.textContent.match(/https?:\/\/\S+/)[0]);
      const token = new URLSearchParams(url.hash.slice(1)).get('token');
      assert.ok(token);
      assert.notEqual((await db.get('SELECT token_hash FROM password_reset_tokens WHERE user_id = 1')).token_hash, token);
      assert.equal((await call('POST', '/auth/reset-password', null, { token, password: 'reset_password_123' })).status, 200);
      assert.equal((await call('POST', '/auth/reset-password', null, { token, password: 'reset_password_123' })).status, 400);
      assert.equal((await call('GET', '/auth/me', 'alice')).status, 401);
      await login('alice', 'reset_password_123');
    });
    await t.test('local times parse UTC correctly across timezones and daylight savings', async () => {
      const module = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/utils/time.js')));
      assert.equal(module.parseTimestamp('2026-10-05 04:00:00').toISOString(), '2026-10-05T04:00:00.000Z');
      assert.equal(module.parseTimestamp('2026-10-05T00:00:00-04:00').toISOString(), '2026-10-05T04:00:00.000Z');
      assert.equal(module.parseTimestamp('invalid'), null);
      process.env.TZ = 'America/Los_Angeles';
      assert.equal(module.parseTimestamp('2026-10-05 04:00:00').getHours(), 21);
      const beforeFall = module.parseTimestamp('2026-11-01 08:30:00');
      const afterFall = module.parseTimestamp('2026-11-01 09:30:00');
      assert.equal(beforeFall.getHours(), 1);
      assert.equal(afterFall.getHours(), 1);
      assert.equal(beforeFall.getTimezoneOffset(), 420);
      assert.equal(afterFall.getTimezoneOffset(), 480);
      assert.equal(module.parseTimestamp('2026-03-08 09:30:00').getHours(), 1);
      assert.equal(module.parseTimestamp('2026-03-08 10:30:00').getHours(), 3);
      process.env.TZ = 'America/Toronto';
      assert.equal(module.parseTimestamp('2026-10-05 04:00:00').getHours(), 0);
      process.env.TZ = 'UTC';
    });
  } finally {
    const photos = await db.all("SELECT image_url FROM posts WHERE image_url <> '' UNION SELECT image_url FROM messages WHERE image_url <> ''");
    for (const photo of photos) {
      if (photo.image_url.startsWith('/private-uploads/') || photo.image_url.startsWith('/uploads/')) {
        await fs.unlink(path.join(__dirname, '..', photo.image_url.slice(1))).catch(() => {});
      }
    }
    global.fetch = nativeFetch;
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
