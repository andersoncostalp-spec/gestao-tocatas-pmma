import { api } from '../api.js';
import { html, $, $$, toast } from '../util.js';

const LOGOS = [['logo_esquerda', 'Brasão à esquerda'], ['logo_centro', 'Brasão central (acima do texto)'], ['logo_direita', 'Brasão à direita']];

export async function render({ main }) {
  const cfg = await api.get('/api/settings');
  const hoje = new Date();

  main.innerHTML = html`
    <div class="cabecalho-tela"><div><h1>Configurações do mapa</h1><p class="sub">Cabeçalho, brasões e assinatura do PDF mensal</p></div></div>
    <form id="form-cfg">
      <fieldset><legend>Cabeçalho</legend><div class="grade">
        <label>Linhas do cabeçalho <small>uma por linha</small><textarea name="cabecalho" rows="5">${cfg.cabecalho}</textarea></label>
        <label>Endereço<input name="endereco" value="${cfg.endereco}"></label>
        <label>Título do documento<input name="titulo" value="${cfg.titulo}"></label>
      </div></fieldset>
      <fieldset><legend>Brasões (PNG ou JPEG, até 600 KB)</legend><div class="grade g3">
        ${LOGOS.map(([k, l]) => html`<div><label>${l}<input type="file" accept="image/png,image/jpeg" data-logo="${k}"></label>
          <div class="logo-prev" style="margin-top:6px"><img data-prev="${k}" alt="" ${cfg[k] ? '' : 'hidden'} src="${cfg[k] || ''}">
          <button type="button" class="btn sec peq" data-remover="${k}" ${cfg[k] ? '' : 'hidden'}>Remover</button></div></div>`)}
      </div></fieldset>
      <fieldset><legend>Assinatura</legend><div class="grade g2">
        <label>Nome <small>use *asteriscos* para o nome de guerra em negrito</small><input name="assinatura_nome" value="${cfg.assinatura_nome}"></label>
        <label>Função<input name="assinatura_cargo" value="${cfg.assinatura_cargo}"></label>
        <label>Formação padrão <small>formação que não recebe destaque em negrito no mapa</small><input name="formacao_padrao" value="${cfg.formacao_padrao}"></label>
      </div></fieldset>
      <div class="acoes">
        <a class="btn sec" href="/api/mapa/${hoje.getFullYear()}/${hoje.getMonth() + 1}/pdf" target="_blank" rel="noopener">Testar PDF do mês</a>
        <button class="btn" type="submit">Salvar configurações</button>
      </div>
    </form>`.toString();

  const form = $('#form-cfg');
  const logos = {};
  $$('[data-logo]').forEach((inp) => inp.addEventListener('change', () => {
    const file = inp.files[0];
    if (!file) return;
    if (file.size > 600 * 1024) { toast('Imagem muito grande (máx. 600 KB).', 'erro'); inp.value = ''; return; }
    const r = new FileReader();
    r.onload = () => {
      const k = inp.dataset.logo;
      logos[k] = r.result;
      const img = $(`[data-prev="${k}"]`);
      img.src = r.result; img.hidden = false;
      $(`[data-remover="${k}"]`).hidden = false;
    };
    r.readAsDataURL(file);
  }));
  $$('[data-remover]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.remover;
    logos[k] = '';
    $(`[data-prev="${k}"]`).hidden = true;
    b.hidden = true;
  }));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = Object.fromEntries([...new FormData(form)].filter(([, v]) => typeof v === 'string'));
    try { await api.put('/api/settings', { ...dados, ...logos }); toast('Configurações salvas.'); } catch (e) { toast(e.message, 'erro'); }
  });
}
