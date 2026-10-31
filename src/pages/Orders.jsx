import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, rp, STATUS, PAY } from '../lib/supabase'
import { useAuth } from '../context/Auth.jsx'
import { useCart } from '../context/Cart.jsx'
import { useSettings, hhmm } from '../lib/settings'

export function CartPage() {
  const { items, setQty, total } = useCart()
  if (!items.length) return <div className="box">Keranjang masih kosong. <Link to="/katalog" className="font-bold text-peony">Pilih buket</Link></div>
  return (
    <div className="grid gap-5 md:grid-cols-[1.5fr_1fr]">
      <div className="box">
        <h1 className="mb-2 text-2xl font-bold text-plum">Keranjang</h1>
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 border-b border-stone-100 py-3 last:border-0">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-blush text-3xl">{i.products.image_url ? <img src={i.products.image_url} alt="" className="h-full w-full object-cover" /> : '💐'}</div>
            <div className="flex-1"><b>{i.products.name}</b><br /><span className="text-sm text-stone-500">{rp(i.products.price)}</span></div>
            <div className="flex items-center gap-2">
              <button className="btn btn-alt !px-2.5" aria-label="Kurangi" onClick={() => setQty(i, i.quantity - 1)}>−</button>
              <b>{i.quantity}</b>
              <button className="btn btn-alt !px-2.5" aria-label="Tambah" disabled={i.quantity >= i.products.stock} onClick={() => setQty(i, i.quantity + 1)}>+</button>
            </div>
            <button className="btn btn-alt" onClick={() => setQty(i, 0)}>Hapus</button>
          </div>
        ))}
      </div>
      <div className="box h-fit"><b className="text-plum">Ringkasan</b><p className="my-2 text-2xl font-bold">{rp(total)}</p><Link to="/checkout" className="btn w-full">Lanjut ke checkout</Link></div>
    </div>
  )
}

export function Checkout() {
  const { items, total, reload } = useCart()
  const st = useSettings()
  const { profile } = useAuth()
  const nav = useNavigate()
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10)
  const [f, setF] = useState({ name: profile.full_name, phone: profile.phone ?? '', address: '', date: tomorrow, time: '10:00', notes: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })
  if (!items.length) return <div className="box">Keranjang kosong. <Link to="/katalog" className="font-bold text-peony">Pilih buket</Link></div>
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    await supabase.rpc('sweep_expired_orders') // lepaskan stok pesanan kedaluwarsa sebelum cek stok
    const { error } = await supabase.rpc('place_order', { p_recipient: f.name, p_phone: f.phone, p_address: f.address, p_date: f.date, p_time: f.time, p_notes: f.notes || null })
    setBusy(false)
    if (error) { await reload(); return setErr(error.message) }
    await reload(); nav('/pesanan')
  }
  return (
    <form onSubmit={submit} className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
      <div className="box grid gap-3">
        <h1 className="text-2xl font-bold text-plum">Checkout</h1>
        {err && <p role="alert" className="rounded-xl bg-red-50 p-2 text-sm text-red-800">{err}</p>}
        <input className="inp" required placeholder="Nama penerima" value={f.name} onChange={up('name')} />
        <input className="inp" placeholder="Telepon penerima" value={f.phone} onChange={up('phone')} />
        <textarea className="inp" required rows={3} placeholder="Alamat lengkap" value={f.address} onChange={up('address')} />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-stone-500">Tanggal kirim<input className="inp" type="date" required min={new Date().toISOString().slice(0, 10)} value={f.date} onChange={up('date')} /></label>
          <label className="text-xs text-stone-500">Jam kirim<input className="inp" type="time" required min={hhmm(st?.open_time, '08:00')} max={hhmm(st?.close_time, '20:00')} value={f.time} onChange={up('time')} /></label>
        </div>
        <p className="text-xs text-stone-500">Jam kirim {hhmm(st?.open_time, '08:00')}–{hhmm(st?.close_time, '20:00')} WIB. Pesanan untuk hari ini diterima sampai pukul {hhmm(st?.cutoff_time, '13:00')} WIB. Bayar maksimal {st?.payment_deadline_hours ?? 24} jam setelah pesan, jika tidak pesanan dibatalkan otomatis.</p>
        <textarea className="inp" rows={2} placeholder="Catatan khusus (mis. isi kartu ucapan)" value={f.notes} onChange={up('notes')} />
      </div>
      <div className="box h-fit">
        <b className="text-plum">Pesanan Anda</b>
        {items.map((i) => <div key={i.id} className="flex justify-between py-1 text-sm"><span>{i.products.name} × {i.quantity}</span><span>{rp(i.products.price * i.quantity)}</span></div>)}
        <p className="my-3 text-2xl font-bold">{rp(total)}</p>
        <button className="btn w-full" disabled={busy}>{busy ? 'Memproses…' : 'Buat pesanan'}</button>
      </div>
    </form>
  )
}

