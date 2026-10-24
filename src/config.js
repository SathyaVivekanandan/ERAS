// Central configuration. Values come from the environment or a local .env file.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
// process.loadEnvFile does not override variables that are already set.
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

module.exports = {
  ROOT,
  port: Number(process.env.PORT || 3000),
  dbPath: path.resolve(ROOT, process.env.DB_PATH || 'data/eras.db'),
  demoPassword: process.env.DEMO_PASSWORD || 'demo123',
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 12),
  requireSolvedNote: process.env.REQUIRE_SOLVED_NOTE === 'true',
  staleAfterMinutes: Number(process.env.STALE_AFTER_MINUTES || 15),
};
