'use strict';
const express = require('express');
const { requireRole, hashPassword, validatePasswordStrength } = require('../auth');
const { ROLES, str } = require('../validation');

module.exports = ({ db, audit, sessions }) => {
  const r = express.Router();
  const cols = 'id, username, name, posto, role, active, must_change_password, last_login_at, created_at';
  const get = (id) => db.prepare(`SELECT ${cols} FROM users WHERE id = ?`).get(id);
  const FIELDS = ['username', 'name', 'posto', 'role', 'active'];

  r.get('/', requireRole('admin'), (req, res) => {
    res.json(db.prepare(`SELECT ${cols} FROM users ORDER BY active DESC, name`).all());
  });

  r.post('/', requireRole('admin'), (req, res) => {
    const b = req.body || {};
    const username = str(b.username, 50);
    const name = str(b.name, 120);
    const errors = {};
    if (!username || !/^[a-zA-Z0-9._-]{3,50}$/.test(username)) errors.username = 'Use 3 a 50 caracteres: letras, números, ponto, hífen ou sublinhado.';
    if (!name) errors.name = 'Campo obrigatório.';
    if (!ROLES.includes(b.role)) errors.role = 'Perfil inválido.';
    const weak = validatePasswordStrength(b.password);
    if (weak) errors.password = weak;
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Dados inválidos.', errors });
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      return res.status(409).json({ error: 'Nome de usuário já existe.', errors: { username: 'Já existe.' } });
    }
    const { lastInsertRowid } = db.prepare(`INSERT INTO users (username, name, posto, role, password_hash, must_change_password)
      VALUES (?,?,?,?,?,1)`).run(username, name, str(b.posto, 60), b.role, hashPassword(b.password));
    const u = get(lastInsertRowid);
    audit.log({ req, action: 'criar', entity: 'usuario', entityId: u.id, summary: `Usuário ${u.username} criado (${u.role})`, changes: audit.diff(null, u, FIELDS) });
    res.status(201).json(u);
  });

  r.put('/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const before = get(id);
    if (!before) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const b = req.body || {};
    const upd = {
      name: b.name !== undefined ? str(b.name, 120) : before.name,
      posto: b.posto !== undefined ? str(b.posto, 60) : before.posto,
      role: b.role !== undefined ? b.role : before.role,
      active: b.active !== undefined ? (b.active ? 1 : 0) : before.active,
    };
    if (!upd.name) return res.status(400).json({ error: 'Nome obrigatório.' });
    if (!ROLES.includes(upd.role)) return res.status(400).json({ error: 'Perfil inválido.' });
    if (id === req.user.id && (upd.role !== 'admin' || !upd.active)) {
      return res.status(400).json({ error: 'Você não pode remover seu próprio acesso de administrador.' });
    }
    db.prepare(`UPDATE users SET name=@name, posto=@posto, role=@role, active=@active,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=@id`).run({ ...upd, id });
    if (!upd.active) sessions.destroyAllForUser(id);
    const after = get(id);
    audit.log({ req, action: 'editar', entity: 'usuario', entityId: id, summary: `Usuário ${after.username} alterado`, changes: audit.diff(before, after, FIELDS) });
    res.json(after);
  });

  r.post('/:id/reset-password', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const u = get(id);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const weak = validatePasswordStrength((req.body || {}).password);
    if (weak) return res.status(400).json({ error: weak });
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(req.body.password), id);
    sessions.destroyAllForUser(id);
    audit.log({ req, action: 'redefinir_senha', entity: 'usuario', entityId: id, summary: `Senha de ${u.username} redefinida pelo administrador` });
    res.json({ ok: true });
  });

  return r;
};
