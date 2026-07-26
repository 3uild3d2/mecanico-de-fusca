-- =====================================================================
-- APLICAR TUDO — Mecânico de Fusca
-- =====================================================================
-- Arquivo de conveniência: junta as 5 migrations de supabase/migrations/
-- na ordem correta, para aplicação manual pelo SQL Editor do Supabase.
--
-- Está dentro de BEGIN/COMMIT: ou tudo funciona, ou nada é criado. Se der
-- erro no meio, o banco volta ao estado anterior e dá para rodar de novo
-- depois da correção, sem sobra pela metade.
--
-- NÃO editar à mão. Gerado a partir de supabase/migrations/.
-- =====================================================================

begin;


-- ============ 20260726000001_base.sql ============

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


-- ============ 20260726000002_garagem.sql ============

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


-- ============ 20260726000003_conversas.sql ============

-- Conversas: threads, mensagens e anexos.
--
-- A mudança estrutural em relação ao Firestore: mensagem é LINHA, não item de
-- um array JSON dentro da thread. Lá, cada token do streaming disparava a
-- reescrita do documento inteiro a cada 600ms (ARCHITECTURE.md §3.7). Aqui a
-- mensagem do usuário entra na hora e a do assistente no onFinish.

create type public.papel_mensagem as enum ('system', 'user', 'assistant');

-- ---------------------------------------------------------------------------
-- threads
-- ---------------------------------------------------------------------------

create table public.threads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,

  titulo        text not null default 'Nova conversa',
  -- Diferencia título derivado de título que o dono escreveu: a derivação
  -- automática precisa parar de sobrescrever depois que ele renomeia.
  titulo_editado boolean not null default false,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index threads_user_idx on public.threads (user_id, atualizado_em desc);

create trigger threads_atualizado_em
  before update on public.threads
  for each row execute function public.toca_atualizado_em();

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,

  papel      public.papel_mensagem not null,
  -- As partes do UIMessage do AI SDK: texto, arquivo e chamadas de ferramenta.
  -- Fica jsonb porque o formato é do SDK, não nosso — normalizar aqui só criaria
  -- uma tradução para manter em dia a cada atualização dele.
  partes     jsonb not null default '[]'::jsonb,

  criado_em  timestamptz not null default now()
);

create index messages_thread_idx on public.messages (thread_id, criado_em);

-- Toda mensagem nova reordena a conversa na sidebar.
create function public.toca_thread_da_mensagem()
returns trigger
language plpgsql
as $$
begin
  update public.threads
     set atualizado_em = now()
   where id = new.thread_id;
  return new;
end;
$$;

create trigger messages_toca_thread
  after insert on public.messages
  for each row execute function public.toca_thread_da_mensagem();

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid references public.messages (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,

  caminho      text not null,
  media_type   text not null check (media_type ~ '^(image|audio)/'),
  bytes        bigint,

  -- Retenção de 48h, hoje feita pela lifecycle rule do bucket. Registrar aqui
  -- permite a limpeza saber o que apagar sem varrer o Storage.
  expira_em    timestamptz not null default now() + interval '48 hours',
  criado_em    timestamptz not null default now()
);

create index attachments_expira_idx on public.attachments (expira_em);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.threads     enable row level security;
alter table public.messages    enable row level security;
alter table public.attachments enable row level security;

create policy "dono administra as próprias conversas"
  on public.threads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dono administra as próprias mensagens"
  on public.messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dono administra os próprios anexos"
  on public.attachments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============ 20260726000004_conhecimento.sql ============

-- Base de conhecimento (RAG).
--
-- Duas decisões gravadas aqui e caras de reverter:
--
-- 1. vector(768) — gemini-embedding-001. Mudar a dimensão obriga a reprocessar
--    todo o acervo.
-- 2. Busca híbrida. Vetorial sozinha erra justamente onde este domínio mais
--    precisa acertar: código de peça e valor numérico. "Solex 30 PICT" e
--    "folga 0,15mm" são casos de full-text, não de similaridade semântica.

