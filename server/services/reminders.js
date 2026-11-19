'use strict';
const webpush = require('web-push');
const { formatHora } = require('./pdf');

// Antecedências dos lembretes, da maior para a menor
const REMINDERS = [
  { kind: '7d', minutes: 7 * 24 * 60, label: 'em 7 dias' },
  { kind: '3d', minutes: 3 * 24 * 60, label: 'em 3 dias' },
  { kind: '24h', minutes: 24 * 60, label: 'em 24 horas' },
  { kind: '2h', minutes: 2 * 60, label: 'em 2 horas' },
];

function eventInstant(e, tzOffset) {
  return new Date(`${e.data}T${e.hora_inicio}:00${tzOffset}`);
}

/**
 * Decide qual lembrete enviar agora. Envia apenas o mais próximo do evento cujo
 * prazo já foi atingido e ainda não foi enviado; os anteriores são marcados como
 * "pulados" (ex.: evento cadastrado com 2 dias de antecedência não dispara o de 7d).
 */
function dueReminder(eventAt, now, alreadySent) {
  const minutesLeft = (eventAt.getTime() - now.getTime()) / 60000;
  if (minutesLeft <= 0) return null;
  const reached = REMINDERS.filter((r) => minutesLeft <= r.minutes);
  if (!reached.length) return null;
  const target = reached[reached.length - 1];
  if (alreadySent.has(target.kind)) return null;
  const skip = reached.slice(0, -1).filter((r) => !alreadySent.has(r.kind)).map((r) => r.kind);
  return { reminder: target, skip };
}

function createPushService(db, settings, config) {
  let publicKey = process.env.VAPID_PUBLIC_KEY || settings.get('vapid_public');
  let privateKey = process.env.VAPID_PRIVATE_KEY || settings.get('vapid_private');
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    settings.set('vapid_public', publicKey);
    settings.set('vapid_private', privateKey);
  }
  webpush.setVapidDetails(config.vapidSubject, publicKey, privateKey);

  const q = {
    subsAll: db.prepare(`SELECT p.* FROM push_subscriptions p JOIN users u ON u.id = p.user_id WHERE u.active = 1`),
    subsUser: db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?'),
    removeSub: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?'),
  };

  let sender = (sub, payload) => webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 6 * 3600 });

  async function sendTo(subs, message) {
    const payload = JSON.stringify(message);
    let ok = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await sender(s, payload);
        ok++;
      } catch (err) {
        // Assinatura expirada/revogada: remove
        if (err && (err.statusCode === 404 || err.statusCode === 410)) q.removeSub.run(s.endpoint);
        else console.warn('[push] falha ao enviar:', err && (err.statusCode || err.message));
      }
    }));
    return ok;
  }

  return {
    publicKey,
    sendToAll: (msg) => sendTo(q.subsAll.all(), msg),
    sendToUser: (userId, msg) => sendTo(q.subsUser.all(userId), msg),
    // Permite substituir o envio real nos testes
    _setSender(fn) { sender = fn; },
  };
}

function createReminderScheduler(db, push, config) {
  const q = {
    upcoming: db.prepare(`SELECT * FROM events WHERE deleted_at IS NULL AND status IN ('agendado','confirmado')
      AND data >= ? AND data <= ?`),
    sent: db.prepare('SELECT kind FROM reminders_sent WHERE event_id = ? AND event_at = ?'),
    mark: db.prepare('INSERT OR IGNORE INTO reminders_sent (event_id, kind, event_at, sent_at, skipped) VALUES (?,?,?,?,?)'),
    users: db.prepare('SELECT id FROM users WHERE active = 1'),
    notify: db.prepare('INSERT INTO notifications (user_id, event_id, kind, title, body) VALUES (?,?,?,?,?)'),
  };

  function buildMessage(e, r) {
    const [y, m, d] = e.data.split('-');
    const title = `Tocata ${r.label}: ${e.evento}`.slice(0, 120);
    const body = `${d}/${m}/${y} às ${formatHora(e.hora_inicio)} — ${e.local}${e.formacao ? ` (${e.formacao})` : ''}`;
    return { title, body, url: `/#/eventos/${e.id}`, tag: `evento-${e.id}`, eventId: e.id, kind: r.kind };
  }

  async function tick(now = new Date()) {
    const fmt = (d) => d.toISOString().slice(0, 10);
    const from = fmt(new Date(now.getTime() - 24 * 3600e3));
    const to = fmt(new Date(now.getTime() + 8 * 24 * 3600e3));
    const sentMessages = [];
    for (const e of q.upcoming.all(from, to)) {
      const at = eventInstant(e, config.tzOffset);
      const key = `${e.data}T${e.hora_inicio}`;
      const already = new Set(q.sent.all(e.id, key).map((r) => r.kind));
      const due = dueReminder(at, now, already);
      if (!due) continue;
      const msg = buildMessage(e, due.reminder);
      const iso = now.toISOString();
      db.transaction(() => {
        for (const k of due.skip) q.mark.run(e.id, k, key, iso, 1);
        q.mark.run(e.id, due.reminder.kind, key, iso, 0);
        for (const u of q.users.all()) q.notify.run(u.id, e.id, due.reminder.kind, msg.title, msg.body);
      })();
      sentMessages.push(msg);
      await push.sendToAll(msg);
    }
    return sentMessages;
  }

  let timer = null;
  return {
    tick,
    start() {
      const run = () => tick().catch((err) => console.error('[lembretes]', err));
      run();
      timer = setInterval(run, config.reminderIntervalMs);
      timer.unref();
    },
    stop() { if (timer) clearInterval(timer); },
  };
}

module.exports = { REMINDERS, dueReminder, eventInstant, createPushService, createReminderScheduler };
