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
