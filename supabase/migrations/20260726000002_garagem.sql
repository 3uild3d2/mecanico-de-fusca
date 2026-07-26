-- Garagem: a ficha técnica do carro e a memória diagnóstica.
--
-- vehicles é plural desde o início: o mockup em references/perfil-veiculo.html
-- já previa vários carros, e migrar de "um" para "muitos" depois custa caro.
--
-- vehicle_events é o que o Firestore guardava em users/{uid}/vehicleEvents.
-- Não é diário de manutenção, é memória diagnóstica — ver docs/CONTEXTO.md.

create type public.tipo_evento   as enum ('diagnostico', 'servico', 'observacao');
create type public.desfecho      as enum ('suspeita', 'confirmado', 'descartado', 'sem_retorno');
create type public.origem_evento as enum ('agente', 'usuario');

create type public.sistema_veiculo as enum (
  'motor', 'eletrica', 'carburacao', 'ignicao', 'freios',
  'suspensao', 'cambio', 'arrefecimento', 'outro'
);

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,

  apelido         text,
  modelo          text,
  ano             text,
  motor           text,
  ano_motor       text,
  carburacao      text,
  combustivel     text,
  ignicao         text not null default 'platinado',
  sistema_eletrico text not null default '12V',
  modificacoes    text,

  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Ano e motor são texto de propósito: as opções incluem "Não sei / outro" e
-- rótulos como "1600 a álcool (Itamar)". Converter para número perderia isso.

create index vehicles_user_idx on public.vehicles (user_id, ativo);

create trigger vehicles_atualizado_em
  before update on public.vehicles
  for each row execute function public.toca_atualizado_em();

-- ---------------------------------------------------------------------------
-- vehicle_events
-- ---------------------------------------------------------------------------

create table public.vehicle_events (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid references public.vehicles (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,

  tipo        public.tipo_evento not null,
  titulo      text not null check (char_length(titulo) between 1 and 80),
  sistema     public.sistema_veiculo,
  desfecho    public.desfecho,

  -- Quando o fato ocorreu, que pode ser bem antes do registro: o dono conta
  -- hoje que trocou as velas mês passado.
  data_evento timestamptz not null default now(),
  km          integer check (km is null or km > 0),

  thread_id   uuid,
  origem      public.origem_evento not null default 'usuario',
  criado_em   timestamptz not null default now()
);

comment on column public.vehicle_events.desfecho is
  'Nulo e sem_retorno são normais e continuam valendo: dizem que o carro já teve suspeita naquele sistema.';

-- Ordena o histórico e sustenta a detecção de recorrência por sistema.
create index vehicle_events_user_data_idx on public.vehicle_events (user_id, data_evento desc);
create index vehicle_events_sistema_idx   on public.vehicle_events (user_id, sistema, data_evento desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.vehicles       enable row level security;
alter table public.vehicle_events enable row level security;

create policy "dono administra os próprios veículos"
  on public.vehicles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dono administra o próprio histórico"
  on public.vehicle_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
