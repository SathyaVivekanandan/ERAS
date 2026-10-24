// HTTP helpers: errors, cookies, authentication and role checks.
const crypto = require('node:crypto');

const SESSION_COOKIE = 'eras_session';

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const badRequest = (message, code = 'invalid_input') => new HttpError(400, code, message);
const notFound = (what) => new HttpError(404, 'not_found', `${what} not found.`);

// Wraps a route handler so thrown errors reach the error middleware.
const handle = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res, next);
    if (out && typeof out.catch === 'function') out.catch(next);
  } catch (err) {
    next(err);
  }
};

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}

const newToken = () => crypto.randomBytes(32).toString('hex');

// Attaches req.user when a valid session cookie is present.
function loadUser(db) {
  const find = db.prepare(`SELECT u.id, u.username, u.role, u.display_name, u.city_id, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`);
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const row = find.get(token);
      if (row && new Date(row.expires_at) > new Date()) {
        req.user = { id: row.id, username: row.username, role: row.role, displayName: row.display_name, cityId: row.city_id };
        req.sessionToken = token;
      }
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Please log in.'));
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Please log in.'));
  if (!roles.includes(req.user.role)) {
    return next(new HttpError(403, 'forbidden', `This action requires the ${roles.join(' or ')} role.`));
  }
  next();
};

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'server_error', message: 'Unexpected server error. The action may not have been saved.' } });
}

module.exports = {
  SESSION_COOKIE, HttpError, badRequest, notFound, handle, newToken, loadUser, requireAuth, requireRole, errorHandler,
};
