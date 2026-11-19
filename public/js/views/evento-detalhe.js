import { api } from '../api.js';
import {
  html, raw, $, toast, confirmar, fmtDataLonga, fmtHorario, fmtNumero, fmtDocumento, fmtDataHora, fmtValor,
  diasAte, STATUS_LABEL, ACTION_LABEL, FIELD_LABEL,
} from '../util.js';
import { icons } from '../icons.js';
import { pode } from '../app.js';

export function listaMudancas(changes) {
  if (!changes) return '';
  return html`<ul class="mudancas">${Object.entries(changes).map(([campo, [a, b]]) => html`
    <li><strong>${FIELD_LABEL[campo] || campo}:</strong> <del>${fmtValor(campo, a)}</del> → <ins>${fmtValor(campo, b)}</ins></li>`)}</ul>`;
}

export function linhaTempo(hist) {
  if (!hist.length) return html`<p class="vazio">Sem registros.</p>`;
  return html`<ol class="linha-tempo">${hist.map((h) => html`<li>
    <div><strong>${ACTION_LABEL[h.action] || h.action}</strong> por ${h.user_name || h.username || 'sistema'}</div>
    <div class="quando">${fmtDataHora(h.at)}</div>
    ${h.action !== 'criar' && h.action !== 'excluir' ? listaMudancas(h.changes) : ''}
  </li>`)}</ol>`;
}

export async function render({ main, params, navigate }) {
  const id = Number(params[0]);
  const [e, hist] = await Promise.all([api.get(`/api/events/${id}`), api.get(`/api/events/${id}/history`)]);
  const prazo = diasAte(e.data, e.hora_inicio);
  const doc = fmtDocumento(e);
  const campo = (label, valor) => (valor ? html`<dt>${label}</dt><dd>${valor}</dd>` : '');
  const [ano, mes] = e.data.split('-');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.local}, São Luís - MA`)}`;

  main.innerHTML = html`
    <div class="cabecalho-tela">
      <div>
        <a href="#/eventos" class="nao-imprimir" style="display:inline-flex;align-items:center;text-decoration:none">${raw(icons.voltar)} Eventos</a>
        <p class="numero-evento">EVENTO Nº ${fmtNumero(e)}</p>
        <h1>${e.evento}</h1>
        <div class="chips" style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="chip st-${e.status}">${STATUS_LABEL[e.status]}</span>
          ${e.status !== 'cancelado' && e.status !== 'realizado' ? html`<span class="chip ${prazo.classe}">${prazo.texto}</span>` : ''}
        </div>
      </div>
      ${pode('editor') ? html`<div class="acoes nao-imprimir">
        ${e.status !== 'cancelado' ? html`<button class="btn sec" id="btn-cancelar">Cancelar evento</button>` : html`<button class="btn sec" id="btn-reativar">Reativar</button>`}
        <button class="btn sec" id="btn-duplicar">Duplicar</button>
        <a class="btn" href="#/eventos/${e.id}/editar">Editar</a>
      </div>` : ''}
    </div>
    <div class="cartao detalhe">
      <dl>
        <dt>Data</dt><dd>${fmtDataLonga(e.data)}</dd>
        <dt>Horário</dt><dd>${fmtHorario(e)}</dd>
        ${campo('Formação', e.formacao)}
        <dt>Entidade solicitante</dt><dd>${e.entidade}</dd>
        <dt>Endereço/Local</dt><dd>${e.local} <a href="${mapsUrl}" target="_blank" rel="noopener" class="nao-imprimir">(ver no mapa)</a></dd>
        <dt>Ofício/SEI</dt><dd>${doc || html`<span class="chip sem-doc">Sem processo SEI/ofício informado</span>`}</dd>
        ${campo('Uniforme', e.uniforme)}
        ${campo('Contato', e.contato)}
        ${e.telefone ? html`<dt>Telefone</dt><dd><a href="tel:${e.telefone.replace(/[^\d+]/g, '')}">${e.telefone}</a></dd>` : ''}
        ${campo('Observações', e.observacoes)}
        <dt>Cadastro</dt><dd>${fmtDataHora(e.created_at)}${e.created_by_name ? ` — ${e.created_by_name}` : ''}</dd>
        <dt>Última alteração</dt><dd>${fmtDataHora(e.updated_at)}${e.updated_by_name ? ` — ${e.updated_by_name}` : ''}</dd>
      </dl>
      <div class="acoes nao-imprimir" style="margin-top:14px;justify-content:flex-start">
        <a class="btn sec peq" href="#/mapa?ano=${ano}&mes=${Number(mes)}">${raw(icons.mapa)} Mapa do mês</a>
        <a class="btn sec peq" href="#/calendario?data=${e.data}&view=timeGridDay">${raw(icons.calendario)} Ver no calendário</a>
        ${pode('editor') ? html`<button class="btn sec peq" id="btn-excluir" style="color:var(--perigo)">Excluir</button>` : ''}
      </div>
    </div>
    <section class="secao">
      <h2>Histórico de alterações</h2>
      <div class="cartao">${linhaTempo(hist)}</div>
    </section>`.toString();

  const mudarStatus = async (status, msg) => {
    try { await api.put(`/api/events/${id}`, { status }); toast(msg); render({ main, params, navigate }); } catch (err) { toast(err.message, 'erro'); }
  };
  $('#btn-cancelar')?.addEventListener('click', async () => {
    if (await confirmar('Cancelar este evento? Ele deixará de constar no mapa mensal e não gerará lembretes.', { ok: 'Cancelar evento', perigo: true })) {
      mudarStatus('cancelado', 'Evento cancelado.');
    }
  });
  $('#btn-reativar')?.addEventListener('click', () => mudarStatus('agendado', 'Evento reativado.'));
  $('#btn-duplicar')?.addEventListener('click', async () => {
    const copia = { ...e, status: 'agendado' };
    try {
      const novo = await api.post('/api/events', copia);
      toast(`Cópia criada: Nº ${fmtNumero(novo)}. Ajuste a data.`);
      navigate(`#/eventos/${novo.id}/editar`);
    } catch (err) { toast(err.message, 'erro'); }
  });
  $('#btn-excluir')?.addEventListener('click', async () => {
    if (!(await confirmar(`Excluir definitivamente o evento Nº ${fmtNumero(e)}? Prefira "Cancelar" quando o evento apenas não for mais acontecer. A exclusão fica registrada no histórico.`, { ok: 'Excluir', perigo: true }))) return;
    try { await api.del(`/api/events/${id}`); toast('Evento excluído.'); navigate('#/eventos'); } catch (err) { toast(err.message, 'erro'); }
  });
}
