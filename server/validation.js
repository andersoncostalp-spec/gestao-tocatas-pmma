'use strict';

const STATUS = ['agendado', 'confirmado', 'realizado', 'cancelado'];
const TIPOS_DOC = ['SEI', 'Ofício', 'Memorando', 'Outro', 'Nenhum'];
const ROLES = ['admin', 'editor', 'leitor'];

class ValidationError extends Error {
  constructor(errors) {
    super('Dados inválidos.');
    this.status = 400;
    this.errors = errors;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100;
}
const isValidTime = (s) => typeof s === 'string' && TIME_RE.test(s);

function str(v, max) {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\r\n/g, '\n').trim();
  if (!s) return null;
  return s.slice(0, max);
}

// Normaliza horários digitados como "8h", "17h30", "8:00" -> "08:00", "17:30"
function normalizeTime(v) {
  if (v === undefined || v === null || v === '') return null;
  const m = String(v).trim().toLowerCase().match(/^(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\s*(?:min)?$/);
  if (!m) return String(v);
  const h = m[1].padStart(2, '0');
  const mm = (m[2] || '00');
  return `${h}:${mm}`;
}

const EVENT_FIELDS = ['data', 'hora_inicio', 'hora_fim', 'evento', 'formacao', 'entidade', 'local',
  'tipo_documento', 'numero_documento', 'status', 'uniforme', 'contato', 'telefone', 'observacoes'];

function validateEvent(input, { partial = false } = {}) {
  const errors = {};
  const out = {};
  const src = input && typeof input === 'object' ? input : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(src, k);
  const need = (k) => !partial || has(k);

  if (need('data')) {
    if (!isValidDate(src.data)) errors.data = 'Data inválida (use AAAA-MM-DD).';
    else out.data = src.data;
  }
  if (need('hora_inicio')) {
    const t = normalizeTime(src.hora_inicio);
    if (!isValidTime(t)) errors.hora_inicio = 'Horário inválido (ex.: 08:00).';
    else out.hora_inicio = t;
  }
  if (has('hora_fim')) {
    const t = normalizeTime(src.hora_fim);
    if (t !== null && !isValidTime(t)) errors.hora_fim = 'Horário de término inválido.';
    else out.hora_fim = t;
  }
  for (const [k, max, required] of [['evento', 300, true], ['entidade', 200, true], ['local', 300, true]]) {
    if (need(k)) {
      const v = str(src[k], max);
      if (required && !v) errors[k] = 'Campo obrigatório.';
      else out[k] = v;
    }
  }
  for (const [k, max] of [['formacao', 100], ['numero_documento', 80], ['uniforme', 100], ['contato', 150],
    ['telefone', 40], ['observacoes', 2000]]) {
    if (has(k)) out[k] = str(src[k], max);
  }
  if (has('tipo_documento') || !partial) {
    const t = src.tipo_documento ?? 'SEI';
    if (!TIPOS_DOC.includes(t)) errors.tipo_documento = 'Tipo de documento inválido.';
    else out.tipo_documento = t;
  }
  if (out.tipo_documento === 'Nenhum') out.numero_documento = null;
  if (has('status') || !partial) {
    const s = src.status ?? 'agendado';
    if (!STATUS.includes(s)) errors.status = 'Situação inválida.';
    else out.status = s;
  }
  if (out.hora_fim && out.hora_inicio && out.hora_fim <= out.hora_inicio) {
    errors.hora_fim = 'O término deve ser após o início.';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

module.exports = {
  STATUS, TIPOS_DOC, ROLES, EVENT_FIELDS, ValidationError,
  validateEvent, isValidDate, isValidTime, normalizeTime, str,
};
