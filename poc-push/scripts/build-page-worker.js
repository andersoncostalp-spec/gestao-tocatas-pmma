#!/usr/bin/env node
'use strict';
// Empacota a página de teste (poc-push/web) em um Worker do Cloudflare que serve os arquivos.
// Uso: node poc-push/scripts/build-page-worker.js <saida.js>
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'web');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; "
  + "worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const arquivos = {};
for (const nome of fs.readdirSync(dir)) {
  const ext = path.extname(nome);
  if (!TIPOS[ext]) continue;
  const buf = fs.readFileSync(path.join(dir, nome));
  arquivos['/' + nome] = { tipo: TIPOS[ext], b64: buf.toString('base64') };
}

const codigo = `// Gerado por poc-push/scripts/build-page-worker.js — não editar à mão.
const ARQUIVOS = ${JSON.stringify(arquivos)};
const CSP = ${JSON.stringify(CSP)};
const cache = new Map();
function corpo(p) {
  if (!cache.has(p)) cache.set(p, Uint8Array.from(atob(ARQUIVOS[p].b64), (c) => c.charCodeAt(0)));
  return cache.get(p);
}
export default {
  async fetch(req) {
    let p = new URL(req.url).pathname;
    if (p === '/') p = '/index.html';
    const f = ARQUIVOS[p];
    if (!f) return new Response('Não encontrado', { status: 404 });
    return new Response(corpo(p), { headers: {
      'Content-Type': f.tipo,
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': p === '/sw.js' || p === '/index.html' ? 'no-cache' : 'public, max-age=3600',
    } });
  },
};
`;
fs.writeFileSync(process.argv[2] || 'page-worker.js', codigo);
console.log(`${Object.keys(arquivos).length} arquivos empacotados.`);
