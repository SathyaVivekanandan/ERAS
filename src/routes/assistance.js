// Assistance requests: driver creates, police processes, both read the same stored record.
const crypto = require('node:crypto');
const express = require('express');
const { HttpError, badRequest, notFound, handle, requireAuth, requireRole } = require('../http');
const { tx, nowIso } = require('../db');
const { assessAssistance } = require('../services/routing');
const { STATUS_LABELS, OPEN_STATUSES, canTransition, TRANSITIONS } = require('../services/status');
const { makeRequestViews, audienceFor, policeFor, canSee } = require('../services/requests');

const conflict = (code, message, extra) => new HttpError(409, code, message, extra);
const MAX_NOTE = 500;
const STATUS_ORDER = { new: 0, acknowledged: 1, in_progress: 2, solved: 3, unable_to_resolve: 3 };

function newRequestId(now) {
  return `AR-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

module.exports = function assistanceRoutes({ db, hub, config }) {
  const router = express.Router();
  const { requestView } = makeRequestViews(db);

  const q = {
    request: db.prepare('SELECT * FROM assistance_requests WHERE id = ?'),
    byClientId: db.prepare('SELECT * FROM assistance_requests WHERE client_request_id = ?'),
    openForTrip: db.prepare(`SELECT * FROM assistance_requests WHERE trip_id = ? AND status IN (${OPEN_STATUSES.map(() => '?').join(',')}) LIMIT 1`),
    trip: db.prepare('SELECT * FROM trips WHERE id = ?'),
    routes: db.prepare('SELECT * FROM trip_routes WHERE trip_id = ? ORDER BY rank'),
    hospital: db.prepare('SELECT * FROM hospitals WHERE id = ?'),
    history: db.prepare('INSERT INTO assistance_status_history (request_id, from_status, to_status, actor_id, actor_role, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    notify: db.prepare('INSERT INTO notifications (request_id, recipient_role, recipient_user_id, city_id, type, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    setDelivery: db.prepare('UPDATE notifications SET delivery_status = ? WHERE id = ?'),
    markPoliceRead: db.prepare("UPDATE notifications SET read_at = ? WHERE request_id = ? AND recipient_role = 'police' AND read_at IS NULL"),
  };

  // Pushes a live event; the stored record is unaffected if pushing fails.
  function push(event, request, notificationId, audience) {
    try {
      const delivered = hub.publish(event, { requestId: request.id, cityId: request.city_id, status: request.status, at: nowIso() }, audience);
      if (notificationId) q.setDelivery.run(delivered > 0 ? 'pushed_live' : 'stored', notificationId);
      return { status: delivered > 0 ? 'pushed_live' : 'stored', liveDashboards: delivered };
    } catch (err) {
      console.error('Live push failed:', err);
      if (notificationId) q.setDelivery.run('push_failed', notificationId);
      return { status: 'push_failed', liveDashboards: 0 };
    }
  }

  const DELIVERY_MESSAGES = {
    pushed_live: (n) => `Saved and delivered live to ${n} police dashboard(s) (in-app only).`,
    stored: () => 'Saved. No police dashboard is open right now; the request will appear when one is opened or refreshes.',
    push_failed: () => 'Saved, but the live update failed. Police dashboards will still see it on their next refresh.',
  };

  // ---- Driver: create a request ------------------------------------------------------
  // POST /api/assistance { tripId, clientRequestId, confirm: true }
  router.post('/', requireRole('driver'), handle((req, res) => {
    const { tripId, clientRequestId, confirm } = req.body || {};
    if (typeof clientRequestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(clientRequestId)) {
      throw badRequest('clientRequestId (8–100 letters, digits, - or _) is required to prevent duplicate submissions.', 'invalid_client_request_id');
    }
    if (confirm !== true) throw badRequest('The driver must confirm the assistance request.', 'confirmation_required');

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const outcome = tx(db, () => {
      // Same button press sent twice: return the original request.
      const repeat = q.byClientId.get(clientRequestId);
      if (repeat) {
        if (repeat.driver_id !== req.user.id) throw conflict('client_request_id_in_use', 'This request key is already in use.');
        return { duplicate: true, request: repeat, message: 'This request was already submitted.' };
      }

      const trip = q.trip.get(Number(tripId));
      if (!trip || trip.driver_id !== req.user.id) throw notFound('Trip');
      if (trip.status !== 'active') throw conflict('trip_not_active', 'Start the trip before requesting traffic assistance.');

      const open = q.openForTrip.get(trip.id, ...OPEN_STATUSES);
      if (open) return { duplicate: true, request: open, message: 'An open assistance request already exists for this trip.' };

      const hospital = q.hospital.get(trip.hospital_id);
      if (!hospital || hospital.city_id !== trip.city_id) throw conflict('invalid_destination', 'The destination hospital is not valid for this trip.');

      const routes = q.routes.all(trip.id).map((r) => ({
        key: r.route_key, name: r.name, distanceKm: r.distance_km, etaMin: r.eta_min, congestion: r.congestion,
        blocked: r.congestion === 'blocked', suitable: r.suitable === 1, rejectionReason: r.rejection_reason,
        geometry: JSON.parse(r.geometry_json), zones: JSON.parse(r.zones_json),
      }));
      const assessment = assessAssistance({ dataStatus: trip.data_status, freshnessAt: trip.data_freshness_at, routes }, { staleAfterMinutes: config.staleAfterMinutes, now: nowDate });
      if (!assessment.eligible) {
        throw new HttpError(422, 'not_eligible', `Assistance not requested: ${assessment.summary}`, { assessment });
      }

      // Use the driver's selected route, or the fastest route that is not blocked.
      const route = routes.find((r) => r.key === trip.selected_route_key && !r.blocked) || routes.find((r) => !r.blocked) || null;
      // Severity on the route the ambulance is using; 'blocked' when every route is blocked.
      const worst = route ? route.congestion : 'blocked';
      const zones = routes.flatMap((r) => r.zones);
      const id = newRequestId(nowDate);
      const etaAt = route?.etaMin != null ? new Date(nowDate.getTime() + route.etaMin * 60000).toISOString() : null;
      const reason = `No suitable alternative route: ${routes.map((r) => `${r.name} – ${r.rejectionReason}`).join(' ')}`;

      db.prepare(`INSERT INTO assistance_requests (id, client_request_id, trip_id, driver_id, city_id, hospital_id, route_key, route_name,
        route_geometry_json, affected_area, congestion_severity, reason, routes_considered_json, zones_json, distance_km, eta_min, eta_at,
        eta_basis, eta_updated_at, status, driver_confirmed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`).run(
        id, clientRequestId, trip.id, req.user.id, trip.city_id, hospital.id, route?.key ?? null, route?.name ?? null,
        route ? JSON.stringify(route.geometry) : null, zones.map((z) => z.label).join('; '), worst, reason,
        JSON.stringify(routes.map(({ key, name, distanceKm, etaMin, congestion, rejectionReason }) => ({ key, name, distanceKm, etaMin, congestion, rejectionReason }))),
        JSON.stringify(zones), route?.distanceKm ?? null, route?.etaMin ?? null, etaAt,
        'SIMULATED estimate from demo speed assumptions (uncertainty about ±40%)', trip.routes_computed_at, now, now, now);
      q.history.run(id, null, 'new', req.user.id, 'driver', 'Driver confirmed the assistance request.', now);
      const { lastInsertRowid } = q.notify.run(id, 'police', null, trip.city_id, 'assistance.created',
        `New assistance request ${id}: ambulance to ${hospital.name}. ${route ? `${worst} congestion on ${route.name}` : 'All routes blocked'}.`
        + `${route ? ` Simulated ETA ${route.etaMin} min.` : ''} (DEMO – in-app only)`, now);
      return { duplicate: false, request: q.request.get(id), notificationId: Number(lastInsertRowid) };
    });

    if (outcome.duplicate) {
      return res.status(200).json({ duplicate: true, message: outcome.message, request: requestView(outcome.request) });
    }
    const delivery = push('assistance.created', outcome.request, outcome.notificationId, policeFor(outcome.request.city_id));
    hub.publish('assistance.created', { requestId: outcome.request.id, status: 'new' }, (u) => u.id === req.user.id);
    res.status(201).json({
      duplicate: false,
      request: requestView(q.request.get(outcome.request.id)),
      delivery: { ...delivery, message: DELIVERY_MESSAGES[delivery.status](delivery.liveDashboards) },
    });
  }));

  // ---- Reading ------------------------------------------------------------------------
  // Police see their city's requests, drivers their own, admin everything.
  function visibleRows(user) {
    if (user.role === 'driver') return db.prepare('SELECT * FROM assistance_requests WHERE driver_id = ?').all(user.id);
    if (user.role === 'police' && user.cityId) return db.prepare('SELECT * FROM assistance_requests WHERE city_id = ?').all(user.cityId);
    return db.prepare('SELECT * FROM assistance_requests').all();
  }

  // Open requests first (New, then Acknowledged, then In Progress), soonest ETA first; closed ones newest first.
  function urgencySort(a, b) {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s) return s;
    if (OPEN_STATUSES.includes(a.status)) {
      const ea = a.eta_at ? Date.parse(a.eta_at) : Infinity;
      const eb = b.eta_at ? Date.parse(b.eta_at) : Infinity;
      return ea - eb || a.created_at.localeCompare(b.created_at);
    }
    return b.updated_at.localeCompare(a.updated_at);
  }

  router.get('/', requireAuth, handle((req, res) => {
    const filter = req.query.status || 'all';
    if (!['all', 'open', 'closed', ...Object.keys(STATUS_LABELS)].includes(filter)) throw badRequest('Unknown status filter.');
    let rows = visibleRows(req.user);
    if (filter === 'open') rows = rows.filter((r) => OPEN_STATUSES.includes(r.status));
    else if (filter === 'closed') rows = rows.filter((r) => !OPEN_STATUSES.includes(r.status));
    else if (filter !== 'all') rows = rows.filter((r) => r.status === filter);
    const now = new Date();
    res.json({ requests: rows.sort(urgencySort).map((r) => requestView(r, { now, includeHistory: false })), serverTime: now.toISOString() });
  }));

  // Summary counts for the police dashboard, calculated from stored records.
  router.get('/summary', requireRole('police', 'admin'), (req, res) => {
    const rows = visibleRows(req.user);
    const unread = new Set(db.prepare("SELECT request_id FROM notifications WHERE recipient_role = 'police' AND read_at IS NULL").all().map((n) => n.request_id));
    const now = Date.now();
    const count = (fn) => rows.filter(fn).length;
    res.json({
      summary: {
        newUnread: count((r) => r.status === 'new' && unread.has(r.id)),
        awaitingAcknowledgement: count((r) => r.status === 'new'),
        acknowledged: count((r) => r.status === 'acknowledged'),
        inProgress: count((r) => r.status === 'in_progress'),
        solved: count((r) => r.status === 'solved'),
        unableToResolve: count((r) => r.status === 'unable_to_resolve'),
        overdue: count((r) => OPEN_STATUSES.includes(r.status) && r.eta_at && Date.parse(r.eta_at) < now),
        total: rows.length,
      },
      serverTime: new Date(now).toISOString(),
    });
  });

  router.get('/:id', requireAuth, handle((req, res) => {
    const r = q.request.get(req.params.id);
    if (!r || !canSee(req.user, r)) throw notFound('Assistance request');
    res.json({ request: requestView(r) });
  }));

  // ---- Police: change status ------------------------------------------------------------
  // POST /api/assistance/:id/status { status, note }
  router.post('/:id/status', requireRole('police'), handle((req, res) => {
    const r = q.request.get(req.params.id);
    if (!r) throw notFound('Assistance request');
    if (req.user.cityId && req.user.cityId !== r.city_id) {
      throw new HttpError(403, 'forbidden', 'This request belongs to another city’s traffic police.');
    }

    const { status, note } = req.body || {};
    if (!STATUS_LABELS[status]) throw badRequest(`Unknown status "${status}".`, 'invalid_status');
    if (!canTransition(r.status, status)) {
      throw conflict('invalid_transition', `Cannot change from ${STATUS_LABELS[r.status]} to ${STATUS_LABELS[status]}.`, { allowed: TRANSITIONS[r.status] });
    }
    if (note !== undefined && note !== null && typeof note !== 'string') throw badRequest('note must be text.');
    const cleanNote = (note || '').trim();
    if (cleanNote.length > MAX_NOTE) throw badRequest(`Note must be at most ${MAX_NOTE} characters.`);
    if (status === 'unable_to_resolve' && cleanNote.length < 3) throw badRequest('A reason is required when marking Unable to Resolve.', 'note_required');
    if (status === 'solved' && config.requireSolvedNote && cleanNote.length < 3) throw badRequest('An action note is required when marking Solved.', 'note_required');

    const now = nowIso();
    const notificationId = tx(db, () => {
      // Only succeeds if nobody changed the status in the meantime.
      const { changes } = db.prepare('UPDATE assistance_requests SET status = ?, latest_note = COALESCE(?, latest_note), updated_at = ? WHERE id = ? AND status = ?')
        .run(status, cleanNote || null, now, r.id, r.status);
      if (changes === 0) throw conflict('status_changed', 'The request was updated by someone else. Refresh and try again.');
      q.history.run(r.id, r.status, status, req.user.id, 'police', cleanNote || null, now);
      q.markPoliceRead.run(now, r.id);
      const { lastInsertRowid } = q.notify.run(r.id, null, r.driver_id, r.city_id, 'assistance.updated',
        `Request ${r.id} is now ${STATUS_LABELS[status]}${cleanNote ? `: ${cleanNote}` : ''} (DEMO – in-app only)`, now);
      return Number(lastInsertRowid);
    });

    const updated = q.request.get(r.id);
    const delivery = push('assistance.updated', updated, notificationId, (u) => u.id === updated.driver_id);
    hub.publish('assistance.updated', { requestId: updated.id, cityId: updated.city_id, status: updated.status, at: now }, (u) => u.id !== updated.driver_id && audienceFor(updated)(u));
    res.json({ request: requestView(updated), driverDelivery: delivery });
  }));

  return router;
};
