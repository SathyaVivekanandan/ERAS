// Demonstration seed data. EVERY hospital, phone number and user below is FICTIONAL.
// Area names (e.g. "Guindy area") only place demo points on the map; they make no
// claim about real facilities, roads or traffic.

const cities = [
  { id: 'chennai', name: 'Chennai', center_lat: 13.0500, center_lng: 80.2300, zoom: 12, radius_km: 30 },
  { id: 'trichy', name: 'Tiruchirappalli (Trichy)', center_lat: 10.8150, center_lng: 78.7000, zoom: 13, radius_km: 25 },
];

const demoOrigins = [
  { id: 'ch-o1', city_id: 'chennai', name: 'DEMO LOCATION – Guindy area', lat: 13.0067, lng: 80.2206 },
  { id: 'ch-o2', city_id: 'chennai', name: 'DEMO LOCATION – T. Nagar area', lat: 13.0418, lng: 80.2341 },
  { id: 'ch-o3', city_id: 'chennai', name: 'DEMO LOCATION – Anna Nagar area', lat: 13.0850, lng: 80.2101 },
  { id: 'ch-o4', city_id: 'chennai', name: 'DEMO LOCATION – Adyar area', lat: 13.0012, lng: 80.2565 },
  { id: 'tr-o1', city_id: 'trichy', name: 'DEMO LOCATION – Central Bus Stand area', lat: 10.7996, lng: 78.6820 },
  { id: 'tr-o2', city_id: 'trichy', name: 'DEMO LOCATION – Srirangam area', lat: 10.8620, lng: 78.6930 },
  { id: 'tr-o3', city_id: 'trichy', name: 'DEMO LOCATION – Thillai Nagar area', lat: 10.8262, lng: 78.6865 },
  { id: 'tr-o4', city_id: 'trichy', name: 'DEMO LOCATION – Ariyamangalam area', lat: 10.8005, lng: 78.7300 },
];

const SOURCE = 'ERAS fictional demo dataset (not a real hospital)';
const VERIFIED_NOTE = 'Emergency capability set by the ERAS demo administrator for demonstration only.';

const hospitals = [
  // Chennai
  { id: 'ch-h1', city_id: 'chennai', name: 'Marina Coast General Hospital (Demo)', address: '12 Demo Beach Road, Triplicane area, Chennai (fictional address)', lat: 13.0600, lng: 80.2650, phone: 'DEMO-044-555-0101', phone_status: 'demo_placeholder', emergency_capability: 'verified' },
  { id: 'ch-h2', city_id: 'chennai', name: 'Coromandel Multispeciality Hospital (Demo)', address: '45 Sample Street, Ashok Nagar area, Chennai (fictional address)', lat: 13.0350, lng: 80.2150, phone: 'DEMO-044-555-0102', phone_status: 'demo_placeholder', emergency_capability: 'verified' },
  { id: 'ch-h3', city_id: 'chennai', name: 'Lakeview Emergency & Trauma Centre (Demo)', address: '7 Placeholder Avenue, Velachery area, Chennai (fictional address)', lat: 12.9900, lng: 80.2200, phone: 'DEMO-044-555-0103', phone_status: 'demo_placeholder', emergency_capability: 'verified' },
  { id: 'ch-h4', city_id: 'chennai', name: 'Greenfield Medical Institute (Demo)', address: '88 Example Main Road, Kilpauk area, Chennai (fictional address)', lat: 13.0950, lng: 80.2350, phone: 'DEMO-044-555-0104', phone_status: 'unverified', emergency_capability: 'unverified' },
  { id: 'ch-h5', city_id: 'chennai', name: "Sunrise Children's Hospital (Demo)", address: '3 Mock Cross Street, Adyar area, Chennai (fictional address)', lat: 13.0080, lng: 80.2500, phone: 'DEMO-044-555-0105', phone_status: 'demo_placeholder', emergency_capability: 'unverified' },
  { id: 'ch-h6', city_id: 'chennai', name: 'Riverside Nursing Home (Demo)', address: '21 Test Lane, Arumbakkam area, Chennai (fictional address)', lat: 13.0700, lng: 80.1950, phone: null, phone_status: 'unavailable', emergency_capability: 'unverified' },
  // Trichy
  { id: 'tr-h1', city_id: 'trichy', name: 'Cauvery Valley General Hospital (Demo)', address: '10 Demo River Road, Thillai Nagar area, Trichy (fictional address)', lat: 10.8250, lng: 78.6950, phone: 'DEMO-0431-555-0201', phone_status: 'demo_placeholder', emergency_capability: 'verified' },
  { id: 'tr-h2', city_id: 'trichy', name: 'Rockfort Emergency Care Centre (Demo)', address: '5 Sample Fort Street, Chinthamani area, Trichy (fictional address)', lat: 10.8080, lng: 78.6980, phone: 'DEMO-0431-555-0202', phone_status: 'demo_placeholder', emergency_capability: 'verified' },
  { id: 'tr-h3', city_id: 'trichy', name: 'Srirangam Island Hospital (Demo)', address: '17 Placeholder Street, Srirangam area, Trichy (fictional address)', lat: 10.8560, lng: 78.6850, phone: 'DEMO-0431-555-0203', phone_status: 'demo_placeholder', emergency_capability: 'verified' },
  { id: 'tr-h4', city_id: 'trichy', name: 'Thillai Multispeciality Hospital (Demo)', address: '62 Example Road, Woraiyur area, Trichy (fictional address)', lat: 10.8300, lng: 78.6750, phone: 'DEMO-0431-555-0204', phone_status: 'unverified', emergency_capability: 'unverified' },
  { id: 'tr-h5', city_id: 'trichy', name: 'Kollidam Community Hospital (Demo)', address: '9 Mock Nagar, KK Nagar area, Trichy (fictional address)', lat: 10.7750, lng: 78.7050, phone: 'DEMO-0431-555-0205', phone_status: 'demo_placeholder', emergency_capability: 'unverified' },
  { id: 'tr-h6', city_id: 'trichy', name: 'Golden Rock Clinic (Demo)', address: '30 Test Colony, Golden Rock area, Trichy (fictional address)', lat: 10.7920, lng: 78.7280, phone: null, phone_status: 'unavailable', emergency_capability: 'unverified' },
].map((h) => ({
  ...h,
  data_source: SOURCE,
  verification_note: h.emergency_capability === 'verified' ? VERIFIED_NOTE : 'Emergency capability not verified.',
  verified_by: h.emergency_capability === 'verified' ? 'ERAS demo administrator' : null,
}));

