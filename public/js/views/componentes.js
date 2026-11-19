import { html, raw, fmtHorario, fmtDocumento, fmtNumero, diasAte, STATUS_LABEL, MESES } from '../util.js';
import { icons } from '../icons.js';

export function eventoItem(e, { contagem = false } = {}) {
  const [, m, d] = e.data.split('-');
  const doc = fmtDocumento(e);
  const prazo = contagem ? diasAte(e.data, e.hora_inicio) : null;
  return html`<li><a class="cartao evento-item ${e.status === 'cancelado' ? 'cancelado' : ''}" href="#/eventos/${e.id}">
    <div class="data-bloco"><span class="dia">${d}</span><span class="mes">${MESES[Number(m) - 1].slice(0, 3)}</span>
      <span class="hora">${fmtHorario(e)}</span></div>
    <div>
      <p class="titulo">${e.evento}${e.formacao ? html` <small>(${e.formacao})</small>` : ''}</p>
      <div class="meta">
        <span>${raw(icons.predio)}${e.entidade}</span>
        <span>${raw(icons.local)}${e.local}</span>
        ${doc ? html`<span>${raw(icons.doc)}${doc}</span>` : ''}
      </div>
      <div class="chips">
        <span class="chip">Nº ${fmtNumero(e)}</span>
        <span class="chip st-${e.status}">${STATUS_LABEL[e.status]}</span>
        ${prazo ? html`<span class="chip ${prazo.classe}">${prazo.texto}</span>` : ''}
        ${!doc && e.status !== 'cancelado' ? html`<span class="chip sem-doc">Sem nº SEI/ofício</span>` : ''}
      </div>
    </div>
  </a></li>`;
}

export function listaEventos(itens, opts) {
  if (!itens.length) return html`<div class="vazio cartao">Nenhum evento encontrado.</div>`;
  return html`<ul class="lista-eventos">${itens.map((e) => eventoItem(e, opts))}</ul>`;
}
