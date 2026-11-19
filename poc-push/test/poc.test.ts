// Testes da Etapa 0 (executar com Deno, o mesmo runtime das Edge Functions do Supabase):
//   POC_TEST=1 deno test --allow-env --allow-net --allow-read poc-push/test/
// O "aparelho" é simulado: gera suas chaves como o navegador faz, recebe a requisição
// produzida pela função, valida a assinatura VAPID e descriptografa o conteúdo (RFC 8291).
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createHandler, chavePublica, type Db } from '../supabase/functions/poc-push/index.ts';
import { tick } from '../worker/index.js';

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const concat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, k, len * 8));
}

// Aparelho simulado (equivalente ao que o Chrome gera ao se inscrever)
async function novoAparelho(endpoint: string) {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    subscription: { endpoint, keys: { p256dh: b64url(pub), auth: b64url(auth) } },
    // Descriptografa o corpo aes128gcm (RFC 8188 + RFC 8291)
    async ler(body: Uint8Array) {
      const salt = body.slice(0, 16);
      const idlen = body[20];
      const asPub = body.slice(21, 21 + idlen);
      const cifra = body.slice(21 + idlen);
      const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, par.privateKey, 256));
      const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info\0'), pub, asPub), 32);
      const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
      const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
      const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
      const claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, cifra));
      let fim = claro.length - 1;
      while (fim > 0 && claro[fim] === 0) fim--;
      assertEquals(claro[fim], 2, 'delimitador de último registro');
      return JSON.parse(new TextDecoder().decode(claro.slice(0, fim)));
    },
  };
}

// Valida o cabeçalho "Authorization: vapid t=<JWT>, k=<chave pública>" como o servidor de push faz
async function validarVapid(auth: string, endpoint: string, publicKeyEsperada: string) {
  const m = /^vapid t=([^,]+),\s*k=(.+)$/.exec(auth);
  assert(m, `cabeçalho Authorization inesperado: ${auth}`);
  const [, jwt, k] = m;
  assertEquals(k, publicKeyEsperada);
  const [h, p, s] = jwt.split('.');
  const chave = await crypto.subtle.importKey('raw', fromB64url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valido = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, chave, fromB64url(s), enc.encode(`${h}.${p}`));
  assert(valido, 'assinatura VAPID inválida');
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  assertEquals(claims.aud, new URL(endpoint).origin);
  assert(claims.exp * 1000 > Date.now() && claims.exp * 1000 <= Date.now() + 24 * 3600e3, 'exp deve estar nas próximas 24h');
  return claims;
}

function memDb(): Db & { inscricoes: Map<string, any>; agendados: any[]; logs: any[] } {
  const inscricoes = new Map<string, any>();
  const agendados: any[] = [];
  const logs: any[] = [];
  return {
    inscricoes, agendados, logs,
    async listarInscricoes() { return [...inscricoes.values()]; },
    async salvarInscricao(i) { inscricoes.set(i.endpoint, i); },
    async removerInscricao(e) { inscricoes.delete(e); },
    async agendar(d) { agendados.push({ id: agendados.length + 1, enviar_em: d, enviado_em: null }); },
    async agendadosVencidos(agora) { return agendados.filter((a) => !a.enviado_em && a.enviar_em <= agora); },
    async marcarEnviado(id, resultado, agora) { const a = agendados.find((x) => x.id === id); a.enviado_em = agora; a.resultado = resultado; },
    async log(origem, detalhe) { logs.push({ origem, detalhe }); },
    async status() { return { log: logs, agendados, aparelhos: inscricoes.size }; },
  };
}

async function montar() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  const env: Record<string, string> = { VAPID_PRIVATE_JWK: JSON.stringify(jwk), POC_TOKEN: 'senha-teste-123', VAPID_SUBJECT: 'mailto:p1@exemplo.com' };
  const recebidas: { endpoint: string; headers: Headers; body: Uint8Array }[] = [];
  let respostaPush = 201;
  const fetchFn = (async (url: string, init: RequestInit) => {
    recebidas.push({ endpoint: url, headers: new Headers(init.headers), body: new Uint8Array(init.body as ArrayBuffer) });
    return new Response(null, { status: respostaPush });
  }) as unknown as typeof fetch;
  let agora = new Date('2026-11-20T12:00:00Z');
  const db = memDb();
  const handler = createHandler({ db, env: (k) => env[k], fetchFn, agora: () => agora });
  const chamar = (body: unknown, token = env.POC_TOKEN) => handler(new Request('https://x.supabase.co/functions/v1/poc-push', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-poc-token': token }, body: JSON.stringify(body),
  }));
  return {
    jwk, db, recebidas, handler, chamar,
    setAgora: (d: Date) => { agora = d; },
    setRespostaPush: (s: number) => { respostaPush = s; },
  };
}

