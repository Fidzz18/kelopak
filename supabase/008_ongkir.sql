create table delivery_tiers (
  max_km numeric(5,1) primary key check (max_km > 0),
  fee numeric(12,2) not null check (fee >= 0)
);
alter table delivery_tiers enable row level security;
create policy "tiers public read" on delivery_tiers for select using (true);
create policy "tiers admin all" on delivery_tiers for all using (is_admin()) with check (is_admin());

-- Tarif awal (ubah di Admin > Ongkir)
insert into delivery_tiers (max_km, fee) values (1, 5000), (2, 8000), (3, 11000), (4, 14000), (5, 17000);

alter table orders add column if not exists shipping_fee numeric(12,2) not null default 0;

-- Tarif untuk jarak tertentu; null jika di luar rentang tarif
create or replace function delivery_fee(p_km numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select fee from delivery_tiers where max_km >= p_km order by max_km limit 1;
$$;
grant execute on function delivery_fee(numeric) to anon, authenticated;

-- Admin menyimpan seluruh tarif sekaligus (atomik: gagal = tidak ada yang berubah)
create or replace function save_delivery_tiers(p_tiers jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) = 0 then
    raise exception 'Minimal satu tarif';
  end if;
  delete from delivery_tiers where true;
  insert into delivery_tiers (max_km, fee)
    select (x->>'max_km')::numeric, (x->>'fee')::numeric from jsonb_array_elements(p_tiers) x;
end $$;

drop function if exists place_order(uuid, text, text, text, date, time, text, double precision, double precision, numeric);

create or replace function place_order(
  p_store uuid, p_recipient text, p_phone text, p_address text,
  p_date date, p_time time, p_notes text default null,
  p_lat double precision default null, p_lng double precision default null,
  p_route_km numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamp := (now() at time zone 'Asia/Jakarta');
  s store_settings;
  st stores;
  d double precision;
  v_km numeric;
  v_fee numeric;
  v_max numeric;
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

  -- Ongkir: titik tujuan wajib ada
  if p_lat is null or p_lng is null then
    raise exception 'Tentukan titik lokasi pengiriman agar ongkir bisa dihitung';
  end if;
  d := 6371 * 2 * asin(sqrt(
    power(sin(radians(p_lat - st.lat) / 2), 2) +
    cos(radians(st.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - st.lng) / 2), 2)));
  -- Jarak rute tidak mungkin lebih pendek dari garis lurus.
  -- Jika layanan rute gagal di klien (p_route_km kosong), pakai perkiraan garis lurus x 1,3.
  v_km := round(greatest(d::numeric, coalesce(p_route_km, d::numeric * 1.3)), 1);
  v_fee := delivery_fee(v_km);
  if v_fee is null then
    select max(max_km) into v_max from delivery_tiers;
    raise exception 'Alamat di luar jangkauan antar (% km lewat jalan, maksimal % km)', v_km, coalesce(v_max, 0);
  end if;
  if st.delivery_radius_km is not null and v_km > st.delivery_radius_km then
    raise exception 'Alamat di luar jangkauan toko ini (% km lewat jalan, maksimal % km)', v_km, st.delivery_radius_km;
  end if;

  if not exists (select 1 from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = v_uid)
    then raise exception 'Keranjang kosong'; end if;

  insert into orders (user_id, store_id, notes, expires_at, shipping_fee)
    values (v_uid, p_store, p_notes, now() + make_interval(hours => s.payment_deadline_hours), v_fee)
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

  v_total := v_total + v_fee;  -- total = barang + ongkir
  update orders set total_amount = v_total where id = v_order;
  insert into payments (order_id, amount) values (v_order, v_total);
  insert into shipping_details (order_id, recipient_name, phone, address, delivery_date, delivery_time, dest_lat, dest_lng, route_km)
    values (v_order, trim(p_recipient), p_phone, trim(p_address), p_date, p_time, p_lat, p_lng, v_km);
  delete from cart_items where cart_id = (select id from carts where user_id = v_uid);
  return v_order;
end $$;