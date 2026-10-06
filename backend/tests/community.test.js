const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');

test('polls and private saved threads', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'connectly-community-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', TURSO_DATABASE_URL: 'file:' + path.join(temporary, 'test.db'),
    TURSO_AUTH_TOKEN: '', JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    CORS_ORIGIN: 'http://localhost:5173'
  });
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) process.env[key] = '';
  const db = require('../db');
  await db.init();
  for (const name of ['alice', 'bob', 'carol']) {
    await db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', name, name + '@example.com', 'unused-test-hash');
  }
  const tokens = {};
  for (const [index, name] of ['alice', 'bob', 'carol'].entries()) {
    tokens[name] = jwt.sign({ userId: index + 1, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }
  const legacy = await db.run("INSERT INTO posts (user_id, content) VALUES (1, 'Existing thread')");
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function call(method, route, who, body) {
    const headers = who ? { Authorization: 'Bearer ' + tokens[who] } : {};
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + '/api' + route, {
      method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
    });
    const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null;
    return { response, status: response.status, data };
  }
  let poll;
  try {
    await t.test('migration is repeatable and keeps old threads', async () => {
      await db.init();
      const post = (await call('GET', '/posts/' + legacy.lastInsertRowid, 'alice')).data.post;
      assert.equal(post.content, 'Existing thread');
      assert.equal(post.poll, null);
      assert.equal(post.savedByMe, false);
      for (const name of ['bookmarks', 'poll_options', 'poll_votes']) {
        assert.ok(await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name));
      }
    });
    await t.test('polls validate the question and every option before inserting', async () => {
      const before = (await db.get('SELECT COUNT(*) c FROM posts')).c;
      const invalid = [
        { title: '', content: 'Text', pollOptions: ['A', 'B'] },
        { title: 'Question', pollOptions: 'not-json' },
        { title: 'Question', pollOptions: null },
        { title: 'Question', pollOptions: ['Only one'] },
        { title: 'Question', pollOptions: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
        { title: 'Question', pollOptions: ['A', ' '] },
        { title: 'Question', pollOptions: ['A', ' a '] },
        { title: 'Question', pollOptions: ['A', 42] },
        { title: 'Question', pollOptions: ['A', 'x'.repeat(81)] }
      ];
      for (const body of invalid) {
        assert.equal((await call('POST', '/posts', 'alice', body)).status, 400, JSON.stringify(body));
      }
      assert.equal((await db.get('SELECT COUNT(*) c FROM posts')).c, before);
      const created = await call('POST', '/posts', 'alice', { title: '  Weekend plan?  ', content: 'Pick one.', pollOptions: [' Outside ', 'Inside'] });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      poll = created.data.post;
      assert.equal(poll.title, 'Weekend plan?');
      assert.deepEqual(poll.poll.options.map(option => option.label), ['Outside', 'Inside']);
      assert.equal(poll.poll.totalVotes, 0);
      assert.equal(poll.poll.myVote, null);
      assert.equal(poll.savedByMe, false);
    });
    await t.test('a failed option insertion rolls back the whole poll', async () => {
      const before = (await db.get('SELECT COUNT(*) c FROM posts')).c;
      const options = (await db.get('SELECT COUNT(*) c FROM poll_options')).c;
      await assert.rejects(db.createPollPost(1, 'Must roll back', '', { url: '', publicId: '' }, ['Valid first', null]));
      assert.equal((await db.get('SELECT COUNT(*) c FROM posts')).c, before);
      assert.equal((await db.get('SELECT COUNT(*) c FROM poll_options')).c, options);
    });
    await t.test('one vote per account can change or be removed without leaking identities', async () => {
      const [outside, inside] = poll.poll.options;
      assert.equal((await call('POST', '/posts/' + poll.id + '/vote', null, { option_id: outside.id })).status, 401);
      for (const option_id of [0, -1, '1', 1.1, null, 99999]) {
        assert.equal((await call('POST', '/posts/' + poll.id + '/vote', 'bob', { option_id })).status, 400);
      }
      assert.equal((await call('POST', '/posts/' + legacy.lastInsertRowid + '/vote', 'bob', { option_id: outside.id })).status, 400);
      await Promise.all(Array.from({ length: 3 }, () => call('POST', '/posts/' + poll.id + '/vote', 'bob', { option_id: outside.id })));
      let result = await call('GET', '/posts/' + poll.id, 'bob');
      assert.equal(result.data.post.poll.totalVotes, 1);
      assert.equal(result.data.post.poll.myVote, outside.id);
      assert.equal((await db.get('SELECT COUNT(*) c FROM poll_votes WHERE user_id = 2')).c, 1);
      result = await call('POST', '/posts/' + poll.id + '/vote', 'bob', { option_id: inside.id });
      assert.deepEqual(result.data.poll.options.map(option => option.votes), [0, 1]);
      assert.equal(result.data.poll.myVote, inside.id);
      await call('POST', '/posts/' + poll.id + '/vote', 'alice', { option_id: outside.id });
      result = await call('GET', '/posts/' + poll.id, 'carol');
      assert.equal(result.data.post.poll.totalVotes, 2);
      assert.equal(result.data.post.poll.myVote, null);
      assert.deepEqual(Object.keys(result.data.post.poll).sort(), ['myVote', 'options', 'totalVotes']);
      assert.deepEqual(Object.keys(result.data.post.poll.options[0]).sort(), ['id', 'label', 'votes']);
      const removed = await call('DELETE', '/posts/' + poll.id + '/vote', 'bob');
      assert.equal(removed.data.poll.totalVotes, 1);
      assert.equal(removed.data.poll.myVote, null);
      assert.equal((await call('DELETE', '/posts/' + poll.id + '/vote', 'bob')).data.poll.totalVotes, 1);
      await call('POST', '/posts/' + poll.id + '/vote', 'bob', { option_id: inside.id });
    });
    await t.test('saved threads and flags are private to each member and survive reload', async () => {
      assert.equal((await call('GET', '/posts/saved', null)).status, 401);
      await call('POST', '/posts/' + poll.id + '/bookmark', 'bob');
      await call('POST', '/posts/' + poll.id + '/bookmark', 'bob');
      assert.equal((await db.get('SELECT COUNT(*) c FROM bookmarks')).c, 1);
      assert.equal((await call('GET', '/posts/saved', 'bob')).data.posts[0].id, poll.id);
      assert.equal((await call('GET', '/posts/saved', 'alice')).data.posts.length, 0);
      assert.equal((await call('GET', '/posts/saved', 'carol')).data.posts.length, 0);
      assert.equal((await call('GET', '/posts/' + poll.id, 'bob')).data.post.savedByMe, true);
      assert.equal((await call('GET', '/posts/' + poll.id, 'alice')).data.post.savedByMe, false);
      const explore = (await call('GET', '/posts/explore', 'bob')).data.posts.find(post => post.id === poll.id);
      assert.equal(explore.savedByMe, true);
      await call('POST', '/users/1/follow', 'bob');
      assert.equal((await call('GET', '/posts/feed', 'bob')).data.posts.find(post => post.id === poll.id).savedByMe, true);
      assert.equal((await call('GET', '/posts/user/1', 'bob')).data.posts.find(post => post.id === poll.id).poll.myVote, poll.poll.options[1].id);
      const exported = (await call('GET', '/settings/export', 'bob')).data;
      assert.equal(exported.bookmarks[0].post_id, poll.id);
      assert.equal(exported.pollVotes.length, 1);
      assert.equal(exported.pollVotes[0].option_id, poll.poll.options[1].id);
      assert.equal(exported.pollVotes[0].user_id, undefined);
      assert.equal((await call('GET', '/settings/export', 'carol')).data.bookmarks.length, 0);
      assert.equal((await call('GET', '/settings/export', 'carol')).data.pollVotes.length, 0);
    });
    await t.test('saved private posts remain subject to follow approval and cannot be voted on without access', async () => {
      await call('PUT', '/settings', 'alice', { profile_visibility: 'private' });
      assert.equal((await call('GET', '/posts/saved', 'bob')).data.posts.length, 1);
      await call('DELETE', '/users/1/follow', 'bob');
      assert.equal((await call('GET', '/posts/saved', 'bob')).data.posts.length, 0);
      assert.equal((await call('GET', '/posts/' + poll.id, 'bob')).status, 404);
      assert.equal((await call('POST', '/posts/' + poll.id + '/vote', 'bob', { option_id: poll.poll.options[0].id })).status, 404);
      assert.equal((await call('DELETE', '/posts/' + poll.id + '/vote', 'bob')).status, 404);
      assert.equal((await call('POST', '/posts/' + poll.id + '/bookmark', 'carol')).status, 404);
      await call('POST', '/users/1/follow', 'bob');
      assert.equal((await call('GET', '/posts/saved', 'bob')).data.posts.length, 0);
      await call('POST', '/users/2/follow-request', 'alice', { decision: 'accept' });
      assert.equal((await call('GET', '/posts/saved', 'bob')).data.posts.length, 1);
      await call('DELETE', '/users/1/follow', 'bob');
      assert.equal((await call('DELETE', '/posts/' + poll.id + '/bookmark', 'bob')).status, 200);
      assert.equal(await db.get('SELECT post_id FROM bookmarks WHERE user_id = 2'), null);
      await call('PUT', '/settings', 'alice', { profile_visibility: 'public' });
      await call('POST', '/posts/' + poll.id + '/bookmark', 'bob');
    });
    await t.test('polls can include a validated protected photo and six choices', async () => {
      const bytes = await sharp({ create: { width: 40, height: 24, channels: 3, background: '#d5fa45' } }).png().toBuffer();
      const form = new FormData();
      form.append('title', 'Choose a color');
      form.append('content', 'Photo and a poll together.');
      form.append('pollOptions', JSON.stringify(['One', 'Two', 'Three', 'Four', 'Five', 'Six']));
      form.append('image', new Blob([bytes], { type: 'image/png' }), 'color.png');
      const created = await call('POST', '/posts', 'alice', form);
      assert.equal(created.status, 201, JSON.stringify(created.data));
      const photo = created.data.post;
      assert.equal(photo.poll.options.length, 6);
      assert.equal(photo.image_private, true);
      const image = await call('GET', photo.image_url, 'bob');
      assert.equal(image.status, 200);
      assert.equal((await sharp(Buffer.from(await image.response.arrayBuffer())).metadata()).format, 'webp');
      assert.equal((await call('POST', '/posts/' + poll.id + '/vote', 'bob', { option_id: photo.poll.options[0].id })).status, 400);
      await call('DELETE', '/posts/' + photo.id, 'alice');
      assert.equal((await call('GET', photo.image_url, 'bob')).status, 404);
    });
    await t.test('deleting a poll cascades to options, votes and bookmarks', async () => {
      const deleted = await call('DELETE', '/posts/' + poll.id, 'alice');
      assert.equal(deleted.status, 200);
      for (const table of ['poll_options', 'poll_votes', 'bookmarks']) {
        assert.equal((await db.get('SELECT COUNT(*) c FROM ' + table + ' WHERE post_id = ?', poll.id)).c, 0);
      }
      assert.equal((await call('GET', '/posts/saved', 'bob')).data.posts.length, 0);
      assert.equal((await call('POST', '/posts/' + poll.id + '/vote', 'bob', { option_id: poll.poll.options[0].id })).status, 404);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
