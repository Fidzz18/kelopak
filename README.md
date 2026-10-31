# Kelopak Jogja: Sistem Pemesanan Buket Bunga

React + Vite + Tailwind CSS v4 + Supabase (PostgreSQL, Auth, Storage, Realtime). Deploy ke Vercel.

## Setup
1. Buat proyek di supabase.com. Buka **SQL Editor**, tempel isi `supabase/schema.sql`, lalu jalankan.
2. Jalankan juga `supabase/002_wajib.sql` (setelah schema.sql) di SQL Editor.
3. Salin `.env.example` menjadi `.env`, isi URL dan **anon key** (Settings > API). Jangan pakai `service_role_key`.
3. `npm install` lalu `npm run dev`.
4. Daftar akun lewat aplikasi, lalu jadikan admin di SQL Editor:
   `update profiles set role='admin' where id=(select id from auth.users where email='emailanda@contoh.com');`
5. Login sebagai admin, tambah produk lewat menu Admin > Katalog.
6. Untuk uji cepat, matikan "Confirm email" di Authentication > Providers > Email.

## Deploy ke Vercel
Import repo, tambah env `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`. `vercel.json` sudah menangani routing SPA.

## Keamanan
- RLS aktif di semua tabel. Pelanggan hanya bisa membaca data sendiri, admin lewat `is_admin()`.
- Pesanan dibuat hanya lewat RPC `place_order` (atomik, cek stok `stock >= qty`, harga dibekukan di `order_items`). Pelanggan tidak punya hak INSERT/UPDATE langsung ke `orders`.
- Trigger `protect_role` mencegah pelanggan menaikkan role sendiri.
- Bukti transfer disimpan di bucket privat, akses lewat signed URL.

## Setelah migrasi 002
- Admin > **Pengaturan**: isi nama bank, nomor rekening, atas nama, nomor WhatsApp toko, jam operasional, dan batas waktu bayar. Tanpa ini pelanggan tidak melihat rekening tujuan.
- Pesanan yang belum dibayar otomatis dibatalkan dan stoknya kembali (pg_cron, tiap 10 menit). Jika `create extension pg_cron` error, aktifkan di Database > Extensions lalu jalankan ulang dua baris terakhir bagian 2.
- Lupa kata sandi: tambahkan `http://localhost:5173/**` (dan alamat Vercel) di Authentication > URL Configuration > Redirect URLs. Email bawaan Supabase dibatasi jumlahnya per jam; untuk produksi pasang SMTP sendiri.
