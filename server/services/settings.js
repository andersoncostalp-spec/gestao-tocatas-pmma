'use strict';

// Configurações do documento (cabeçalho/rodapé do mapa) editáveis pelo administrador.
const DEFAULTS = {
  cabecalho: [
    'ESTADO DO MARANHÃO',
    'SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA',
    'POLÍCIA MILITAR DO MARANHÃO',
    'AJUDÂNCIA GERAL',
    'BANDA DE MÚSICA',
  ].join('\n'),
  endereco: 'Av. Jerônimo de Albuquerque, s/n Calhau; CEP: 65074-220; São Luís/MA',
  titulo: 'MAPA DE EVENTOS DA BANDA DE MÚSICA/AJG',
  // Trecho entre *asteriscos* sai em negrito (nome de guerra)
  assinatura_nome: 'TC QOMus PAULO *SILA* DA SILVA ALVES',
  assinatura_cargo: 'Regente da BM/AjG',
  formacao_padrao: 'Banda de Música',
  logo_esquerda: '',
  logo_centro: '',
  logo_direita: '',
};
const PUBLIC_KEYS = Object.keys(DEFAULTS);
const LOGO_KEYS = ['logo_esquerda', 'logo_centro', 'logo_direita'];
const MAX_LOGO_BYTES = 600 * 1024;

function createSettings(db) {
  const getQ = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setQ = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

  const get = (key) => {
    const r = getQ.get(key);
    return r ? r.value : (DEFAULTS[key] ?? null);
  };
  const set = (key, value) => setQ.run(key, value);

  function all() {
    const o = {};
    for (const k of PUBLIC_KEYS) o[k] = get(k);
    return o;
  }

  function validateLogo(v) {
    if (v === '' || v === null) return '';
    const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(v));
    if (!m) throw Object.assign(new Error('Logo deve ser PNG ou JPEG.'), { status: 400 });
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_LOGO_BYTES) throw Object.assign(new Error('Logo muito grande (máx. 600 KB).'), { status: 400 });
    // Confere assinatura binária para evitar arquivo disfarçado
    const isPng = bytes.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!(isPng || isJpg)) throw Object.assign(new Error('Arquivo de imagem inválido.'), { status: 400 });
    return v;
  }

  const update = db.transaction((input) => {
    const changed = {};
    for (const k of PUBLIC_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(input, k)) continue;
      let v = input[k] === null || input[k] === undefined ? '' : String(input[k]);
      if (LOGO_KEYS.includes(k)) v = validateLogo(v);
      else v = v.slice(0, 1000);
      const old = get(k);
      if (old !== v) {
        set(k, v);
        changed[k] = LOGO_KEYS.includes(k) ? [old ? '(imagem)' : '', v ? '(imagem)' : ''] : [old, v];
      }
    }
    return changed;
  });

  return { get, set, all, update, DEFAULTS };
}

module.exports = { createSettings, DEFAULTS };
