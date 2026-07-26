-- Base: extensões, perfis e direitos de acesso.
--
-- Princípio que governa este arquivo (AGENTS.md §1): o servidor é a autoridade.
-- O cliente LÊ seus direitos de acesso e nunca os escreve. No Firebase isso
-- dependia só das regras; aqui é reforçado em duas camadas — RLS decide QUAIS
-- linhas, e GRANT por coluna decide QUAIS campos.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create type public.plano as enum ('free', 'premium');

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email        text,

  -- Direitos de acesso. Só o servidor escreve (ver grants no fim do bloco).
  is_admin     boolean not null default false,
  plan         public.plano not null default 'free',
  plan_expira_em timestamptz,

  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on column public.profiles.is_admin is
  'Entitlement. Escrita bloqueada para o cliente por GRANT de coluna.';
comment on column public.profiles.plan is
  'Entitlement. Só o servidor escreve, após validar o recibo do Play.';

-- Cria o perfil junto com o usuário, inclusive anônimo. Sem isso, todo lugar
-- que lê profiles precisaria tratar a ausência da linha.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- atualizado_em automático, reaproveitado pelas demais tabelas
-- ---------------------------------------------------------------------------

create function public.toca_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger profiles_atualizado_em
  before update on public.profiles
  for each row execute function public.toca_atualizado_em();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "dono lê o próprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "dono edita o próprio perfil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- A RLS acima decide quais LINHAS o usuário toca. Os grants abaixo decidem
-- quais COLUNAS — é o que impede alguém de mandar `plan = 'premium'` numa
-- linha que legitimamente é dele. Sem isto, a política de UPDATE permitiria.
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated, anon;

-- service_role ignora RLS por natureza; é assim que o servidor escreve
-- entitlements depois de validar o recibo do Play Billing.
