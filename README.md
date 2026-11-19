# Tocatas BM: Gestão de Eventos da Banda de Música da PMMA

Sistema web para cadastro, acompanhamento e divulgação das tocatas e eventos da **Banda de Música da Polícia Militar do Maranhão**, em substituição ao controle manual em Word feito pelo P1.

Funciona no computador e no celular, e pode ser **instalado no Android como aplicativo (PWA)**.

## Funcionalidades

| # | Recurso | Onde |
|---|---------|------|
| 1 | Cadastro, edição, cancelamento, duplicação e consulta de eventos | *Eventos* |
| 2 | **Numeração automática** anual (Nº 001/2026, 002/2026…) e numeração sequencial do mapa por ordem cronológica | automático |
| 3 | Calendário **mensal, semanal, diário** e em lista | *Calendário* |
| 4 | Painel com eventos de hoje, próximos 7 dias, total do mês, pendências de SEI e lista dos próximos eventos | *Painel* |
| 5 | **Lembretes automáticos** 7 dias, 3 dias, 24 horas e 2 horas antes (push no celular/computador + central de notificações) | *Meu perfil → Ativar* |
| 6 | Pesquisa por texto livre, período, entidade solicitante, local, nº de ofício/processo SEI, nº do evento e situação (ignora acentos) | *Eventos → Filtros* |
| 7 | **Mapa mensal em PDF** no padrão do documento oficial (cabeçalho, tabela azul, assinatura do Regente) | *Mapa mensal* |
| 8 | **Histórico de alterações**: quem fez, quando e o que mudou (antes → depois) | *Histórico* e em cada evento |
| | Usuários com perfis, exportação CSV e configuração de cabeçalho, brasões e assinatura do mapa | *Usuários*, *Configurações* |

### Perfis de acesso
- **Administrador**: tudo, inclusive usuários, configurações do mapa e registros de acesso.
- **Editor (P1)**: cadastra, altera, cancela e exclui eventos; vê o histórico.
- **Consulta**: visualiza eventos, calendário e mapa; recebe lembretes.

## Arquitetura

```
Navegador / App Android (PWA)
  └─ SPA em JavaScript puro (public/), FullCalendar, service worker (cache + push)
        │ HTTPS · cookie de sessão httpOnly
Servidor Node.js + Express (server/)
  ├─ routes/      API REST (/api/auth, /api/events, /api/mapa, /api/users, /api/audit, …)
  ├─ services/    eventos (numeração/pesquisa), PDF (PDFKit), lembretes (Web Push/VAPID)
  ├─ auth.js      senhas scrypt, sessões, perfis
  └─ db.js        SQLite (better-sqlite3), migrações versionadas
data/tocatas.db   banco persistente (um único arquivo)
```

**Segurança:** senhas com scrypt e salt; sessão por token aleatório (somente o hash fica no banco) em cookie `httpOnly`/`SameSite=Lax`/`Secure`; troca obrigatória da senha provisória; limite de tentativas de login; proteção CSRF (cabeçalho obrigatório e verificação de origem); cabeçalhos de segurança e CSP (Helmet); validação de todas as entradas no servidor; escape de HTML na interface; exclusão lógica (nada some do histórico); log de acessos e tentativas falhas.

## Instalação

Requisitos: **Node.js 20 ou superior** (ou Docker).

```bash
npm install
cp .env.example .env        # edite usuário/senha do admin inicial
npm start                   # http://localhost:3000
```

No primeiro start, o administrador definido em `ADMIN_USERNAME`/`ADMIN_PASSWORD` é criado e deverá trocar a senha no primeiro acesso. Para criar ou redefinir usuários pelo terminal:

```bash
npm run create-user -- p1.sgt "2º SGT Fulano de Tal" editor
```

Para importar os 12 eventos do mapa de **novembro/2026** (documento de referência):

```bash
npm run seed:nov2026 -- admin
```

### Com Docker

```bash
cp .env.example .env
docker compose up -d --build
```

O banco fica no volume `tocatas-dados`.

### Publicação em produção (obrigatório para PWA e notificações)
1. Hospede em um servidor com **HTTPS** (ex.: VPS com Nginx + Let's Encrypt, Render, Railway, Fly.io), com disco persistente para `data/`.
2. Configure `NODE_ENV=production` e `TRUST_PROXY=1` se houver proxy reverso.
3. Defina `VAPID_SUBJECT` com um e-mail de contato da unidade.
4. Agende backups diários: `node scripts/backup.js /caminho/backups`.

As chaves de notificação (VAPID) são geradas automaticamente no primeiro start e guardadas no banco. Para fixá-las, defina `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`.

### Instalar no Android
Abra o endereço no **Chrome**, faça login e toque em **⋮ → Instalar app** (ou "Adicionar à tela inicial"). Depois, em *Meu perfil*, toque em **Ativar neste aparelho** para receber os lembretes.

## Mapa mensal (PDF)
Segue o modelo do P1: cabeçalho institucional, título "MAPA DE EVENTOS DA BANDA DE MÚSICA/AJG", mês/ano, colunas **Nº | DATA | HORÁRIO | EVENTO | ENTIDADE SOLICITANTE | ENDEREÇO/LOCAL | OFÍCIO/SEI** e assinatura do Regente.
- Eventos em ordem cronológica, numerados de 1 a n; cancelados não entram.
- Horário no formato do documento (8h, 17h30); formação entre parênteses, em **negrito** quando diferente da formação padrão (ex.: **(SAXOFONISTA)**).
- Sem número de documento, aparece "SEM PROCESSO SEI INFORMADO".
- Os brasões (PMMA, Estado, BM/AJG) são enviados em *Configurações*; o trecho do nome entre `*asteriscos*` sai em negrito (nome de guerra).

## Testes

```bash
npm test
```

Cobrem autenticação e perfis, troca obrigatória de senha, CSRF, numeração automática, validação, edição/cancelamento/exclusão com histórico, pesquisa (data, entidade, local, SEI, sem acentos), mapa mensal e PDF, configurações, painel/CSV e o agendador de lembretes (7d/3d/24h/2h, sem duplicidade, reinício ao mudar a data, sem lembretes para cancelados).

## Próximos passos sugeridos
- Escala de músicos por evento e controle de efetivo/instrumentos.
- Envio dos lembretes também por e-mail ou WhatsApp.
- Anexar o PDF do ofício/processo SEI ao evento.
- Relatórios anuais (eventos por entidade, por mês, por tipo).
