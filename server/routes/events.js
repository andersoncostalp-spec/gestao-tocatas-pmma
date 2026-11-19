'use strict';
const express = require('express');
const { requireAuth, requireRole } = require('../auth');
const { validateEvent, isValidDate } = require('../validation');

module.exports = ({ db, events }) => {
  const r = express.Router();
  const idParam = (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'ID inválido.' }); return null; }
    return id;
  };
  const dateOrNull = (v) => (typeof v === 'string' && isValidDate(v) ? v : null);

  // Pesquisa: ?q=&from=&to=&entidade=&local=&documento=&numero=&status=&semDocumento=1
  r.get('/', requireAuth, (req, res) => {
    const f = req.query;
    res.json(events.search({
      q: str(f.q), from: dateOrNull(f.from), to: dateOrNull(f.to), entidade: str(f.entidade), local: str(f.local),
      documento: str(f.documento), numero: str(f.numero), status: str(f.status), semDocumento: f.semDocumento === '1',
      order: f.order, limit: f.limit, offset: f.offset,
    }));
  });

  // Próximos eventos a partir de hoje (painel)
  r.get('/upcoming', requireAuth, (req, res) => {
    const today = localToday(req.app);
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const result = events.search({ from: today, status: 'agendado,confirmado', limit });
    const in7 = addDays(today, 7);
    const monthStart = today.slice(0, 8) + '01';
    const monthEnd = today.slice(0, 8) + '31';
    const count = (sql, ...p) => db.prepare(`SELECT COUNT(*) AS n FROM events WHERE deleted_at IS NULL AND status <> 'cancelado' AND ${sql}`).get(...p).n;
    res.json({
      today,
      items: result.items,
      stats: {
        hoje: count('data = ?', today),
        proximos7: count('data >= ? AND data <= ?', today, in7),
        mes: count('data >= ? AND data <= ?', monthStart, monthEnd),
        semDocumento: count(`data >= ? AND (numero_documento IS NULL OR numero_documento = '')`, today),
      },
    });
  });

  // Formato do FullCalendar: ?start=&end=
  r.get('/calendar', requireAuth, (req, res) => {
    const from = dateOrNull(String(req.query.start || '').slice(0, 10));
    const to = dateOrNull(String(req.query.end || '').slice(0, 10));
    if (!from || !to) return res.status(400).json({ error: 'Período inválido.' });
    const { items } = events.search({ from, to, limit: 1000 });
    res.json(items);
  });

  r.get('/suggestions/:field', requireAuth, (req, res) => res.json(events.suggestions(req.params.field)));

  r.get('/export.csv', requireAuth, (req, res) => {
    const f = req.query;
    const { items } = events.search({ from: dateOrNull(f.from), to: dateOrNull(f.to), limit: 1000 });
    const cols = ['numero', 'ano', 'data', 'hora_inicio', 'hora_fim', 'evento', 'formacao', 'entidade', 'local',
      'tipo_documento', 'numero_documento', 'status', 'uniforme', 'contato', 'telefone', 'observacoes'];
    const esc = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita injeção de fórmulas em planilhas
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = '﻿' + [cols.join(';'), ...items.map((e) => cols.map((c) => esc(e[c])).join(';'))].join('\r\n');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="eventos.csv"');
    res.send(csv);
  });

  r.get('/:id', requireAuth, (req, res) => {
    const id = idParam(req, res); if (!id) return;
    const e = events.get(id);
    if (!e) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json(e);
  });

  r.get('/:id/history', requireAuth, (req, res) => {
    const id = idParam(req, res); if (!id) return;
    const rows = db.prepare(`SELECT a.id, a.at, a.username, u.name AS user_name, a.action, a.summary, a.changes
      FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entity = 'evento' AND a.entity_id = ? ORDER BY a.id DESC`).all(id);
    res.json(rows.map((x) => ({ ...x, changes: x.changes ? JSON.parse(x.changes) : null })));
  });

  r.post('/', requireRole('editor'), (req, res) => {
    const data = validateEvent(req.body);
    res.status(201).json(events.create(data, req));
  });

  r.put('/:id', requireRole('editor'), (req, res) => {
    const id = idParam(req, res); if (!id) return;
    const current = events.get(id);
    if (!current) return res.status(404).json({ error: 'Evento não encontrado.' });
    // Valida o registro resultante completo (permite atualização parcial)
    const merged = { ...current, ...req.body };
    const data = validateEvent(merged);
    for (const k of ['hora_fim', 'formacao', 'numero_documento', 'uniforme', 'contato', 'telefone', 'observacoes']) {
      if (!(k in data)) data[k] = null;
    }
    res.json(events.update(id, data, req));
  });

  r.delete('/:id', requireRole('editor'), (req, res) => {
    const id = idParam(req, res); if (!id) return;
    if (!events.remove(id, req)) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json({ ok: true });
  });

  return r;
};

function str(v) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null; }

function localToday(app) {
  const offset = (app.get('tzOffset') || '-03:00');
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return new Date(Date.now() + sign * (h * 60 + m) * 60000).toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports.localToday = localToday;
module.exports.addDays = addDays;
