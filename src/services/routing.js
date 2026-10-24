// SIMULATED demo route generator.
// There is no live routing or traffic provider. Routes are smooth curves between the
// origin and the hospital (not snapped to real roads), and congestion comes from the
// selected demo scenario. Every result is labelled as simulated.
const { polylineKm, round } = require('./geo');

const DATA_SOURCE = 'SIMULATED DEMO DATA – ERAS demo route generator (approximate geometry, not road-snapped; no live traffic)';
const ETA_BASIS = 'SIMULATED estimate from demo speed assumptions (uncertainty about ±40%)';

// Extra distance added because real roads are not straight lines.
const ROAD_FACTOR = 1.25;
// Assumed ambulance speeds (km/h) for each simulated congestion level.
const SPEED_KMH = { none: 28, moderate: 16, severe: 5 };
// A route is "suitable" only if its ETA is within this factor of the fastest free-flow ETA.
const SUITABLE_ETA_FACTOR = 2.0;
// The stale-data scenario pretends the traffic data was produced this long ago.
const STALE_DATA_AGE_MIN = 50;

const ROUTE_SHAPES = [
  { key: 'A', name: 'Route A – Main corridor (simulated)', bend: 0.08 },
  { key: 'B', name: 'Route B – Inner bypass (simulated)', bend: -0.3 },
  { key: 'C', name: 'Route C – Outer detour (simulated)', bend: 0.55 },
];

// Quadratic curve from origin to destination. `bend` pushes the midpoint sideways,
// as a fraction of the straight-line length, so each route has its own shape.
function buildGeometry(origin, dest, bend, samples = 16) {
  const k = Math.cos((origin.lat * Math.PI) / 180); // scale longitude so the bend is not skewed
  const ox = origin.lng * k, oy = origin.lat;
  const dx = dest.lng * k, dy = dest.lat;
  const cx = (ox + dx) / 2 - (dy - oy) * bend;
  const cy = (oy + dy) / 2 + (dx - ox) * bend;
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = (1 - t) ** 2 * ox + 2 * (1 - t) * t * cx + t ** 2 * dx;
    const y = (1 - t) ** 2 * oy + 2 * (1 - t) * t * cy + t ** 2 * dy;
    points.push([round(y, 6), round(x / k, 6)]);
  }
  return points;
}

function congestionZone(route) {
  const mid = route.geometry[Math.floor(route.geometry.length / 2)];
  const label = route.congestion === 'blocked'
    ? `Simulated road blockage on ${route.name}`
    : `Simulated ${route.congestion} congestion on ${route.name}`;
  return { lat: mid[0], lng: mid[1], radiusM: route.congestion === 'moderate' ? 300 : 450, severity: route.congestion, label };
}

/**
 * Computes candidate routes for one origin/hospital pair under a demo scenario.
 * scenario: { code, congestion: {A,B,C}, data_status }
 */
