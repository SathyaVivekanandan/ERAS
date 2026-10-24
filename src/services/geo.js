// Small geometry helpers. Distances here are STRAIGHT-LINE, not driving distances.
const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Length of a polyline given as [[lat, lng], ...].
function polylineKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm({ lat: points[i - 1][0], lng: points[i - 1][1] }, { lat: points[i][0], lng: points[i][1] });
  }
  return total;
}

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

module.exports = { haversineKm, polylineKm, round };
