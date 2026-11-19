import { api, onUnauthorized, onMustChangePassword } from './api.js';
import { html, raw, $, $$, esc, toast, ROLE_LABEL } from './util.js';
import { icons } from './icons.js';
import { registrarServiceWorker } from './push.js';

const state = { user: null, cleanup: null, unread: 0 };
export const getUser = () => state.user;
export const pode = (role) => {
  const nivel = { leitor: 1, editor: 2, admin: 3 };
  return !!state.user && nivel[state.user.role] >= nivel[role];
};

// Rotas: padrão -> carregador do módulo de tela
const ROTAS = [
  [/^\/painel$/, () => import('./views/painel.js')],
  [/^\/calendario$/, () => import('./views/calendario.js')],
  [/^\/eventos$/, () => import('./views/eventos.js')],
  [/^\/eventos\/novo$/, () => import('./views/evento-form.js'), 'editor'],
  [/^\/eventos\/(\d+)\/editar$/, () => import('./views/evento-form.js'), 'editor'],
  [/^\/eventos\/(\d+)$/, () => import('./views/evento-detalhe.js')],
  [/^\/mapa$/, () => import('./views/mapa.js')],
  [/^\/historico$/, () => import('./views/historico.js'), 'editor'],
  [/^\/usuarios$/, () => import('./views/usuarios.js'), 'admin'],
  [/^\/config$/, () => import('./views/config.js'), 'admin'],
  [/^\/perfil$/, () => import('./views/perfil.js')],
  [/^\/notificacoes$/, () => import('./views/notificacoes.js')],
  [/^\/menu$/, () => import('./views/menu.js')],
];

const NAV = [
  { href: '#/painel', label: 'Painel', icon: 'painel', mobile: true },
  { href: '#/calendario', label: 'Calendário', icon: 'calendario', mobile: true },
  { href: '#/eventos', label: 'Eventos', icon: 'eventos', mobile: true },
  { href: '#/mapa', label: 'Mapa mensal', icon: 'mapa', mobile: true },
  { href: '#/historico', label: 'Histórico', icon: 'historico', role: 'editor' },
  { href: '#/usuarios', label: 'Usuários', icon: 'usuarios', role: 'admin' },
  { href: '#/config', label: 'Configurações', icon: 'config', role: 'admin' },
  { href: '#/perfil', label: 'Meu perfil', icon: 'perfil' },
];

export function navigate(hash) { location.hash = hash; }

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/painel';
  const [path, query = ''] = h.split('?');
  return { path, query: new URLSearchParams(query) };
}

function shell() {
  const u = state.user;
  const itens = NAV.filter((n) => !n.role || pode(n.role));
  $('#app').innerHTML = html`
    <a class="pular" href="#conteudo">Pular para o conteúdo</a>
    <header class="topo">
      <a href="#/painel" class="marca" aria-label="Início">
        <img src="/icons/icon.svg" alt="" width="34" height="34">
        <span><strong>Tocatas BM</strong><small>Banda de Música · PMMA</small></span>
      </a>
      <div class="topo-acoes">
        ${pode('editor') ? html`<a class="btn novo-topo" href="#/eventos/novo" aria-label="Novo evento">${raw(icons.mais_add)}<span>Novo evento</span></a>` : ''}
        <a href="#/notificacoes" class="icone-btn" aria-label="Notificações" id="sino">${raw(icons.sino)}<span class="badge" hidden></span></a>
        <a href="#/perfil" class="usuario-topo" title="${u.name}"><span class="avatar">${iniciais(u.name)}</span></a>
      </div>
    </header>
    <nav class="lateral" aria-label="Navegação principal">
      ${itens.map((n) => html`<a href="${n.href}" data-nav>${raw(icons[n.icon])}<span>${n.label}</span></a>`)}
      <button type="button" class="sair" id="btn-sair">${raw(icons.sair)}<span>Sair</span></button>
      <div class="lateral-rodape">${u.name}<br><small>${ROLE_LABEL[u.role]}</small></div>
    </nav>
    <main id="conteudo" tabindex="-1"></main>
    <nav class="inferior" aria-label="Navegação">
      ${itens.filter((n) => n.mobile).map((n) => html`<a href="${n.href}" data-nav>${raw(icons[n.icon])}<span>${n.label.split(' ')[0]}</span></a>`)}
      <a href="#/menu" data-nav>${raw(icons.mais)}<span>Mais</span></a>
    </nav>`.toString();
  $('#btn-sair').addEventListener('click', sair);
}

function iniciais(nome) {
  return esc(String(nome).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase());
}

export async function sair() {
  try { await api.post('/api/auth/logout'); } catch { /* ignora */ }
  state.user = null;
  location.hash = '#/painel';
  telaLogin();
}

