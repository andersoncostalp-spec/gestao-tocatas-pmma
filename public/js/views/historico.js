import { api } from '../api.js';
import { html, $, fmtDataHora, ACTION_LABEL } from '../util.js';
import { listaMudancas } from './evento-detalhe.js';
import { pode } from '../app.js';

const POR_PAGINA = 40;
const ENTIDADES = { evento: 'Eventos', usuario: 'Usuários e acessos', configuracao: 'Configurações', mapa: 'Mapas gerados' };

export async function render({ main }) {
  main.innerHTML = html`
    <div class="cabecalho-tela"><div><h1>Histórico de alterações</h1>
      <p class="sub">Registro de todas as inclusões, alterações, cancelamentos e exclusões</p></div></div>
    <form class="cartao grade g4" id="filtros" style="margin-bottom:14px">
      <label>Tipo<select name="entity"><option value="">Todos</option>
        ${Object.entries(ENTIDADES).filter(([k]) => k !== 'usuario' || pode('admin')).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label>Ação<select name="action"><option value="">Todas</option>
        ${Object.entries(ACTION_LABEL).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label>De<input type="date" name="from"></label>
      <label>Até<input type="date" name="to"></label>
      <label class="span-all">Texto<input type="search" name="q" placeholder="Buscar na descrição (ex.: nº do evento)"></label>
    </form>
    <div id="lista" class="cartao"></div>
    <div class="paginacao" id="pag"></div>`.toString();

  const form = $('#filtros');
  let offset = 0;
  async function carregar() {
    const params = Object.fromEntries([...new FormData(form)].filter(([, v]) => v));
    const r = await api.get('/api/audit', { ...params, limit: POR_PAGINA, offset });
    $('#lista').innerHTML = r.items.length ? html`<ol class="linha-tempo">${r.items.map((h) => html`<li>
      <div>${h.entity === 'evento' && h.entity_id && h.action !== 'excluir' ? html`<a href="#/eventos/${h.entity_id}">${h.summary}</a>` : h.summary}</div>
      <div class="quando">${ACTION_LABEL[h.action] || h.action} · ${h.user_name || h.username || 'sistema'} · ${fmtDataHora(h.at)}${h.ip ? ` · IP ${h.ip}` : ''}</div>
      ${['editar', 'cancelar'].includes(h.action) ? listaMudancas(h.changes) : ''}
    </li>`)}</ol>`.toString() : '<p class="vazio">Nenhum registro encontrado.</p>';
    const paginas = Math.ceil(r.total / POR_PAGINA);
    const atual = offset / POR_PAGINA + 1;
    $('#pag').innerHTML = paginas > 1 ? html`<button class="btn sec peq" data-p="${atual - 1}" ${atual <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${atual} de ${paginas} (${r.total})</span>
      <button class="btn sec peq" data-p="${atual + 1}" ${atual >= paginas ? 'disabled' : ''}>Próxima</button>`.toString() : '';
  }
  form.addEventListener('input', () => { offset = 0; carregar(); });
  $('#pag').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-p]');
    if (b) { offset = (Number(b.dataset.p) - 1) * POR_PAGINA; carregar(); }
  });
  await carregar();
}
