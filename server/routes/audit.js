'use strict';
const express = require('express');
const { requireRole } = require('../auth');
const { isValidDate } = require('../validation');

module.exports = ({ db }) => {
  const r = express.Router();

  // Histórico geral de alterações (editores e administradores)
  r.get('/', requireRole('editor'), (req, res) => {
    const f = req.query;
    const where = ['1=1'];
    const p = {};
    if (typeof f.entity === 'string' && f.entity) { where.push('a.entity = @entity'); p.entity = f.entity; }
    if (typeof f.action === 'string' && f.action) { where.push('a.action = @action'); p.action = f.action; }
    if (typeof f.user === 'string' && f.user) { where.push('a.username = @user'); p.user = f.user; }
    if (isValidDate(f.from)) { where.push('a.at >= @from'); p.from = `${f.from}T00:00:00`; }
    if (isValidDate(f.to)) { where.push('a.at <= @to'); p.to = `${f.to}T23:59:59.999Z`; }
    if (typeof f.q === 'string' && f.q.trim()) { where.push('fold(a.summary) LIKE @q'); p.q = `%${require('../services/events').fold(f.q.trim())}%`; }
    // Leitores de log de acesso (login) só para administradores
    if (req.user.role !== 'admin') where.push(`a.entity <> 'usuario'`);
    const limit = Math.min(Number(f.limit) || 50, 200);
    const offset = Math.max(Number(f.offset) || 0, 0);
    const w = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM audit_log a WHERE ${w}`).get(p).n;
    const items = db.prepare(`SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE ${w} ORDER BY a.id DESC LIMIT ${limit} OFFSET ${offset}`).all(p)
      .map((x) => ({ ...x, changes: x.changes ? JSON.parse(x.changes) : null }));
    res.json({ total, items, limit, offset });
  });

  return r;
};
