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
