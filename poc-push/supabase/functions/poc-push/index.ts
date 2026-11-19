// Etapa 0 — Edge Function de prova de conceito do envio de notificações push.
// Arquivo único para poder ser colado no editor de Edge Functions do Supabase.
//
// Segredos necessários (Supabase → Edge Functions → Secrets):
//   VAPID_PRIVATE_JWK  chave privada VAPID em JWK (gerada na página de teste)
//   POC_TOKEN          senha do teste, exigida em todas as ações que alteram dados
//   VAPID_SUBJECT      ex.: mailto:p1.banda@exemplo.com
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidas automaticamente pelo Supabase.
//
// Ações (POST JSON, cabeçalho x-poc-token):
//   {action:"subscribe", subscription}  grava a inscrição do aparelho
//   {action:"send"}                     envia agora para todos os aparelhos
//   {action:"schedule", minutos}        agenda um envio (será feito pelo cron)
//   {action:"tick", origem}             chamado pelo cron do Cloudflare: envia os agendados vencidos
//   {action:"status"}                   últimas execuções e agendamentos
// GET sem parâmetros devolve a chave pública VAPID (informação pública).

// Biblioteca baseada em WebCrypto, com o padrão atual de criptografia (aes128gcm, RFC 8291) e VAPID (RFC 8292)
import { buildPushPayload } from 'npm:@block65/webcrypto-web-push@2.0.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';

type Inscricao = { endpoint: string; p256dh: string; auth: string };

export interface Db {
  listarInscricoes(): Promise<Inscricao[]>;
  salvarInscricao(i: Inscricao & { aparelho: string | null }): Promise<void>;
  removerInscricao(endpoint: string): Promise<void>;
  agendar(enviarEm: Date): Promise<void>;
  agendadosVencidos(agora: Date): Promise<{ id: number }[]>;
  marcarEnviado(id: number, resultado: string, agora: Date): Promise<void>;
  log(origem: string, detalhe: string): Promise<void>;
  status(): Promise<unknown>;
}

