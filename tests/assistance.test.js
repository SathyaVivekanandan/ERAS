// The core connected workflow: driver requests assistance -> police notified -> police updates -> driver sees it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

let t, driver1, driver2, policeChennai, policeTrichy, admin;
before(async () => {
  t = await startTestApp();
  [driver1, driver2, policeChennai, policeTrichy, admin] = await Promise.all(
    ['driver1', 'driver2', 'police_chennai', 'police_trichy', 'admin'].map((u) => t.login(u)),
  );
});
after(() => t.stop());

let keyCounter = 0;
const newKey = () => `test-key-${Date.now()}-${++keyCounter}`;

// Plans and starts a trip under the given scenario; returns the trip.
async function activeTrip(cookie, scenarioCode, { cityId = 'chennai', originId = 'ch-o1', hospitalId = 'ch-h1', routeKey = 'A' } = {}) {
  const trip = (await t.api('POST', '/api/trips', { cookie, body: { cityId, originId, hospitalId, scenarioCode } })).body.trip;
  if (routeKey) assert.equal((await t.api('POST', `/api/trips/${trip.id}/select-route`, { cookie, body: { routeKey } })).status, 200);
  const started = await t.api('POST', `/api/trips/${trip.id}/start`, { cookie, body: { confirm: true } });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  return started.body.trip;
}
const finish = (cookie, trip) => t.api('POST', `/api/trips/${trip.id}/cancel`, { cookie });
const requestAssist = (cookie, tripId, body = {}) =>
  t.api('POST', '/api/assistance', { cookie, body: { tripId, clientRequestId: newKey(), confirm: true, ...body } });
const setStatus = (cookie, id, status, note) => t.api('POST', `/api/assistance/${id}/status`, { cookie, body: { status, note } });

test('no request when a suitable alternative exists (moderate congestion)', async () => {
  const trip = await activeTrip(driver1, 'moderate_alt', { routeKey: 'B' });
  const res = await requestAssist(driver1, trip.id);
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'not_eligible');
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM assistance_requests').get().n, 0);
  await finish(driver1, trip);
});

test('no request with stale or unavailable data', async () => {
  const stale = await activeTrip(driver1, 'stale_data');
  assert.equal((await requestAssist(driver1, stale.id)).status, 422);
  await finish(driver1, stale);

  // Fresh severe data that has aged past the stale limit is also refused until refreshed.
  const aged = await activeTrip(driver1, 'severe_no_alt');
  t.db.prepare('UPDATE trips SET data_freshness_at = ? WHERE id = ?').run(new Date(Date.now() - 60 * 60000).toISOString(), aged.id);
  const res = await requestAssist(driver1, aged.id);
  assert.equal(res.status, 422);
  assert.equal(res.body.error.assessment.checks.find((c) => c.id === 'data_usable').passed, false);
  await finish(driver1, aged);
});

test('request requires confirmation, a request key and an active trip', async () => {
  const planned = (await t.api('POST', '/api/trips', { cookie: driver1, body: { cityId: 'chennai', originId: 'ch-o1', hospitalId: 'ch-h1', scenarioCode: 'severe_no_alt' } })).body.trip;
  assert.equal((await requestAssist(driver1, planned.id, { confirm: false })).body.error.code, 'confirmation_required');
  assert.equal((await requestAssist(driver1, planned.id, { clientRequestId: 'x' })).body.error.code, 'invalid_client_request_id');
  assert.equal((await requestAssist(driver1, planned.id)).body.error.code, 'trip_not_active');
  assert.equal((await requestAssist(driver2, planned.id)).status, 404, 'cannot request on another driver\'s trip');
  assert.equal((await requestAssist(policeChennai, planned.id)).status, 403);
  await finish(driver1, planned);
});

