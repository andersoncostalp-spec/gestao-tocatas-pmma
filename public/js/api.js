// Cliente HTTP da API (envia o cabeçalho anti-CSRF e trata sessão expirada)

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || `Erro ${status}`);
    this.status = status;
    this.errors = data && data.errors;
    this.code = data && data.code;
  }
}

const listeners = { unauthorized: [], mustChange: [] };
export const onUnauthorized = (fn) => listeners.unauthorized.push(fn);
export const onMustChangePassword = (fn) => listeners.mustChange.push(fn);

async function request(method, url, body) {
  const opts = { method, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, { error: 'Sem conexão com o servidor. Verifique a internet.' });
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/login')) listeners.unauthorized.forEach((f) => f());
    if (res.status === 403 && data && data.code === 'MUST_CHANGE_PASSWORD') listeners.mustChange.forEach((f) => f());
    throw new ApiError(res.status, data);
  }
  return data;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (url, params) => request('GET', url + qs(params)),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  qs,
};
