import { api } from '../api.js';
import { html, fmtDataHora } from '../util.js';
import { atualizarSino } from '../app.js';

export async function render({ main }) {
  const { items } = await api.get('/api/notifications');
  main.innerHTML = html`
    <div class="cabecalho-tela"><div><h1>Notificações</h1><p class="sub">Lembretes automáticos dos próximos eventos</p></div></div>
    <div class="cartao" style="padding:0;overflow:hidden">
      ${items.length ? items.map((n) => html`<a class="notif ${n.read_at ? '' : 'nao-lida'}" href="${n.event_id ? `#/eventos/${n.event_id}` : '#/painel'}">
        <strong>${n.title}</strong><div>${n.body}</div><small>${fmtDataHora(n.created_at)}</small></a>`)
        : html`<p class="vazio">Nenhuma notificação ainda.</p>`}
    </div>`.toString();
  if (items.some((n) => !n.read_at)) {
    await api.post('/api/notifications/read-all').catch(() => {});
    atualizarSino();
  }
}
