'use strict';
const crypto = require('crypto');

// ---------- Senhas (scrypt nativo do Node) ----------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Hash fictício para equalizar o tempo de resposta quando o usuário não existe
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

function validatePasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (pw.length > 200) return 'Senha muito longa.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'A senha deve conter letras e números.';
  return null;
}

// ---------- Sessões (token aleatório no cookie; só o hash fica no banco) ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSessionStore(db, { sessionDays }) {
  const ttlMs = sessionDays * 24 * 3600 * 1000;
  const q = {
    ins: db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)'),
    get: db.prepare(`SELECT s.id AS sid, s.expires_at, u.id, u.username, u.name, u.posto, u.role,
      u.must_change_password, u.active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`),
    touch: db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM sessions WHERE id = ?'),
    removeUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    removeUserExcept: db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  };

  return {
    ttlMs,
    create(userId, { ip, userAgent } = {}) {
      const token = crypto.randomBytes(32).toString('base64url');
      const now = Date.now();
      q.ins.run(sha256(token), userId, new Date(now).toISOString(), new Date(now + ttlMs).toISOString(),
        ip || null, String(userAgent || '').slice(0, 300));
      return token;
    },
    resolve(token) {
      if (!token || typeof token !== 'string' || token.length > 100) return null;
      const id = sha256(token);
      const row = q.get.get(id);
      if (!row) return null;
      const now = Date.now();
      const exp = Date.parse(row.expires_at);
      if (exp < now || !row.active) {
        q.remove.run(id);
        return null;
      }
      // Renovação deslizante (no máximo uma escrita por hora)
      if (exp - now < ttlMs - 3600_000) q.touch.run(new Date(now + ttlMs).toISOString(), id);
      return row;
    },
    destroy(token) { if (token) q.remove.run(sha256(token)); },
    destroyAllForUser(userId, exceptToken) {
      if (exceptToken) q.removeUserExcept.run(userId, sha256(exceptToken));
      else q.removeUser.run(userId);
    },
    purgeExpired() { q.purge.run(new Date().toISOString()); },
  };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie malformado */ }
  }
  return out;
}

const ROLE_LEVEL = { leitor: 1, editor: 2, admin: 3 };

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
  if (req.user.must_change_password) {
    return res.status(403).json({ error: 'Troca de senha obrigatória.', code: 'MUST_CHANGE_PASSWORD' });
  }
  next();
}

function requireRole(minRole) {
  return (req, res, next) => requireAuth(req, res, () => {
    if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[minRole]) return res.status(403).json({ error: 'Permissão insuficiente.' });
    next();
  });
}

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH, validatePasswordStrength,
  createSessionStore, parseCookies, requireAuth, requireRole, ROLE_LEVEL,
};
