// Builds the ERAS web application: one shared database and API for every dashboard.
const path = require('node:path');
const express = require('express');
const defaultConfig = require('./config');
const { openDb } = require('./db');
const { EventHub } = require('./services/events');
const { loadUser, errorHandler, HttpError } = require('./http');
const authRoutes = require('./routes/auth');
const directoryRoutes = require('./routes/directory');
const tripRoutes = require('./routes/trips');
const assistanceRoutes = require('./routes/assistance');
const notificationRoutes = require('./routes/notifications');

function createApp(overrides = {}) {
  const config = { ...defaultConfig, ...overrides };
  const db = openDb(config.dbPath, config);
  const hub = new EventHub();
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(loadUser(db));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, app: 'ERAS', mode: 'DEMONSTRATION PROTOTYPE – simulated data only', time: new Date().toISOString() });
  });
  app.use('/api/auth', authRoutes({ db, config }));
  app.use('/api', directoryRoutes({ db, hub, config }));
  app.use('/api/trips', tripRoutes({ db, config }));
  app.use('/api/assistance', assistanceRoutes({ db, hub, config }));
  app.use('/api', notificationRoutes({ db, hub }));

  app.use('/api', (req, res, next) => next(new HttpError(404, 'not_found', `No API endpoint ${req.method} ${req.originalUrl}`)));
  app.use(express.static(path.join(config.ROOT, 'public')));
  app.use(errorHandler);

  const close = () => {
    hub.close();
    db.close();
  };
  return { app, db, hub, config, close };
}

module.exports = { createApp };