export const ORDER_SEL = '*, order_items(quantity, price, product_name, products(name)), payments(*), shipping_details(*), profiles(full_name)'
const tone = { paid: 'bg-green-100 text-green-800', processing: 'bg-amber-100 text-amber-800', shipped: 'bg-sky-100 text-sky-800', completed: 'bg-blue-100 text-blue-800', cancelled: 'bg-stone-200 text-stone-600' }
export const Badge = ({ s }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone[s] ?? 'bg-blush text-plum'}`}>{STATUS[s]}</span>

export function Orders() {
  const { user } = useAuth()
  const settings = useSettings()
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('orders').select(ORDER_SEL).eq('user_id', user.id).order('created_at', { ascending: false })
    setRows(data ?? [])
  }, [user.id])
  useEffect(() => {
    load()
    // Status real-time: muat ulang saat order/payment milik pengguna berubah (RLS menyaring event)
    const ch = supabase.channel('my-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])
  const upload = async (o, file) => {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) return alert('Ukuran file maksimal 3 MB')
    const path = `${user.id}/${o.id}-${Date.now()}.${file.name.split('.').pop()}`
    const up = await supabase.storage.from('payment-proofs').upload(path, file)
    if (up.error) return alert(up.error.message)
    const { error } = await supabase.rpc('submit_payment_proof', { p_order: o.id, p_path: path })
    if (error) return alert(error.message)
    load()
  }
  const cancel = async (o) => {
    if (!confirm('Batalkan pesanan ini?')) return
    const { error } = await supabase.rpc('cancel_my_order', { p_order: o.id })
    if (error) alert(error.message)
    load()
  }
  const expire = async () => { await supabase.rpc('sweep_expired_orders'); load() }
  if (!rows) return <p className="text-stone-500">Memuat…</p>
  return (
    <>
      <h1 className="text-2xl font-bold text-plum">Pesanan saya</h1>
      {!rows.length && <div className="box mt-4">Belum ada pesanan.</div>}
      {rows.map((o) => {
        const pay = o.payments?.[0] ?? o.payments, ship = o.shipping_details?.[0] ?? o.shipping_details
        return (
          <div key={o.id} className="box mt-4">
            <div className="flex items-center justify-between"><div><b>Pesanan #{o.order_no}</b><br /><span className="text-xs text-stone-500">Kirim {ship?.delivery_date} pukul {ship?.delivery_time?.slice(0, 5)}</span></div><Badge s={o.status} /></div>
            {o.order_items.map((i, k) => <div key={k} className="flex justify-between border-b border-stone-100 py-2 text-sm last:border-0"><span>{i.product_name ?? i.products?.name ?? 'Produk dihapus'} × {i.quantity}</span><span>{rp(i.price * i.quantity)}</span></div>)}
            {o.status === 'pending' && ['unverified', 'rejected'].includes(pay?.status) && <PayInfo o={o} s={settings} onCancel={() => cancel(o)} onExpire={expire} />}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <b>Total {rp(o.total_amount)}</b>
              <span className="text-sm text-stone-500">Pembayaran: {PAY[pay?.status]}</span>
              {o.status !== 'cancelled' && ['unverified', 'rejected'].includes(pay?.status) && (
                <label className="btn cursor-pointer">Unggah bukti transfer<input type="file" accept="image/*,.pdf" hidden onChange={(e) => upload(o, e.target.files[0])} /></label>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

function PayInfo({ o, s, onCancel, onExpire }) {
  const end = o.expires_at ? new Date(o.expires_at).getTime() : null
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!end) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [end])
  const left = end ? end - now : null
  const over = left !== null && left <= 0
  // Saat hitung mundur habis, minta server membatalkan lalu muat ulang (stok langsung kembali)
  useEffect(() => { if (over) onExpire() }, [over])
  const fmt = end && new Date(end).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="mt-3 rounded-xl bg-blush p-3 text-sm">
      <b className="text-plum">Cara membayar</b>
      {s?.account_no
        ? <p>Transfer <b>{rp(o.total_amount)}</b> ke <b>{s.bank_name} {s.account_no}</b> a.n. <b>{s.account_name}</b>, lalu unggah bukti transfer di bawah.</p>
        : <p>Rekening toko belum diatur. Silakan hubungi toko untuk info pembayaran.</p>}
      {end && (
        <p className="mt-1">
          {over ? 'Waktu bayar habis, pesanan sedang dibatalkan…' : <>Sisa waktu bayar: <b className="font-mono text-base text-peony">{clock(left)}</b> (sampai {fmt}). Setelah itu pesanan dibatalkan otomatis dan stok dikembalikan.</>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn btn-alt" onClick={onCancel}>Batalkan pesanan</button>
        {s?.shop_phone && <a className="btn btn-alt" target="_blank" rel="noreferrer" href={'https://wa.me/' + s.shop_phone.replace(/\D/g, '')}>Tanya via WhatsApp</a>}
      </div>
    </div>
  )
}
