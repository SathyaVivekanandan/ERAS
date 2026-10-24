// In-app notifications and the live event stream. Nothing here leaves the application.
const express = require('express');
const { badRequest, handle, requireAuth } = require('../http');
const { nowIso } = require('../db');

module.exports = function notificationRoutes({ db, hub }) {
  const router = express.Router();

  // A user's notifications: addressed to them directly, or to their role in their city.
  const MINE = `(recipient_user_id = :uid OR (recipient_role = :role AND (:city IS NULL OR city_id = :city)))`;
  const list = db.prepare(`SELECT * FROM notifications WHERE ${MINE} ORDER BY id DESC LIMIT 50`);
  const unread = db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${MINE} AND read_at IS NULL`);
  const markOne = db.prepare(`UPDATE notifications SET read_at = :now WHERE id = :id AND read_at IS NULL AND ${MINE}`);
  const markForRequest = db.prepare(`UPDATE notifications SET read_at = :now WHERE request_id = :rid AND read_at IS NULL AND ${MINE}`);

  const who = (user) => ({ uid: user.id, role: user.role, city: user.cityId ?? null });

  router.get('/notifications', requireAuth, (req, res) => {
    res.json({
      notifications: list.all(who(req.user)).map((n) => ({
        id: n.id, requestId: n.request_id, type: n.type, message: n.message,
        deliveryStatus: n.delivery_status, createdAt: n.created_at, readAt: n.read_at,
      })),
      unreadCount: unread.get(who(req.user)).n,
      label: 'In-app demo notifications only – no SMS, call or real police message is sent.',
    });
  });

  // POST /api/notifications/read { ids: [1, 2] } or { requestId: 'AR-...' }
  router.post('/notifications/read', requireAuth, handle((req, res) => {
    const { ids, requestId } = req.body || {};
    const now = nowIso();
    let marked = 0;
    if (Array.isArray(ids)) {
      for (const id of ids) marked += Number(markOne.run({ ...who(req.user), now, id: Number(id) }).changes);
    } else if (typeof requestId === 'string') {
      marked = Number(markForRequest.run({ ...who(req.user), now, rid: requestId }).changes);
    } else {
      throw badRequest('Provide ids (array) or requestId.');
    }
    res.json({ marked });
  }));

  // Server-Sent Events stream. Dashboards refetch data when an event arrives.
  router.get('/events', requireAuth, (req, res) => {
    hub.add(req, res, req.user);
  });

  return router;
};
