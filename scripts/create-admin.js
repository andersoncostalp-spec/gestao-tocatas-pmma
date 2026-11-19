#!/usr/bin/env node
'use strict';
// Uso: node scripts/create-admin.js <usuario> "<Nome Completo>" [perfil]
// A senha é lida do terminal (ou da variável NEW_PASSWORD) — nunca da linha de comando.
const readline = require('readline');
const config = require('../server/config');
const { openDatabase } = require('../server/db');
const { hashPassword, validatePasswordStrength } = require('../server/auth');
const { createAudit } = require('../server/audit');

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

(async () => {
  const [username, name, role = 'admin'] = process.argv.slice(2);
  if (!username || !name || !['admin', 'editor', 'leitor'].includes(role)) {
    console.error('Uso: node scripts/create-admin.js <usuario> "<Nome Completo>" [admin|editor|leitor]');
    process.exit(1);
  }
  const password = process.env.NEW_PASSWORD || await ask('Senha: ');
  const weak = validatePasswordStrength(password);
  if (weak) { console.error(weak); process.exit(1); }
  const db = openDatabase(config.databasePath);
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    db.prepare('UPDATE users SET password_hash = ?, role = ?, active = 1, must_change_password = 1 WHERE id = ?')
      .run(hashPassword(password), role, exists.id);
    createAudit(db).log({ action: 'redefinir_senha', entity: 'usuario', entityId: exists.id, summary: `Usuário ${username} redefinido via terminal` });
    console.log(`Usuário "${username}" atualizado (perfil ${role}).`);
  } else {
    const { lastInsertRowid } = db.prepare(`INSERT INTO users (username, name, role, password_hash, must_change_password)
      VALUES (?,?,?,?,1)`).run(username, name, role, hashPassword(password));
    createAudit(db).log({ action: 'criar', entity: 'usuario', entityId: lastInsertRowid, summary: `Usuário ${username} criado via terminal` });
    console.log(`Usuário "${username}" criado (perfil ${role}). A senha deverá ser trocada no primeiro acesso.`);
  }
  db.close();
})();
