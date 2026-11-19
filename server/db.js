'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Migrações versionadas: cada item é aplicado uma única vez, em ordem.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    posto TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin','editor','leitor')),
    password_hash TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,               -- sha256 do token
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ano INTEGER NOT NULL,
    numero INTEGER NOT NULL,           -- numeração anual automática
    data TEXT NOT NULL,                -- YYYY-MM-DD
    hora_inicio TEXT NOT NULL,         -- HH:MM
    hora_fim TEXT,
    evento TEXT NOT NULL,
    formacao TEXT,                     -- ex.: Banda de Música, Saxofonista
    entidade TEXT NOT NULL,
    local TEXT NOT NULL,
    tipo_documento TEXT NOT NULL DEFAULT 'SEI' CHECK (tipo_documento IN ('SEI','Ofício','Memorando','Outro','Nenhum')),
    numero_documento TEXT,
    status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','confirmado','realizado','cancelado')),
    uniforme TEXT,
    contato TEXT,
    telefone TEXT,
    observacoes TEXT,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at TEXT,
    UNIQUE (ano, numero)
  );
  CREATE INDEX idx_events_data ON events(data, hora_inicio);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    summary TEXT,
    changes TEXT,                      -- JSON {campo: [antes, depois]}
    ip TEXT
  );
  CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
  CREATE INDEX idx_audit_at ON audit_log(at);

  CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE reminders_sent (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,                -- 7d, 3d, 24h, 2h
    event_at TEXT NOT NULL,            -- data/hora do evento no momento do envio
    sent_at TEXT NOT NULL,
    skipped INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (event_id, kind, event_at)
  );

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    kind TEXT,
    title TEXT NOT NULL,
    body TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `,
];

function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

module.exports = { openDatabase };
