import { api } from '../api.js';
import { html, $, toast, mostrarErros, fmtNumero, STATUS_LABEL, confirmar } from '../util.js';

const FORMACOES = ['Banda de Música', 'Banda Marcial', 'Fanfarra', 'Grupo de Câmara', 'Quinteto de Metais', 'Quarteto',
  'Trio', 'Saxofonista', 'Trompetista', 'Corneteiro', 'Clarim', 'Hino Nacional (terno)'];

export async function render({ main, params, query, navigate }) {
  const id = params[0] ? Number(params[0]) : null;
  const [ev, entidades, locais, settings] = await Promise.all([
    id ? api.get(`/api/events/${id}`) : null,
    api.get('/api/events/suggestions/entidade').catch(() => []),
    api.get('/api/events/suggestions/local').catch(() => []),
    api.get('/api/settings').catch(() => ({})),
  ]);
  const e = ev || {
    data: query.get('data') || '', hora_inicio: query.get('hora') || '', status: 'agendado', tipo_documento: 'SEI',
    formacao: settings.formacao_padrao || 'Banda de Música',
  };
  const v = (k) => e[k] ?? '';

  main.innerHTML = html`
    <div class="cabecalho-tela">
      <div>
        <h1>${id ? 'Editar evento' : 'Novo evento'}</h1>
        <p class="sub">${id ? `Nº ${fmtNumero(e)} — a numeração não muda na edição` : 'O número do evento será gerado automaticamente ao salvar'}</p>
      </div>
    </div>
    <form id="form-evento" novalidate>
      <fieldset>
        <legend>Data e horário</legend>
        <div class="grade g3">
          <label>Data *<input type="date" name="data" required value="${v('data')}"></label>
          <label>Horário de início *<input type="time" name="hora_inicio" required value="${v('hora_inicio')}"></label>
          <label>Término <small>(opcional)</small><input type="time" name="hora_fim" value="${v('hora_fim')}"></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Evento</legend>
        <div class="grade g2">
          <label class="span-all">Evento *<textarea name="evento" required rows="2" maxlength="300" placeholder="ex.: Solenidade de Abertura do Mundo SENAI">${v('evento')}</textarea></label>
          <label>Formação / efetivo <small>Sai entre parênteses no mapa</small>
            <input name="formacao" list="dl-formacoes" maxlength="100" value="${v('formacao')}"></label>
          <label>Situação<select name="status">
            ${Object.entries(STATUS_LABEL).map(([k, l]) => html`<option value="${k}" ${e.status === k ? 'selected' : ''}>${l}</option>`)}
          </select></label>
          <label class="span-all">Entidade solicitante *<input name="entidade" required list="dl-entidades" maxlength="200" value="${v('entidade')}"></label>
          <label class="span-all">Endereço / local *<textarea name="local" required rows="2" maxlength="300">${v('local')}</textarea></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Documento de solicitação</legend>
        <div class="grade g2">
          <label>Tipo<select name="tipo_documento">
            ${['SEI', 'Ofício', 'Memorando', 'Outro', 'Nenhum'].map((t) => html`<option value="${t}" ${e.tipo_documento === t ? 'selected' : ''}>${t === 'SEI' ? 'Processo SEI' : t === 'Nenhum' ? 'Sem documento informado' : t}</option>`)}
          </select></label>
          <label>Número<input name="numero_documento" maxlength="80" value="${v('numero_documento')}" placeholder="ex.: 2026.190110.42616"></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Informações complementares</legend>
        <div class="grade g3">
          <label>Uniforme<input name="uniforme" maxlength="100" value="${v('uniforme')}" placeholder="ex.: 4º A"></label>
          <label>Contato no local<input name="contato" maxlength="150" value="${v('contato')}"></label>
          <label>Telefone<input name="telefone" type="tel" maxlength="40" value="${v('telefone')}"></label>
          <label class="span-all">Observações<textarea name="observacoes" maxlength="2000">${v('observacoes')}</textarea></label>
        </div>
      </fieldset>
      <datalist id="dl-formacoes">${FORMACOES.map((f) => html`<option value="${f}">`)}</datalist>
      <datalist id="dl-entidades">${entidades.map((x) => html`<option value="${x}">`)}</datalist>
      <datalist id="dl-locais">${locais.map((x) => html`<option value="${x}">`)}</datalist>
      <p class="erro" id="form-erro" role="alert"></p>
      <div class="acoes">
        <a class="btn sec" href="${id ? `#/eventos/${id}` : '#/eventos'}">Cancelar</a>
        ${!id ? html`<button type="submit" class="btn sec" data-mais="1">Salvar e cadastrar outro</button>` : ''}
        <button type="submit" class="btn">Salvar</button>
      </div>
    </form>`.toString();

  const form = $('#form-evento');
  const sincDoc = () => { form.numero_documento.disabled = form.tipo_documento.value === 'Nenhum'; };
  form.tipo_documento.addEventListener('change', sincDoc);
  sincDoc();
  if (!id) form.data.focus();

  let sujo = false;
  form.addEventListener('input', () => { sujo = true; });

  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const outro = evt.submitter && evt.submitter.dataset.mais;
    const dados = Object.fromEntries(new FormData(form));
    if (form.numero_documento.disabled) dados.numero_documento = '';
    $('#form-erro').textContent = '';
    if (dados.status === 'cancelado' && ev && ev.status !== 'cancelado') {
      if (!(await confirmar('Confirma o cancelamento deste evento? Ele deixará de constar no mapa mensal e não gerará lembretes.', { ok: 'Cancelar evento', perigo: true }))) return;
    }
    const botoes = form.querySelectorAll('button');
    botoes.forEach((b) => { b.disabled = true; });
    try {
      const salvo = id ? await api.put(`/api/events/${id}`, dados) : await api.post('/api/events', dados);
      sujo = false;
      toast(id ? 'Evento atualizado.' : `Evento Nº ${fmtNumero(salvo)} cadastrado.`);
      if (outro) {
        form.reset();
        form.formacao.value = settings.formacao_padrao || '';
        form.data.value = dados.data;
        form.data.focus();
        mostrarErros(form, null);
      } else navigate(`#/eventos/${salvo.id}`);
    } catch (err) {
      $('#form-erro').textContent = err.message;
      mostrarErros(form, err);
    } finally { botoes.forEach((b) => { b.disabled = false; }); }
  });

  const aviso = (ev2) => { if (sujo) { ev2.preventDefault(); ev2.returnValue = ''; } };
  window.addEventListener('beforeunload', aviso);
  return () => window.removeEventListener('beforeunload', aviso);
}
