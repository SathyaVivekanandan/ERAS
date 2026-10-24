// Trips: destination selection, route comparison, scenarios and trip start.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t, driver1, driver2, police;
before(async () => {
  t = await startTestApp();
  driver1 = await t.login('driver1');
  driver2 = await t.login('driver2');
  police = await t.login('police_chennai');
});
after(() => t.stop());

const plan = (cookie, body) => t.api('POST', '/api/trips', { cookie, body: { cityId: 'chennai', originId: 'ch-o1', hospitalId: 'ch-h1', ...body } });
const setScenario = (cookie, id, scenarioCode) => t.api('PATCH', `/api/trips/${id}/scenario`, { cookie, body: { scenarioCode } });
const selectRoute = (cookie, id, routeKey) => t.api('POST', `/api/trips/${id}/select-route`, { cookie, body: { routeKey } });
const routeByKey = (trip, key) => trip.routes.find((r) => r.key === key);

test('only drivers can use trips', async () => {
  assert.equal((await plan(police, {})).status, 403);
  assert.equal((await t.api('GET', '/api/trips/current')).status, 401);
});

test('missing origin or destination is rejected', async () => {
  const noOrigin = await plan(driver1, { originId: undefined });
  assert.equal(noOrigin.status, 400);
  assert.equal(noOrigin.body.error.code, 'missing_origin');
  const noDest = await plan(driver1, { hospitalId: undefined });
  assert.equal(noDest.status, 400);
  assert.equal(noDest.body.error.code, 'missing_destination');
  const wrongCity = await plan(driver1, { hospitalId: 'tr-h1' });
  assert.equal(wrongCity.status, 400);
  assert.equal(wrongCity.body.error.code, 'invalid_destination');
});

test('normal traffic: three ranked simulated routes, no assistance recommended', async () => {
  const { status, body } = await plan(driver1, { scenarioCode: 'normal' });
  assert.equal(status, 201);
  const trip = body.trip;
  assert.equal(trip.status, 'planned');
  assert.equal(trip.routes.length, 3);
  assert.deepEqual(trip.routes.map((r) => r.rank), [1, 2, 3]);
  const etas = trip.routes.map((r) => r.etaMin);
  assert.deepEqual(etas, [...etas].sort((a, b) => a - b));
  assert.ok(trip.routes.every((r) => r.geometry.length > 2 && r.suitable));
  assert.match(trip.data.source, /SIMULATED/);
  assert.equal(trip.scenario.label, 'SIMULATED DEMO DATA');
  assert.equal(trip.assistanceCheck.eligible, false);
  assert.equal(trip.selectedRouteKey, null, 'route is not auto-selected');
});

test('moderate congestion: alternative shown, assistance not recommended', async () => {
  const trip = (await plan(driver1, { scenarioCode: 'moderate_alt' })).body.trip;
  assert.equal(routeByKey(trip, 'A').congestion, 'moderate');
  assert.equal(trip.recommendedKey, 'B');
  assert.equal(trip.assistanceCheck.eligible, false);
  assert.match(trip.assistanceCheck.summary, /suitable route is available/);
});

test('road blockage with alternative: blocked route cannot be selected', async () => {
  const trip = (await plan(driver1, { scenarioCode: 'blockage_alt' })).body.trip;
  assert.equal(routeByKey(trip, 'A').blocked, true);
  assert.equal(routeByKey(trip, 'A').etaMin, null);
  assert.equal(trip.assistanceCheck.eligible, false);
  const res = await selectRoute(driver1, trip.id, 'A');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'route_blocked');
});

test('severe congestion with no alternative: assistance recommended, every check explained', async () => {
  const trip = (await plan(driver1, { scenarioCode: 'severe_no_alt' })).body.trip;
  assert.equal(trip.recommendedKey, null);
  assert.ok(trip.routes.every((r) => !r.suitable && r.rejectionReason));
  assert.equal(trip.assistanceCheck.eligible, true);
  assert.ok(trip.assistanceCheck.checks.every((c) => c.passed));
});

test('blockage with no alternative: assistance recommended', async () => {
  const trip = (await plan(driver1, { scenarioCode: 'blockage_no_alt' })).body.trip;
  assert.equal(trip.assistanceCheck.eligible, true);
});

