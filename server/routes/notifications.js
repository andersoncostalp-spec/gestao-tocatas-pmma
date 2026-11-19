'use strict';
const express = require('express');
const { requireAuth } = require('../auth');

module.exports = ({ db }) => {
  const r = express.Router();

  r.get('/', requireAuth, (req, res) => {
    const items = db.prepare(`SELECT id, event_id, kind, title, body, read_at, created_at FROM notifications
      WHERE user_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id);
    const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n;
    res.json({ items, unread });
  });

  r.post('/read-all', requireAuth, (req, res) => {
    db.prepare(`UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND read_at IS NULL`).run(req.user.id);
    res.json({ ok: true });
  });

  return r;
};
