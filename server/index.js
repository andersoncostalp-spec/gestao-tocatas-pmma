'use strict';
const { createApp } = require('./app');

const { app, ctx } = createApp();
const { config, reminders, sessions, db } = ctx;

reminders.start();
const purge = setInterval(() => sessions.purgeExpired(), 3600_000);
purge.unref();

const server = app.listen(config.port, () => {
  console.log(`Gestão de Tocatas - Banda de Música PMMA rodando em http://localhost:${config.port}`);
});

function shutdown() {
  reminders.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
