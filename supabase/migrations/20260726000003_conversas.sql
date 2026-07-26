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
