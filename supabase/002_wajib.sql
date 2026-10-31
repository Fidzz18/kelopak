-- =====================================================================
-- Migrasi 002: instruksi bayar, batas waktu bayar, snapshot nama produk,
-- aturan bisnis di server. Jalankan SETELAH schema.sql (aman untuk DB yang sudah berisi data).
-- =====================================================================

-- ---------- 1. Pengaturan toko (rekening, jam operasional, batas bayar) ----------
create table if not exists store_settings (
  id int primary key default 1 check (id = 1),
  bank_name text, account_no text, account_name text, shop_phone text,
  payment_deadline_hours int not null default 24 check (payment_deadline_hours > 0),
  open_time time not null default '08:00',
  close_time time not null default '20:00',
  cutoff_time time not null default '13:00',      -- batas terima pesanan hari yang sama (WIB)
  min_lead_hours int not null default 2 check (min_lead_hours >= 0),
  updated_at timestamptz not null default now()
);
insert into store_settings (id) values (1) on conflict do nothing;
alter table store_settings enable row level security;
drop policy if exists "settings public read" on store_settings;
drop policy if exists "settings admin all" on store_settings;
create policy "settings public read" on store_settings for select using (true);
create policy "settings admin all" on store_settings for all using (is_admin()) with check (is_admin());

-- ---------- 2. Batas waktu bayar + pembatalan ----------
alter table orders add column if not exists expires_at timestamptz;
update orders set expires_at = created_at + interval '24 hours' where status = 'pending' and expires_at is null;

create or replace function restore_stock(p_order uuid) returns void
language sql security definer set search_path = public as $$
  update products p set stock = p.stock + oi.quantity
  from order_items oi where oi.order_id = p_order and oi.product_id = p.id;
$$;

create or replace function cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  update orders set status = 'cancelled', updated_at = now()
    where id = p_order and status in ('pending','paid');
  if not found then raise exception 'Pesanan tidak dapat dibatalkan'; end if;
  perform restore_stock(p_order);
end $$;

-- Pelanggan boleh membatalkan sendiri selama belum ada bukti bayar yang sedang diperiksa
create or replace function cancel_my_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update orders o set status = 'cancelled', updated_at = now()
  where o.id = p_order and o.user_id = auth.uid() and o.status = 'pending'
    and exists (select 1 from payments p where p.order_id = o.id and p.status in ('unverified','rejected'));
  if not found then raise exception 'Pesanan tidak dapat dibatalkan'; end if;
  perform restore_stock(p_order);
end $$;

-- Batalkan otomatis pesanan yang lewat batas bayar dan kembalikan stok
create or replace function expire_orders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select o.id from orders o
    where o.status = 'pending' and o.expires_at is not null and o.expires_at < now()
      and exists (select 1 from payments p where p.order_id = o.id and p.status in ('unverified','rejected'))
    for update of o skip locked
  loop
    update orders set status = 'cancelled', updated_at = now() where id = r.id;
    perform restore_stock(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function restore_stock(uuid) from public, anon, authenticated;
revoke all on function expire_orders() from public, anon, authenticated;

-- Jadwal tiap 10 menit. Jika error, aktifkan dulu di Database > Extensions > pg_cron.
create extension if not exists pg_cron;
select cron.schedule('expire-unpaid-orders', '*/10 * * * *', $$select public.expire_orders()$$);

-- ---------- 3. Snapshot nama produk ----------
alter table order_items add column if not exists product_name text;
update order_items oi set product_name = p.name from products p where p.id = oi.product_id and oi.product_name is null;

-- ---------- 4. place_order dengan aturan bisnis di server ----------
create or replace function place_order(
  p_recipient text, p_phone text, p_address text,
  p_date date, p_time time, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamp := (now() at time zone 'Asia/Jakarta');
  s store_settings;
  v_order uuid;
  v_total numeric(12,2) := 0;
  r record;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  select * into s from store_settings where id = 1;

  if length(trim(coalesce(p_recipient,''))) < 2 then raise exception 'Nama penerima wajib diisi'; end if;
  if length(trim(coalesce(p_address,''))) < 10 then raise exception 'Alamat terlalu pendek, tulis selengkap mungkin'; end if;
  if p_date < v_now::date then raise exception 'Tanggal kirim tidak valid'; end if;
  if p_time < s.open_time or p_time > s.close_time then
    raise exception 'Jam kirim harus antara % dan % WIB', to_char(s.open_time,'HH24:MI'), to_char(s.close_time,'HH24:MI');
  end if;
  if p_date = v_now::date then
    if v_now::time > s.cutoff_time then
      raise exception 'Pesanan untuk hari ini sudah ditutup pukul % WIB. Pilih tanggal besok.', to_char(s.cutoff_time,'HH24:MI');
    end if;
    if p_time < v_now::time + make_interval(hours => s.min_lead_hours) then
      raise exception 'Untuk pengiriman hari ini, jam kirim minimal % jam dari sekarang', s.min_lead_hours;
    end if;
  end if;
  if not exists (select 1 from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = v_uid)
    then raise exception 'Keranjang kosong'; end if;

  insert into orders (user_id, notes, expires_at)
    values (v_uid, p_notes, now() + make_interval(hours => s.payment_deadline_hours))
    returning id into v_order;

  for r in
    select ci.product_id, ci.quantity, p.name, p.price
    from cart_items ci join carts c on c.id = ci.cart_id join products p on p.id = ci.product_id
    where c.user_id = v_uid order by ci.product_id
  loop
    update products set stock = stock - r.quantity
      where id = r.product_id and is_active and stock >= r.quantity;
    if not found then raise exception 'Stok "%" tidak mencukupi atau produk sudah tidak dijual', r.name; end if;
    insert into order_items (order_id, product_id, product_name, quantity, price)
      values (v_order, r.product_id, r.name, r.quantity, r.price);
    v_total := v_total + r.price * r.quantity;
  end loop;

  update orders set total_amount = v_total where id = v_order;
  insert into payments (order_id, amount) values (v_order, v_total);
  insert into shipping_details (order_id, recipient_name, phone, address, delivery_date, delivery_time)
    values (v_order, trim(p_recipient), p_phone, trim(p_address), p_date, p_time);
  delete from cart_items where cart_id = (select id from carts where user_id = v_uid);
  return v_order;
end $$;
