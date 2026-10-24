// Cities, demo origins, demo scenarios and the shared hospital directory.
const express = require('express');
const { badRequest, notFound, handle, requireAuth, requireRole } = require('../http');
const { tx, nowIso } = require('../db');
const { haversineKm, round } = require('../services/geo');
const { computeRoutes, DATA_SOURCE } = require('../services/routing');
const { hospitalView, DIALABLE_PHONE } = require('../views');

const PHONE_STATUSES = ['verified', 'unverified', 'demo_placeholder', 'unavailable'];
const CAPABILITIES = ['verified', 'unverified'];
const AVAILABILITY = ['not_connected', 'confirmed_by_authorized_source'];

function scenarioFromRow(row) {
  return { code: row.code, name: row.name, description: row.description, congestion: JSON.parse(row.congestion_json), data_status: row.data_status };
}

// Shared lookups, also used by later route files (trips, assistance).
function directoryLookups(db) {
  const q = {
    city: db.prepare('SELECT * FROM cities WHERE id = ?'),
    origin: db.prepare('SELECT * FROM demo_origins WHERE id = ?'),
    scenario: db.prepare('SELECT * FROM demo_scenarios WHERE code = ?'),
    hospital: db.prepare('SELECT * FROM hospitals WHERE id = ?'),
  };

  const getCity = (id) => {
    const city = typeof id === 'string' ? q.city.get(id) : null;
    if (!city) throw badRequest('Select a valid city (chennai or trichy).', 'invalid_city');
    return city;
  };

  const getScenario = (code = 'normal') => {
    const row = q.scenario.get(String(code));
    if (!row) throw badRequest(`Unknown demo scenario "${code}".`, 'invalid_scenario');
    return scenarioFromRow(row);
  };

  // Origin is either a predefined demo origin or a custom point inside the city.
  // Returns null when no origin was supplied at all.
  const resolveOrigin = (city, { originId, lat, lng }) => {
    if (originId) {
      const o = q.origin.get(String(originId));
      if (!o || o.city_id !== city.id) throw badRequest(`Demo origin "${originId}" does not belong to ${city.name}.`, 'invalid_origin');
      return { id: o.id, label: o.name, lat: o.lat, lng: o.lng, isDemo: true };
    }
    if (lat === undefined && lng === undefined) return null;
    const point = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) throw badRequest('Origin latitude and longitude must be numbers.', 'invalid_origin');
    const fromCentre = haversineKm(point, { lat: city.center_lat, lng: city.center_lng });
    if (fromCentre > city.radius_km) {
      throw badRequest(`Origin is ${round(fromCentre)} km from ${city.name} centre; demo origins must be within ${city.radius_km} km.`, 'invalid_origin');
    }
    return { id: null, label: 'DEMO LOCATION – custom point', lat: round(point.lat, 6), lng: round(point.lng, 6), isDemo: true };
  };

  const getHospital = (id) => {
    const h = q.hospital.get(String(id));
    if (!h) throw notFound('Hospital');
    return h;
  };

  return { getCity, getScenario, resolveOrigin, getHospital };
}

// Distance and simulated travel estimate from an origin to one hospital.
function estimateFor(origin, hospital, scenario) {
  const straightLineKm = round(haversineKm(origin, hospital), 2);
  const result = computeRoutes({ origin, hospital, scenario });
  const best = result.routes.find((r) => r.suitable) || result.routes.find((r) => !r.blocked) || null;
  return {
    straightLineKm,
    dataStatus: result.dataStatus,
    estimate: best && {
      routeKey: best.key,
      routeName: best.name,
      distanceKm: best.distanceKm,
      etaMin: best.etaMin,
      congestion: best.congestion,
      suitable: best.suitable,
      basis: result.etaBasis,
    },
  };
}