test('FULL WORKFLOW: severe congestion -> request -> live police notification -> status updates -> driver sees Solved', async () => {
  const policeStream = await t.openEvents(policeChennai);
  const trichyStream = await t.openEvents(policeTrichy);
  const driverStream = await t.openEvents(driver1);
  assert.equal(policeStream.status, 200);

  const trip = await activeTrip(driver1, 'severe_no_alt');
  assert.equal(trip.assistanceCheck.eligible, true);

  // 1. Driver confirms the request.
  const created = await requestAssist(driver1, trip.id);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const req = created.body.request;
  assert.match(req.id, /^AR-\d{8}-[0-9A-F]{6}$/);
  assert.equal(req.status, 'new');
  assert.equal(req.statusLabel, 'New');
  assert.equal(req.hospital.id, 'ch-h1');
  assert.equal(req.route.key, 'A');
  assert.equal(req.congestionSeverity, 'severe');
  assert.equal(req.routesConsidered.length, 3);
  assert.ok(req.routesConsidered.every((r) => r.rejectionReason));
  assert.match(req.timing.etaBasis, /SIMULATED/);
  assert.ok(req.timing.minutesRemaining > 0);
  assert.match(req.disclaimer, /No real police officer has been contacted/);
  assert.equal(created.body.delivery.status, 'pushed_live');
  assert.equal(created.body.delivery.liveDashboards, 1, 'only the Chennai police dashboard is notified');

  // 2. Police dashboard receives it live; Trichy police does not.
  const event = await policeStream.waitFor('assistance.created');
  assert.equal(event.data.requestId, req.id);
  await assert.rejects(trichyStream.waitFor('assistance.created', 300));

  const inbox = (await t.api('GET', '/api/notifications', { cookie: policeChennai })).body;
  assert.equal(inbox.unreadCount, 1);
  assert.equal(inbox.notifications[0].requestId, req.id);
  assert.match(inbox.notifications[0].message, /DEMO – in-app only/);
  assert.equal((await t.api('GET', '/api/notifications', { cookie: policeTrichy })).body.unreadCount, 0);

  let summary = (await t.api('GET', '/api/assistance/summary', { cookie: policeChennai })).body.summary;
  assert.equal(summary.newUnread, 1);
  assert.equal(summary.awaitingAcknowledgement, 1);

  const list = (await t.api('GET', '/api/assistance?status=open', { cookie: policeChennai })).body.requests;
  assert.deepEqual(list.map((r) => r.id), [req.id]);
  assert.equal((await t.api('GET', '/api/assistance', { cookie: policeTrichy })).body.requests.length, 0);

  // 3. Police details include route, reasons and history.
  const detail = (await t.api('GET', `/api/assistance/${req.id}`, { cookie: policeChennai })).body.request;
  assert.ok(detail.route.geometry.length > 2);
  assert.ok(detail.zones.length >= 1);
  assert.equal(detail.history.length, 1);
  assert.equal(detail.history[0].actorRole, 'driver');

  // 4. Invalid transitions and unauthorised users are refused.
  assert.equal((await setStatus(policeChennai, req.id, 'solved')).status, 409, 'cannot jump New -> Solved');
  assert.equal((await setStatus(driver1, req.id, 'acknowledged')).status, 403, 'driver cannot change status');
  assert.equal((await setStatus(admin, req.id, 'acknowledged')).status, 403);
  assert.equal((await setStatus(policeTrichy, req.id, 'acknowledged')).status, 403, 'other city cannot act');
  assert.equal((await setStatus(policeChennai, req.id, 'cleared')).status, 400);

  // 5. Acknowledge -> driver sees it.
  const ack = await setStatus(policeChennai, req.id, 'acknowledged');
  assert.equal(ack.status, 200);
  assert.equal(ack.body.driverDelivery.status, 'pushed_live');
  assert.equal((await driverStream.waitFor('assistance.updated')).data.status, 'acknowledged');
  let driverView = (await t.api('GET', '/api/trips/current', { cookie: driver1 })).body.trip.assistanceRequest;
  assert.equal(driverView.statusLabel, 'Acknowledged');
  assert.equal((await t.api('GET', '/api/notifications', { cookie: policeChennai })).body.unreadCount, 0, 'acknowledging marks it read');

  // 6. In Progress -> Solved with note.
  assert.equal((await setStatus(policeChennai, req.id, 'in_progress')).status, 200);
  const solved = await setStatus(policeChennai, req.id, 'solved', 'Demo: traffic diverted at junction.');
  assert.equal(solved.status, 200);

  driverView = (await t.api('GET', `/api/assistance/${req.id}`, { cookie: driver1 })).body.request;
  assert.equal(driverView.status, 'solved');
  assert.equal(driverView.statusLabel, 'Solved');
  assert.match(driverView.statusDescription, /does NOT confirm that a real road was cleared/);
  assert.equal(driverView.latestNote, 'Demo: traffic diverted at junction.');
  assert.equal(driverView.etaRecalculated, false);
  assert.match(driverView.etaNote, /not recalculated/);
  assert.equal(driverView.timing.minutesRemaining, null);
  assert.deepEqual(driverView.history.map((h) => h.toStatus), ['new', 'acknowledged', 'in_progress', 'solved']);
  assert.ok(driverView.history.every((h) => h.at && h.actor));
  assert.equal(driverView.history[3].actor, 'Demo Traffic Police – Chennai');

  const driverInbox = (await t.api('GET', '/api/notifications', { cookie: driver1 })).body;
  assert.equal(driverInbox.notifications.length, 3);
  assert.match(driverInbox.notifications[0].message, /Solved: Demo: traffic diverted/);

  summary = (await t.api('GET', '/api/assistance/summary', { cookie: policeChennai })).body.summary;
  assert.equal(summary.solved, 1);
  assert.equal(summary.awaitingAcknowledgement, 0);

  // 7. Closed requests cannot change again.
  assert.equal((await setStatus(policeChennai, req.id, 'unable_to_resolve', 'late')).status, 409);

  policeStream.close(); trichyStream.close(); driverStream.close();
  await finish(driver1, trip);
});

