// Login tests. Each run uses a fresh in-memory database, so no files are touched.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, PASSWORD } = require('./helpers');

let t;
before(async () => { t = await startTestApp(); });
after(() => t.stop());

const login = (username, password) => t.api('POST', '/api/auth/login', { body: { username, password } });
const cookieFrom = (res) => res.headers.get('set-cookie').split(';')[0];

test('health endpoint reports demonstration mode', async () => {
  const res = await t.api('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.match(res.body.mode, /DEMONSTRATION/);
});

test('driver can log in and is identified as a driver', async () => {
  const res = await login('driver1', PASSWORD);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'driver');
  assert.match(res.headers.get('set-cookie'), /HttpOnly/);

  const me = await t.api('GET', '/api/auth/me', { cookie: cookieFrom(res) });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'driver1');
});

test('police user logs in with their city', async () => {
  const res = await login('police_chennai', PASSWORD);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'police');
  assert.equal(res.body.user.cityId, 'chennai');
});

test('wrong password and unknown user are rejected', async () => {
  assert.equal((await login('driver1', 'wrong')).status, 401);
  assert.equal((await login('nobody', PASSWORD)).status, 401);
});

test('missing fields and invalid JSON return 400', async () => {
  assert.equal((await login('', '')).status, 400);
  const res = await fetch(`${t.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  assert.equal(res.status, 400);
});

test('/me without a session returns 401', async () => {
  assert.equal((await t.api('GET', '/api/auth/me')).status, 401);
});

test('logout ends the session', async () => {
  const cookie = await t.login('driver1');
  assert.equal((await t.api('POST', '/api/auth/logout', { cookie })).status, 200);
  assert.equal((await t.api('GET', '/api/auth/me', { cookie })).status, 401);
});

test('unknown API path returns JSON 404', async () => {
  const res = await t.api('GET', '/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'not_found');
});