export interface Deps {
  db: Db;
  env: (k: string) => string | undefined;
  fetchFn: typeof fetch;
  agora: () => Date;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-poc-token, authorization, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

// Chave pública no formato que o navegador espera (ponto não comprimido: 0x04 || x || y)
export function chavePublica(jwk: JsonWebKey): string {
  const x = fromB64url(jwk.x!);
  const y = fromB64url(jwk.y!);
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(x, 1);
  raw.set(y, 33);
  return b64url(raw);
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function createHandler(deps: Deps) {
  const { db, env, fetchFn, agora } = deps;

  async function enviarParaTodos(titulo: string, corpo: string) {
    const jwk = JSON.parse(env('VAPID_PRIVATE_JWK') || 'null');
    if (!jwk) throw new Error('Segredo VAPID_PRIVATE_JWK não configurado.');
    const subject = env('VAPID_SUBJECT') || 'mailto:admin@example.com';
    const inscricoes = await db.listarInscricoes();
    const resultados: { aparelho: string; status: number | string }[] = [];
    for (const s of inscricoes) {
      const destino = new URL(s.endpoint).host;
      try {
        const req = await buildPushPayload(
          { data: { title: titulo, body: corpo, url: '/', tag: 'poc', kind: 'poc' }, options: { ttl: 6 * 3600, urgency: 'high' } },
          { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
          { subject, publicKey: chavePublica(jwk), privateKey: jwk.d },
        );
        const r = await fetchFn(s.endpoint, { method: req.method, headers: req.headers, body: req.body });
        resultados.push({ aparelho: destino, status: r.status });
        // 404/410: inscrição expirada ou cancelada no aparelho
        if (r.status === 404 || r.status === 410) await db.removerInscricao(s.endpoint);
      } catch (e) {
        resultados.push({ aparelho: destino, status: `erro: ${(e as Error).message}` });
      }
    }
    return resultados;
  }

  return async function handler(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === 'GET') {
        const jwk = JSON.parse(env('VAPID_PRIVATE_JWK') || 'null');
        return json({ publicKey: jwk ? chavePublica(jwk) : null });
      }
      if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

      const token = env('POC_TOKEN');
      if (!token || !iguais(req.headers.get('x-poc-token') || '', token)) return json({ error: 'Token inválido.' }, 401);

      const body = await req.json().catch(() => ({}));
      switch (body.action) {
        case 'subscribe': {
          const s = body.subscription || {};
          if (typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth) {
            return json({ error: 'Inscrição inválida.' }, 400);
          }
          await db.salvarInscricao({ endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, aparelho: req.headers.get('user-agent') });
          await db.log('subscribe', new URL(s.endpoint).host);
          return json({ ok: true });
        }
        case 'send': {
          const r = await enviarParaTodos('Teste imediato — Tocatas BM', 'Se você está lendo isto, o envio pelo Supabase funcionou.');
          await db.log('send', JSON.stringify(r));
          return json({ resultados: r });
        }
        case 'schedule': {
          const min = Math.min(Math.max(Number(body.minutos) || 10, 1), 120);
          const quando = new Date(agora().getTime() + min * 60000);
          await db.agendar(quando);
          return json({ ok: true, enviar_em: quando.toISOString() });
        }
        case 'tick': {
          const vencidos = await db.agendadosVencidos(agora());
          let r: unknown[] = [];
          if (vencidos.length) {
            const hora = agora().toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' });
            r = await enviarParaTodos('Lembrete agendado — Tocatas BM', `Disparado pelo cron do Cloudflare às ${hora}, com o app fechado.`);
            for (const v of vencidos) await db.marcarEnviado(v.id, JSON.stringify(r), agora());
          }
          await db.log(`tick:${String(body.origem || 'manual').slice(0, 20)}`, vencidos.length ? JSON.stringify(r) : 'nada agendado');
          return json({ enviados: vencidos.length, resultados: r });
        }
        case 'status':
          return json(await db.status());
        default:
          return json({ error: 'Ação desconhecida.' }, 400);
      }
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  };
}

function supabaseDb(): Db {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const ok = <T>(r: { data: T; error: unknown }) => {
    if (r.error) throw new Error((r.error as { message: string }).message);
    return r.data;
  };
  return {
    async listarInscricoes() { return ok(await sb.from('poc_push_inscricoes').select('endpoint, p256dh, auth')) as Inscricao[]; },
    async salvarInscricao(i) { ok(await sb.from('poc_push_inscricoes').upsert(i, { onConflict: 'endpoint' })); },
    async removerInscricao(endpoint) { ok(await sb.from('poc_push_inscricoes').delete().eq('endpoint', endpoint)); },
    async agendar(enviarEm) { ok(await sb.from('poc_push_agendados').insert({ enviar_em: enviarEm.toISOString() })); },
    async agendadosVencidos(agora) {
      return ok(await sb.from('poc_push_agendados').select('id').is('enviado_em', null).lte('enviar_em', agora.toISOString())) as { id: number }[];
    },
    async marcarEnviado(id, resultado, agora) {
      ok(await sb.from('poc_push_agendados').update({ enviado_em: agora.toISOString(), resultado }).eq('id', id));
    },
    async log(origem, detalhe) { ok(await sb.from('poc_push_log').insert({ origem, detalhe: detalhe.slice(0, 2000) })); },
    async status() {
      const [log, agendados, inscricoes] = await Promise.all([
        sb.from('poc_push_log').select('em, origem, detalhe').order('id', { ascending: false }).limit(15),
        sb.from('poc_push_agendados').select('enviar_em, enviado_em, resultado').order('id', { ascending: false }).limit(10),
        sb.from('poc_push_inscricoes').select('id', { count: 'exact', head: true }),
      ]);
      return { log: ok(log), agendados: ok(agendados), aparelhos: inscricoes.count ?? 0 };
    },
  };
}

if (!Deno.env.get('POC_TEST')) {
  Deno.serve(createHandler({ db: supabaseDb(), env: (k) => Deno.env.get(k), fetchFn: fetch, agora: () => new Date() }));
}
