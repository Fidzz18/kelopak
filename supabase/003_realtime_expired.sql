-- Migrasi 003: pembatalan pesanan kedaluwarsa nyaris real-time.
-- Jalankan SETELAH 002_wajib.sql.

-- Indeks agar pengecekan kedaluwarsa tetap cepat walau pesanan banyak
create index if not exists orders_pending_expiry_idx on orders (expires_at) where status = 'pending';

-- Pintu aman yang boleh dipanggil aplikasi: hanya membatalkan pesanan yang MEMANG sudah lewat batas.
-- Idempotent, jadi aman dipanggil berkali-kali oleh siapa pun.
create or replace function sweep_expired_orders() returns int
language sql security definer set search_path = public as $$ select expire_orders(); $$;
revoke all on function sweep_expired_orders() from public;
grant execute on function sweep_expired_orders() to anon, authenticated;

-- Jadwal pg_cron tiap 30 detik sebagai jaring pengaman (butuh pg_cron versi yang mendukung detik).
-- Jika error, pakai: select cron.schedule('expire-unpaid-orders', '* * * * *', $$select public.expire_orders()$$);
select cron.schedule('expire-unpaid-orders', '30 seconds', $$select public.expire_orders()$$);
