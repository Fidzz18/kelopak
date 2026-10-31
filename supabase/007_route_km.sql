alter table shipping_details add column if not exists route_km numeric(6,1);

drop function if exists place_order(uuid, text, text, text, date, time, text, double precision, double precision);

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
    -- jarak rute tidak mungkin lebih pendek dari garis lurus
    v_km := greatest(d::numeric, coalesce(p_route_km, 0));
    if v_km > st.delivery_radius_km then
      raise exception 'Alamat di luar jangkauan toko ini (% km lewat jalan, maksimal % km)', round(v_km, 1), st.delivery_radius_km;
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
  insert into shipping_details (order_id, recipient_name, phone, address, delivery_date, delivery_time, dest_lat, dest_lng, route_km)
    values (v_order, trim(p_recipient), p_phone, trim(p_address), p_date, p_time, p_lat, p_lng, p_route_km);
  delete from cart_items where cart_id = (select id from carts where user_id = v_uid);
  return v_order;
end $$;