Deno.test('GET devolve a chave pública VAPID derivada da chave privada', async () => {
  const t = await montar();
  const r = await (await t.handler(new Request('https://x/', { method: 'GET' }))).json();
  assertEquals(fromB64url(r.publicKey).length, 65);
  assertEquals(r.publicKey, chavePublica(t.jwk));
});

Deno.test('ações exigem a senha do teste', async () => {
  const t = await montar();
  assertEquals((await t.chamar({ action: 'send' }, 'errada')).status, 401);
  assertEquals((await t.chamar({ action: 'send' }, '')).status, 401);
});

Deno.test('envio imediato: notificação válida, assinada e legível pelo aparelho', async () => {
  const t = await montar();
  const ap = await novoAparelho('https://fcm.googleapis.com/fcm/send/abc123');
  assertEquals((await t.chamar({ action: 'subscribe', subscription: ap.subscription })).status, 200);
  const r = await (await t.chamar({ action: 'send' })).json();
  assertEquals(r.resultados, [{ aparelho: 'fcm.googleapis.com', status: 201 }]);
  const req = t.recebidas[0];
  assertEquals(req.endpoint, ap.subscription.endpoint);
  assertEquals(req.headers.get('content-encoding'), 'aes128gcm');
  assert(Number(req.headers.get('ttl')) > 0);
  await validarVapid(req.headers.get('authorization')!, req.endpoint, chavePublica(t.jwk));
  const msg = await ap.ler(req.body);
  assertEquals(msg.title, 'Teste imediato — Tocatas BM');
});

Deno.test('agendamento: só envia quando o cron passa após o horário, uma única vez', async () => {
  const t = await montar();
  const ap = await novoAparelho('https://fcm.googleapis.com/fcm/send/xyz');
  await t.chamar({ action: 'subscribe', subscription: ap.subscription });
  await t.chamar({ action: 'schedule', minutos: 10 });
  assertEquals((await (await t.chamar({ action: 'tick', origem: 'cron' })).json()).enviados, 0);
  t.setAgora(new Date('2026-11-20T12:10:30Z'));
  const r = await (await t.chamar({ action: 'tick', origem: 'cron' })).json();
  assertEquals(r.enviados, 1);
  const msg = await ap.ler(t.recebidas.at(-1)!.body);
  assertEquals(msg.title, 'Lembrete agendado — Tocatas BM');
  assert(msg.body.includes('09:10'), msg.body); // horário de São Luís (UTC-3)
  assertEquals((await (await t.chamar({ action: 'tick', origem: 'cron' })).json()).enviados, 0);
  assertEquals(t.recebidas.length, 1);
  assertEquals(t.db.logs.filter((l) => l.origem === 'tick:cron').length, 3);
});

Deno.test('inscrição expirada (410) é removida automaticamente', async () => {
  const t = await montar();
  const ap = await novoAparelho('https://fcm.googleapis.com/fcm/send/velho');
  await t.chamar({ action: 'subscribe', subscription: ap.subscription });
  t.setRespostaPush(410);
  await t.chamar({ action: 'send' });
  assertEquals(t.db.inscricoes.size, 0);
});

Deno.test('inscrição inválida é recusada', async () => {
  const t = await montar();
  assertEquals((await t.chamar({ action: 'subscribe', subscription: { endpoint: 'http://inseguro' } })).status, 400);
});

Deno.test('Worker do Cloudflare chama a função com a ação tick e a senha', async () => {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => { chamadas.push({ url, init }); return new Response('{"enviados":0}'); }) as unknown as typeof fetch;
  await tick({ FUNCTION_URL: 'https://x.supabase.co/functions/v1/poc-push', POC_TOKEN: 's3' }, 'cron', fakeFetch);
  assertEquals(chamadas[0].url, 'https://x.supabase.co/functions/v1/poc-push');
  assertEquals(new Headers(chamadas[0].init.headers).get('x-poc-token'), 's3');
  assertEquals(JSON.parse(chamadas[0].init.body as string), { action: 'tick', origem: 'cron' });
  // erro da função vira exceção (aparece nos logs do Worker)
  const falha = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
  let erro = '';
  try { await tick({ FUNCTION_URL: 'https://x', POC_TOKEN: 's' }, 'cron', falha); } catch (e) { erro = (e as Error).message; }
  assert(erro.includes('500'));
});
