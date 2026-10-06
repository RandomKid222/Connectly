const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');

test('verified badges and database-enforced administration', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'connectly-admin-'));
  Object.assign(process.env, { NODE_ENV: 'test', TURSO_DATABASE_URL: 'file:' + path.join(temporary, 'db.sqlite'),
    TURSO_AUTH_TOKEN: '', JWT_SECRET: crypto.randomBytes(32).toString('hex'), CORS_ORIGIN: 'http://localhost:5173' });
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) process.env[key] = '';
  const db = require('../db');
  await db.init();
  for (const name of ['owner', 'member', 'other']) {
    await db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', name, name + '@example.com', 'unused-test-hash');
  }
  const tokens = [null, ...[1, 2, 3].map(userId => jwt.sign({ userId, tokenVersion: 0 }, process.env.JWT_SECRET))];
  const server = require('../server').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function call(method, route, id, body, overrideToken) {
    const headers = id ? { Authorization: 'Bearer ' + (overrideToken || tokens[id]) } : {};
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + '/api' + route, { method, headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null;
    return { response, status: response.status, data };
  }
  const bytes = await sharp({ create: { width: 50, height: 30, channels: 3, background: '#d5fa45' } }).png().toBuffer();
  function photoForm(title, content = '') {
    const form = new FormData();
    if (title) form.append('title', title);
    form.append('content', content);
    form.append('image', new Blob([bytes], { type: 'image/png' }), 'test.png');
    return form;
  }
  let thread;
  try {
    await t.test('new columns default to unverified members and initialization preserves data', async () => {
      await db.run("UPDATE users SET bio = 'Existing bio' WHERE id = 2");
      await db.init();
      const member = await db.get('SELECT role, is_verified, bio FROM users WHERE id = 2');
      assert.equal(member.role, 'member'); assert.equal(member.is_verified, 0); assert.equal(member.bio, 'Existing bio');
      assert.ok(await db.get("SELECT name FROM sqlite_master WHERE name = 'admin_actions'"));
      await db.run("UPDATE users SET role = 'admin' WHERE id = 1");
    });
    await t.test('every admin route rejects unauthenticated and ordinary accounts', async () => {
      const routes = [
        ['GET', '/admin/users'], ['GET', '/admin/threads'], ['GET', '/admin/comments'], ['GET', '/admin/history'],
        ['GET', '/admin/threads/1/image'], ['PUT', '/admin/users/2/verification', { verified: true }],
        ['DELETE', '/admin/threads/1', { reason: 'Spam' }], ['DELETE', '/admin/comments/1', { reason: 'Spam' }]
      ];
      for (const [method, route, body] of routes) {
        assert.equal((await call(method, route, null, body)).status, 401, route);
        assert.equal((await call(method, route, 2, body)).status, 403, route);
      }
      const list = await call('GET', '/admin/users', 1);
      assert.equal(list.status, 200);
      assert.equal(list.response.headers.get('Cache-Control'), 'no-store');
      for (const user of list.data.users) {
        assert.equal(user.email, undefined); assert.equal(user.password_hash, undefined); assert.equal(user.token_version, undefined);
      }
      assert.equal((await call('GET', '/admin/users?page=-1', 1)).status, 400);
      assert.equal((await call('GET', '/admin/users?q=' + 'x'.repeat(101), 1)).status, 400);
    });
    await t.test('signup, profile updates and JWT role claims cannot grant privileges', async () => {
      const forgedClaim = jwt.sign({ userId: 2, tokenVersion: 0, role: 'admin', is_verified: true }, process.env.JWT_SECRET);
      assert.equal((await call('GET', '/admin/users', 2, null, forgedClaim)).status, 403);
      await call('PUT', '/users/me/update', 2, { bio: 'Updated bio', role: 'admin', is_verified: true });
      let member = await db.get('SELECT role, is_verified FROM users WHERE id = 2');
      assert.equal(member.role, 'member'); assert.equal(member.is_verified, 0);
      const signup = await call('POST', '/auth/signup', null, { username: 'newmember', email: 'new@example.com',
        password: 'test_password_123', role: 'admin', is_verified: true });
      assert.equal(signup.status, 201, JSON.stringify(signup.data));
      assert.equal(signup.data.user.role, 'member'); assert.equal(signup.data.user.is_verified, 0);
      assert.equal((await call('PUT', '/admin/users/2/verification', 1, { verified: true, role: 'admin' })).status, 400);
      assert.equal((await call('PUT', '/admin/users/2/verification', 1, { verified: 'true' })).status, 400);
      assert.equal((await call('PUT', '/admin/users/999/verification', 1, { verified: true })).status, 404);
    });
    await t.test('only administrators can set a badge; it appears across public account views', async () => {
      const changed = await call('PUT', '/admin/users/2/verification', 1, { verified: true });
      assert.equal(changed.status, 200); assert.equal(changed.data.user.is_verified, true);
      assert.equal((await call('GET', '/admin/users', 2)).status, 403, 'Verified is not administrator');
      const created = await call('POST', '/posts', 2, { title: 'Verified thread', content: 'A regular thread' });
      thread = created.data.post;
      assert.equal(thread.author.is_verified, true);
      await call('POST', '/posts/' + thread.id + '/comments', 2, { content: 'Verified comment' });
      await call('POST', '/users/1/follow', 2);
      await call('POST', '/messages/1', 2, { content: 'Hello owner' });
      assert.equal((await call('GET', '/users/member', 3)).data.user.is_verified, true);
      assert.equal((await call('GET', '/users?q=member', 1)).data.users.find(user => user.id === 2).is_verified, 1);
      assert.equal((await call('GET', '/posts/' + thread.id + '/comments', 1)).data.comments[0].is_verified, 1);
      assert.equal((await call('GET', '/messages/2', 1)).data.otherUser.is_verified, true);
      assert.equal((await call('GET', '/messages/conversations', 1)).data.conversations[0].is_verified, 1);
      assert.equal((await call('GET', '/notifications', 1)).data.notifications[0].is_verified, 1);
      assert.equal((await call('GET', '/users/1/followers', 1)).data.followers[0].is_verified, 1);
      assert.equal((await db.get('SELECT role FROM users WHERE id = 2')).role, 'member');
    });
    await t.test('verification changes are idempotent, audited and reversible', async () => {
      await call('PUT', '/admin/users/2/verification', 1, { verified: true });
      assert.equal((await db.get("SELECT COUNT(*) c FROM admin_actions WHERE action = 'verification'")).c, 1);
      await call('PUT', '/admin/users/2/verification', 1, { verified: false });
      assert.equal((await call('GET', '/users/member', 3)).data.user.is_verified, false);
      assert.equal((await call('GET', '/posts/' + thread.id, 1)).data.post.author.is_verified, false);
      const history = (await call('GET', '/admin/history', 1)).data.actions;
      assert.equal(history.length, 2); assert.equal(history[0].actor_name, 'owner'); assert.equal(history[0].details, 'Badge removed');
    });
    await t.test('private threads and photos can be moderated without exposing them to members', async () => {
      const created = await call('POST', '/posts', 2, photoForm('Private photo', 'For followers'));
      const privatePost = created.data.post;
      await call('PUT', '/settings', 2, { profile_visibility: 'private' });
      assert.equal((await call('GET', '/posts/' + privatePost.id, 1)).status, 404, 'Ordinary feed permissions still apply to admins');
      const list = await call('GET', '/admin/threads?q=Private', 1);
      assert.equal(list.data.threads.length, 1);
      const row = list.data.threads[0];
      assert.equal(row.image_url, '/admin/threads/' + row.id + '/image');
      assert.equal(row.image_public_id, undefined);
      assert.equal((await call('GET', row.image_url, 3)).status, 403);
      const image = await call('GET', row.image_url, 1);
      assert.equal(image.status, 200);
      assert.equal((await sharp(Buffer.from(await image.response.arrayBuffer())).metadata()).format, 'webp');
      assert.equal((await call('DELETE', '/admin/threads/' + row.id, 1, { reason: '' })).status, 400);
      assert.equal((await call('DELETE', '/admin/threads/' + row.id, 1, { reason: 'x'.repeat(301) })).status, 400);
      await db.run("CREATE TRIGGER block_admin_delete BEFORE INSERT ON admin_actions WHEN NEW.action = 'remove_thread' BEGIN SELECT RAISE(ABORT, 'Simulated audit outage'); END");
      const failed = await call('DELETE', '/admin/threads/' + row.id, 1, { reason: 'Spam' });
      assert.equal(failed.status, 500); assert.equal(failed.data.error, 'Server error');
      assert.ok(await db.get('SELECT id FROM posts WHERE id = ?', row.id));
      await db.run('DROP TRIGGER block_admin_delete');
      await db.run('INSERT INTO bookmarks (user_id, post_id) VALUES (2, ?)', row.id);
      await db.run('INSERT INTO poll_options (post_id, position, label) VALUES (?, 0, ?)', row.id, 'Choice');
      const option = await db.get('SELECT id FROM poll_options WHERE post_id = ?', row.id);
      await db.run('INSERT INTO poll_votes (post_id, user_id, option_id) VALUES (?, 2, ?)', row.id, option.id);
      await db.run("INSERT INTO comments (post_id, user_id, content) VALUES (?, 2, 'A reply')", row.id);
      const removal = await call('DELETE', '/admin/threads/' + row.id, 1, { reason: 'Spam photo' });
      assert.equal(removal.status, 200);
      for (const table of ['comments', 'bookmarks', 'poll_options', 'poll_votes']) {
        assert.equal((await db.get('SELECT COUNT(*) c FROM ' + table + ' WHERE post_id = ?', row.id)).c, 0);
      }
      assert.equal((await call('GET', row.image_url, 1)).status, 404);
      assert.equal((await call('DELETE', '/admin/threads/' + row.id, 1, { reason: 'Repeated' })).status, 404);
      const action = await db.get("SELECT * FROM admin_actions WHERE action = 'remove_thread' AND target_id = ?", row.id);
      assert.equal(action.actor_id, 1); assert.equal(action.details, 'Spam photo');
      assert.equal((await db.get('SELECT COUNT(*) c FROM admin_actions WHERE action = ? AND target_id = ?', 'remove_thread', row.id)).c, 1);
      await call('PUT', '/settings', 2, { profile_visibility: 'public' });
    });
    await t.test('comment moderation removes a reply branch but preserves its thread', async () => {
      const parent = await call('POST', '/posts/' + thread.id + '/comments', 3, { content: 'Remove this branch' });
      await call('POST', '/posts/' + thread.id + '/comments', 2, { content: 'Nested child', parent_id: parent.data.comment.id });
      const parentId = parent.data.comment.id;
      assert.equal((await call('GET', '/admin/comments?q=Remove', 1)).data.comments[0].id, parentId);
      assert.equal((await call('DELETE', '/admin/comments/' + parentId, 3, { reason: 'Spam' })).status, 403);
      assert.equal((await call('DELETE', '/admin/comments/' + parentId, 1, { reason: 'Spam replies' })).status, 200);
      assert.equal(await db.get('SELECT id FROM comments WHERE parent_id = ?', parentId), null);
      assert.equal((await call('GET', '/posts/' + thread.id, 3)).data.post.commentCount, 1);
      assert.ok(await db.get('SELECT id FROM posts WHERE id = ?', thread.id));
      assert.equal((await call('DELETE', '/admin/comments/' + parentId, 1, { reason: 'Again' })).status, 404);
    });
    await t.test('administrator privileges do not expose unrelated direct messages or photos', async () => {
      const created = await call('POST', '/messages/3', 2, photoForm(null, 'Private DM'));
      const message = created.data.message;
      assert.equal((await call('GET', message.image_url, 1)).status, 404);
      const pairs = (await call('GET', '/messages/2', 1)).data.messages;
      assert.ok(pairs.every(item => item.sender_id === 1 || item.receiver_id === 1));
      assert.ok(!pairs.some(item => item.id === message.id));
    });
    await t.test('revoking the role blocks an already issued token on the next admin request', async () => {
      assert.equal((await call('GET', '/admin/history', 1)).status, 200);
      await db.run("UPDATE users SET role = 'member' WHERE id = 1");
      assert.equal((await call('GET', '/admin/history', 1)).status, 403);
      assert.equal((await call('PUT', '/admin/users/3/verification', 1, { verified: true })).status, 403);
      assert.equal((await call('DELETE', '/admin/threads/' + thread.id, 1, { reason: 'Forbidden' })).status, 403);
      assert.ok(await db.get('SELECT id FROM posts WHERE id = ?', thread.id));
      assert.equal((await call('GET', '/auth/me', 1)).data.user.role, 'member');
    });
  } finally {
    const photos = await db.all("SELECT image_url AS url, image_public_id AS publicId FROM messages WHERE image_url <> ''");
    for (const photo of photos) await require('../media').deleteImage(photo.url, photo.publicId, { privateImage: true });
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
