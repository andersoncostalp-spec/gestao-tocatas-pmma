import { api } from '../api.js';
import { html, $, toast, fmtDataLonga, hoje, MESES } from '../util.js';
import { listaEventos } from './componentes.js';
import { statusPush, ativarPush } from '../push.js';

export async function render({ main, user }) {
  const dados = await api.get('/api/events/upcoming', { limit: 15 });
  const { stats, items } = dados;
  const [ano, mes] = hoje().split('-');
  const primeiro = user.name.split(' ')[0];

  main.innerHTML = html`
    <div class="cabecalho-tela">
      <div><h1>Olá, ${primeiro}</h1><p class="sub">${fmtDataLonga(hoje())}</p></div>
    </div>
    <div id="aviso-push"></div>
    <div class="stats">
      <a class="cartao stat destaque" href="#/eventos?from=${hoje()}&to=${hoje()}"><strong>${stats.hoje}</strong><span>Evento(s) hoje</span></a>
      <a class="cartao stat" href="#/calendario?view=listWeek"><strong>${stats.proximos7}</strong><span>Próximos 7 dias</span></a>
      <a class="cartao stat" href="#/mapa?ano=${ano}&mes=${Number(mes)}"><strong>${stats.mes}</strong><span>Em ${MESES[Number(mes) - 1].toLowerCase()}</span></a>
      <a class="cartao stat" href="#/eventos?semDocumento=1&from=${hoje()}"><strong>${stats.semDocumento}</strong><span>Sem nº SEI/ofício</span></a>
    </div>
    <section>
      <div class="cabecalho-tela"><h2>Próximos eventos</h2><a href="#/calendario" class="btn sec peq">Ver calendário</a></div>
      ${listaEventos(items, { contagem: true })}
    </section>`.toString();

  // Convida a ativar notificações neste aparelho
  try {
    const st = await statusPush();
    if (st === 'inativo') {
      const box = $('#aviso-push');
      box.innerHTML = html`<div class="alerta" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px">
        <span>Ative as notificações para receber lembretes 7 dias, 3 dias, 24 horas e 2 horas antes de cada evento.</span>
        <button class="btn peq" id="btn-push">Ativar lembretes</button></div>`.toString();
      $('#btn-push').addEventListener('click', async () => {
        try { await ativarPush(); toast('Lembretes ativados neste aparelho.'); box.innerHTML = ''; } catch (e) { toast(e.message, 'erro'); }
      });
    }
  } catch { /* sem suporte */ }
}
