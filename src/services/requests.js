// Shared formatting for assistance requests, so the driver and police dashboards
// always show the same stored record in the same way.
const { STATUS_LABELS, STATUS_DESCRIPTIONS, TRANSITIONS, OPEN_STATUSES } = require('./status');
const { hospitalView } = require('../views');

const DISCLAIMER = 'DEMONSTRATION ONLY: this is an internal in-app request. No real police officer has been contacted, and "Solved" does not mean a real road has been cleared.';
const ETA_NOT_RECALCULATED = 'ETA not recalculated: changing the request status does not change the simulated route data. The driver can switch the demo scenario to recompute routes.';

// Who should receive live events about a request.
const audienceFor = (request) => (user) =>
  user.role === 'admin'
  || (user.role === 'police' && (!user.cityId || user.cityId === request.city_id))
  || (user.role === 'driver' && user.id === request.driver_id);

const policeFor = (cityId) => (user) => user.role === 'police' && (!user.cityId || user.cityId === cityId);

function canSee(user, request) {
  return audienceFor(request)(user);
}

function timing(r, now) {
  const open = OPEN_STATUSES.includes(r.status);
  const meaningful = r.eta_at !== null;
  const minutesRemaining = meaningful && open ? Math.round((new Date(r.eta_at) - now) / 60000) : null;
  const overdue = minutesRemaining !== null && minutesRemaining < 0;
  return {
    createdAt: r.created_at,
    etaMin: r.eta_min,
    etaAt: r.eta_at,
    etaBasis: r.eta_basis,
    etaUpdatedAt: r.eta_updated_at,
    uncertainty: meaningful ? 'SIMULATED estimate – actual arrival may differ by about ±40%.' : 'No meaningful ETA: no usable route estimate.',
    minutesRemaining,
    overdue,
    warning: overdue ? 'The estimated arrival time has passed and this request is still open.' : null,
  };
}

function makeRequestViews(db) {
  const q = {
    hospital: db.prepare('SELECT * FROM hospitals WHERE id = ?'),
    city: db.prepare('SELECT id, name FROM cities WHERE id = ?'),
    user: db.prepare('SELECT id, display_name, role FROM users WHERE id = ?'),
    trip: db.prepare('SELECT id, status, origin_label, origin_lat, origin_lng, started_at FROM trips WHERE id = ?'),
    history: db.prepare(`SELECT h.*, u.display_name FROM assistance_status_history h JOIN users u ON u.id = h.actor_id
      WHERE h.request_id = ? ORDER BY h.id`),
    policeNotification: db.prepare("SELECT delivery_status, read_at FROM notifications WHERE request_id = ? AND recipient_role = 'police' ORDER BY id LIMIT 1"),
  };

  function requestView(r, { now = new Date(), includeHistory = true } = {}) {
    const hospital = hospitalView(q.hospital.get(r.hospital_id));
    const trip = q.trip.get(r.trip_id);
    const driver = q.user.get(r.driver_id);
    const notification = q.policeNotification.get(r.id);
    const view = {
      id: r.id,
      status: r.status,
      statusLabel: STATUS_LABELS[r.status],
      statusDescription: STATUS_DESCRIPTIONS[r.status],
      isOpen: OPEN_STATUSES.includes(r.status),
      allowedNextStatuses: TRANSITIONS[r.status],
      city: q.city.get(r.city_id),
      origin: { label: trip.origin_label, lat: trip.origin_lat, lng: trip.origin_lng },
      hospital: { id: hospital.id, name: hospital.name, address: hospital.address, lat: hospital.lat, lng: hospital.lng, phone: hospital.phone, phoneNote: hospital.phoneNote, emergencyCapabilityLabel: hospital.emergencyCapabilityLabel },
      driver: { id: driver.id, displayName: driver.display_name },
      trip: { id: trip.id, status: trip.status, startedAt: trip.started_at },
      route: r.route_key ? { key: r.route_key, name: r.route_name, distanceKm: r.distance_km, geometry: JSON.parse(r.route_geometry_json) } : null,
      zones: JSON.parse(r.zones_json),
      affectedArea: r.affected_area,
      congestionSeverity: r.congestion_severity,
      reason: r.reason,
      routesConsidered: JSON.parse(r.routes_considered_json),
      timing: timing(r, now),
      driverConfirmedAt: r.driver_confirmed_at,
      latestNote: r.latest_note,
      etaRecalculated: r.eta_recalculated === 1,
      etaNote: r.eta_recalculated === 1 ? 'ETA was recalculated from updated route data.' : ETA_NOT_RECALCULATED,
      notification: notification ? { deliveryStatus: notification.delivery_status, readAt: notification.read_at } : null,
      dataLabel: 'SIMULATED DEMO DATA',
      disclaimer: DISCLAIMER,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
    if (includeHistory) {
      view.history = q.history.all(r.id).map((h) => ({
        fromStatus: h.from_status,
        toStatus: h.to_status,
        toStatusLabel: STATUS_LABELS[h.to_status],
        actor: h.display_name,
        actorRole: h.actor_role,
        note: h.note,
        at: h.created_at,
      }));
    }
    return view;
  }

  return { requestView };
}

module.exports = { makeRequestViews, audienceFor, policeFor, canSee, DISCLAIMER };
