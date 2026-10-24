-- ERAS database schema (SQLite). All timestamps are ISO-8601 UTC strings.

CREATE TABLE IF NOT EXISTS cities (
  id          TEXT PRIMARY KEY,              -- 'chennai' | 'trichy'
  name        TEXT NOT NULL,
  center_lat  REAL NOT NULL,
  center_lng  REAL NOT NULL,
  zoom        INTEGER NOT NULL,
  radius_km   REAL NOT NULL                  -- custom demo origins must lie within this radius
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('driver', 'police', 'admin')),
  display_name  TEXT NOT NULL,
  city_id       TEXT REFERENCES cities(id),  -- police: city they handle; NULL = all cities
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_origins (
  id       TEXT PRIMARY KEY,
  city_id  TEXT NOT NULL REFERENCES cities(id),
  name     TEXT NOT NULL,
  lat      REAL NOT NULL,
  lng      REAL NOT NULL
);

-- Hospital directory shared by every dashboard. All seeded hospitals are FICTIONAL.
CREATE TABLE IF NOT EXISTS hospitals (
  id                         TEXT PRIMARY KEY,
  city_id                    TEXT NOT NULL REFERENCES cities(id),
  name                       TEXT NOT NULL,
  address                    TEXT NOT NULL,
  lat                        REAL NOT NULL,
  lng                        REAL NOT NULL,
  phone                      TEXT,
  phone_status               TEXT NOT NULL DEFAULT 'unavailable'
                               CHECK (phone_status IN ('verified', 'unverified', 'demo_placeholder', 'unavailable')),
  emergency_capability       TEXT NOT NULL DEFAULT 'unverified'
                               CHECK (emergency_capability IN ('verified', 'unverified')),
  availability_status        TEXT NOT NULL DEFAULT 'not_connected'
                               CHECK (availability_status IN ('not_connected', 'confirmed_by_authorized_source')),
  availability_source        TEXT,
  availability_confirmed_at  TEXT,
  data_source                TEXT NOT NULL,
  verification_note          TEXT,
  verified_by                TEXT,
  verified_at                TEXT,
  updated_at                 TEXT NOT NULL
);

-- Reproducible simulated traffic scenarios. congestion_json maps route key -> level.
CREATE TABLE IF NOT EXISTS demo_scenarios (
  code             TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL,
  congestion_json  TEXT NOT NULL,            -- e.g. {"A":"severe","B":"none","C":"blocked"}
  data_status      TEXT NOT NULL CHECK (data_status IN ('ok', 'stale', 'unavailable')),
  sort_order       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trips (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id           INTEGER NOT NULL REFERENCES users(id),
  city_id             TEXT NOT NULL REFERENCES cities(id),
  origin_id           TEXT REFERENCES demo_origins(id),   -- NULL when a custom demo point was used
  origin_label        TEXT NOT NULL,
  origin_lat          REAL NOT NULL,
  origin_lng          REAL NOT NULL,
  hospital_id         TEXT NOT NULL REFERENCES hospitals(id),
  scenario_code       TEXT NOT NULL REFERENCES demo_scenarios(code),
  selected_route_key  TEXT,
  status              TEXT NOT NULL CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  data_status         TEXT NOT NULL,
  data_source         TEXT NOT NULL,
  data_freshness_at   TEXT,
  warnings_json       TEXT NOT NULL DEFAULT '[]',
  routes_computed_at  TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  started_at          TEXT,
  ended_at            TEXT,
  updated_at          TEXT NOT NULL
);

-- Candidate route summaries computed for a trip (replaced when the scenario changes).
CREATE TABLE IF NOT EXISTS trip_routes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id            INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  route_key          TEXT NOT NULL,
  name               TEXT NOT NULL,
  rank               INTEGER NOT NULL,
  distance_km        REAL NOT NULL,
  eta_min            REAL,                   -- NULL when the route is blocked
  free_flow_eta_min  REAL NOT NULL,
  congestion         TEXT NOT NULL CHECK (congestion IN ('none', 'moderate', 'severe', 'blocked')),
  suitable           INTEGER NOT NULL,
  rejection_reason   TEXT,
  geometry_json      TEXT NOT NULL,          -- [[lat,lng], ...]
  zones_json         TEXT NOT NULL,          -- simulated congestion zones on this route
  UNIQUE (trip_id, route_key)
);

CREATE TABLE IF NOT EXISTS assistance_requests (
  id                     TEXT PRIMARY KEY,   -- e.g. AR-20261024-3F9A1C
  client_request_id      TEXT NOT NULL UNIQUE,  -- idempotency key from the driver's browser
  trip_id                INTEGER NOT NULL REFERENCES trips(id),
  driver_id              INTEGER NOT NULL REFERENCES users(id),
  city_id                TEXT NOT NULL REFERENCES cities(id),
  hospital_id            TEXT NOT NULL REFERENCES hospitals(id),
  route_key              TEXT,
  route_name             TEXT,
  route_geometry_json    TEXT,
  affected_area          TEXT NOT NULL,
  congestion_severity    TEXT NOT NULL,
  reason                 TEXT NOT NULL,
  routes_considered_json TEXT NOT NULL,
  zones_json             TEXT NOT NULL,
  distance_km            REAL,
  eta_min                REAL,
  eta_at                 TEXT,
  eta_basis              TEXT NOT NULL,
  eta_updated_at         TEXT,
  eta_recalculated       INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL
                           CHECK (status IN ('new', 'acknowledged', 'in_progress', 'solved', 'unable_to_resolve')),
  driver_confirmed_at    TEXT NOT NULL,
  latest_note            TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_city_status ON assistance_requests (city_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_trip ON assistance_requests (trip_id);

CREATE TABLE IF NOT EXISTS assistance_status_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   TEXT NOT NULL REFERENCES assistance_requests(id),
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  actor_id     INTEGER NOT NULL REFERENCES users(id),
  actor_role   TEXT NOT NULL,
  note         TEXT,
  created_at   TEXT NOT NULL
);

-- In-app notifications only. Nothing here is sent outside the application.
CREATE TABLE IF NOT EXISTS notifications (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id         TEXT REFERENCES assistance_requests(id),
  recipient_role     TEXT,                   -- set for role-wide notifications (police of a city)
  recipient_user_id  INTEGER REFERENCES users(id),
  city_id            TEXT REFERENCES cities(id),
  type               TEXT NOT NULL,
  message            TEXT NOT NULL,
  delivery_status    TEXT NOT NULL DEFAULT 'stored'
                       CHECK (delivery_status IN ('stored', 'pushed_live', 'push_failed')),
  created_at         TEXT NOT NULL,
  read_at            TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  details     TEXT,
  created_at  TEXT NOT NULL
);