function computeRoutes({ origin, hospital, scenario, now = new Date() }) {
  if (scenario.data_status === 'unavailable') {
    return {
      dataStatus: 'unavailable',
      dataSource: DATA_SOURCE,
      freshnessAt: null,
      etaBasis: ETA_BASIS,
      routes: [],
      recommendedKey: null,
      warnings: ['Routing/traffic data is unavailable (simulated provider failure). No route estimate or assistance recommendation can be made. Use local knowledge and contact the hospital directly.'],
    };
  }

  const freshnessAt = scenario.data_status === 'stale'
    ? new Date(now.getTime() - STALE_DATA_AGE_MIN * 60000)
    : now;

  const routes = ROUTE_SHAPES.map((shape) => {
    const geometry = buildGeometry(origin, hospital, shape.bend);
    const distanceKm = round(polylineKm(geometry) * ROAD_FACTOR, 2);
    const congestion = scenario.congestion[shape.key] || 'none';
    const blocked = congestion === 'blocked';
    const route = {
      key: shape.key,
      name: shape.name,
      distanceKm,
      freeFlowEtaMin: round((distanceKm / SPEED_KMH.none) * 60),
      etaMin: blocked ? null : round((distanceKm / SPEED_KMH[congestion]) * 60),
      congestion,
      blocked,
      geometry,
    };
    route.zones = congestion === 'none' ? [] : [congestionZone(route)];
    return route;
  });

  // Decide which routes are suitable and explain why the others are not.
  const fastestFreeFlow = Math.min(...routes.map((r) => r.freeFlowEtaMin));
  const limit = round(fastestFreeFlow * SUITABLE_ETA_FACTOR);
  for (const r of routes) {
    if (r.blocked) r.rejectionReason = 'Route is blocked (simulated).';
    else if (r.congestion === 'severe') r.rejectionReason = `Severe congestion (simulated): estimated ${r.etaMin} min.`;
    else if (r.etaMin > limit) r.rejectionReason = `Too slow: estimated ${r.etaMin} min exceeds the ${limit} min suitability limit.`;
    else r.rejectionReason = null;
    r.suitable = r.rejectionReason === null;
  }

  // Rank by ETA; blocked routes go last.
  routes.sort((a, b) => (a.etaMin ?? Infinity) - (b.etaMin ?? Infinity));
  routes.forEach((r, i) => { r.rank = i + 1; });

  const warnings = [];
  if (scenario.data_status === 'stale') {
    warnings.push(`Traffic data is stale (simulated, about ${STALE_DATA_AGE_MIN} minutes old). Congestion shown may no longer be accurate, so no assistance recommendation is made.`);
  }

  return {
    dataStatus: scenario.data_status,
    dataSource: DATA_SOURCE,
    freshnessAt: freshnessAt.toISOString(),
    etaBasis: ETA_BASIS,
    routes,
    recommendedKey: routes.find((r) => r.suitable)?.key ?? null,
    warnings,
  };
}

/**
 * Checks whether traffic assistance should be recommended for a computed route set.
 * Returns every check so the UI can explain the decision.
 */
function assessAssistance(result, { staleAfterMinutes, now = new Date() }) {
  const ageMin = result.freshnessAt ? (now - new Date(result.freshnessAt)) / 60000 : null;
  const fresh = result.dataStatus === 'ok' && ageMin !== null && ageMin <= staleAfterMinutes;
  const severe = result.routes.filter((r) => r.congestion === 'severe' || r.blocked);
  const suitable = result.routes.filter((r) => r.suitable);

  const checks = [
    {
      id: 'data_usable',
      label: 'Route and traffic data is available and fresh',
      passed: fresh,
      detail: fresh ? 'Simulated data is current.' : `Data status: ${result.dataStatus}${ageMin !== null ? ` (about ${Math.round(ageMin)} min old)` : ''}.`,
    },
    {
      id: 'routes_found',
      label: 'Candidate routes were found',
      passed: result.routes.length > 0,
      detail: `${result.routes.length} candidate route(s).`,
    },
    {
      id: 'severe_condition',
      label: 'Severe congestion or a blockage is present',
      passed: severe.length > 0,
      detail: severe.length ? severe.map((r) => `${r.key}: ${r.congestion}`).join(', ') : 'No severe congestion or blockage.',
    },
    {
      id: 'no_suitable_alternative',
      label: 'No suitable alternative route remains',
      passed: result.routes.length > 0 && suitable.length === 0,
      detail: suitable.length ? `Suitable route available: ${suitable.map((r) => r.name).join(', ')}.` : 'Every candidate route was rejected.',
    },
  ];

  const eligible = checks.every((c) => c.passed);
  let summary;
  if (eligible) summary = 'Severe congestion with no suitable alternative. Traffic assistance is recommended.';
  else if (!fresh) summary = 'Data is unavailable or stale, so no assistance recommendation can be made.';
  else if (suitable.length) summary = 'A suitable route is available. Traffic assistance is not needed.';
  else summary = 'Assistance conditions are not met.';

  return { eligible, checks, summary };
}

module.exports = { computeRoutes, assessAssistance, DATA_SOURCE, ETA_BASIS, SPEED_KMH, SUITABLE_ETA_FACTOR };
