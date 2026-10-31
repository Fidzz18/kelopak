import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
export const rp = (n) => 'Rp' + Number(n).toLocaleString('id-ID')
export const STATUS = { pending: 'Menunggu pembayaran', paid: 'Dibayar', processing: 'Diproses', shipped: 'Dikirim', completed: 'Selesai', cancelled: 'Dibatalkan' }
export const PAY = { unverified: 'Belum ada bukti', waiting: 'Menunggu verifikasi', verified: 'Terverifikasi', rejected: 'Ditolak' }