// Route keys: A = main corridor, B = inner bypass, C = outer detour.
const scenarios = [
  { code: 'normal', name: 'Normal traffic', description: 'No simulated congestion on any route.', congestion: { A: 'none', B: 'none', C: 'none' }, data_status: 'ok' },
  { code: 'moderate_alt', name: 'Moderate congestion – alternative available', description: 'Route A has moderate congestion; Route B is clear.', congestion: { A: 'moderate', B: 'none', C: 'none' }, data_status: 'ok' },
  { code: 'severe_no_alt', name: 'Severe congestion – no suitable alternative', description: 'Routes A and B are severely congested and Route C is blocked.', congestion: { A: 'severe', B: 'severe', C: 'blocked' }, data_status: 'ok' },
  { code: 'blockage_alt', name: 'Road blockage – alternative available', description: 'Route A is blocked; Route B is clear.', congestion: { A: 'blocked', B: 'none', C: 'moderate' }, data_status: 'ok' },
  { code: 'blockage_no_alt', name: 'Road blockage – no suitable alternative', description: 'Routes A and B are blocked and Route C is severely congested.', congestion: { A: 'blocked', B: 'blocked', C: 'severe' }, data_status: 'ok' },
  { code: 'data_unavailable', name: 'Routing / traffic data unavailable', description: 'Simulates a routing-provider failure. No route estimates are produced.', congestion: {}, data_status: 'unavailable' },
  { code: 'stale_data', name: 'Stale traffic data', description: 'Same congestion as the severe scenario, but the simulated data is too old to rely on.', congestion: { A: 'severe', B: 'severe', C: 'blocked' }, data_status: 'stale' },
];

const users = [
  { username: 'driver1', role: 'driver', display_name: 'Demo Ambulance Driver 1', city_id: null },
  { username: 'driver2', role: 'driver', display_name: 'Demo Ambulance Driver 2', city_id: null },
  { username: 'police_chennai', role: 'police', display_name: 'Demo Traffic Police – Chennai', city_id: 'chennai' },
  { username: 'police_trichy', role: 'police', display_name: 'Demo Traffic Police – Trichy', city_id: 'trichy' },
  { username: 'admin', role: 'admin', display_name: 'Demo Hospital Directory Admin', city_id: null },
];

module.exports = { cities, demoOrigins, hospitals, scenarios, users };
