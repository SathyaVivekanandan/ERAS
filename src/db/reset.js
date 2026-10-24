// Deletes the database file so the next `npm start` recreates it with fresh demo data.
// Usage: npm run reset-db   (stop the server first)
const fs = require('node:fs');
const config = require('../config');
const { openDb } = require('./index');

for (const suffix of ['', '-wal', '-shm']) {
  const file = config.dbPath + suffix;
  if (fs.existsSync(file)) fs.rmSync(file);
}
openDb(config.dbPath, config).close();
console.log(`Database reset and re-seeded with demo data: ${config.dbPath}`);
