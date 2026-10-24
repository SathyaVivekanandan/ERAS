// Ambulance trips: destination selection, route comparison, scenario switching and trip start.
const express = require('express');
const { HttpError, badRequest, notFound, handle, requireRole } = require('../http');
const { tx, nowIso } = require('../db');
const { computeRoutes, assessAssistance } = require('../services/routing');
const { hospitalView } = require('../views');
const { directoryLookups } = require('./directory');
const { makeRequestViews } = require('../services/requests');

const conflict = (code, message) => new HttpError(409, code, message);

module.exports = function tripRoutes({ db, config }) {
  const router = express.Router();
  const look = directoryLookups(db);
  const { requestView } = makeRequestViews(db);
  const latestRequest = db.prepare('SELECT * FROM assistance_requests WHERE trip_id = ? ORDER BY created_at DESC LIMIT 1');
  router.use(requireRole('driver'));

  const q = {
    trip: db.prepare('SELECT * FROM trips WHERE id = ?'),
    current: db.prepare("SELECT * FROM trips WHERE driver_id = ? AND status IN ('planned', 'active') ORDER BY id DESC LIMIT 1"),
    activeForDriver: db.prepare("SELECT id FROM trips WHERE driver_id = ? AND status = 'active'"),
    cancelPlanned: db.prepare("UPDATE trips SET status = 'cancelled', ended_at = ?, updated_at = ? WHERE driver_id = ? AND status = 'planned'"),
    routes: db.prepare('SELECT * FROM trip_routes WHERE trip_id = ? ORDER BY rank'),
    deleteRoutes: db.prepare('DELETE FROM trip_routes WHERE trip_id = ?'),
    insertRoute: db.prepare(`INSERT INTO trip_routes (trip_id, route_key, name, rank, distance_km, eta_min, free_flow_eta_min,
      congestion, suitable, rejection_reason, geometry_json, zones_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  };

  function saveRoutes(tripId, result) {
    q.deleteRoutes.run(tripId);
    for (const r of result.routes) {
      q.insertRoute.run(tripId, r.key, r.name, r.rank, r.distanceKm, r.etaMin, r.freeFlowEtaMin, r.congestion,
        r.suitable ? 1 : 0, r.rejectionReason, JSON.stringify(r.geometry), JSON.stringify(r.zones));
    }
  }

  // Only the driver who owns a trip may see or change it.
  function ownTrip(req) {
    const trip = q.trip.get(Number(req.params.id));
    if (!trip || trip.driver_id !== req.user.id) throw notFound('Trip');
    return trip;
  }

  function routeRows(tripId) {
    return q.routes.all(tripId).map((r) => ({
      key: r.route_key,
      name: r.name,
      rank: r.rank,
      distanceKm: r.distance_km,
      etaMin: r.eta_min,
      freeFlowEtaMin: r.free_flow_eta_min,
      congestion: r.congestion,
      blocked: r.congestion === 'blocked',
      suitable: r.suitable === 1,
      rejectionReason: r.rejection_reason,
      geometry: JSON.parse(r.geometry_json),
      zones: JSON.parse(r.zones_json),
    }));
  }

  function tripView(trip) {
    const routes = routeRows(trip.id);
    const scenario = look.getScenario(trip.scenario_code);
    const routeData = { dataStatus: trip.data_status, freshnessAt: trip.data_freshness_at, routes };
    const selected = routes.find((r) => r.key === trip.selected_route_key) || null;
    const request = latestRequest.get(trip.id);
    return {
      id: trip.id,
      status: trip.status,
      cityId: trip.city_id,
      origin: { id: trip.origin_id, label: trip.origin_label, lat: trip.origin_lat, lng: trip.origin_lng, isDemo: true },
      hospital: hospitalView(look.getHospital(trip.hospital_id)),
      scenario: { code: scenario.code, name: scenario.name, description: scenario.description, label: 'SIMULATED DEMO DATA' },
      data: {
        status: trip.data_status,
        source: trip.data_source,
        freshnessAt: trip.data_freshness_at,
        computedAt: trip.routes_computed_at,
        warnings: JSON.parse(trip.warnings_json),
      },
      routes,
      recommendedKey: routes.find((r) => r.suitable)?.key ?? null,
      selectedRouteKey: trip.selected_route_key,
      selectedRoute: selected && { key: selected.key, name: selected.name, distanceKm: selected.distanceKm, etaMin: selected.etaMin, congestion: selected.congestion, suitable: selected.suitable },
      assistanceCheck: assessAssistance(routeData, { staleAfterMinutes: config.staleAfterMinutes }),
      assistanceRequest: request ? requestView(request) : null,
      createdAt: trip.created_at,
      startedAt: trip.started_at,
      endedAt: trip.ended_at,
      updatedAt: trip.updated_at,
    };
  }

  // POST /api/trips { cityId, originId | origin: {lat, lng}, hospitalId, scenarioCode }
  router.post('/', handle((req, res) => {
    const body = req.body || {};
    const city = look.getCity(body.cityId);
    const origin = look.resolveOrigin(city, { originId: body.originId, lat: body.origin?.lat, lng: body.origin?.lng });
    if (!origin) throw badRequest('Select a demo origin before choosing a destination.', 'missing_origin');
    if (!body.hospitalId) throw badRequest('Select a destination hospital.', 'missing_destination');
    const hospital = look.getHospital(body.hospitalId);
    if (hospital.city_id !== city.id) throw badRequest(`${hospital.name} is not in ${city.name}.`, 'invalid_destination');
    const scenario = look.getScenario(body.scenarioCode || 'normal');

    if (q.activeForDriver.get(req.user.id)) {
      throw conflict('active_trip_exists', 'You already have an active trip. Complete or cancel it before planning a new one.');
    }

    const now = nowIso();
    const result = computeRoutes({ origin, hospital, scenario });
    const tripId = tx(db, () => {
      q.cancelPlanned.run(now, now, req.user.id); // choosing a new destination replaces an unstarted plan
      const { lastInsertRowid } = db.prepare(`INSERT INTO trips (driver_id, city_id, origin_id, origin_label, origin_lat, origin_lng,
        hospital_id, scenario_code, status, data_status, data_source, data_freshness_at, warnings_json, routes_computed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?)`).run(
        req.user.id, city.id, origin.id, origin.label, origin.lat, origin.lng, hospital.id, scenario.code,
        result.dataStatus, result.dataSource, result.freshnessAt, JSON.stringify(result.warnings), now, now, now);
      saveRoutes(lastInsertRowid, result);
      return Number(lastInsertRowid);
    });
    res.status(201).json({ trip: tripView(q.trip.get(tripId)) });
  }));

  router.get('/current', (req, res) => {
    const trip = q.current.get(req.user.id);
    res.json({ trip: trip ? tripView(trip) : null });
  });

  router.get('/:id', handle((req, res) => {
    res.json({ trip: tripView(ownTrip(req)) });
  }));

  // Switch (or refresh, with the same code) the simulated traffic scenario. Routes are recomputed.
  router.patch('/:id/scenario', handle((req, res) => {
    const trip = ownTrip(req);
    if (!['planned', 'active'].includes(trip.status)) throw conflict('trip_closed', 'This trip has ended.');
    const scenario = look.getScenario((req.body || {}).scenarioCode);
    const hospital = look.getHospital(trip.hospital_id);
    const result = computeRoutes({ origin: { lat: trip.origin_lat, lng: trip.origin_lng }, hospital, scenario });

    // Keep the driver's chosen route only if it still exists and is not blocked.
    const keep = result.routes.find((r) => r.key === trip.selected_route_key && !r.blocked);
    const warnings = [...result.warnings];
    if (trip.selected_route_key && !keep) warnings.push(`Your selected route (${trip.selected_route_key}) is no longer usable. Select another route.`);

    const now = nowIso();
    tx(db, () => {
      db.prepare(`UPDATE trips SET scenario_code = ?, data_status = ?, data_source = ?, data_freshness_at = ?, warnings_json = ?,
        selected_route_key = ?, routes_computed_at = ?, updated_at = ? WHERE id = ?`).run(
        scenario.code, result.dataStatus, result.dataSource, result.freshnessAt, JSON.stringify(warnings),
        keep ? keep.key : null, now, now, trip.id);
      saveRoutes(trip.id, result);
    });
    res.json({ trip: tripView(q.trip.get(trip.id)) });
  }));

  router.post('/:id/select-route', handle((req, res) => {
    const trip = ownTrip(req);
    if (!['planned', 'active'].includes(trip.status)) throw conflict('trip_closed', 'This trip has ended.');
    const key = (req.body || {}).routeKey;
    const route = routeRows(trip.id).find((r) => r.key === key);
    if (!route) throw badRequest(`Route "${key}" is not one of this trip's candidate routes.`, 'invalid_route');
    if (route.blocked) throw badRequest(`${route.name} is blocked and cannot be selected.`, 'route_blocked');
    const now = nowIso();
    db.prepare('UPDATE trips SET selected_route_key = ?, updated_at = ? WHERE id = ?').run(route.key, now, trip.id);
    res.json({ trip: tripView(q.trip.get(trip.id)) });
  }));

  // Starts the demonstration trip. The driver must explicitly confirm.
  router.post('/:id/start', handle((req, res) => {
    const trip = ownTrip(req);
    if ((req.body || {}).confirm !== true) throw badRequest('Confirm to start the trip.', 'confirmation_required');
    if (trip.status !== 'planned') throw conflict('invalid_trip_state', `Trip is ${trip.status}; only a planned trip can be started.`);
    if (!trip.selected_route_key) throw badRequest('Select a route before starting the trip.', 'route_required');
    const now = nowIso();
    db.prepare("UPDATE trips SET status = 'active', started_at = ?, updated_at = ? WHERE id = ?").run(now, now, trip.id);
    res.json({ trip: tripView(q.trip.get(trip.id)) });
  }));

  for (const [action, from, to] of [['complete', ['active'], 'completed'], ['cancel', ['planned', 'active'], 'cancelled']]) {
    router.post(`/:id/${action}`, handle((req, res) => {
      const trip = ownTrip(req);
      if (!from.includes(trip.status)) throw conflict('invalid_trip_state', `Trip is ${trip.status}; it cannot be ${to}.`);
      const now = nowIso();
      db.prepare('UPDATE trips SET status = ?, ended_at = ?, updated_at = ? WHERE id = ?').run(to, now, now, trip.id);
      res.json({ trip: tripView(q.trip.get(trip.id)) });
    }));
  }

  return router;
};
