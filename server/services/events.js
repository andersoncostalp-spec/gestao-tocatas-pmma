'use strict';
const { EVENT_FIELDS } = require('../validation');

// Remove acentos e passa para minúsculas: permite busca "assembleia" achar "ASSEMBLÉIA"
function fold(s) {
  if (s === null || s === undefined) return null;
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const COLS = `e.id, e.ano, e.numero, e.data, e.hora_inicio, e.hora_fim, e.evento, e.formacao, e.entidade, e.local,
  e.tipo_documento, e.numero_documento, e.status, e.uniforme, e.contato, e.telefone, e.observacoes,
  e.created_at, e.updated_at, e.created_by, e.updated_by,
  cu.name AS created_by_name, uu.name AS updated_by_name`;
const FROM = `FROM events e LEFT JOIN users cu ON cu.id = e.created_by LEFT JOIN users uu ON uu.id = e.updated_by`;

function createEventService(db, audit) {
  db.function('fold', { deterministic: true }, fold);
  db.function('digits', { deterministic: true }, (s) => (s == null ? null : String(s).replace(/\D/g, '')));

  const q = {
    get: db.prepare(`SELECT ${COLS} ${FROM} WHERE e.id = ? AND e.deleted_at IS NULL`),
    nextNumber: db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM events WHERE ano = ?'),
    insert: db.prepare(`INSERT INTO events (ano, numero, data, hora_inicio, hora_fim, evento, formacao, entidade, local,
      tipo_documento, numero_documento, status, uniforme, contato, telefone, observacoes, created_by, updated_by)
      VALUES (@ano, @numero, @data, @hora_inicio, @hora_fim, @evento, @formacao, @entidade, @local,
      @tipo_documento, @numero_documento, @status, @uniforme, @contato, @telefone, @observacoes, @user_id, @user_id)`),
    softDelete: db.prepare(`UPDATE events SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_by = ? WHERE id = ?`),
  };

  const label = (e) => `Nº ${String(e.numero).padStart(3, '0')}/${e.ano}`;

  const create = db.transaction((data, req) => {
    const ano = Number(data.data.slice(0, 4));
    const numero = q.nextNumber.get(ano).n;
    const row = {
      hora_fim: null, formacao: null, numero_documento: null, uniforme: null, contato: null, telefone: null,
      observacoes: null, ...data, ano, numero, user_id: req.user.id,
    };
    const { lastInsertRowid } = q.insert.run(row);
    const created = q.get.get(lastInsertRowid);
    audit.log({
      req, action: 'criar', entity: 'evento', entityId: created.id,
      summary: `Evento ${label(created)} criado: ${created.evento}`,
      changes: audit.diff(null, created, EVENT_FIELDS),
    });
    return created;
  });

  const update = db.transaction((id, data, req) => {
    const before = q.get.get(id);
    if (!before) return null;
    const fields = Object.keys(data).filter((k) => EVENT_FIELDS.includes(k));
    if (fields.length) {
      const sets = fields.map((f) => `${f} = @${f}`).join(', ');
      db.prepare(`UPDATE events SET ${sets}, updated_by = @user_id, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = @id`).run({ ...pick(data, fields), user_id: req.user.id, id });
    }
    const after = q.get.get(id);
    const changes = audit.diff(before, after, EVENT_FIELDS);
    if (Object.keys(changes).length) {
      let action = 'editar';
      if (changes.status && after.status === 'cancelado') action = 'cancelar';
      audit.log({ req, action, entity: 'evento', entityId: id, summary: `Evento ${label(after)} ${action === 'cancelar' ? 'cancelado' : 'alterado'}`, changes });
    }
    return after;
  });

  const remove = db.transaction((id, req) => {
    const before = q.get.get(id);
    if (!before) return false;
    q.softDelete.run(req.user.id, id);
    audit.log({ req, action: 'excluir', entity: 'evento', entityId: id, summary: `Evento ${label(before)} excluído: ${before.evento}`,
      changes: audit.diff(before, null, EVENT_FIELDS) });
    return true;
  });

  function search(f = {}) {
    const where = ['e.deleted_at IS NULL'];
    const p = {};
    if (f.from) { where.push('e.data >= @from'); p.from = f.from; }
    if (f.to) { where.push('e.data <= @to'); p.to = f.to; }
    if (f.status) {
      const list = String(f.status).split(',').filter(Boolean);
      where.push(`e.status IN (${list.map((_, i) => `@st${i}`).join(',')})`);
      list.forEach((s, i) => { p[`st${i}`] = s; });
    }
    if (f.entidade) { where.push(`fold(e.entidade) LIKE @entidade`); p.entidade = `%${fold(f.entidade)}%`; }
    if (f.local) { where.push(`fold(e.local) LIKE @local`); p.local = `%${fold(f.local)}%`; }
    if (f.documento) {
      const d = String(f.documento).replace(/\D/g, '');
      if (d) { where.push(`(digits(e.numero_documento) LIKE @docd OR fold(e.numero_documento) LIKE @doc)`); p.docd = `%${d}%`; }
      else where.push(`fold(e.numero_documento) LIKE @doc`);
      p.doc = `%${fold(f.documento)}%`;
    }
    if (f.semDocumento) where.push(`(e.numero_documento IS NULL OR e.numero_documento = '')`);
    if (f.numero) {
      const m = String(f.numero).match(/^(\d+)(?:\s*\/\s*(\d{4}))?$/);
      if (m) {
        where.push('e.numero = @numero'); p.numero = Number(m[1]);
        if (m[2]) { where.push('e.ano = @ano'); p.ano = Number(m[2]); }
      }
    }
    if (f.q) {
      const terms = fold(f.q).split(/\s+/).filter(Boolean).slice(0, 8);
      terms.forEach((t, i) => {
        where.push(`(fold(e.evento) LIKE @q${i} OR fold(e.entidade) LIKE @q${i} OR fold(e.local) LIKE @q${i}
          OR fold(e.formacao) LIKE @q${i} OR fold(e.numero_documento) LIKE @q${i} OR fold(e.observacoes) LIKE @q${i}
          OR fold(e.contato) LIKE @q${i})`);
        p[`q${i}`] = `%${t}%`;
      });
    }
    const order = f.order === 'desc' ? 'DESC' : 'ASC';
    const limit = Math.min(Math.max(Number(f.limit) || 100, 1), 1000);
    const offset = Math.max(Number(f.offset) || 0, 0);
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM events e WHERE ${whereSql}`).get(p).n;
    const items = db.prepare(`SELECT ${COLS} ${FROM} WHERE ${whereSql}
      ORDER BY e.data ${order}, e.hora_inicio ${order}, e.id ${order} LIMIT ${limit} OFFSET ${offset}`).all(p);
    return { total, items, limit, offset };
  }

  // Eventos do mês para o mapa: exclui cancelados, ordem cronológica, numeração sequencial 1..n
  function monthMap(ano, mes) {
    const mm = String(mes).padStart(2, '0');
    const items = db.prepare(`SELECT ${COLS} ${FROM} WHERE e.deleted_at IS NULL AND e.status <> 'cancelado'
      AND e.data >= ? AND e.data <= ? ORDER BY e.data, e.hora_inicio, e.id`).all(`${ano}-${mm}-01`, `${ano}-${mm}-31`);
    return items.map((e, i) => ({ ...e, ordem: i + 1 }));
  }

  function suggestions(field) {
    if (!['entidade', 'local', 'formacao', 'uniforme'].includes(field)) return [];
    return db.prepare(`SELECT ${field} AS v, COUNT(*) AS n FROM events WHERE deleted_at IS NULL AND ${field} IS NOT NULL
      GROUP BY ${field} ORDER BY n DESC, ${field} LIMIT 200`).all().map((r) => r.v);
  }

  return { get: (id) => q.get.get(id), create, update, remove, search, monthMap, suggestions, label };
}

function pick(obj, keys) {
  const o = {};
  for (const k of keys) o[k] = obj[k] === undefined ? null : obj[k];
  return o;
}

module.exports = { createEventService, fold };
