-- =====================================================================
-- Kelopak Jogja: skema Supabase. Jalankan utuh di SQL Editor.
-- =====================================================================
create type user_role as enum ('customer','admin');
create type order_status as enum ('pending','paid','processing','shipped','completed','cancelled');
create type payment_status as enum ('unverified','waiting','verified','rejected');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role user_role not null default 'customer',
  created_at timestamptz not null default now()
);
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);
create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade
);
create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity int not null check (quantity > 0),
  unique (cart_id, product_id)
);
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated always as identity,
  user_id uuid not null references profiles(id),
  total_amount numeric(12,2) not null default 0,
  status order_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  quantity int not null check (quantity > 0),
  price numeric(12,2) not null  -- harga dibekukan saat checkout (immutable)
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  method text not null default 'transfer',
  amount numeric(12,2) not null,
  status payment_status not null default 'unverified',
  proof_url text,
  updated_at timestamptz not null default now()
);
create table shipping_details (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  recipient_name text not null,
  phone text,
  address text not null,
  delivery_date date not null,
  delivery_time time not null
);
create index on products(category_id);
create index on cart_items(cart_id);
create index on orders(user_id);
create index on order_items(order_id);

-- ---------- Helper & trigger ----------
create or replace function is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Cegah pelanggan menaikkan role sendiri
create or replace function protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role and auth.uid() is not null and not is_admin() then
    raise exception 'Tidak boleh mengubah role';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on profiles
  for each row execute function protect_role();

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table shipping_details enable row level security;

create policy "profiles self select" on profiles for select using (auth.uid() = id);
create policy "profiles self update" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles admin all" on profiles for all using (is_admin()) with check (is_admin());
create policy "categories public read" on categories for select using (true);
create policy "categories admin all" on categories for all using (is_admin()) with check (is_admin());
create policy "products public read" on products for select using (is_active or is_admin());
create policy "products admin all" on products for all using (is_admin()) with check (is_admin());
create policy "carts self all" on carts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cart_items via cart" on cart_items for all
  using (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()));
-- Pesanan dibuat hanya lewat RPC place_order: pelanggan tidak punya policy INSERT/UPDATE
create policy "orders self select" on orders for select using (auth.uid() = user_id);
create policy "orders admin all" on orders for all using (is_admin()) with check (is_admin());
create policy "order_items self select" on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "order_items admin all" on order_items for all using (is_admin()) with check (is_admin());
create policy "payments self select" on payments for select
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "payments admin all" on payments for all using (is_admin()) with check (is_admin());
create policy "shipping self select" on shipping_details for select
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "shipping admin all" on shipping_details for all using (is_admin()) with check (is_admin());

-- ---------- RPC ----------
-- Checkout atomik. UPDATE ... WHERE stock >= qty mengunci baris, jadi dua checkout
-- bersamaan untuk stok terakhir hanya menyisakan satu pemenang; yang kalah di-rollback utuh.
create or replace function place_order(
  p_recipient text, p_phone text, p_address text,
  p_date date, p_time time, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_order uuid;
  v_total numeric(12,2) := 0;
  r record;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  if p_date < current_date then raise exception 'Tanggal kirim tidak valid'; end if;
  if not exists (select 1 from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = v_uid)
    then raise exception 'Keranjang kosong'; end if;

  insert into orders (user_id, notes) values (v_uid, p_notes) returning id into v_order;

  for r in
    select ci.product_id, ci.quantity, p.name, p.price
    from cart_items ci join carts c on c.id = ci.cart_id join products p on p.id = ci.product_id
    where c.user_id = v_uid order by ci.product_id
  loop
    update products set stock = stock - r.quantity
      where id = r.product_id and is_active and stock >= r.quantity;
    if not found then raise exception 'Stok "%" tidak mencukupi', r.name; end if;
    insert into order_items (order_id, product_id, quantity, price)
      values (v_order, r.product_id, r.quantity, r.price);
    v_total := v_total + r.price * r.quantity;
  end loop;

  update orders set total_amount = v_total where id = v_order;
  insert into payments (order_id, amount) values (v_order, v_total);
  insert into shipping_details (order_id, recipient_name, phone, address, delivery_date, delivery_time)
    values (v_order, p_recipient, p_phone, p_address, p_date, p_time);
  delete from cart_items where cart_id = (select id from carts where user_id = v_uid);
  return v_order;
end $$;

create or replace function submit_payment_proof(p_order uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update payments set proof_url = p_path, status = 'waiting', updated_at = now()
  where order_id = p_order and status in ('unverified','rejected')
    and exists (select 1 from orders o where o.id = p_order and o.user_id = auth.uid());
  if not found then raise exception 'Pembayaran tidak dapat diperbarui'; end if;
end $$;

create or replace function verify_payment(p_order uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  update payments set status = case when p_ok then 'verified'::payment_status else 'rejected'::payment_status end,
    updated_at = now() where order_id = p_order;
  if p_ok then update orders set status = 'paid', updated_at = now() where id = p_order and status = 'pending'; end if;
end $$;

-- Pembatalan oleh admin sekaligus mengembalikan stok
create or replace function cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  update orders set status = 'cancelled', updated_at = now()
    where id = p_order and status in ('pending','paid');
  if not found then raise exception 'Pesanan tidak dapat dibatalkan'; end if;
  update products p set stock = p.stock + oi.quantity
    from order_items oi where oi.order_id = p_order and oi.product_id = p.id;
end $$;

-- ---------- Realtime ----------
alter publication supabase_realtime add table orders, payments;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values
  ('product-images','product-images', true), ('payment-proofs','payment-proofs', false)
on conflict do nothing;
create policy "product images admin write" on storage.objects for all
  using (bucket_id = 'product-images' and is_admin()) with check (bucket_id = 'product-images' and is_admin());
create policy "proof upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "proof read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

-- ---------- Data awal ----------
insert into categories (name) values ('Mawar'),('Matahari'),('Campuran'),('Wisuda');
-- Jadikan akun admin (setelah mendaftar lewat aplikasi):
-- update profiles set role = 'admin' where id = (select id from auth.users where email = 'admin@contoh.com');