async function rotear() {
  if (!state.user) return;
  if (state.user.must_change_password) return telaTrocaSenha();
  if (!$('#conteudo')) shell();
  const { path, query } = parseHash();
  const main = $('#conteudo');
  if (typeof state.cleanup === 'function') { try { state.cleanup(); } catch { /* */ } }
  state.cleanup = null;

  $$('[data-nav]').forEach((a) => {
    const alvo = a.getAttribute('href').slice(1);
    a.classList.toggle('ativo', path === alvo || (alvo !== '/painel' && path.startsWith(alvo + '/')));
    if (a.classList.contains('ativo')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  const rota = ROTAS.find(([re]) => re.test(path));
  if (!rota) { navigate('#/painel'); return; }
  const [re, loader, role] = rota;
  if (role && !pode(role)) {
    main.innerHTML = '<div class="vazio"><h2>Acesso restrito</h2><p>Seu perfil não permite acessar esta tela.</p></div>';
    return;
  }
  const params = path.match(re).slice(1);
  main.innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    const mod = await loader();
    const token = Symbol('rota');
    state.rotaAtual = token;
    const cleanup = await mod.render({ main, params, query, user: state.user, navigate });
    if (state.rotaAtual === token) state.cleanup = cleanup;
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    if (err.status === 401 || err.code === 'MUST_CHANGE_PASSWORD') return;
    main.innerHTML = html`<div class="vazio"><h2>Não foi possível carregar</h2><p>${err.message}</p>
      <button class="btn" id="recarregar">Tentar novamente</button></div>`.toString();
    $('#recarregar').addEventListener('click', () => location.reload());
  }
  atualizarSino();
}

export async function atualizarSino() {
  try {
    const { unread } = await api.get('/api/notifications');
    state.unread = unread;
    const b = $('#sino .badge');
    if (b) { b.hidden = !unread; b.textContent = unread > 9 ? '9+' : unread; }
  } catch { /* silencioso */ }
}

function telaLogin(msg) {
  $('#app').innerHTML = html`
    <main class="login">
      <form class="cartao login-form" id="form-login" novalidate>
        <img src="/icons/icon.svg" alt="" width="72" height="72">
        <h1>Tocatas BM</h1>
        <p class="sub">Banda de Música · Polícia Militar do Maranhão</p>
        ${msg ? html`<p class="alerta">${msg}</p>` : ''}
        <label>Usuário<input name="username" autocomplete="username" required autocapitalize="none" spellcheck="false"></label>
        <label>Senha<input name="password" type="password" autocomplete="current-password" required></label>
        <p class="erro" id="login-erro" role="alert"></p>
        <button class="btn largo" type="submit">Entrar</button>
        <p class="rodape-login">Acesso restrito a usuários autorizados.</p>
      </form>
    </main>`.toString();
  const form = $('#form-login');
  form.username.focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    $('#login-erro').textContent = '';
    try {
      const { user } = await api.post('/api/auth/login', { username: form.username.value.trim(), password: form.password.value });
      state.user = user;
      rotear();
    } catch (err) {
      $('#login-erro').textContent = err.message;
      form.password.value = '';
      form.password.focus();
    } finally { btn.disabled = false; }
  });
}

function telaTrocaSenha() {
  $('#app').innerHTML = html`
    <main class="login">
      <form class="cartao login-form" id="form-senha" novalidate>
        <h1>Defina sua senha</h1>
        <p class="sub">Por segurança, troque a senha provisória antes de continuar.</p>
        <label>Senha atual<input name="current" type="password" autocomplete="current-password" required></label>
        <label>Nova senha<input name="password" type="password" autocomplete="new-password" minlength="8" required>
          <small>Mínimo de 8 caracteres, com letras e números.</small></label>
        <label>Confirme a nova senha<input name="confirm" type="password" autocomplete="new-password" required></label>
        <p class="erro" id="senha-erro" role="alert"></p>
        <button class="btn largo" type="submit">Salvar e continuar</button>
        <button class="btn sec largo" type="button" id="cancelar-senha">Sair</button>
      </form>
    </main>`.toString();
  const form = $('#form-senha');
  $('#cancelar-senha').addEventListener('click', sair);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = $('#senha-erro');
    if (form.password.value !== form.confirm.value) { erro.textContent = 'As senhas não conferem.'; return; }
    try {
      await api.post('/api/auth/change-password', { current: form.current.value, password: form.password.value });
      state.user.must_change_password = false;
      toast('Senha alterada com sucesso.');
      $('#app').innerHTML = '';
      rotear();
    } catch (err) { erro.textContent = err.message; }
  });
}

async function iniciar() {
  onUnauthorized(() => { if (state.user) { state.user = null; telaLogin('Sua sessão expirou. Entre novamente.'); } });
  onMustChangePassword(() => { if (state.user) { state.user.must_change_password = true; telaTrocaSenha(); } });
  window.addEventListener('hashchange', rotear);
  registrarServiceWorker();
  try {
    const { user } = await api.get('/api/auth/me');
    state.user = user;
    rotear();
  } catch {
    telaLogin();
  }
}

iniciar();
