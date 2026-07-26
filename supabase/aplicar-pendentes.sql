-- =====================================================================
-- APLICAR PENDENTES — migrations 6 e 7 (versão corrigida)
-- =====================================================================
-- As migrations 1 a 5 JÁ FORAM aplicadas em 26/07/2026 (aplicar-tudo.sql).
-- Este arquivo contém só o que veio depois. Mesmo uso: colar inteiro no
-- SQL Editor do Supabase e clicar Run uma vez.
--
-- Correção sobre a versão anterior: a troca de tipo de messages.id agora
-- arrasta attachments.message_id junto (a FK impedia mudar só um lado).
--
-- NÃO editar à mão. Gerado a partir de supabase/migrations/.
-- =====================================================================

begin;


-- ============ 20260726000006_id_de_mensagem.sql ============

-- messages.id passa de uuid para text.
--
-- Motivo: o id da mensagem é gerado pelo AI SDK no navegador, em formato
-- próprio ("msg-abc123"), não uuid. Guardar o id do SDK é o que permite
-- gravar por upsert — cada mensagem entra uma vez e só uma vez, mesmo que a
-- gravação seja repetida depois de uma reconexão.
--
-- attachments.message_id referencia messages.id, então muda junto: a FK é
-- solta antes e recriada depois, com os dois lados já em text. (A primeira
-- versão desta migration esqueceu isso e falhou com 42804.)
--
-- Seguro de rodar: as duas tabelas estão vazias.

alter table public.attachments
  drop constraint attachments_message_id_fkey;

alter table public.messages
  alter column id drop default,
  alter column id type text using id::text;

alter table public.attachments
  alter column message_id type text using message_id::text;

alter table public.attachments
  add constraint attachments_message_id_fkey
  foreign key (message_id) references public.messages (id) on delete cascade;


-- ============ 20260726000007_storage.sql ============

-- Bucket de anexos do chat (imagens e áudios).
--
-- Leitura pública, como era no Firebase: a URL do anexo fica dentro da
-- mensagem e o servidor a baixa no /api/chat sem sessão do usuário. O nome do
-- objeto carrega um uuid aleatório, então a URL não é adivinhável.
-- Escrita: só o dono, e só dentro da própria pasta (uid/...).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', true, 15728640, array['image/*', 'audio/*'])
on conflict (id) do nothing;

create policy "leitura publica de anexos"
  on storage.objects for select
  using (bucket_id = 'anexos');

create policy "dono envia na propria pasta"
  on storage.objects for insert
  with check (
    bucket_id = 'anexos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dono apaga os proprios anexos"
  on storage.objects for delete
  using (
    bucket_id = 'anexos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


commit;
