// Login, logout and "who am I" for the demo user accounts.
const express = require('express');
const { verifyPassword } = require('../services/passwords');
const { SESSION_COOKIE, HttpError, badRequest, handle, newToken, requireAuth } = require('../http');
const { nowIso } = require('../db');

module.exports = function authRoutes({ db, config }) {
  const router = express.Router();
  const findUser = db.prepare('SELECT id, username, password_hash, role, display_name, city_id FROM users WHERE username = ?');
  const insertSession = db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
  const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  const userView = (u) => ({ id: u.id, username: u.username, role: u.role, displayName: u.displayName ?? u.display_name, cityId: u.cityId ?? u.city_id });

  router.post('/login', handle((req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      throw badRequest('Username and password are required.');
    }
    const user = findUser.get(username.trim());
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'invalid_credentials', 'Incorrect username or password.');
    }

    const now = new Date();
    const maxAgeSec = Math.round(config.sessionTtlHours * 3600);
    const token = newToken();
    deleteExpired.run(now.toISOString());
    insertSession.run(token, user.id, now.toISOString(), new Date(now.getTime() + maxAgeSec * 1000).toISOString());

    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`);
    res.json({ user: userView(user) });
  }));

  router.post('/logout', handle((req, res) => {
    if (req.sessionToken) deleteSession.run(req.sessionToken);
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    res.json({ ok: true, at: nowIso() });
  }));

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: userView(req.user) });
  });

  return router;
};