create type public.confianca_doc as enum ('alta', 'media', 'verificar');

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create table public.documents (
  id             uuid primary key default gen_random_uuid(),

  -- Procedência. Rastrear por documento desde o início não é burocracia: num
  -- produto pago, saber de onde veio cada afirmação é o que permite auditar o
  -- acervo depois. Reconstruir isso retroativamente é inviável.
  fonte          text not null,
  fonte_url      text,
  licenca        text,

  titulo         text not null,
  categoria      text,
  conteudo       text not null,

  -- Filtro cruzado com a ficha do carro: { motores: [...], combustiveis: [...],
  -- anos: { de, ate }, ignicao: [...] }
  aplicabilidade jsonb not null default '{}'::jsonb,

  -- Nada com confianca='verificar' e revisado_por nulo deve chegar ao usuário.
  -- Torque errado quebra motor; o filtro está na função de busca abaixo.
  confianca      public.confianca_doc not null default 'verificar',
  revisado_por   text,
  revisado_em    timestamptz,

  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create trigger documents_atualizado_em
  before update on public.documents
  for each row execute function public.toca_atualizado_em();

-- ---------------------------------------------------------------------------
-- chunks
-- ---------------------------------------------------------------------------

create table public.chunks (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents (id) on delete cascade,

  conteudo       text not null,
  embedding      vector(768),

  -- Herdada do documento na ingestão, para o filtro rodar sem join.
  aplicabilidade jsonb not null default '{}'::jsonb,

  ordem          integer not null default 0,
  tokens         integer,

  busca          tsvector generated always as (to_tsvector('portuguese', conteudo)) stored,
  criado_em      timestamptz not null default now()
);

create index chunks_embedding_idx on public.chunks
  using hnsw (embedding vector_cosine_ops);

create index chunks_busca_idx on public.chunks using gin (busca);
create index chunks_aplicabilidade_idx on public.chunks using gin (aplicabilidade);
create index chunks_document_idx on public.chunks (document_id, ordem);

-- ---------------------------------------------------------------------------
-- Busca híbrida
-- ---------------------------------------------------------------------------

-- Combina similaridade vetorial e full-text por Reciprocal Rank Fusion: soma
-- 1/(k + posição) de cada ranking. Escolhida em vez de somar scores normalizados
-- porque não exige calibrar pesos entre duas escalas que não se comparam.
create function public.buscar_conhecimento(
  consulta_embedding vector(768),
  consulta_texto     text,
  filtro_motor       text default null,
  filtro_combustivel text default null,
  limite             integer default 8,
  apenas_revisado    boolean default true
)
returns table (
  chunk_id    uuid,
  document_id uuid,
  titulo      text,
  fonte       text,
  conteudo    text,
  score       double precision
)
language sql
stable
as $$
  with candidatos as (
    select c.id, c.document_id, c.conteudo, d.titulo, d.fonte
      from public.chunks c
      join public.documents d on d.id = c.document_id
     where (not apenas_revisado or d.revisado_por is not null)
       and (
         filtro_motor is null
         or c.aplicabilidade -> 'motores' is null
         or c.aplicabilidade -> 'motores' @> to_jsonb(filtro_motor)
       )
       and (
         filtro_combustivel is null
         or c.aplicabilidade -> 'combustiveis' is null
         or c.aplicabilidade -> 'combustiveis' @> to_jsonb(filtro_combustivel)
       )
  ),
  vetorial as (
    select id, row_number() over (order by embedding <=> consulta_embedding) as pos
      from public.chunks
     where id in (select id from candidatos) and embedding is not null
     order by embedding <=> consulta_embedding
     limit limite * 4
  ),
  textual as (
    select c.id,
           row_number() over (
             order by ts_rank(ch.busca, plainto_tsquery('portuguese', consulta_texto)) desc
           ) as pos
      from candidatos c
      join public.chunks ch on ch.id = c.id
     where ch.busca @@ plainto_tsquery('portuguese', consulta_texto)
     limit limite * 4
  )
  select c.id, c.document_id, c.titulo, c.fonte, c.conteudo,
         coalesce(1.0 / (60 + v.pos), 0) + coalesce(1.0 / (60 + t.pos), 0) as score
    from candidatos c
    left join vetorial v on v.id = c.id
    left join textual  t on t.id = c.id
   where v.id is not null or t.id is not null
   order by score desc
   limit limite;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.documents enable row level security;
alter table public.chunks    enable row level security;

-- O acervo é o produto: leitura para quem está autenticado, escrita só pela
-- ingestão, que roda com service_role.
create policy "autenticado lê o acervo revisado"
  on public.documents for select
  using (auth.uid() is not null and revisado_por is not null);

create policy "autenticado lê os trechos"
  on public.chunks for select
  using (auth.uid() is not null);


-- ============ 20260726000005_assinatura.sql ============

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


commit;
