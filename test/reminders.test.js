'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dueReminder } = require('../server/services/reminders');
const { startServer, adminClient } = require('./helpers');

const at = new Date('2026-12-10T12:00:00-03:00');
const minus = (min) => new Date(at.getTime() - min * 60000);

test('dueReminder escolhe o lembrete correto em cada antecedência', () => {
  assert.equal(dueReminder(at, minus(8 * 24 * 60), new Set()), null);
  assert.equal(dueReminder(at, minus(7 * 24 * 60), new Set()).reminder.kind, '7d');
  assert.equal(dueReminder(at, minus(6 * 24 * 60), new Set(['7d'])), null);
  assert.equal(dueReminder(at, minus(3 * 24 * 60), new Set(['7d'])).reminder.kind, '3d');
  assert.equal(dueReminder(at, minus(24 * 60), new Set(['7d', '3d'])).reminder.kind, '24h');
  assert.equal(dueReminder(at, minus(119), new Set(['7d', '3d', '24h'])).reminder.kind, '2h');
  assert.equal(dueReminder(at, minus(-1), new Set()), null); // evento já começou
});

test('evento cadastrado em cima da hora não dispara lembretes antigos', () => {
  const d = dueReminder(at, minus(30 * 60), new Set()); // 30h antes
  assert.equal(d.reminder.kind, '3d');
  assert.deepEqual(d.skip, ['7d']);
});

test('agendador envia push e notificação interna uma única vez por lembrete', async () => {
  const srv = await startServer();
  try {
    const admin = await adminClient(srv.base);
    const sent = [];
    srv.ctx.push._setSender(async (sub, payload) => { sent.push(JSON.parse(payload)); });
    await admin.post('/api/push/subscribe', { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x'.repeat(87), auth: 'y'.repeat(22) } });
    const { data: e } = await admin.post('/api/events', {
      data: '2026-12-10', hora_inicio: '12:00', evento: 'Concerto de Natal', entidade: 'PMMA', local: 'Praça Maria Aragão',
      tipo_documento: 'SEI', numero_documento: '1',
    });
    const { reminders } = srv.ctx;
    await reminders.tick(minus(7 * 24 * 60 - 5));
    await reminders.tick(minus(7 * 24 * 60 - 6)); // repetido: não reenviar
    await reminders.tick(minus(3 * 24 * 60 - 1));
    await reminders.tick(minus(24 * 60 - 1));
    await reminders.tick(minus(119));
    await reminders.tick(minus(60));
    assert.deepEqual(sent.map((m) => m.kind), ['7d', '3d', '24h', '2h']);
    assert.equal(sent[0].url, `/#/eventos/${e.id}`);
    assert.match(sent[3].title, /em 2 horas/);
    const notif = await admin.get('/api/notifications');
    assert.equal(notif.data.unread, 4);

    // Alterar a data do evento reinicia o ciclo de lembretes
    await admin.put(`/api/events/${e.id}`, { data: '2026-12-11' });
    const newAt = new Date('2026-12-11T12:00:00-03:00');
    await reminders.tick(new Date(newAt.getTime() - 100 * 60000));
    assert.equal(sent.at(-1).kind, '2h');
    // Eventos cancelados não geram lembretes
    await admin.put(`/api/events/${e.id}`, { status: 'cancelado', data: '2026-12-12' });
    const n = sent.length;
    await reminders.tick(new Date(new Date('2026-12-12T12:00:00-03:00').getTime() - 60 * 60000));
    assert.equal(sent.length, n);
  } finally {
    await srv.close();
  }
});
