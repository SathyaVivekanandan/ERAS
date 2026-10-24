// Opens the shared SQLite database, creates tables, and seeds demo data on first run.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('../services/passwords');
const seed = require('./seed-data');

const nowIso = () => new Date().toISOString();

function openDb(dbPath, { demoPassword }) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n === 0) seedDatabase(db, demoPassword);
  return db;
}

// Runs fn inside a transaction; rolls back if it throws.
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function seedDatabase(db, demoPassword) {
  const now = nowIso();
  tx(db, () => {
    const city = db.prepare('INSERT INTO cities (id, name, center_lat, center_lng, zoom, radius_km) VALUES (?, ?, ?, ?, ?, ?)');
    for (const c of seed.cities) city.run(c.id, c.name, c.center_lat, c.center_lng, c.zoom, c.radius_km);

    const origin = db.prepare('INSERT INTO demo_origins (id, city_id, name, lat, lng) VALUES (?, ?, ?, ?, ?)');
    for (const o of seed.demoOrigins) origin.run(o.id, o.city_id, o.name, o.lat, o.lng);

    const hospital = db.prepare(`INSERT INTO hospitals
      (id, city_id, name, address, lat, lng, phone, phone_status, emergency_capability,
       availability_status, data_source, verification_note, verified_by, verified_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_connected', ?, ?, ?, ?, ?)`);
    for (const h of seed.hospitals) {
      hospital.run(h.id, h.city_id, h.name, h.address, h.lat, h.lng, h.phone, h.phone_status,
        h.emergency_capability, h.data_source, h.verification_note, h.verified_by,
        h.verified_by ? now : null, now);
    }

    const scenario = db.prepare('INSERT INTO demo_scenarios (code, name, description, congestion_json, data_status, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    seed.scenarios.forEach((s, i) => scenario.run(s.code, s.name, s.description, JSON.stringify(s.congestion), s.data_status, i));

    const user = db.prepare('INSERT INTO users (username, password_hash, role, display_name, city_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const u of seed.users) user.run(u.username, hashPassword(demoPassword), u.role, u.display_name, u.city_id, now);
  });
}

module.exports = { openDb, tx, nowIso };
