// Página de teste da Etapa 0: inscreve o aparelho e aciona a Edge Function do Supabase.
const $ = (id) => document.getElementById(id);
const cfg = {
  get url() { try { return localStorage.getItem('poc-url') || ''; } catch { return ''; } },
  get token() { try { return localStorage.getItem('poc-token') || ''; } catch { return ''; } },
  salvar(url, token) { try { localStorage.setItem('poc-url', url); localStorage.setItem('poc-token', token); } catch { /* */ } },
};

function mostrar(id, msg, ok = true) {
  const el = $(id);
  el.textContent = msg;
  el.className = `st ${ok ? 'ok' : 'erro'}`;
}

async function chamar(action, extra = {}) {
  if (!cfg.url) throw new Error('Configure o endereço da Edge Function no passo 1.');
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-poc-token': cfg.token },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
  return data;
}

function b64urlToBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function iniciar() {
  if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js');
  $('url').value = cfg.url;
  $('token').value = cfg.token;
  atualizarStatusPush();

  $('salvar').onclick = async () => {
    cfg.salvar($('url').value.trim(), $('token').value);
    try {
      const r = await fetch(cfg.url);
      const d = await r.json();
      if (!d.publicKey) throw new Error('A função respondeu, mas o segredo VAPID_PRIVATE_JWK ainda não foi configurado.');
      await chamar('status');
      mostrar('st-conexao', 'Conectado. Chave VAPID e senha conferem.');
    } catch (e) { mostrar('st-conexao', e.message, false); }
  };

  $('ativar').onclick = async () => {
    try {
      if (!('PushManager' in window)) throw new Error('Este navegador não suporta notificações push. Use o Chrome no Android.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do site.');
      const { publicKey } = await (await fetch(cfg.url)).json();
      if (!publicKey) throw new Error('Chave VAPID não configurada no Supabase.');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      // Se a chave do servidor mudou, refaz a inscrição
      if (sub && sub.options.applicationServerKey) {
        const atual = new Uint8Array(sub.options.applicationServerKey);
        const nova = b64urlToBytes(publicKey);
        if (atual.length !== nova.length || atual.some((v, i) => v !== nova[i])) { await sub.unsubscribe(); sub = null; }
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) });
      await chamar('subscribe', { subscription: sub.toJSON() });
      mostrar('st-push', 'Aparelho inscrito com sucesso.');
    } catch (e) { mostrar('st-push', e.message, false); }
  };

  $('enviar').onclick = async () => {
    try {
      const { resultados } = await chamar('send');
      const ok = resultados.filter((r) => r.status === 201 || r.status === 200).length;
      mostrar('st-teste', `Enviado para ${ok} de ${resultados.length} aparelho(s). ${JSON.stringify(resultados)}`, ok > 0);
    } catch (e) { mostrar('st-teste', e.message, false); }
  };

  $('agendar').onclick = async () => {
    try {
      const { enviar_em } = await chamar('schedule', { minutos: Number($('minutos').value) });
      const h = new Date(enviar_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      mostrar('st-teste', `Agendado para ${h}. Agora feche o app e aguarde (até 5 min de atraso).`);
    } catch (e) { mostrar('st-teste', e.message, false); }
  };

  $('status').onclick = async () => {
    try { $('saida').textContent = JSON.stringify(await chamar('status'), null, 2); } catch (e) { $('saida').textContent = e.message; }
  };

  $('gerar').onclick = async () => {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
    $('jwk').value = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });
    $('copiar').hidden = false;
  };
  $('copiar').onclick = async () => {
    try { await navigator.clipboard.writeText($('jwk').value); $('copiar').textContent = 'Copiada!'; } catch { $('jwk').select(); }
  };
}

async function atualizarStatusPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return mostrar('st-push', 'Navegador sem suporte a push.', false);
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) mostrar('st-push', 'Este aparelho já está inscrito.');
}

iniciar();
