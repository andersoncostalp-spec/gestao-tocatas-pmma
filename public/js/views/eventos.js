import { api } from '../api.js';
import { html, raw, $, debounce, STATUS_LABEL } from '../util.js';
import { icons } from '../icons.js';
import { listaEventos } from './componentes.js';
import { pode } from '../app.js';

const CAMPOS = ['q', 'from', 'to', 'entidade', 'local', 'documento', 'numero', 'status', 'semDocumento', 'order'];
const POR_PAGINA = 30;

export async function render({ main, query }) {
  const f = Object.fromEntries(CAMPOS.map((k) => [k, query.get(k) || '']));
  const avancado = CAMPOS.some((k) => k !== 'q' && f[k]);
  const [entidades, locais] = await Promise.all([
    api.get('/api/events/suggestions/entidade').catch(() => []),
    api.get('/api/events/suggestions/local').catch(() => []),
  ]);

  main.innerHTML = html`
    <div class="cabecalho-tela">
      <div><h1>Eventos</h1><p class="sub">Consulta e pesquisa de tocatas</p></div>
      ${pode('editor') ? html`<a class="btn" href="#/eventos/novo">${raw(icons.mais_add)} Novo evento</a>` : ''}
    </div>
    <form class="cartao" id="form-busca" role="search">
      <div class="busca-principal">
        <input name="q" type="search" placeholder="Buscar por evento, entidade, local, SEI…" value="${f.q}" aria-label="Busca geral">
        <button class="btn" type="submit" aria-label="Pesquisar">${raw(icons.busca)}</button>
      </div>
      <details class="filtros" ${avancado ? 'open' : ''}>
        <summary>Filtros avançados</summary>
        <div class="grade g3" style="margin-top:10px">
          <label>Data inicial<input type="date" name="from" value="${f.from}"></label>
          <label>Data final<input type="date" name="to" value="${f.to}"></label>
          <label>Situação<select name="status">
            <option value="">Todas</option>
            ${Object.entries(STATUS_LABEL).map(([v, l]) => html`<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`)}
          </select></label>
          <label>Entidade solicitante<input name="entidade" list="dl-entidades" value="${f.entidade}"></label>
          <label>Endereço/Local<input name="local" list="dl-locais" value="${f.local}"></label>
          <label>Nº ofício / processo SEI<input name="documento" inputmode="numeric" value="${f.documento}" placeholder="ex.: 2026.190110.42616"></label>
          <label>Nº do evento<input name="numero" value="${f.numero}" placeholder="ex.: 45 ou 45/2026"></label>
          <label>Ordem<select name="order">
            <option value="">Data crescente</option>
            <option value="desc" ${f.order === 'desc' ? 'selected' : ''}>Mais recentes primeiro</option>
          </select></label>
          <label style="flex-direction:row;align-items:center;gap:8px;margin-top:24px">
            <input type="checkbox" name="semDocumento" value="1" style="width:auto;min-height:0" ${f.semDocumento ? 'checked' : ''}> Somente sem nº SEI/ofício</label>
        </div>
        <div class="acoes" style="margin-top:12px">
          <button type="button" class="btn sec" id="limpar">Limpar filtros</button>
          <button type="submit" class="btn">Pesquisar</button>
        </div>
      </details>
      <datalist id="dl-entidades">${entidades.map((v) => html`<option value="${v}">`)}</datalist>
      <datalist id="dl-locais">${locais.map((v) => html`<option value="${v}">`)}</datalist>
    </form>
    <div class="resultado-info"><span id="contagem"></span><a id="csv" href="#">Exportar CSV</a></div>
    <div id="resultados"><div class="carregando">Carregando…</div></div>
    <div class="paginacao" id="paginacao"></div>`.toString();

  const form = $('#form-busca');
  let offset = 0;

  const filtros = () => {
    const fd = new FormData(form);
    const o = {};
    for (const k of CAMPOS) { const v = fd.get(k); if (v) o[k] = String(v).trim(); }
    return o;
  };

  async function buscar() {
    const params = filtros();
    // mantém os filtros na URL (permite voltar e compartilhar)
    const novaHash = `#/eventos${api.qs(params)}`;
    if (location.hash !== novaHash) history.replaceState(null, '', novaHash);
    const r = await api.get('/api/events', { ...params, limit: POR_PAGINA, offset });
    $('#resultados').innerHTML = listaEventos(r.items).toString();
    $('#contagem').textContent = `${r.total} evento(s) encontrado(s)`;
    $('#csv').href = `/api/events/export.csv${api.qs({ from: params.from, to: params.to })}`;
    const pag = $('#paginacao');
    const paginas = Math.ceil(r.total / POR_PAGINA);
    const atual = Math.floor(offset / POR_PAGINA) + 1;
    pag.innerHTML = paginas > 1 ? html`
      <button class="btn sec peq" data-p="${atual - 1}" ${atual <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${atual} de ${paginas}</span>
      <button class="btn sec peq" data-p="${atual + 1}" ${atual >= paginas ? 'disabled' : ''}>Próxima</button>`.toString() : '';
  }

  form.addEventListener('submit', (ev) => { ev.preventDefault(); offset = 0; buscar(); });
  form.q.addEventListener('input', debounce(() => { offset = 0; buscar(); }, 350));
  form.addEventListener('change', (ev) => { if (ev.target.name !== 'q') { offset = 0; buscar(); } });
  $('#limpar').addEventListener('click', () => { form.reset(); for (const el of form.elements) if (el.name && el.type !== 'checkbox') el.value = ''; form.semDocumento.checked = false; offset = 0; buscar(); });
  $('#paginacao').addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-p]');
    if (!p) return;
    offset = (Number(p.dataset.p) - 1) * POR_PAGINA;
    buscar();
    window.scrollTo(0, 0);
  });
  await buscar();
}
