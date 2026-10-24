// Hospital directory, cities, origins and scenarios.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t, driver, admin, police;
before(async () => {
  t = await startTestApp();
  driver = await t.login('driver1');
  admin = await t.login('admin');
  police = await t.login('police_chennai');
});
after(() => t.stop());

test('directory requires login', async () => {
  assert.equal((await t.api('GET', '/api/cities')).status, 401);
  assert.equal((await t.api('GET', '/api/hospitals?city=chennai')).status, 401);
});

test('both cities are listed with their demo origins', async () => {
  const { status, body } = await t.api('GET', '/api/cities', { cookie: driver });
  assert.equal(status, 200);
  assert.deepEqual(body.cities.map((c) => c.id).sort(), ['chennai', 'trichy']);
  for (const c of body.cities) {
    assert.ok(c.demoOrigins.length >= 4);
    assert.ok(c.demoOrigins.every((o) => o.name.startsWith('DEMO LOCATION')));
  }
});

test('scenarios are labelled as simulated', async () => {
  const { body } = await t.api('GET', '/api/scenarios', { cookie: driver });
  assert.equal(body.label, 'SIMULATED DEMO DATA');
  assert.equal(body.scenarios.length, 7);
});

test('hospitals are sorted by simulated ETA from the selected origin', async () => {
  const { status, body } = await t.api('GET', '/api/hospitals?city=chennai&originId=ch-o1', { cookie: driver });
  assert.equal(status, 200);
  assert.equal(body.sortBasis, 'simulated_eta');
  assert.equal(body.hospitals.length, 6);
  assert.ok(body.hospitals.every((h) => h.cityId === 'chennai'));
  const etas = body.hospitals.map((h) => h.estimate.etaMin);
  assert.deepEqual(etas, [...etas].sort((a, b) => a - b));
  assert.match(body.hospitals[0].estimate.basis, /SIMULATED/);
  assert.ok(body.hospitals[0].straightLineKm > 0);
});

test('distances follow the selected origin, not a fixed city centre', async () => {
  const fromGuindy = await t.api('GET', '/api/hospitals/ch-h3?originId=ch-o1', { cookie: driver });
  const fromAnnaNagar = await t.api('GET', '/api/hospitals/ch-h3?originId=ch-o3', { cookie: driver });
  assert.ok(fromGuindy.body.hospital.straightLineKm < fromAnnaNagar.body.hospital.straightLineKm);
});

test('custom demo point inside the city works; outside is rejected', async () => {
  const inside = await t.api('GET', '/api/hospitals?city=trichy&lat=10.81&lng=78.69', { cookie: driver });
  assert.equal(inside.status, 200);
  assert.match(inside.body.origin.label, /DEMO LOCATION/);
  const outside = await t.api('GET', '/api/hospitals?city=trichy&lat=13.05&lng=80.23', { cookie: driver });
  assert.equal(outside.status, 400);
  assert.equal(outside.body.error.code, 'invalid_origin');
});

test('origin from another city is rejected', async () => {
  const res = await t.api('GET', '/api/hospitals?city=trichy&originId=ch-o1', { cookie: driver });
  assert.equal(res.status, 400);
});

test('without route data the list falls back to labelled straight-line distance', async () => {
  const { body } = await t.api('GET', '/api/hospitals?city=chennai&originId=ch-o2&scenario=data_unavailable', { cookie: driver });
  assert.equal(body.sortBasis, 'straight_line_distance');
  assert.match(body.sortNote, /STRAIGHT-LINE/);
  assert.ok(body.hospitals.every((h) => h.estimate === null));
  const km = body.hospitals.map((h) => h.straightLineKm);
  assert.deepEqual(km, [...km].sort((a, b) => a - b));
});

test('no origin selected: sorted by name, no distances invented', async () => {
  const { body } = await t.api('GET', '/api/hospitals?city=chennai', { cookie: driver });
  assert.equal(body.sortBasis, 'name');
  assert.equal(body.hospitals[0].straightLineKm, undefined);
});

test('search filters by name', async () => {
  const { body } = await t.api('GET', '/api/hospitals?city=chennai&q=lakeview', { cookie: driver });
  assert.equal(body.hospitals.length, 1);
  assert.equal(body.hospitals[0].id, 'ch-h3');
});

test('invalid city and unknown hospital are reported', async () => {
  assert.equal((await t.api('GET', '/api/hospitals?city=mumbai', { cookie: driver })).status, 400);
  assert.equal((await t.api('GET', '/api/hospitals/zz-h9', { cookie: driver })).status, 404);
});

test('seed data never claims availability or a callable number', async () => {
  const { body } = await t.api('GET', '/api/hospitals?city=trichy', { cookie: driver });
  for (const h of body.hospitals) {
    assert.equal(h.availability.status, 'not_connected');
    assert.equal(h.availability.label, 'Availability Not Connected');
    assert.equal(h.callable, false);
  }
});

test('only admin can edit hospitals', async () => {
  assert.equal((await t.api('PATCH', '/api/hospitals/ch-h1', { cookie: driver, body: { name: 'X' } })).status, 403);
  assert.equal((await t.api('PATCH', '/api/hospitals/ch-h1', { cookie: police, body: { name: 'X' } })).status, 403);
});

test('a demo placeholder number cannot be marked verified', async () => {
  const res = await t.api('PATCH', '/api/hospitals/ch-h1', { cookie: admin, body: { phone_status: 'verified' } });
  assert.equal(res.status, 400);
});

test('confirming availability requires a source and records a timestamp', async () => {
  const missing = await t.api('PATCH', '/api/hospitals/ch-h2', { cookie: admin, body: { availability_status: 'confirmed_by_authorized_source' } });
  assert.equal(missing.status, 400);

  const ok = await t.api('PATCH', '/api/hospitals/ch-h2', {
    cookie: admin,
    body: { availability_status: 'confirmed_by_authorized_source', availability_source: 'Demo admin phone check (fictional)' },
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.hospital.availability.confirmedAt);
});

test('admin edits are shared: the driver sees the change and it is audited', async () => {
  const res = await t.api('PATCH', '/api/hospitals/tr-h4', { cookie: admin, body: { emergency_capability: 'verified', phone: '+91 431 555 0000', phone_status: 'verified' } });
  assert.equal(res.status, 200);

  const seen = await t.api('GET', '/api/hospitals/tr-h4', { cookie: driver });
  assert.equal(seen.body.hospital.emergencyCapabilityLabel, 'Emergency Capability Verified');
  assert.equal(seen.body.hospital.verifiedBy, 'Demo Hospital Directory Admin');
  assert.equal(seen.body.hospital.callable, true);

  const audit = t.db.prepare("SELECT * FROM audit_log WHERE entity_id = 'tr-h4'").all();
  assert.equal(audit.length, 1);
});

test('admin can read a hospital change history; others cannot', async () => {
  const res = await t.api('GET', '/api/hospitals/tr-h4/audit', { cookie: admin });
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  assert.equal(res.body.entries[0].by, 'Demo Hospital Directory Admin');
  const fields = res.body.entries[0].changes.map((c) => c.field);
  assert.ok(fields.includes('emergency_capability') && fields.includes('phone_status'));
  assert.equal((await t.api('GET', '/api/hospitals/tr-h4/audit', { cookie: driver })).status, 403);
  assert.equal((await t.api('GET', '/api/hospitals/zz-h9/audit', { cookie: admin })).status, 404);
});