test('duplicate submissions return the original request', async () => {
  const trip = await activeTrip(driver1, 'blockage_no_alt', { routeKey: 'C' });
  const key = newKey();
  const [a, b] = await Promise.all([requestAssist(driver1, trip.id, { clientRequestId: key }), requestAssist(driver1, trip.id, { clientRequestId: key })]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 201]);
  assert.equal(a.body.request.id, b.body.request.id);

  // A second press with a new key while the first is still open also returns the same request.
  const again = await requestAssist(driver1, trip.id);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.request.id, a.body.request.id);
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM assistance_requests WHERE trip_id = ?').get(trip.id).n, 1);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE request_id = ? AND recipient_role = 'police'").get(a.body.request.id).n, 1);

  // Unable to Resolve requires a reason and keeps history.
  const id = a.body.request.id;
  assert.equal((await setStatus(policeChennai, id, 'unable_to_resolve')).body.error.code, 'note_required');
  const unable = await setStatus(policeChennai, id, 'unable_to_resolve', 'Demo: no units available.');
  assert.equal(unable.status, 200);
  assert.equal(unable.body.request.statusLabel, 'Unable to Resolve');
  assert.equal(unable.body.request.history.length, 2);
  await finish(driver1, trip);
});

test('request is stored even when no police dashboard is connected', async () => {
  const trip = await activeTrip(driver2, 'severe_no_alt', { cityId: 'trichy', originId: 'tr-o1', hospitalId: 'tr-h3' });
  const res = await requestAssist(driver2, trip.id);
  assert.equal(res.status, 201);
  assert.equal(res.body.delivery.status, 'stored');
  assert.match(res.body.delivery.message, /will appear when one is opened/);
  const list = (await t.api('GET', '/api/assistance', { cookie: policeTrichy })).body.requests;
  assert.equal(list[0].id, res.body.request.id);
  assert.equal(list[0].notification.deliveryStatus, 'stored');
  // driver1 cannot see driver2's request
  assert.equal((await t.api('GET', `/api/assistance/${res.body.request.id}`, { cookie: driver1 })).status, 404);
});

test('overdue requests stay visible with a warning', async () => {
  const id = (await t.api('GET', '/api/assistance?status=open', { cookie: policeTrichy })).body.requests[0].id;
  t.db.prepare('UPDATE assistance_requests SET eta_at = ? WHERE id = ?').run(new Date(Date.now() - 5 * 60000).toISOString(), id);
  const view = (await t.api('GET', `/api/assistance/${id}`, { cookie: policeTrichy })).body.request;
  assert.equal(view.timing.overdue, true);
  assert.match(view.timing.warning, /has passed/);
  assert.equal((await t.api('GET', '/api/assistance/summary', { cookie: policeTrichy })).body.summary.overdue, 1);
});

test('police list puts open requests first, soonest ETA first', async () => {
  const trip = await activeTrip(driver1, 'severe_no_alt', { cityId: 'trichy', originId: 'tr-o2', hospitalId: 'tr-h3' });
  await requestAssist(driver1, trip.id);
  const list = (await t.api('GET', '/api/assistance', { cookie: policeTrichy })).body.requests;
  assert.equal(list.length, 2);
  assert.ok(list.every((r) => r.status === 'new'));
  assert.ok(Date.parse(list[0].timing.etaAt) <= Date.parse(list[1].timing.etaAt));
});

test('records persist after restart-style re-read (same database rows)', async () => {
  const rows = t.db.prepare('SELECT id, status FROM assistance_requests').all();
  const viaApi = (await t.api('GET', '/api/assistance', { cookie: admin })).body.requests;
  assert.equal(viaApi.length, rows.length);
  for (const r of rows) assert.equal(viaApi.find((v) => v.id === r.id).status, r.status);
});
