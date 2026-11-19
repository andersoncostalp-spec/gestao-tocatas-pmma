'use strict';
const { createApp } = require('../server/app');
const { openDatabase } = require('../server/db');

// Sobe uma instância isolada com banco em memória e cliente HTTP com cookie
async function startServer(overrides = {}) {
  const db = openDatabase(':memory:');
  const { app, ctx } = createApp({
    db, isProd: false, loginRateLimit: 1000,
    admin: { username: 'admin', password: 'Inicial123', name: 'Admin Teste' },
    ...overrides,
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, ctx, close: () => new Promise((r) => server.close(() => { db.close(); r(); })) };
}

function client(base) {
  let cookie = '';
  async function req(method, path, body, headers = {}) {
    const h = { 'X-Requested-With': 'fetch', ...headers };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (p, h) => req('GET', p, undefined, h),
    post: (p, b, h) => req('POST', p, b ?? {}, h),
    put: (p, b, h) => req('PUT', p, b, h),
    del: (p, h) => req('DELETE', p, undefined, h),
  };
}

// Faz login como admin inicial e troca a senha obrigatória
async function adminClient(base) {
  const c = client(base);
  await c.post('/api/auth/login', { username: 'admin', password: 'Inicial123' });
  await c.post('/api/auth/change-password', { current: 'Inicial123', password: 'NovaSenha456' });
  return c;
}

module.exports = { startServer, client, adminClient };
