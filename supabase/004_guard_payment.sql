-- Migrasi 004: bukti bayar hanya boleh untuk pesanan yang masih pending,
-- dan admin tidak bisa memverifikasi pembayaran pesanan yang sudah dibatalkan.

create or replace function submit_payment_proof(p_order uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update payments p set proof_url = p_path, status = 'waiting', updated_at = now()
  from orders o
  where p.order_id = p_order
    and o.id = p.order_id
    and o.user_id = auth.uid()
    and o.status = 'pending'
    and p.status in ('unverified','rejected');
  if not found then raise exception 'Pembayaran tidak dapat diperbarui'; end if;
end $$;

create or replace function verify_payment(p_order uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if not exists (select 1 from orders where id = p_order and status = 'pending') then
    raise exception 'Pesanan sudah tidak menunggu pembayaran (dibatalkan atau sudah diproses)';
  end if;
  update payments
     set status = case when p_ok then 'verified'::payment_status else 'rejected'::payment_status end,
         updated_at = now()
   where order_id = p_order;
  if p_ok then
    update orders set status = 'paid', updated_at = now() where id = p_order;
  end if;
end $$;