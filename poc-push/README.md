# Etapa 0: prova de conceito das notificações (Supabase + Cloudflare)

Valida a parte mais arriscada da migração gratuita **antes** de mexer no sistema: uma notificação push
disparada pelo **cron do Cloudflare**, enviada pela **Edge Function do Supabase** e recebida no **Android com o app fechado**.

O sistema atual (`server/`, `public/`) **não é alterado**.

```
Cloudflare Worker (cron */5) ──POST tick──▶ Supabase Edge Function "poc-push" ──Web Push──▶ Chrome/Android
                                                   │ tabelas poc_push_*
Página de teste (Cloudflare Pages) ──inscrição────┘
```

| Pasta | Conteúdo |
|---|---|
| `supabase/migrations/0001_poc_push.sql` | Tabelas do teste (RLS ativo, sem acesso público) |
| `supabase/functions/poc-push/index.ts` | Edge Function: inscrição, envio, agendamento e `tick` |
| `worker/index.js` | Worker do Cloudflare com Cron Trigger |
| `web/` | Página de teste instalável (PWA) |
| `test/poc.test.ts` | Testes automatizados (Deno) |

## Custos
Nenhum. Supabase Free e Cloudflare Free **não pedem cartão**. **Não cadastre cartão** em nenhuma das contas:
assim, ao atingir algum limite, o serviço é restringido, nunca cobrado.

## Passo a passo (tudo pelo navegador)

Antes de começar, invente uma **senha do teste** (ex.: 20 letras e números aleatórios). Ela será o `POC_TOKEN`.

### A. Supabase
1. Crie a conta em supabase.com (pode usar "Continue with GitHub"). Crie o projeto: região **South America (São Paulo)**,
   plano **Free**, e guarde a senha do banco.
2. **SQL Editor → New query**: cole o conteúdo de `supabase/migrations/0001_poc_push.sql` e clique em **Run**.
3. **Edge Functions → Deploy a new function → Via Editor**: nome **`poc-push`**, cole todo o conteúdo de
   `supabase/functions/poc-push/index.ts` e clique em **Deploy**.
4. Na função, em **Details / Settings**, **desligue "Enforce JWT verification"** (Verify JWT). A proteção é feita pela senha do teste.
5. Copie o endereço da função (algo como `https://xxxx.supabase.co/functions/v1/poc-push`).
6. **Edge Functions → Secrets**: crie `POC_TOKEN` (sua senha do teste) e `VAPID_SUBJECT` (ex.: `mailto:seu-email@...`).
   O `VAPID_PRIVATE_JWK` será criado no passo C.

### B. Página de teste (Worker do Cloudflare)
A página é servida por um Worker (`tocatas-teste`), gerado a partir de `web/` por `scripts/build-page-worker.js`
e publicado pela API do Cloudflare. Endereço: `https://tocatas-teste.<subdominio>.workers.dev`.
(O envio de arquivos do Cloudflare Pages exige um token temporário próprio, incompatível com a injeção de credenciais
do ambiente usado; o Worker tem o mesmo HTTPS e é instalável como PWA. Pages volta a ser avaliado na Etapa 5.)

### C. Chaves de notificação (VAPID)
1. Abra o endereço do Pages no computador → **Configuração inicial: gerar chaves VAPID → Gerar chaves → Copiar**.
2. No Supabase, **Edge Functions → Secrets**: crie `VAPID_PRIVATE_JWK` e cole o valor copiado (o texto inteiro, com chaves `{}`).
   Essa chave é secreta: não a envie por chat nem a coloque no GitHub.

### D. Cloudflare Worker (cron)
1. **Workers & Pages → Create → Worker** → nome `tocatas-cron` → **Deploy** → **Edit code**: apague o exemplo,
   cole o conteúdo de `worker/index.js` e clique em **Deploy**.
2. **Settings → Variables and Secrets**: adicione `FUNCTION_URL` (tipo *Text*) com o endereço da função
   e `POC_TOKEN` (tipo *Secret*) com a senha do teste.
3. **Settings → Trigger events → Add → Cron Triggers**: `*/5 * * * *` (a cada 5 minutos).

### E. Teste no celular Android
1. Abra o endereço do Pages no **Chrome** → menu ⋮ → **Instalar app** → abra pelo ícone.
2. Passo 1 da página: cole o endereço da função e a senha → **Salvar e verificar** → deve aparecer "Conectado".
3. Passo 2: **Ativar notificações** → permitir.
4. **Teste A**: **Enviar agora**. A notificação deve chegar em segundos.
5. **Teste B**: **Agendar para daqui 10 min**, **feche o app** (remova dos recentes) e bloqueie a tela.
   A notificação "Lembrete agendado" deve chegar entre 10 e 15 minutos depois.
6. Abra o app → **Situação no servidor → Atualizar**: os registros `tick:cron` a cada 5 minutos comprovam o cron.

**Critério de aprovação da Etapa 0:** testes A e B recebidos no celular, com o app fechado no teste B.

### Se algo falhar
| Sintoma | Causa provável |
|---|---|
| "Token inválido" | `POC_TOKEN` diferente na página e no Supabase |
| "segredo VAPID_PRIVATE_JWK ainda não foi configurado" | Passo C incompleto, ou a função precisa ser publicada de novo após criar o segredo |
| Erro 401 com "JWT" na mensagem | "Enforce JWT verification" ainda ligado (passo A.4) |
| Teste A ok, B não chega | Cron não configurado (D.3), `FUNCTION_URL`/`POC_TOKEN` errados no Worker (veja **Logs** do Worker), ou economia de bateria do Android bloqueando o Chrome |
| Notificação atrasa muito com a tela bloqueada | Configurações → Apps → Chrome → Bateria → **Sem restrições** |

## Testes automatizados
```bash
POC_TEST=1 deno test --node-modules-dir=none --allow-env --allow-net --allow-read poc-push/test/
```
Simulam o aparelho: a notificação gerada pela função é descriptografada no padrão **aes128gcm (RFC 8291)** e a
assinatura **VAPID (RFC 8292)** é validada como faz o servidor de push do Google. Cobrem também senha, agendamento
(envio único após o horário), remoção de inscrição expirada e a chamada feita pelo Worker.

## Depois da aprovação
As tabelas `poc_push_*`, a função `poc-push` e a página de teste podem ser apagadas: a Etapa 1 cria a estrutura definitiva.
O Worker e o projeto Supabase serão reaproveitados.
