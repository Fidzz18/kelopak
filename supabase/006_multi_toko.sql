-- ---------- Tabel ----------
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  phone text,
  delivery_radius_km numeric(6,1) check (delivery_radius_km > 0),  -- null = tanpa batas
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table store_stock (
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  stock int not null default 0 check (stock >= 0),
  primary key (store_id, product_id)
);
create index on store_stock(product_id);

alter table stores enable row level security;
alter table store_stock enable row level security;
create policy "stores public read" on stores for select using (true);
create policy "stores admin all" on stores for all using (is_admin()) with check (is_admin());
create policy "store_stock public read" on store_stock for select using (true);
create policy "store_stock admin all" on store_stock for all using (is_admin()) with check (is_admin());

-- ---------- Data awal dari stok lama ----------
insert into stores (name, address, lat, lng) values ('Toko Utama', 'Yogyakarta (ubah di Admin > Toko)', -7.7956, 110.3695);
insert into store_stock (store_id, product_id, stock)
  select (select id from stores order by created_at limit 1), id, stock from products;

alter table orders add column store_id uuid references stores(id);
update orders set store_id = (select id from stores order by created_at limit 1) where store_id is null;
alter table shipping_details add column dest_lat double precision, add column dest_lng double precision;

-- ---------- products.stock = total stok toko aktif (dijaga trigger) ----------
create or replace function recompute_stock(p_product uuid) returns void
language sql security definer set search_path = public as $$
  update products set stock = coalesce((
    select sum(ss.stock) from store_stock ss join stores s on s.id = ss.store_id
    where ss.product_id = p_product and s.is_active), 0)
  where id = p_product;
$$;
revoke all on function recompute_stock(uuid) from public, anon, authenticated;

create or replace function trg_store_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then perform recompute_stock(new.product_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.product_id <> new.product_id) then
    perform recompute_stock(old.product_id);
  end if;
  return null;
end $$;
create trigger store_stock_sync after insert or update or delete on store_stock
  for each row execute function trg_store_stock();

create or replace function trg_store_active() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_active is distinct from old.is_active then
    perform recompute_stock(product_id) from store_stock where store_id = new.id;
  end if;
  return null;
end $$;
create trigger stores_active_sync after update on stores
  for each row execute function trg_store_active();

update products p set stock = coalesce((
  select sum(ss.stock) from store_stock ss join stores s on s.id = ss.store_id
  where ss.product_id = p.id and s.is_active), 0);

-- ---------- Pengembalian stok ke toko asal pesanan ----------
create or replace function restore_stock(p_order uuid) returns void
language sql security definer set search_path = public as $$
  insert into store_stock (store_id, product_id, stock)
  select o.store_id, oi.product_id, oi.quantity
  from order_items oi join orders o on o.id = oi.order_id
  where oi.order_id = p_order and oi.product_id is not null and o.store_id is not null
  on conflict (store_id, product_id) do update set stock = store_stock.stock + excluded.stock;
$$;

-- ---------- place_order dengan toko ----------
drop function if exists place_order(text, text, text, date, time, text);

create or replace function place_order(
  p_store uuid, p_recipient text, p_phone text, p_address text,
  p_date date, p_time time, p_notes text default null,
  p_lat double precision default null, p_lng double precision default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamp := (now() at time zone 'Asia/Jakarta');
  s store_settings;
  st stores;
  d double precision;
  v_order uuid;
  v_total numeric(12,2) := 0;
  r record;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  select * into s from store_settings where id = 1;
  select * into st from stores where id = p_store and is_active;
  if not found then raise exception 'Toko tidak tersedia, pilih toko lain'; end if;

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

  if st.delivery_radius_km is not null then
    if p_lat is null or p_lng is null then
      raise exception 'Tentukan titik lokasi pengiriman agar jarak ke toko bisa dicek';
    end if;
    d := 6371 * 2 * asin(sqrt(
      power(sin(radians(p_lat - st.lat) / 2), 2) +
      cos(radians(st.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - st.lng) / 2), 2)));
    if d > st.delivery_radius_km then
      raise exception 'Alamat di luar jangkauan toko ini (% km, maksimal % km)', round(d::numeric, 1), st.delivery_radius_km;
    end if;
  end if;

  if not exists (select 1 from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = v_uid)
    then raise exception 'Keranjang kosong'; end if;

  insert into orders (user_id, store_id, notes, expires_at)
    values (v_uid, p_store, p_notes, now() + make_interval(hours => s.payment_deadline_hours))
    returning id into v_order;

  for r in
    select ci.product_id, ci.quantity, p.name, p.price
    from cart_items ci join carts c on c.id = ci.cart_id join products p on p.id = ci.product_id
    where c.user_id = v_uid order by ci.product_id
  loop
    update store_stock ss set stock = ss.stock - r.quantity
      from products p
      where ss.store_id = p_store and ss.product_id = r.product_id
        and p.id = ss.product_id and p.is_active and ss.stock >= r.quantity;
    if not found then raise exception 'Stok "%" di toko % tidak mencukupi', r.name, st.name; end if;
    insert into order_items (order_id, product_id, product_name, quantity, price)
      values (v_order, r.product_id, r.name, r.quantity, r.price);
    v_total := v_total + r.price * r.quantity;
  end loop;

  update orders set total_amount = v_total where id = v_order;
  insert into payments (order_id, amount) values (v_order, v_total);
  insert into shipping_details (order_id, recipient_name, phone, address, delivery_date, delivery_time, dest_lat, dest_lng)
    values (v_order, trim(p_recipient), p_phone, trim(p_address), p_date, p_time, p_lat, p_lng);
  delete from cart_items where cart_id = (select id from carts where user_id = v_uid);
  return v_order;
end $$;