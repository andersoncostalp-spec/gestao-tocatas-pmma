'use strict';
const express = require('express');
const { requireAuth } = require('../auth');

module.exports = ({ db, push }) => {
  const r = express.Router();

  r.get('/key', requireAuth, (req, res) => res.json({ publicKey: push.publicKey }));

  r.post('/subscribe', requireAuth, (req, res) => {
    const s = req.body || {};
    const endpoint = typeof s.endpoint === 'string' ? s.endpoint : '';
    const keys = s.keys || {};
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string'
      || keys.p256dh.length > 200 || keys.auth.length > 100) {
      return res.status(400).json({ error: 'Assinatura inválida.' });
    }
    db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?,?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(req.user.id, endpoint, keys.p256dh, keys.auth, String(req.get('User-Agent') || '').slice(0, 300));
    res.status(201).json({ ok: true });
  });

  r.post('/unsubscribe', requireAuth, (req, res) => {
    const endpoint = (req.body || {}).endpoint;
    if (typeof endpoint === 'string') db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.user.id);
    res.json({ ok: true });
  });

  r.post('/test', requireAuth, async (req, res) => {
    const n = await push.sendToUser(req.user.id, {
      title: 'Teste de notificação', body: 'As notificações da Banda de Música estão funcionando.', url: '/#/painel', tag: 'teste',
    });
    res.json({ sent: n });
  });

  return r;
};
