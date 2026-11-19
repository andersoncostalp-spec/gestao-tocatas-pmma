'use strict';
const path = require('path');

const env = process.env;

module.exports = {
  port: Number(env.PORT || 3000),
  isProd: env.NODE_ENV === 'production',
  databasePath: env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'tocatas.db'),
  trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : false,
  sessionDays: Number(env.SESSION_DAYS || 7),
  cookieName: 'tocatas_sid',
  vapidSubject: env.VAPID_SUBJECT || 'mailto:admin@localhost',
  // Maranhão: UTC-3 o ano todo
  tzOffset: env.TZ_OFFSET || '-03:00',
  reminderIntervalMs: Number(env.REMINDER_INTERVAL_MS || 60_000),
  admin: {
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
    name: env.ADMIN_NAME || 'Administrador',
  },
};
