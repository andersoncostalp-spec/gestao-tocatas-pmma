'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, adminClient } = require('./helpers');
const { EVENTOS } = require('../scripts/seed-nov-2026');

let srv; let admin;
before(async () => {
  srv = await startServer();
  admin = await adminClient(srv.base);
});
after(() => srv.close());

const novo = (o = {}) => ({
  data: '2026-12-10', hora_inicio: '09:00', evento: 'Formatura de teste', entidade: 'PMMA',
  local: 'Quartel do Comando-Geral', tipo_documento: 'SEI', numero_documento: '2026.190110.99999', ...o,
});

test('autenticação: rotas exigem login e senha errada é recusada', async () => {
  const anon = client(srv.base);
  assert.equal((await anon.get('/api/events')).status, 401);
  const bad = await anon.post('/api/auth/login', { username: 'admin', password: 'errada' });
  assert.equal(bad.status, 401);
  const me = await admin.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.role, 'admin');
  assert.equal(me.data.user.must_change_password, false);
});

test('troca de senha obrigatória bloqueia o restante da API', async () => {
  const c = client(srv.base);
  await admin.post('/api/users', { username: 'leitor1', name: 'Sd Leitor', role: 'leitor', password: 'Leitor123' });
  const login = await c.post('/api/auth/login', { username: 'leitor1', password: 'Leitor123' });
  assert.equal(login.data.user.must_change_password, true);
  const blocked = await c.get('/api/events');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'MUST_CHANGE_PASSWORD');
  assert.equal((await c.post('/api/auth/change-password', { current: 'Leitor123', password: 'curta' })).status, 400);
  assert.equal((await c.post('/api/auth/change-password', { current: 'Leitor123', password: 'Leitor456' })).status, 200);
  assert.equal((await c.get('/api/events')).status, 200);
  // Leitor não pode criar eventos
  assert.equal((await c.post('/api/events', novo())).status, 403);
});

test('proteção CSRF recusa POST sem cabeçalho ou de outra origem', async () => {
  const res = await fetch(`${srv.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'a', password: 'b' }),
  });
  assert.equal(res.status, 403);
  const r2 = await admin.post('/api/events', novo(), { Origin: 'https://site-malicioso.com' });
  assert.equal(r2.status, 403);
});

test('cadastro com numeração automática anual e validação', async () => {
  const a = await admin.post('/api/events', novo({ data: '2027-01-05' }));
  const b = await admin.post('/api/events', novo({ data: '2027-01-02' }));
  assert.equal(a.status, 201);
  assert.equal(a.data.numero, 1);
  assert.equal(a.data.ano, 2027);
  assert.equal(b.data.numero, 2);
  const inval = await admin.post('/api/events', { data: '2027-02-30', hora_inicio: '25:00' });
  assert.equal(inval.status, 400);
  assert.ok(inval.data.errors.data);
  assert.ok(inval.data.errors.hora_inicio);
  assert.ok(inval.data.errors.evento);
  // horário em formato do mapa ("17h30") é normalizado
  const c = await admin.post('/api/events', novo({ data: '2027-01-03', hora_inicio: '17h30' }));
  assert.equal(c.data.hora_inicio, '17:30');
});

test('edição, cancelamento, exclusão e histórico', async () => {
  const { data: e } = await admin.post('/api/events', novo({ data: '2026-12-20' }));
  const up = await admin.put(`/api/events/${e.id}`, { local: 'Teatro Arthur Azevedo', hora_inicio: '10:00' });
  assert.equal(up.status, 200);
  assert.equal(up.data.local, 'Teatro Arthur Azevedo');
  assert.equal(up.data.numero, e.numero); // número não muda
  await admin.put(`/api/events/${e.id}`, { status: 'cancelado' });
  const hist = await admin.get(`/api/events/${e.id}/history`);
  assert.deepEqual(hist.data.map((h) => h.action), ['cancelar', 'editar', 'criar']);
  assert.deepEqual(hist.data[1].changes.local, ['Quartel do Comando-Geral', 'Teatro Arthur Azevedo']);
  assert.equal((await admin.del(`/api/events/${e.id}`)).status, 200);
  assert.equal((await admin.get(`/api/events/${e.id}`)).status, 404);
  const audit = await admin.get('/api/audit?entity=evento&action=excluir');
  assert.ok(audit.data.items.some((x) => x.entity_id === e.id));
});

test('importa o mapa de novembro/2026 e pesquisa por data, entidade, local e SEI', async () => {
  for (const e of EVENTOS) {
    const r = await admin.post('/api/events', { tipo_documento: 'SEI', ...e });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  const nov = await admin.get('/api/events?from=2026-11-01&to=2026-11-30');
  assert.equal(nov.data.total, 12);
  // ordem cronológica: 13/11 08h30 antes de 17h30
  const d13 = nov.data.items.filter((e) => e.data === '2026-11-13');
  assert.deepEqual(d13.map((e) => e.hora_inicio), ['08:30', '17:30']);

  const ent = await admin.get('/api/events?entidade=' + encodeURIComponent('assembleia legislativa'));
  assert.equal(ent.data.total, 3);
  const loc = await admin.get('/api/events?local=alema');
  assert.equal(loc.data.total, 3);
  // busca sem acento encontra texto acentuado
  const acento = await admin.get('/api/events?q=' + encodeURIComponent('vitoria'));
  assert.equal(acento.data.total, 2);
  const sei = await admin.get('/api/events?documento=47409');
  assert.equal(sei.data.total, 1);
  assert.match(sei.data.items[0].evento, /LEX & ORDEM/);
  const seiSemPontos = await admin.get('/api/events?documento=2026190110.42616');
  assert.equal(seiSemPontos.data.total, 2);
  const semSei = await admin.get('/api/events?semDocumento=1&from=2026-11-01&to=2026-11-30');
  assert.equal(semSei.data.total, 1);
});

test('mapa mensal: ordem e numeração sequencial, PDF válido', async () => {
  const m = await admin.get('/api/mapa/2026/11');
  assert.equal(m.data.eventos.length, 12);
  assert.deepEqual(m.data.eventos.map((e) => e.ordem), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(m.data.eventos[0].evento, 'Solenidade de Abertura do Mundo SENAI');
  const pdf = await admin.get('/api/mapa/2026/11/pdf');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.data.slice(0, 5).toString(), '%PDF-');
  assert.ok(pdf.data.length > 3000);
  assert.equal((await admin.get('/api/mapa/2026/13')).status, 400);
});

test('configurações: apenas admin altera; logo é validado', async () => {
  const r = await admin.put('/api/settings', { assinatura_cargo: 'Regente da BM/AjG' });
  assert.equal(r.status, 200);
  const bad = await admin.put('/api/settings', { logo_esquerda: 'data:image/png;base64,AAAA' });
  assert.equal(bad.status, 400);
  const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const ok = await admin.put('/api/settings', { logo_esquerda: png1x1 });
  assert.equal(ok.status, 200);
  const pdf = await admin.get('/api/mapa/2026/11/pdf');
  assert.equal(pdf.status, 200);
});

test('painel de próximos eventos e exportação CSV', async () => {
  const up = await admin.get('/api/events/upcoming');
  assert.equal(up.status, 200);
  assert.ok(Array.isArray(up.data.items));
  assert.ok(up.data.items.every((e) => e.data >= up.data.today && e.status !== 'cancelado'));
  const csv = await admin.get('/api/events/export.csv?from=2026-11-01&to=2026-11-30');
  assert.equal(csv.status, 200);
  assert.match(csv.data.toString('utf8'), /MEETING SUN 26/);
});
