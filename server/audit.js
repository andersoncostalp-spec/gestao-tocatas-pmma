'use strict';

// Registro de auditoria: quem fez, quando, o quê e a diferença campo a campo.
function createAudit(db) {
  const ins = db.prepare(`INSERT INTO audit_log (user_id, username, action, entity, entity_id, summary, changes, ip)
    VALUES (@user_id, @username, @action, @entity, @entity_id, @summary, @changes, @ip)`);

  function diff(before, after, fields) {
    const changes = {};
    for (const f of fields) {
      const a = before ? before[f] ?? null : null;
      const b = after ? after[f] ?? null : null;
      if (a !== b) changes[f] = [a, b];
    }
    return changes;
  }

  function log({ req, user, action, entity, entityId, summary, changes }) {
    const u = user || (req && req.user) || null;
    ins.run({
      user_id: u ? u.id : null,
      username: u ? u.username : null,
      action,
      entity,
      entity_id: entityId ?? null,
      summary: summary || null,
      changes: changes && Object.keys(changes).length ? JSON.stringify(changes) : null,
      ip: req ? req.ip : null,
    });
  }

  return { log, diff };
}

module.exports = { createAudit };
