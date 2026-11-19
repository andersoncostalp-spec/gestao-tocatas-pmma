import { api } from '../api.js';
import { html, $, toast, ROLE_LABEL } from '../util.js';
import { statusPush, ativarPush, desativarPush } from '../push.js';
import { sair } from '../app.js';

const STATUS_PUSH = {
  ativo: 'Ativos neste aparelho', inativo: 'Desativados neste aparelho',
  bloqueado: 'Bloqueados pelo navegador — libere nas configurações do site', indisponivel: 'Não suportados neste navegador',
};

export async function render({ main, user }) {
  main.innerHTML = html`
    <div class="cabecalho-tela"><div><h1>Meu perfil</h1><p class="sub">${user.posto ? `${user.posto} ` : ''}${user.name} · ${ROLE_LABEL[user.role]}</p></div>
      <button class="btn sec" id="btn-sair">Sair</button></div>
    <section class="cartao" style="margin-bottom:16px">
      <h2>Lembretes de eventos</h2>
      <p>Notificações automáticas <strong>7 dias, 3 dias, 24 horas e 2 horas</strong> antes de cada evento agendado ou confirmado.</p>
      <p>Situação: <strong id="st-push">verificando…</strong></p>
      <div class="acoes" style="justify-content:flex-start">
        <button class="btn" id="btn-ativar" hidden>Ativar neste aparelho</button>
        <button class="btn sec" id="btn-desativar" hidden>Desativar</button>
        <button class="btn sec" id="btn-testar" hidden>Enviar teste</button>
      </div>
      <p style="font-size:.85rem;color:var(--texto-2)">No Android, instale o app pelo menu do Chrome (“Adicionar à tela inicial” / “Instalar app”) para receber os lembretes como um aplicativo.</p>
    </section>
    <form class="cartao" id="form-senha" novalidate>
      <h2>Alterar senha</h2>
      <div class="grade g3">
        <label>Senha atual<input type="password" name="current" autocomplete="current-password" required></label>
        <label>Nova senha<input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
        <label>Confirmar<input type="password" name="confirm" autocomplete="new-password" required></label>
      </div>
      <p class="erro" id="senha-erro"></p>
      <div class="acoes"><button class="btn" type="submit">Alterar senha</button></div>
    </form>`.toString();

  $('#btn-sair').addEventListener('click', sair);

  async function atualizar() {
    const st = await statusPush().catch(() => 'indisponivel');
    $('#st-push').textContent = STATUS_PUSH[st];
    $('#btn-ativar').hidden = st !== 'inativo';
    $('#btn-desativar').hidden = st !== 'ativo';
    $('#btn-testar').hidden = st !== 'ativo';
  }
  $('#btn-ativar').addEventListener('click', async () => {
    try { await ativarPush(); toast('Lembretes ativados.'); } catch (e) { toast(e.message, 'erro'); }
    atualizar();
  });
  $('#btn-desativar').addEventListener('click', async () => { await desativarPush(); toast('Lembretes desativados neste aparelho.'); atualizar(); });
  $('#btn-testar').addEventListener('click', async () => {
    try { const r = await api.post('/api/push/test'); toast(r.sent ? 'Notificação de teste enviada.' : 'Nenhum aparelho recebeu. Reative os lembretes.', r.sent ? 'ok' : 'erro'); } catch (e) { toast(e.message, 'erro'); }
  });
  atualizar();

  const form = $('#form-senha');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = $('#senha-erro');
    erro.textContent = '';
    if (form.password.value !== form.confirm.value) { erro.textContent = 'As senhas não conferem.'; return; }
    try {
      await api.post('/api/auth/change-password', { current: form.current.value, password: form.password.value });
      form.reset();
      toast('Senha alterada. Outras sessões foram encerradas.');
    } catch (e) { erro.textContent = e.message; }
  });
}
