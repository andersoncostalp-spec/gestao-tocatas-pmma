-- Etapa 0 — Prova de conceito de notificações push (Supabase + Cloudflare)
-- Cole este script no Supabase: SQL Editor → New query → Run.
-- As tabelas ficam com RLS ativado e SEM políticas: só a Edge Function (chave de serviço) acessa.

create table if not exists public.poc_push_inscricoes (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now()
);

create table if not exists public.poc_push_agendados (
  id bigint generated always as identity primary key,
  enviar_em timestamptz not null,
  enviado_em timestamptz,
  resultado text,
  criado_em timestamptz not null default now()
);
create index if not exists poc_push_agendados_pendentes on public.poc_push_agendados (enviar_em) where enviado_em is null;

-- Registro de cada execução (permite ver o cron do Cloudflare funcionando)
create table if not exists public.poc_push_log (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  origem text not null,
  detalhe text
);

alter table public.poc_push_inscricoes enable row level security;
alter table public.poc_push_agendados enable row level security;
alter table public.poc_push_log enable row level security;
