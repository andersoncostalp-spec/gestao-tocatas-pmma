'use strict';
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { verifyPassword, hashPassword, DUMMY_HASH, validatePasswordStrength } = require('../auth');

module.exports = ({ db, config, sessions, audit }) => {
  const r = express.Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimit ?? 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
  });

  const cookieOpts = () => ({
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: sessions.ttlMs,
  });

  const publicUser = (u) => ({
    id: u.id, username: u.username, name: u.name, posto: u.posto, role: u.role,
    must_change_password: !!u.must_change_password,
  });

  r.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'Informe usuário e senha.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
    const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok || !user.active) {
      audit.log({ req, action: 'login_falhou', entity: 'usuario', entityId: user ? user.id : null, summary: `Tentativa de login falhou para "${username.slice(0, 50)}"` });
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    const token = sessions.create(user.id, { ip: req.ip, userAgent: req.get('User-Agent') });
    db.prepare(`UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(user.id);
    audit.log({ req, user, action: 'login', entity: 'usuario', entityId: user.id, summary: `${user.username} entrou no sistema` });
    res.cookie(config.cookieName, token, cookieOpts());
    res.json({ user: publicUser(user) });
  });

  r.post('/logout', (req, res) => {
    sessions.destroy(req.sessionToken);
    res.clearCookie(config.cookieName, { ...cookieOpts(), maxAge: undefined });
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    res.json({ user: publicUser(req.user) });
  });

  r.post('/change-password', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { current, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(String(current || ''), user.password_hash)) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }
    const weak = validatePasswordStrength(password);
    if (weak) return res.status(400).json({ error: weak });
    if (password === current) return res.status(400).json({ error: 'A nova senha deve ser diferente da atual.' });
    db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .run(hashPassword(password), user.id);
    sessions.destroyAllForUser(user.id, req.sessionToken); // encerra outras sessões
    audit.log({ req, action: 'trocar_senha', entity: 'usuario', entityId: user.id, summary: `${user.username} alterou a própria senha` });
    res.json({ ok: true });
  });

  return r;
};
