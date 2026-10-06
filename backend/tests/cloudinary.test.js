const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Writable } = require('node:stream');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');

test('Cloudinary uses authenticated assets and does not expose delivery signatures', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'connectly-cloud-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', TURSO_DATABASE_URL: 'file:' + path.join(directory, 'test.db'), TURSO_AUTH_TOKEN: '',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'), CORS_ORIGIN: 'http://localhost:5173',
    CLOUDINARY_CLOUD_NAME: 'connectly-test-only', CLOUDINARY_API_KEY: 'test-only',
    CLOUDINARY_API_SECRET: 'test-only-never-a-real-secret'
  });
  const cloudinary = require('cloudinary').v2;
  const assets = new Map();
  const uploads = [];
  const renames = [];
  const deleted = [];
  cloudinary.uploader.upload_stream = (options, callback) => {
    uploads.push(options);
    const chunks = [];
    return new Writable({
      write(chunk, encoding, done) { chunks.push(chunk); done(); },
      final(done) {
        const id = options.folder + '/' + crypto.randomUUID();
        assets.set(id, { bytes: Buffer.concat(chunks), type: options.type });
        callback(null, { secure_url: 'https://res.cloudinary.com/connectly-test-only/image/' + options.type + '/v123/' + id + '.webp', public_id: id });
        done();
      }
    });
  };
  cloudinary.uploader.rename = async (from, to, options) => {
    renames.push({ from, to, options });
    const asset = assets.get(from);
    assert.ok(asset);
    asset.type = options.to_type;
    assets.set(to, asset);
    return { public_id: to, secure_url: 'https://res.cloudinary.com/connectly-test-only/image/authenticated/v123/' + to + '.' + (asset.format || 'webp') };
  };
  cloudinary.uploader.destroy = async (id, options) => {
    deleted.push({ id, options });
    if (assets.get(id)?.type === options.type) assets.delete(id);
    return { result: 'ok' };
  };
  const nativeFetch = global.fetch;
  let deliveries = 0;
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://res.cloudinary.com/')) {
      deliveries++;
      const pathname = new URL(url).pathname;
      assert.ok(pathname.includes('/image/authenticated/s--'));
      const id = decodeURIComponent(pathname.match(/\/v\d+\/(.+)\.(webp|png|jpe?g)$/)[1]);
      const asset = assets.get(id);
      assert.ok(asset);
      assert.equal(asset.type, 'authenticated');
      return new Response(asset.bytes, { status: 200, headers: { 'Content-Type': 'image/webp' } });
    }
    return nativeFetch(url, options);
  };
  const db = require('../db');
  await db.init();
  for (const username of ['sender', 'receiver', 'other']) {
    await db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', username, username + '@example.com', 'unused-test-hash');
  }
  const tokens = [null, ...[1, 2, 3].map(id => jwt.sign({ userId: id, tokenVersion: 0 }, process.env.JWT_SECRET))];
  const server = require('../server').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function request(method, route, id, body) {
    const headers = { Authorization: 'Bearer ' + tokens[id] };
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    return fetch(origin + '/api' + route, { method, headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  }
  const png = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#3a6a8a' } }).png().toBuffer();
  function form() {
    const body = new FormData();
    body.append('image', new Blob([png], { type: 'image/png' }), 'photo.png');
    return body;
  }
  try {
    const response = await request('POST', '/messages/2', 1, form());
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(uploads[0].type, 'authenticated');
    assert.equal(uploads[0].folder, 'connectly/messages');
    assert.ok(!JSON.stringify(data).includes('res.cloudinary.com'));
    assert.ok(!JSON.stringify(data).includes('public_id'));
    assert.equal((await request('GET', data.message.image_url, 3)).status, 404);
    assert.equal(deliveries, 0);
    assert.equal((await request('GET', data.message.image_url, 2)).status, 200);
    assert.equal(deliveries, 1);
    const media = require('../media');
    const older = await media.saveImage(png);
    await db.run('INSERT INTO posts (user_id, content, image_url, image_public_id) VALUES (?, ?, ?, ?)', 1, 'Older photo', older.url, older.publicId);
    assets.set('connectly/old-png', { bytes: png, type: 'upload', format: 'png' });
    await db.run('INSERT INTO posts (user_id, content, image_url, image_public_id) VALUES (?, ?, ?, ?)',
      1, 'Older PNG', 'https://res.cloudinary.com/connectly-test-only/image/upload/v123/connectly/old-png.png', 'connectly/old-png');
    assert.equal((await request('PUT', '/settings', 1, { profile_visibility: 'private' })).status, 200);
    assert.equal(renames[0].from, older.publicId);
    assert.equal(renames[0].to, older.publicId);
    assert.equal(renames[0].options.type, 'upload');
    assert.equal(renames[0].options.to_type, 'authenticated');
    assert.equal(renames[0].options.invalidate, true);
    assert.equal(assets.get(older.publicId).type, 'authenticated');
    assert.equal((await request('GET', '/posts/1/image', 2)).status, 404);
    assert.equal((await request('GET', '/posts/1/image', 1)).status, 200);
    const legacyPng = await request('GET', '/posts/2/image', 1);
    assert.equal(legacyPng.status, 200);
    assert.equal((await sharp(Buffer.from(await legacyPng.arrayBuffer())).metadata()).format, 'webp');
    assert.equal((await request('DELETE', '/posts/1', 1)).status, 200);
    assert.equal(deleted.at(-1).options.type, 'authenticated');
    assert.equal(assets.has(older.publicId), false);
    await db.run("UPDATE users SET role = 'admin' WHERE id = 3");
    assert.equal((await request('GET', '/messages/' + data.message.id + '/image', 3)).status, 404);
    assert.equal((await request('GET', '/admin/threads/2/image', 3)).status, 200);
    const moderated = await request('DELETE', '/admin/threads/2', 3, { reason: 'Test moderation' });
    assert.equal(moderated.status, 200);
    assert.equal(deleted.at(-1).id, 'connectly/old-png');
    assert.equal(deleted.at(-1).options.type, 'authenticated');
    assert.equal(deleted.at(-1).options.invalidate, true);
    assert.equal(assets.has('connectly/old-png'), false);
    const beforeFailure = assets.size;
    const originalRun = db.run;
    db.run = async (sql, ...args) => {
      if (sql.startsWith('INSERT INTO messages')) throw new Error('Simulated database outage');
      return originalRun(sql, ...args);
    };
    const failed = await request('POST', '/messages/2', 1, form());
    db.run = originalRun;
    assert.equal(failed.status, 500);
    assert.equal((await failed.json()).error, 'Server error');
    assert.equal(assets.size, beforeFailure);
    assert.equal(deleted.at(-1).options.type, 'authenticated');
  } finally {
    global.fetch = nativeFetch;
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
