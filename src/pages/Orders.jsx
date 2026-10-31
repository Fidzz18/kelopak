import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, rp, STATUS, PAY } from '../lib/supabase'
import { useAuth } from '../context/Auth.jsx'
import { useCart } from '../context/Cart.jsx'
import { useSettings, hhmm } from '../lib/settings'
import { waLink } from '../lib/wa'
import { km, fmtKm, routeMatrix, feeFor } from '../lib/geo'
import LocationSearch from '../components/LocationSearch.jsx'
import { useStore } from '../context/Store.jsx'
import { useOrderList } from '../lib/useOrders'
import OrderSearch from '../components/OrderSearch.jsx'

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
  const { storeId: picked } = useStore()
  const st = useSettings()
  const { profile } = useAuth()
  const nav = useNavigate()
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10)
  const [f, setF] = useState({ name: profile.full_name, phone: profile.phone ?? '', address: '', date: tomorrow, time: '10:00', notes: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [stores, setStores] = useState([])
  const [stockMap, setStockMap] = useState({})
  const [tiers, setTiers] = useState([])
  const [dest, setDest] = useState(null)
  const [storeId, setStoreId] = useState('')
  const [routes, setRoutes] = useState({})
  const [routing, setRouting] = useState(false)
  const [routeFail, setRouteFail] = useState(false)
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const ids = items.map((i) => i.products.id).join(',')
  useEffect(() => {
    let off = false
    ;(async () => {
      const [s, k, t] = await Promise.all([
        supabase.from('stores').select('*').eq('is_active', true).order('name'),
        ids ? supabase.from('store_stock').select('store_id, product_id, stock').in('product_id', ids.split(',')) : Promise.resolve({ data: [] }),
        supabase.from('delivery_tiers').select('*').order('max_km'),
      ])
      if (off) return
      const m = {}
      for (const r of k.data ?? []) (m[r.store_id] ??= {})[r.product_id] = r.stock
      setStores(s.data ?? []); setStockMap(m); setTiers(t.data ?? [])
    })()
    return () => { off = true }
  }, [ids])

  // Jarak rute jalan ke semua toko tiap titik tujuan berubah
  useEffect(() => {
    setRoutes({}); setRouteFail(false)
    if (!dest || !stores.length) return
    let off = false
    setRouting(true)
    routeMatrix(dest, stores)
      .then((r) => { if (!off) setRoutes(r) })
      .catch(() => { if (!off) setRouteFail(true) })
      .finally(() => { if (!off) setRouting(false) })
    return () => { off = true }
  }, [dest, stores])

  const maxKm = tiers.length ? Math.max(...tiers.map((t) => +t.max_km)) : null

  // Jarak lewat jalan; jika layanan rute gagal, perkiraan garis lurus x 1,3 (sama dengan server)
  const opts = stores.map((s) => {
    const rt = routes[s.id]
    const line = dest ? km(dest.lat, dest.lng, s.lat, s.lng) : null
    const eff = rt ? rt.km : line != null ? line * 1.3 : null
    const d = eff != null ? Math.round(eff * 10) / 10 : null
    const fee = d != null ? feeFor(tiers, d) : null
    const beyond = d != null && tiers.length > 0 && fee == null
    const far = d != null && (beyond || (s.delivery_radius_km != null && d > s.delivery_radius_km))
    const short = items.filter((i) => (stockMap[s.id]?.[i.products.id] ?? 0) < i.quantity).map((i) => i.products.name)
    return { s, d, fee, min: rt?.min ?? null, approx: !!dest && !rt, beyond, short, far, ok: !short.length && !far }
  }).sort((a, b) => (b.ok - a.ok) || ((a.d ?? 0) - (b.d ?? 0)) || a.s.name.localeCompare(b.s.name))

  // Pilih otomatis toko terdekat (lewat jalan) yang bisa memenuhi pesanan
  useEffect(() => {
    const ok = opts.filter((o) => o.ok)
    setStoreId(dest ? ((ok.find((o) => o.s.id === picked) ?? ok[0])?.s.id ?? '') : '')
  }, [dest, stores, stockMap, routes, tiers, picked])

  if (!items.length) return <div className="box">Keranjang kosong. <Link to="/katalog" className="font-bold text-peony">Pilih buket</Link></div>

  const sel = opts.find((o) => o.s.id === storeId)
  const ongkir = sel?.fee ?? null
  const grand = total + (ongkir ?? 0)

  const pick = (r) => {
    setDest(r)
    if (!f.address.trim() && !r.label.startsWith('Lokasi saya')) setF({ ...f, address: r.label })
  }
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    await supabase.rpc('sweep_expired_orders') // lepaskan stok pesanan kedaluwarsa sebelum cek stok
    const { error } = await supabase.rpc('place_order', {
      p_store: storeId, p_recipient: f.name, p_phone: f.phone, p_address: f.address,
      p_date: f.date, p_time: f.time, p_notes: f.notes || null,
      p_lat: dest?.lat ?? null, p_lng: dest?.lng ?? null,
      p_route_km: routes[storeId] ? +routes[storeId].km.toFixed(1) : null,
    })
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
        <textarea className="inp" required rows={3} placeholder="Alamat lengkap (jalan, nomor, patokan)" value={f.address} onChange={up('address')} />

        <div className="rounded-xl bg-blush p-3">
          <b className="text-sm text-plum">Titik lokasi pengiriman</b>
          <p className="mb-2 text-xs text-stone-500">Wajib diisi. Cari alamat atau pakai lokasi Anda, lalu toko diurutkan dari yang terdekat lewat jalan dan ongkir dihitung otomatis{maxKm ? ` (jangkauan maks. ${maxKm} km)` : ''}.</p>
          <LocationSearch geo onPick={pick} />
          {dest && <p className="mt-2 text-xs">📍 {dest.label} <button type="button" className="underline" onClick={() => setDest(null)}>hapus</button></p>}
        </div>

        <div>
          <b className="text-sm text-plum">Pilih toko</b>
          {!stores.length && <p className="text-sm text-stone-500">Belum ada toko aktif.</p>}
          {routing && <p className="text-xs text-stone-500">Menghitung rute jalan…</p>}
          <div className="mt-1 grid gap-2">
            {opts.map((o, i) => (
              <label key={o.s.id} className={`flex gap-2 rounded-xl border p-3 text-sm ${storeId === o.s.id ? 'border-peony bg-blush' : 'border-stone-200 bg-white'} ${o.ok ? 'cursor-pointer' : 'opacity-50'}`}>
                <input type="radio" name="store" disabled={!o.ok} checked={storeId === o.s.id} onChange={() => setStoreId(o.s.id)} />
                <span className="flex-1">
                  <b>{o.s.name}</b>
                  {dest && o.ok && i === 0 && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">Terdekat</span>}
                  <br /><span className="text-xs text-stone-500">{o.s.address}</span>
                  {o.short.length > 0 && <><br /><span className="text-xs text-red-700">Stok kurang: {o.short.join(', ')}</span></>}
                  {o.beyond && <><br /><span className="text-xs text-red-700">Di luar jangkauan antar (maks. {maxKm} km)</span></>}
                  {o.far && !o.beyond && <><br /><span className="text-xs text-red-700">Di luar jangkauan toko ini (maks. {o.s.delivery_radius_km} km)</span></>}
                </span>
                {o.d != null && (
                  <span className="text-right text-xs text-stone-600">
                    <b>{o.approx ? '≈ ' : ''}{fmtKm(o.d)}</b>
                    {o.min != null && <><br />±{o.min} menit</>}
                    {o.fee != null && <><br /><b className="text-peony">Ongkir {rp(o.fee)}</b></>}
                  </span>
                )}
              </label>
            ))}
          </div>
          {stores.length > 0 && !opts.some((o) => o.ok) && <p className="mt-2 text-sm text-red-800">{dest ? 'Belum ada toko yang bisa memenuhi pesanan ke alamat ini. Kurangi jumlah, ganti produk, atau ubah titik lokasi.' : 'Belum ada toko yang stoknya cukup untuk isi keranjang.'}</p>}
          <p className="mt-1 text-xs text-stone-500">
            {routeFail
              ? 'Layanan rute sedang tidak tersedia, jarak dan ongkir dihitung dari perkiraan garis lurus.'
              : 'Jarak dihitung lewat jalan. Ongkir mengikuti jarak ke toko yang dipilih.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-stone-500">Tanggal kirim<input className="inp" type="date" required min={new Date().toISOString().slice(0, 10)} value={f.date} onChange={up('date')} /></label>
          <label className="text-xs text-stone-500">Jam kirim<input className="inp" type="time" required min={hhmm(st?.open_time, '08:00')} max={hhmm(st?.close_time, '20:00')} value={f.time} onChange={up('time')} /></label>
        </div>
        <p className="text-xs text-stone-500">Jam kirim {hhmm(st?.open_time, '08:00')}–{hhmm(st?.close_time, '20:00')} WIB. Pesanan untuk hari ini diterima sampai pukul {hhmm(st?.cutoff_time, '13:00')} WIB dan jam kirim minimal {st?.min_lead_hours ?? 2} jam dari sekarang. Bayar maksimal {st?.payment_deadline_hours ?? 24} jam setelah pesan, jika tidak pesanan dibatalkan otomatis.</p>
        <textarea className="inp" rows={2} placeholder="Catatan khusus (mis. isi kartu ucapan)" value={f.notes} onChange={up('notes')} />
      </div>
      <div className="box h-fit">
        <b className="text-plum">Pesanan Anda</b>
        {items.map((i) => <div key={i.id} className="flex justify-between py-1 text-sm"><span>{i.products.name} × {i.quantity}</span><span>{rp(i.products.price * i.quantity)}</span></div>)}
        <div className="mt-2 flex justify-between border-t border-stone-100 pt-2 text-sm"><span>Subtotal</span><span>{rp(total)}</span></div>
        <div className="flex justify-between py-1 text-sm">
          <span>Ongkos kirim{sel?.d != null ? ` (${sel.approx ? '≈ ' : ''}${fmtKm(sel.d)})` : ''}</span>
          <span>{ongkir != null ? rp(ongkir) : '—'}</span>
        </div>
        <p className="my-3 text-2xl font-bold">{rp(grand)}</p>
        <button className="btn w-full" disabled={busy || routing || !storeId || !dest}>
          {busy ? 'Memproses…' : routing ? 'Menghitung rute…' : !dest ? 'Tentukan lokasi dulu' : storeId ? 'Buat pesanan' : 'Pilih toko dulu'}
        </button>
      </div>
    </form>
  )
}

export const ORDER_SEL = '*, order_items(quantity, price, product_name, products(name)), payments(*), shipping_details(*), profiles(full_name), stores(name)'
const tone = { paid: 'bg-green-100 text-green-800', processing: 'bg-amber-100 text-amber-800', shipped: 'bg-sky-100 text-sky-800', completed: 'bg-blue-100 text-blue-800', cancelled: 'bg-stone-200 text-stone-600' }
export const Badge = ({ s }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone[s] ?? 'bg-blush text-plum'}`}>{STATUS[s]}</span>

const msgToShop = (o, ship) =>
  `Halo Kelopak Jogja, saya mau konfirmasi pesanan #${o.order_no}.\n` +
  o.order_items.map((i) => `- ${i.product_name ?? i.products?.name ?? 'Produk'} x${i.quantity}`).join('\n') +
  `\nTotal: ${rp(o.total_amount)}\nKirim: ${ship?.delivery_date} pukul ${ship?.delivery_time?.slice(0, 5)}\nAlamat: ${ship?.address}`

export function Orders() {
  const { user } = useAuth()
  const [skew, setSkew] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    supabase.rpc('server_now').then(({ data }) => {
      if (data) setSkew(new Date(data).getTime() - (t0 + Date.now()) / 2)
    })
  }, [])
  const settings = useSettings()
  const { rows, hasMore, loadingMore, error, term, search, loadMore, reload: load } =
    useOrderList({ select: ORDER_SEL, userId: user.id, name: 'my-orders-list' })

  const upload = async (o, file) => {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) return alert('Ukuran file maksimal 3 MB')
    const path = `${user.id}/${o.id}-${Date.now()}.${file.name.split('.').pop()}`
    const up = await supabase.storage.from('payment-proofs').upload(path, file)
    if (up.error) return alert(up.error.message)
    const { error } = await supabase.rpc('submit_payment_proof', { p_order: o.id, p_path: path })
    if (error) {
      await supabase.storage.from('payment-proofs').remove([path]) // buang berkas yatim
      return alert(error.message)
    }
    load()
  }

  const cancel = async (o) => {
    if (!confirm('Batalkan pesanan ini?')) return
    const { error } = await supabase.rpc('cancel_my_order', { p_order: o.id })
    if (error) alert(error.message)
    load()
  }

  const expire = async () => { await supabase.rpc('sweep_expired_orders'); load() }

  // Tidak ada "if (!rows) return ..." di sini, supaya judul dan kolom pencarian tetap tampil saat memuat.
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-plum">Pesanan saya</h1>
        <OrderSearch term={term} onSearch={search} />
      </div>

      {!rows ? (
        <p className="mt-4 text-stone-500">Memuat…</p>
      ) : (
        <>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-2 text-sm text-red-800">{error}</p>}

          {!rows.length && (
            <div className="box mt-4">
              {term ? `Tidak ada pesanan dengan nomor "${term}".` : 'Belum ada pesanan.'}
            </div>
          )}

          {rows.map((o) => {
            const pay = o.payments?.[0] ?? o.payments
            const ship = o.shipping_details?.[0] ?? o.shipping_details
            return (
              <div key={o.id} className="box mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <b>Pesanan #{o.order_no}</b><br />
                    <span className="text-xs text-stone-500">Kirim {ship?.delivery_date} pukul {ship?.delivery_time?.slice(0, 5)}</span>
                  </div>
                  <Badge s={o.status} />
                </div>

                {o.order_items.map((i, k) => (
                  <div key={k} className="flex justify-between border-b border-stone-100 py-2 text-sm">
                    <span>{i.product_name ?? i.products?.name ?? 'Produk dihapus'} × {i.quantity}</span>
                    <span>{rp(i.price * i.quantity)}</span>
                  </div>
                ))}

                {o.stores?.name && <p className="py-1 text-xs text-stone-500">Dari {o.stores.name}</p>}

                {+o.shipping_fee > 0 && (
                  <div className="flex justify-between border-b border-stone-100 py-2 text-sm">
                    <span>Ongkos kirim{ship?.route_km ? ` (${ship.route_km} km)` : ''}</span>
                    <span>{rp(o.shipping_fee)}</span>
                  </div>
                )}

                {o.status === 'pending' && ['unverified', 'rejected'].includes(pay?.status) && (
                  <PayInfo o={o} s={settings} skew={skew} onCancel={() => cancel(o)} onExpire={expire} />
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <b>Total {rp(o.total_amount)}</b>
                  <span className="text-sm text-stone-500">Pembayaran: {PAY[pay?.status]}</span>

                  {o.status !== 'cancelled' && ['unverified', 'rejected'].includes(pay?.status) && (
                    <label className="btn cursor-pointer">
                      Unggah bukti transfer
                      <input type="file" accept="image/*,.pdf" hidden onChange={(e) => upload(o, e.target.files[0])} />
                    </label>
                  )}

                  {settings?.shop_phone && o.status !== 'cancelled' && (
                    <a
                      className="btn btn-alt"
                      target="_blank"
                      rel="noreferrer"
                      href={waLink(settings.shop_phone, msgToShop(o, ship))}
                    >
                      Konfirmasi via WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )
          })}

          {hasMore && (
            <div className="mt-4 text-center">
              <button className="btn btn-alt" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? 'Memuat…' : 'Muat 10 pesanan lagi'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

function PayInfo({ o, s, skew = 0, onCancel, onExpire }) {
  const end = o.expires_at ? new Date(o.expires_at).getTime() : null
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!end) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [end])
  const left = end ? end - (now + skew) : null
  const over = left !== null && left <= 0
  // Saat habis: minta server membatalkan, ulangi tiap 5 detik sampai pesanan berubah status
  // (komponen ini hilang dari layar begitu status bukan 'pending', sehingga interval ikut berhenti)
  useEffect(() => {
    if (!over) return
    onExpire()
    const t = setInterval(onExpire, 5000)
    return () => clearInterval(t)
  }, [over])
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
        {s?.shop_phone && <a className="btn btn-alt" target="_blank" rel="noreferrer" href={waLink(s.shop_phone, `Halo, saya mau tanya soal pembayaran pesanan #${o.order_no}.`)}>Tanya via WhatsApp</a>}
      </div>
    </div>
  )
}