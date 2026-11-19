#!/usr/bin/env node
'use strict';
// Cópia de segurança consistente do banco (pode rodar com o sistema no ar).
// Uso: node scripts/backup.js [pasta-destino]
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../server/config');

const destDir = process.argv[2] || path.join(path.dirname(config.databasePath), 'backups');
fs.mkdirSync(destDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const dest = path.join(destDir, `tocatas-${stamp}.db`);
const db = new Database(config.databasePath, { readonly: true, fileMustExist: true });
db.backup(dest)
  .then(() => { console.log(`Backup salvo em ${dest}`); db.close(); })
  .catch((err) => { console.error('Falha no backup:', err.message); process.exit(1); });
