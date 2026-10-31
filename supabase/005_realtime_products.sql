alter publication supabase_realtime add table products;

create or replace function server_now() returns timestamptz
language sql stable as $$ select now(); $$;
grant execute on function server_now() to anon, authenticated;

create policy "proof delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);