test('routing data unavailable: no routes, warning, no recommendation, cannot start', async () => {
  const trip = (await plan(driver1, { scenarioCode: 'data_unavailable' })).body.trip;
  assert.equal(trip.data.status, 'unavailable');
  assert.equal(trip.routes.length, 0);
  assert.match(trip.data.warnings[0], /unavailable/);
  assert.equal(trip.assistanceCheck.eligible, false);
  const start = await t.api('POST', `/api/trips/${trip.id}/start`, { cookie: driver1, body: { confirm: true } });
  assert.equal(start.body.error.code, 'route_required');
});

test('stale data: severe congestion shown but no assistance recommendation', async () => {
  const trip = (await plan(driver1, { scenarioCode: 'stale_data' })).body.trip;
  assert.equal(trip.data.status, 'stale');
  assert.match(trip.data.warnings[0], /stale/);
  assert.equal(trip.assistanceCheck.eligible, false);
  assert.equal(trip.assistanceCheck.checks.find((c) => c.id === 'data_usable').passed, false);
});

test('choosing a new destination replaces the unstarted plan', async () => {
  const first = (await plan(driver1, {})).body.trip;
  const second = (await plan(driver1, { hospitalId: 'ch-h3' })).body.trip;
  assert.equal((await t.api('GET', `/api/trips/${first.id}`, { cookie: driver1 })).body.trip.status, 'cancelled');
  assert.equal((await t.api('GET', '/api/trips/current', { cookie: driver1 })).body.trip.id, second.id);
});

test('start requires a selected route and explicit confirmation', async () => {
  const trip = (await plan(driver1, { scenarioCode: 'severe_no_alt' })).body.trip;
  const start = (body) => t.api('POST', `/api/trips/${trip.id}/start`, { cookie: driver1, body });

  assert.equal((await start({ confirm: true })).body.error.code, 'route_required');
  assert.equal((await selectRoute(driver1, trip.id, 'A')).status, 200);
  assert.equal((await start({})).body.error.code, 'confirmation_required');

  const ok = await start({ confirm: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.trip.status, 'active');
  assert.ok(ok.body.trip.startedAt);
  assert.equal(ok.body.trip.selectedRoute.key, 'A');
  assert.equal((await start({ confirm: true })).status, 409, 'cannot start twice');
});

test('a new plan is refused while a trip is active', async () => {
  const res = await plan(driver1, {});
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'active_trip_exists');
});

test('switching scenario recomputes routes and drops a selection that became blocked', async () => {
  const current = (await t.api('GET', '/api/trips/current', { cookie: driver1 })).body.trip;
  assert.equal(current.selectedRouteKey, 'A');

  const blocked = (await setScenario(driver1, current.id, 'blockage_alt')).body.trip;
  assert.equal(blocked.selectedRouteKey, null);
  assert.ok(blocked.data.warnings.some((w) => /no longer usable/.test(w)));
  assert.equal(blocked.recommendedKey, 'B');

  const normal = (await setScenario(driver1, current.id, 'normal')).body.trip;
  assert.ok(normal.routes.every((r) => r.congestion === 'none'));
  assert.equal((await setScenario(driver1, current.id, 'nonsense')).status, 400);
});

test('another driver cannot see or change the trip', async () => {
  const current = (await t.api('GET', '/api/trips/current', { cookie: driver1 })).body.trip;
  assert.equal((await t.api('GET', `/api/trips/${current.id}`, { cookie: driver2 })).status, 404);
  assert.equal((await selectRoute(driver2, current.id, 'B')).status, 404);
});

test('trip state survives a reload (stored in the database)', async () => {
  const current = (await t.api('GET', '/api/trips/current', { cookie: driver1 })).body.trip;
  const row = t.db.prepare('SELECT status, scenario_code FROM trips WHERE id = ?').get(current.id);
  assert.equal(row.status, 'active');
  assert.equal(row.scenario_code, 'normal');
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM trip_routes WHERE trip_id = ?').get(current.id).n, 3);
});

test('completing a trip ends it; completed trips cannot be changed', async () => {
  const current = (await t.api('GET', '/api/trips/current', { cookie: driver1 })).body.trip;
  const done = await t.api('POST', `/api/trips/${current.id}/complete`, { cookie: driver1 });
  assert.equal(done.body.trip.status, 'completed');
  assert.equal((await selectRoute(driver1, current.id, 'B')).status, 409);
  assert.equal((await t.api('GET', '/api/trips/current', { cookie: driver1 })).body.trip, null);
});
