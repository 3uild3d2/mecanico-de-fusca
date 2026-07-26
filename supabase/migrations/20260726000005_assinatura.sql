-- Assinatura e consumo.
--
-- Nenhuma destas tabelas é escrita pelo cliente. O dono LÊ o próprio plano para
-- a interface saber o que mostrar; quem grava é o servidor, depois de validar o
-- recibo com o Google. Recibo validado no cliente é recibo forjável.

create type public.status_assinatura as enum (
  'ativa', 'em_teste', 'em_carencia', 'pausada', 'cancelada', 'expirada'
);

create table public.subscriptions (
  user_id            uuid primary key references public.profiles (id) on delete cascade,

  plano              public.plano not null default 'free',
  status             public.status_assinatura not null default 'expirada',

  -- Identificadores do Google Play. purchase_token é único: é ele que impede a
  -- mesma compra de ser resgatada por duas contas.
  play_purchase_token text unique,
  play_product_id     text,
  play_order_id       text,

  periodo_fim        timestamptz,
  cancelada_em       timestamptz,

  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create index subscriptions_periodo_idx on public.subscriptions (status, periodo_fim);

create trigger subscriptions_atualizado_em
  before update on public.subscriptions
  for each row execute function public.toca_atualizado_em();

-- ---------------------------------------------------------------------------
-- usage_events — quota e custo
-- ---------------------------------------------------------------------------

create table public.usage_events (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,

  tipo          text not null,
  tokens_entrada integer,
  tokens_saida   integer,
  modelo        text,

  criado_em     timestamptz not null default now()
);

-- Sustenta a contagem por janela do rate limiting.
create index usage_events_user_idx on public.usage_events (user_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.subscriptions enable row level security;
alter table public.usage_events  enable row level security;

-- Só SELECT. Sem política de INSERT ou UPDATE, a RLS nega por padrão: o
-- cliente não tem como escrever o próprio direito de acesso nem forjar consumo.
create policy "dono lê a própria assinatura"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "dono lê o próprio consumo"
  on public.usage_events for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Exclusão de conta
-- ---------------------------------------------------------------------------

-- Requisito do Google Play, e bloqueante para a publicação. Chamada pelo
-- servidor: apagar auth.users cascateia para profiles e daí para todo o resto.
-- Os objetos do Storage NÃO são removidos por isto — quem chama precisa
-- limpar o bucket antes, ou os arquivos ficam órfãos.
create function public.apagar_conta(alvo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = alvo;
end;
$$;

revoke all on function public.apagar_conta(uuid) from public, anon, authenticated;
