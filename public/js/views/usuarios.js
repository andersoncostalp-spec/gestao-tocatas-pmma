import { api } from '../api.js';
import { html, $, toast, mostrarErros, fmtDataHora, ROLE_LABEL } from '../util.js';

export async function render({ main, user }) {
  const usuarios = await api.get('/api/users');

  main.innerHTML = html`
    <div class="cabecalho-tela"><div><h1>Usuários</h1><p class="sub">Controle de acesso ao sistema</p></div>
      <button class="btn" id="btn-novo">Novo usuário</button></div>
    <div class="alerta" style="margin-bottom:14px"><strong>Perfis:</strong> Administrador — tudo, inclusive usuários e configurações ·
      Editor (P1) — cadastra, altera e cancela eventos · Consulta — apenas visualiza e gera o mapa.</div>
    <div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th></th></tr></thead>
      <tbody>${usuarios.map((u) => html`<tr>
        <td class="esq">${u.posto ? `${u.posto} ` : ''}${u.name}</td><td>${u.username}</td><td>${ROLE_LABEL[u.role]}</td>
        <td>${u.active ? html`<span class="chip st-confirmado">Ativo</span>` : html`<span class="chip st-cancelado">Inativo</span>`}
          ${u.must_change_password ? html`<span class="chip breve">Senha provisória</span>` : ''}</td>
        <td>${u.last_login_at ? fmtDataHora(u.last_login_at) : '—'}</td>
        <td><button class="btn sec peq" data-editar="${u.id}">Editar</button></td></tr>`)}</tbody>
    </table></div>
    <dialog class="modal" id="dlg"><form id="form-usuario" novalidate>
      <h2 id="dlg-titulo"></h2>
      <div class="grade">
        <label>Nome completo *<input name="name" required maxlength="120"></label>
        <label>Posto/graduação<input name="posto" maxlength="60" placeholder="ex.: 2º SGT"></label>
        <label>Usuário (login) *<input name="username" required autocapitalize="none" maxlength="50"></label>
        <label>Perfil<select name="role">${Object.entries(ROLE_LABEL).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
        <label id="lbl-senha">Senha provisória *<input name="password" type="text" autocomplete="off" minlength="8">
          <small>O usuário deverá trocá-la no primeiro acesso.</small></label>
        <label id="lbl-ativo" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="active" style="width:auto;min-height:0"> Usuário ativo</label>
      </div>
      <p class="erro" id="usr-erro"></p>
      <div class="acoes" style="margin-top:10px">
        <button type="button" class="btn sec" id="btn-reset" hidden>Redefinir senha</button>
        <button type="button" class="btn sec" id="btn-fechar">Fechar</button>
        <button type="submit" class="btn">Salvar</button>
      </div>
    </form></dialog>`.toString();

  const dlg = $('#dlg');
  const form = $('#form-usuario');
  let editando = null;

  function abrir(u) {
    editando = u;
    form.reset();
    mostrarErros(form, null);
    $('#usr-erro').textContent = '';
    $('#dlg-titulo').textContent = u ? `Editar ${u.username}` : 'Novo usuário';
    form.name.value = u ? u.name : '';
    form.posto.value = u ? u.posto || '' : '';
    form.username.value = u ? u.username : '';
    form.username.disabled = !!u;
    form.role.value = u ? u.role : 'editor';
    form.active.checked = u ? !!u.active : true;
    $('#lbl-senha').hidden = !!u;
    $('#lbl-ativo').hidden = !u;
    $('#btn-reset').hidden = !u;
    dlg.showModal();
  }
  $('#btn-novo').addEventListener('click', () => abrir(null));
  $('#btn-fechar').addEventListener('click', () => dlg.close());
  main.querySelector('tbody').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-editar]');
    if (b) abrir(usuarios.find((u) => u.id === Number(b.dataset.editar)));
  });
  $('#btn-reset').addEventListener('click', async () => {
    const senha = prompt(`Nova senha provisória para ${editando.username} (mín. 8 caracteres, letras e números):`);
    if (!senha) return;
    try { await api.post(`/api/users/${editando.id}/reset-password`, { password: senha }); toast('Senha redefinida. O usuário deverá trocá-la no próximo acesso.'); dlg.close(); render({ main, user }); } catch (e) { toast(e.message, 'erro'); }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = { name: form.name.value, posto: form.posto.value, role: form.role.value };
    try {
      if (editando) await api.put(`/api/users/${editando.id}`, { ...d, active: form.active.checked });
      else await api.post('/api/users', { ...d, username: form.username.value.trim(), password: form.password.value });
      toast('Usuário salvo.');
      dlg.close();
      render({ main, user });
    } catch (e) { $('#usr-erro').textContent = e.message; mostrarErros(form, e); }
  });
}
