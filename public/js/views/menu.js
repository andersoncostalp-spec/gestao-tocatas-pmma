import { html, raw, $ } from '../util.js';
import { icons } from '../icons.js';
import { pode, sair } from '../app.js';

export async function render({ main }) {
  const itens = [
    ['#/eventos/novo', 'Novo evento', 'mais_add', 'editor'],
    ['#/notificacoes', 'Notificações', 'sino'],
    ['#/historico', 'Histórico de alterações', 'historico', 'editor'],
    ['#/usuarios', 'Usuários', 'usuarios', 'admin'],
    ['#/config', 'Configurações do mapa', 'config', 'admin'],
    ['#/perfil', 'Meu perfil e lembretes', 'perfil'],
  ].filter(([, , , role]) => !role || pode(role));
  main.innerHTML = html`<h1>Mais opções</h1>
    <ul class="menu-lista">
      ${itens.map(([href, label, icon]) => html`<li><a href="${href}">${raw(icons[icon])}${label}</a></li>`)}
      <li><button type="button" class="sair" id="menu-sair">${raw(icons.sair)}Sair</button></li>
    </ul>`.toString();
  $('#menu-sair').addEventListener('click', sair);
}
