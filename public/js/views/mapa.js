import { api } from '../api.js';
import { html, raw, $, hoje, fmtHora, MESES } from '../util.js';
import { icons } from '../icons.js';

function horario(e) { return e.hora_fim ? `${fmtHora(e.hora_inicio)} às ${fmtHora(e.hora_fim)}` : fmtHora(e.hora_inicio); }
function documento(e) {
  if (!e.numero_documento || e.tipo_documento === 'Nenhum') return 'SEM PROCESSO SEI INFORMADO';
  const p = { SEI: 'SEI nº', 'Ofício': 'Ofício nº', Memorando: 'Memorando nº', Outro: '' }[e.tipo_documento];
  return p ? html`${p}<br>${e.numero_documento}` : e.numero_documento;
}

// Nome com *trecho* em negrito (nome de guerra)
function assinatura(nome) {
  return String(nome || '').split('*').map((p, i) => (i % 2 ? html`<strong>${p}</strong>` : html`${p}`));
}

export async function render({ main, query, navigate }) {
  const [anoAtual, mesAtual] = hoje().split('-').map(Number);
  const ano = Number(query.get('ano')) || anoAtual;
  const mes = Number(query.get('mes')) || mesAtual;
  const [dados, cfg] = await Promise.all([api.get(`/api/mapa/${ano}/${mes}`), api.get('/api/settings')]);
  const pdfUrl = `/api/mapa/${ano}/${mes}/pdf`;
  const anos = [];
  for (let a = anoAtual - 3; a <= anoAtual + 2; a++) anos.push(a);
  if (!anos.includes(ano)) anos.push(ano);
  const prox = mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
  const ant = mes === 1 ? [ano - 1, 12] : [ano, mes - 1];

  main.innerHTML = html`
    <div class="cabecalho-tela">
      <div><h1>Mapa mensal</h1><p class="sub">Gerado automaticamente a partir dos eventos cadastrados (exceto cancelados)</p></div>
      <div class="acoes">
        <a class="btn sec" href="${pdfUrl}" target="_blank" rel="noopener">${raw(icons.mapa)} Abrir PDF</a>
        <a class="btn" href="${pdfUrl}?download=1">${raw(icons.download)} Baixar PDF</a>
      </div>
    </div>
    <form class="cartao nao-imprimir" id="form-mes" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:16px">
      <button type="button" class="btn sec" data-ir="${ant.join('-')}" aria-label="Mês anterior">‹</button>
      <label style="flex:1;min-width:140px">Mês<select name="mes">${MESES.map((m, i) => html`<option value="${i + 1}" ${i + 1 === mes ? 'selected' : ''}>${m}</option>`)}</select></label>
      <label style="width:110px">Ano<select name="ano">${anos.sort().map((a) => html`<option ${a === ano ? 'selected' : ''}>${a}</option>`)}</select></label>
      <button type="button" class="btn sec" data-ir="${prox.join('-')}" aria-label="Próximo mês">›</button>
    </form>
    <p class="sub nao-imprimir" style="color:var(--texto-2)">${dados.eventos.length} evento(s) no mapa. Pré-visualização:</p>
    <div class="folha">
      <div class="logos">
        ${cfg.logo_esquerda ? html`<img src="${cfg.logo_esquerda}" alt="Brasão">` : html`<span></span>`}
        ${cfg.logo_centro ? html`<img src="${cfg.logo_centro}" alt="Brasão">` : html`<span></span>`}
        ${cfg.logo_direita ? html`<img src="${cfg.logo_direita}" alt="Brasão">` : html`<span></span>`}
      </div>
      <div class="cab">${String(cfg.cabecalho || '').split('\n').map((l) => html`${l}<br>`)}<span class="end">${cfg.endereco}</span></div>
      <p class="tit">${cfg.titulo}</p>
      <p class="tit">${dados.mesNome} ${ano}</p>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Nº</th><th>DATA</th><th>HORÁRIO</th><th>EVENTO</th><th>ENTIDADE SOLICITANTE</th><th>ENDEREÇO/LOCAL</th><th>OFÍCIO/SEI</th></tr></thead>
        <tbody>
          ${dados.eventos.length ? dados.eventos.map((e) => html`<tr data-href="#/eventos/${e.id}">
            <td>${e.ordem}</td><td>${e.data.slice(8, 10)}/${e.data.slice(5, 7)}</td><td>${horario(e)}</td>
            <td>${e.evento}${e.formacao ? html`<br>${e.formacao.toLowerCase() === String(cfg.formacao_padrao || '').toLowerCase() ? `(${e.formacao})` : html`<strong>(${e.formacao.toUpperCase()})</strong>`}` : ''}</td>
            <td>${e.entidade}</td><td>${e.local}</td><td>${documento(e)}</td></tr>`)
            : html`<tr><td colspan="7"><em>Nenhum evento cadastrado para o período.</em></td></tr>`}
        </tbody>
      </table></div>
      <div class="assinatura">${assinatura(cfg.assinatura_nome)}<small>${cfg.assinatura_cargo}</small></div>
    </div>`.toString();

  const form = $('#form-mes');
  const ir = (a, m) => navigate(`#/mapa?ano=${a}&mes=${m}`);
  form.addEventListener('change', () => ir(form.ano.value, form.mes.value));
  form.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ir]');
    if (b) { const [a, m] = b.dataset.ir.split('-'); ir(a, m); }
  });
  main.querySelector('tbody').addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-href]');
    if (tr) navigate(tr.dataset.href);
  });
}
