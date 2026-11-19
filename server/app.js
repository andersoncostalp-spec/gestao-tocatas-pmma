'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');

const defaultConfig = require('./config');
const { openDatabase } = require('./db');
const { createSessionStore, parseCookies, hashPassword } = require('./auth');
const { createAudit } = require('./audit');
const { createEventService } = require('./services/events');
const { createSettings } = require('./services/settings');
const { createPushService, createReminderScheduler } = require('./services/reminders');

function createApp(overrides = {}) {
  const config = { ...defaultConfig, ...overrides };
  const db = overrides.db || openDatabase(config.databasePath);
  const audit = createAudit(db);
  const sessions = createSessionStore(db, config);
  const settings = createSettings(db);
  const events = createEventService(db, audit);
  const push = createPushService(db, settings, config);
  const reminders = createReminderScheduler(db, push, config);
  const ctx = { db, config, audit, sessions, settings, events, push, reminders };

  bootstrapAdmin(ctx);

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.set('tzOffset', config.tzOffset);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"], // FullCalendar injeta estilos
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'frame-src': ["'self'", 'blob:'],
        'object-src': ["'self'", 'blob:'],
        'worker-src': ["'self'"],
        'manifest-src': ["'self'"],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProd,
  }));

  // Sessão via cookie httpOnly
  app.use((req, res, next) => {
    const token = parseCookies(req.headers.cookie)[config.cookieName];
    req.sessionToken = token;
    req.user = token ? sessions.resolve(token) : null;
    next();
  });

  // Proteção CSRF: requisições que alteram dados precisam vir do próprio site
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('X-Requested-With') !== 'fetch') return res.status(403).json({ error: 'Requisição recusada (CSRF).' });
    const origin = req.get('Origin');
    if (origin) {
      let host;
      try { host = new URL(origin).host; } catch { host = null; }
      if (host !== req.get('Host')) return res.status(403).json({ error: 'Origem não permitida.' });
    }
    next();
  });

  app.use('/api', express.json({ limit: '2mb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth')(ctx));
  app.use('/api/events', require('./routes/events')(ctx));
  app.use('/api/mapa', require('./routes/mapa')(ctx));
  app.use('/api/users', require('./routes/users')(ctx));
  app.use('/api/audit', require('./routes/audit')(ctx));
  app.use('/api/settings', require('./routes/settings')(ctx));
  app.use('/api/push', require('./routes/push')(ctx));
  app.use('/api/notifications', require('./routes/notifications')(ctx));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // Arquivos estáticos (SPA + PWA)
  const pub = path.join(__dirname, '..', 'public');
  const fcDir = path.join(__dirname, '..', 'node_modules');
  app.get('/vendor/fullcalendar.js', (req, res) => res.sendFile(path.join(fcDir, 'fullcalendar', 'index.global.min.js')));
  app.get('/vendor/fullcalendar-pt-br.js', (req, res) => res.sendFile(path.join(fcDir, '@fullcalendar', 'core', 'locales', 'pt-br.global.min.js')));
  app.get('/sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(pub, 'sw.js'));
  });
  app.use(express.static(pub, { index: 'index.html', maxAge: config.isProd ? '1h' : 0 }));

  // Tratamento de erros
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Conteúdo muito grande.' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor.' : err.message, errors: err.errors });
  });

  return { app, ctx };
}

// Cria o primeiro administrador a partir das variáveis de ambiente, se não houver usuários
function bootstrapAdmin({ db, config, audit }) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0 || !config.admin.username || !config.admin.password) return;
  const { lastInsertRowid } = db.prepare(`INSERT INTO users (username, name, role, password_hash, must_change_password)
    VALUES (?, ?, 'admin', ?, 1)`).run(config.admin.username, config.admin.name, hashPassword(config.admin.password));
  audit.log({ action: 'criar', entity: 'usuario', entityId: lastInsertRowid, summary: `Administrador inicial "${config.admin.username}" criado` });
  console.log(`[setup] Usuário administrador "${config.admin.username}" criado. Troque a senha no primeiro acesso.`);
}

module.exports = { createApp };