module.exports = function directoryRoutes({ db, hub }) {
  const router = express.Router();
  const look = directoryLookups(db);

  router.get('/cities', requireAuth, (req, res) => {
    const cities = db.prepare('SELECT * FROM cities ORDER BY name').all();
    const origins = db.prepare('SELECT * FROM demo_origins ORDER BY id').all();
    res.json({
      cities: cities.map((c) => ({
        id: c.id,
        name: c.name,
        center: { lat: c.center_lat, lng: c.center_lng },
        zoom: c.zoom,
        radiusKm: c.radius_km,
        demoOrigins: origins.filter((o) => o.city_id === c.id).map((o) => ({ id: o.id, name: o.name, lat: o.lat, lng: o.lng })),
      })),
    });
  });

  router.get('/scenarios', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM demo_scenarios ORDER BY sort_order').all();
    res.json({ label: 'SIMULATED DEMO DATA', scenarios: rows.map(scenarioFromRow) });
  });

  // GET /api/hospitals?city=chennai&originId=ch-o1&scenario=normal&q=lake
  // (or &lat=..&lng=.. for a custom demo point)
  router.get('/hospitals', requireAuth, handle((req, res) => {
    const city = look.getCity(req.query.city);
    const origin = look.resolveOrigin(city, req.query);
    const scenario = look.getScenario(req.query.scenario || 'normal');
    const search = String(req.query.q || '').trim().toLowerCase();

    let rows = db.prepare('SELECT * FROM hospitals WHERE city_id = ? ORDER BY name').all(city.id);
    if (search) rows = rows.filter((h) => h.name.toLowerCase().includes(search) || h.address.toLowerCase().includes(search));

    let hospitals = rows.map((h) => ({ ...hospitalView(h), ...(origin ? estimateFor(origin, h, scenario) : {}) }));

    // Sort by simulated ETA only when every hospital has a comparable estimate.
    let sortBasis = 'name';
    if (origin) {
      const allEstimated = hospitals.every((h) => h.estimate && h.estimate.etaMin !== null);
      sortBasis = allEstimated ? 'simulated_eta' : 'straight_line_distance';
      hospitals = hospitals.sort(allEstimated
        ? (a, b) => a.estimate.etaMin - b.estimate.etaMin
        : (a, b) => a.straightLineKm - b.straightLineKm);
    }

    const sortNote = {
      name: 'No origin selected – sorted by name. Select a demo origin to see distances.',
      simulated_eta: 'Sorted by SIMULATED estimated travel time from the selected origin.',
      straight_line_distance: 'Route estimates unavailable – sorted by STRAIGHT-LINE distance, which is not driving distance.',
    }[sortBasis];

    res.json({ city: { id: city.id, name: city.name }, origin, scenario: { code: scenario.code, name: scenario.name, dataStatus: scenario.data_status }, sortBasis, sortNote, dataSource: DATA_SOURCE, hospitals });
  }));

  router.get('/hospitals/:id', requireAuth, handle((req, res) => {
    const h = look.getHospital(req.params.id);
    const city = look.getCity(h.city_id);
    const origin = look.resolveOrigin(city, req.query);
    const scenario = look.getScenario(req.query.scenario || 'normal');
    res.json({ hospital: { ...hospitalView(h), ...(origin ? estimateFor(origin, h, scenario) : {}) }, origin });
  }));

  // Admin-only edit. Changes appear on every dashboard because they all read this table.
  router.patch('/hospitals/:id', requireRole('admin'), handle((req, res) => {
    const current = look.getHospital(req.params.id);
    const body = req.body || {};
    const now = nowIso();
    const next = { ...current };

    for (const field of ['name', 'address', 'verification_note']) {
      if (body[field] === undefined) continue;
      if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > 200) throw badRequest(`${field} must be 1–200 characters.`);
      next[field] = body[field].trim();
    }
    if (body.phone !== undefined) {
      if (body.phone !== null && (typeof body.phone !== 'string' || body.phone.length > 30)) throw badRequest('phone must be text (max 30 characters) or null.');
      next.phone = body.phone ? body.phone.trim() : null;
    }
    if (body.phone_status !== undefined) {
      if (!PHONE_STATUSES.includes(body.phone_status)) throw badRequest(`phone_status must be one of: ${PHONE_STATUSES.join(', ')}.`);
      next.phone_status = body.phone_status;
    }
    if (next.phone_status === 'verified' && !DIALABLE_PHONE.test(next.phone || '')) {
      throw badRequest('A phone number can only be marked verified when it is a real dialable number (digits, spaces, dashes, optional +).');
    }
    if (!next.phone && next.phone_status !== 'unavailable') next.phone_status = 'unavailable';

    if (body.emergency_capability !== undefined) {
      if (!CAPABILITIES.includes(body.emergency_capability)) throw badRequest(`emergency_capability must be one of: ${CAPABILITIES.join(', ')}.`);
      if (body.emergency_capability !== current.emergency_capability) {
        next.emergency_capability = body.emergency_capability;
        next.verified_by = body.emergency_capability === 'verified' ? req.user.displayName : null;
        next.verified_at = body.emergency_capability === 'verified' ? now : null;
      }
    }

    if (body.availability_status !== undefined) {
      if (!AVAILABILITY.includes(body.availability_status)) throw badRequest(`availability_status must be one of: ${AVAILABILITY.join(', ')}.`);
      if (body.availability_status === 'confirmed_by_authorized_source') {
        if (typeof body.availability_source !== 'string' || !body.availability_source.trim()) {
          throw badRequest('availability_source is required when confirming availability (who confirmed it).');
        }
        next.availability_source = body.availability_source.trim().slice(0, 200);
        next.availability_confirmed_at = now;
      } else {
        next.availability_source = null;
        next.availability_confirmed_at = null;
      }
      next.availability_status = body.availability_status;
    }

    const changed = Object.keys(next).filter((k) => next[k] !== current[k]);
    if (changed.length === 0) return res.json({ hospital: hospitalView(current), changed: [] });

    tx(db, () => {
      db.prepare(`UPDATE hospitals SET name = ?, address = ?, phone = ?, phone_status = ?, emergency_capability = ?,
        availability_status = ?, availability_source = ?, availability_confirmed_at = ?, verification_note = ?,
        verified_by = ?, verified_at = ?, updated_at = ? WHERE id = ?`).run(
        next.name, next.address, next.phone, next.phone_status, next.emergency_capability,
        next.availability_status, next.availability_source, next.availability_confirmed_at, next.verification_note,
        next.verified_by, next.verified_at, now, current.id);
      db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(req.user.id, 'hospital.update', 'hospital', current.id, JSON.stringify({ changed: changed.map((k) => ({ field: k, from: current[k], to: next[k] })) }), now);
    });

    const hospital = hospitalView(look.getHospital(current.id));
    hub.publish('hospital.updated', { hospitalId: hospital.id, cityId: hospital.cityId, at: now });
    res.json({ hospital, changed });
  }));

  return router;
};

module.exports.directoryLookups = directoryLookups;
module.exports.scenarioFromRow = scenarioFromRow;
