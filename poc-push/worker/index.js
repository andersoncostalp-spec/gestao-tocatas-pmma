// Etapa 0 — Cloudflare Worker com Cron Trigger (plano gratuito).
// A cada execução agendada, chama a Edge Function "poc-push" do Supabase (ação "tick").
// O tempo esperando a resposta da rede não conta no limite de CPU do plano gratuito.
//
// Configuração no painel do Cloudflare (Workers → este Worker → Settings):
//   Variables:  FUNCTION_URL = https://<projeto>.supabase.co/functions/v1/poc-push
//   Secrets:    POC_TOKEN    = mesma senha configurada no Supabase
//   Triggers:   Cron "*/5 * * * *"  (a cada 5 minutos)

export async function tick(env, origem, fetchFn = fetch) {
  if (!env.FUNCTION_URL || !env.POC_TOKEN) throw new Error('FUNCTION_URL e POC_TOKEN precisam estar configurados.');
  const r = await fetchFn(env.FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-poc-token': env.POC_TOKEN },
    body: JSON.stringify({ action: 'tick', origem }),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Edge Function respondeu ${r.status}: ${texto.slice(0, 300)}`);
  return texto;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env, 'cron').then((t) => console.log('tick ok', t)));
  },
  // Acesso pelo navegador apenas informa que o Worker está no ar (não executa nada).
  async fetch() {
    return new Response('Worker de lembretes ativo.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
