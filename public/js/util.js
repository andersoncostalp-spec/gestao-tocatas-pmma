// Utilitários de interface: escape de HTML, formatação de datas e avisos.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => (v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

// Template seguro: tudo que é interpolado é escapado, exceto raw() e arrays de raw
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return new Raw(out);
}
function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro',
  'Outubro', 'Novembro', 'Dezembro'];
export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function fmtData(d) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}
export function fmtDataLonga(d) {
  const dt = new Date(`${d}T12:00:00`);
  return `${DIAS[dt.getDay()]}, ${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()} de ${dt.getFullYear()}`;
}
export function fmtHora(h) {
  if (!h) return '';
  const [hh, mm] = h.split(':');
  return `${Number(hh)}h${mm === '00' ? '' : mm}`;
}
export const fmtHorario = (e) => (e.hora_fim ? `${fmtHora(e.hora_inicio)} às ${fmtHora(e.hora_fim)}` : fmtHora(e.hora_inicio));
export const fmtNumero = (e) => `${String(e.numero).padStart(3, '0')}/${e.ano}`;
export function fmtDocumento(e) {
  if (!e.numero_documento || e.tipo_documento === 'Nenhum') return '';
  return e.tipo_documento === 'Outro' ? e.numero_documento : `${e.tipo_documento} nº ${e.numero_documento}`;
}
export function fmtDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Data de hoje no fuso local do aparelho (AAAA-MM-DD)
export function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function diasAte(data, hora) {
  const alvo = new Date(`${data}T${hora || '00:00'}:00`);
  const diffMin = (alvo - new Date()) / 60000;
  const hojeD = new Date(`${hoje()}T00:00:00`);
  const dias = Math.round((new Date(`${data}T00:00:00`) - hojeD) / 86400000);
  if (diffMin < 0 && dias === 0) return { texto: 'Hoje (em andamento/encerrado)', classe: 'hoje' };
  if (dias === 0) return { texto: diffMin < 120 ? `Em ${Math.max(1, Math.round(diffMin))} min` : 'Hoje', classe: 'hoje' };
  if (dias === 1) return { texto: 'Amanhã', classe: 'breve' };
  if (dias <= 3) return { texto: `Em ${dias} dias`, classe: 'breve' };
  if (dias < 0) return { texto: `Há ${-dias} dia(s)`, classe: 'passado' };
  return { texto: `Em ${dias} dias`, classe: '' };
}

export const STATUS_LABEL = { agendado: 'Agendado', confirmado: 'Confirmado', realizado: 'Realizado', cancelado: 'Cancelado' };
export const ROLE_LABEL = { admin: 'Administrador', editor: 'Editor (P1)', leitor: 'Consulta' };
export const ACTION_LABEL = {
  criar: 'Criação', editar: 'Alteração', cancelar: 'Cancelamento', excluir: 'Exclusão', login: 'Acesso',
  login_falhou: 'Acesso negado', trocar_senha: 'Troca de senha', redefinir_senha: 'Senha redefinida', gerar_mapa: 'Mapa gerado',
};
export const FIELD_LABEL = {
  data: 'Data', hora_inicio: 'Horário', hora_fim: 'Término', evento: 'Evento', formacao: 'Formação', entidade: 'Entidade solicitante',
  local: 'Endereço/Local', tipo_documento: 'Tipo de documento', numero_documento: 'Nº do documento', status: 'Situação',
  uniforme: 'Uniforme', contato: 'Contato', telefone: 'Telefone', observacoes: 'Observações', username: 'Usuário', name: 'Nome',
  posto: 'Posto/Graduação', role: 'Perfil', active: 'Ativo', cabecalho: 'Cabeçalho', endereco: 'Endereço', titulo: 'Título',
  assinatura_nome: 'Assinatura (nome)', assinatura_cargo: 'Assinatura (função)', formacao_padrao: 'Formação padrão',
  logo_esquerda: 'Brasão esquerdo', logo_centro: 'Brasão central', logo_direita: 'Brasão direito',
};

export function fmtValor(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'data') return fmtData(v);
  if (campo === 'status') return STATUS_LABEL[v] || v;
  if (campo === 'role') return ROLE_LABEL[v] || v;
  if (campo === 'active') return v ? 'Sim' : 'Não';
  return String(v);
}

export function toast(msg, tipo = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('saindo'), 3500);
  setTimeout(() => el.remove(), 4000);
}

export function confirmar(mensagem, { ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.innerHTML = html`<form method="dialog">
      <p>${mensagem}</p>
      <div class="acoes">
        <button value="cancel" class="btn sec">Voltar</button>
        <button value="ok" class="btn ${perigo ? 'perigo' : ''}">${ok}</button>
      </div></form>`.toString();
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    dlg.showModal();
  });
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Exibe erros de validação devolvidos pela API ao lado dos campos
export function mostrarErros(form, err) {
  $$('.erro-campo', form).forEach((e) => e.remove());
  $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
  const errors = err && err.errors;
  if (!errors) return;
  let primeiro = null;
  for (const [campo, msg] of Object.entries(errors)) {
    const input = form.elements[campo];
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    const s = document.createElement('small');
    s.className = 'erro-campo';
    s.textContent = msg;
    input.insertAdjacentElement('afterend', s);
    primeiro = primeiro || input;
  }
  if (primeiro) primeiro.focus();
}
