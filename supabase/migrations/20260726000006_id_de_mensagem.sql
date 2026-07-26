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
