import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, rp } from '../lib/supabase'
import { useAuth } from '../context/Auth.jsx'
import { useCart } from '../context/Cart.jsx'
import { ProductCard } from '../components/ui.jsx'
import { useSettings, hhmm } from '../lib/settings'
import { mapsLink } from '../lib/geo'

const SEL = '*, categories(name)'
const waLink = (phone) => {
  const d = String(phone ?? '').replace(/\D/g, '')
  return d ? 'https://wa.me/' + (d.startsWith('0') ? '62' + d.slice(1) : d) : null
}

export function Home() {
  const st = useSettings()
  const [feat, setFeat] = useState([])
  const [cats, setCats] = useState([])
  const [stores, setStores] = useState([])
  const [sel, setSel] = useState(null)
  useEffect(() => {
    supabase.from('products').select(SEL).eq('is_active', true).gt('stock', 0).order('created_at', { ascending: false }).limit(4).then(({ data }) => setFeat(data ?? []))
    supabase.from('categories').select('*').then(({ data }) => setCats(data ?? []))
    supabase.from('stores').select('*').eq('is_active', true).order('name').then(({ data }) => {
      setStores(data ?? []); setSel(data?.[0]?.id ?? null)
    })
  }, [])
  const cur = stores.find((s) => s.id === sel)
  const jam = (t, d) => hhmm(t, d).replace(':', '.')
  const perks = [
    ['🌷', 'Dirangkai segar', 'Buket dirangkai sesuai pesanan Anda'],
    ['🛵', 'Ongkir otomatis', 'Dihitung dari jarak toko ke alamat Anda'],
    ['📅', 'Pilih jadwal kirim', 'Tentukan tanggal dan jam sesuai kebutuhan'],
  ]
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-plum to-[#7a2d63] p-8 text-white md:p-12">
        <div className="relative z-10 grid items-center gap-6 md:grid-cols-[1.3fr_1fr]">
          <div>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Toko bunga Yogyakarta</span>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">Buket segar untuk hari istimewa Anda.</h1>
            <p className="mt-3 max-w-md text-pink-100">Pilih buket, tentukan tanggal dan jam kirim, kami antar di Yogyakarta dan sekitarnya.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/katalog" className="btn !bg-white !px-6 !py-2.5 !text-plum">Lihat katalog</Link>
              <a href="#toko" className="btn !border !border-white/40 !bg-transparent !px-6 !py-2.5">Lokasi toko</a>
            </div>
          </div>
          <div className="text-center text-[8rem] leading-none drop-shadow-lg md:text-[10rem]">💐</div>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-peony/30 blur-3xl" />
      </section>

      {/* Keunggulan */}
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {perks.map(([ic, t, d]) => (
          <div key={t} className="box flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blush text-2xl">{ic}</span>
            <div><b className="text-sm text-plum">{t}</b><p className="text-xs text-stone-500">{d}</p></div>
          </div>
        ))}
      </div>

      {/* Kategori */}
      {cats.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-2xl font-bold text-plum">Kategori</h2>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => <Link key={c.id} to={`/katalog?kategori=${c.id}`} className="btn btn-alt !px-5 !py-2.5">{c.name}</Link>)}
          </div>
        </>
      )}

      {/* Produk unggulan */}
      <div className="mb-3 mt-10 flex items-end justify-between">
        <h2 className="text-2xl font-bold text-plum">Produk unggulan</h2>
        <Link to="/katalog" className="text-sm font-bold text-peony">Lihat semua →</Link>
      </div>
      {feat.length
        ? <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{feat.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        : <div className="box text-sm text-stone-500">Belum ada produk tersedia.</div>}

      {/* Informasi toko */}
      <h2 id="toko" className="mb-3 mt-10 scroll-mt-20 text-2xl font-bold text-plum">Informasi toko</h2>
      <div className="box !p-0 overflow-hidden">
        {!stores.length ? (
          <p className="p-4 text-sm text-stone-500">Informasi toko belum tersedia.</p>
        ) : (
          <div className="grid md:grid-cols-[1fr_1.2fr]">
            <div className="grid content-start gap-2 p-4">
              {stores.map((s) => {
                const wa = waLink(s.phone)
                const on = s.id === sel
                return (
                  <div key={s.id} onClick={() => setSel(s.id)}
                    className={`cursor-pointer rounded-xl border p-3 text-sm transition ${on ? 'border-peony bg-blush' : 'border-stone-200 bg-white hover:bg-blush/50'}`}>
                    <b className="text-plum">🌸 {s.name}</b>
                    <p className="mt-1 text-stone-600">📍 {s.address}</p>
                    {s.phone && <p className="mt-1 text-stone-600">📞 <a className="underline" href={'tel:' + s.phone.replace(/[^\d+]/g, '')} onClick={(e) => e.stopPropagation()}>{s.phone}</a></p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a className="btn btn-alt !px-3 !py-1 text-xs" target="_blank" rel="noreferrer" href={mapsLink(s.lat, s.lng)} onClick={(e) => e.stopPropagation()}>Buka di Google Maps</a>
                      {wa && <a className="btn btn-alt !px-3 !py-1 text-xs" target="_blank" rel="noreferrer" href={wa} onClick={(e) => e.stopPropagation()}>WhatsApp</a>}
                    </div>
                  </div>
                )
              })}
              <p className="mt-1 text-xs text-stone-500">
                Pengiriman setiap hari {jam(st?.open_time, '08:00')}–{jam(st?.close_time, '20:00')} WIB. Pesanan hari yang sama diterima sampai pukul {jam(st?.cutoff_time, '13:00')}. Pembayaran lewat transfer bank, lalu unggah bukti di halaman Pesanan Saya.
              </p>
            </div>
            {cur && (
              <iframe key={cur.id} title={`Peta ${cur.name}`} loading="lazy" className="h-72 w-full border-0 md:h-full md:min-h-80"
                src={`https://maps.google.com/maps?q=${cur.lat},${cur.lng}&z=16&output=embed`} />
            )}
          </div>
        )}
      </div>
    </>
  )
}

const PER = 8
export function Catalog() {
  const sp = new URLSearchParams(location.search)
  const [f, setF] = useState({ q: '', cat: sp.get('kategori') ?? '', max: '', sort: 'new', page: 1 })
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [cats, setCats] = useState([])
  const [busy, setBusy] = useState(true)
  const [tick, setTick] = useState(0)
  const set = (k, v) => setF((o) => ({ ...o, [k]: v, page: k === 'page' ? v : 1 }))

  useEffect(() => { supabase.from('categories').select('*').then(({ data }) => setCats(data ?? [])) }, [])

  // Lepaskan stok dari pesanan kedaluwarsa, lalu muat ulang katalog agar stok tampil terbaru
  useEffect(() => { supabase.rpc('sweep_expired_orders').then(() => setTick((t) => t + 1)) }, [])

  // Real-time: setiap perubahan tabel products memicu muat ulang
  useEffect(() => {
    const ch = supabase.channel('catalog-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => setTick((t) => t + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      if (rows.length === 0) setBusy(true)
      let q = supabase.from('products').select(SEL, { count: 'exact' }).eq('is_active', true)
      if (f.q) q = q.ilike('name', `%${f.q}%`)
      if (f.cat) q = q.eq('category_id', f.cat)
      if (f.max) q = q.lte('price', f.max)
      const o = { new: ['created_at', false], lo: ['price', true], hi: ['price', false], az: ['name', true] }[f.sort]
      const { data, count } = await q.order(o[0], { ascending: o[1] }).range((f.page - 1) * PER, f.page * PER - 1)
      if (cancelled) return
      setRows(data ?? []); setCount(count ?? 0); setBusy(false)
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [f, tick])

  const pages = Math.max(1, Math.ceil(count / PER))
  return (
    <>
      <h1 className="text-2xl font-bold text-plum">Katalog buket</h1>
      <div className="my-4 grid gap-2 md:grid-cols-4">
        <input className="inp" placeholder="Cari buket…" value={f.q} onChange={(e) => set('q', e.target.value)} />
        <select className="inp" value={f.cat} onChange={(e) => set('cat', e.target.value)}><option value="">Semua kategori</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="inp" value={f.max} onChange={(e) => set('max', e.target.value)}><option value="">Semua harga</option><option value="150000">Sampai Rp150.000</option><option value="200000">Sampai Rp200.000</option><option value="350000">Sampai Rp350.000</option></select>
        <select className="inp" value={f.sort} onChange={(e) => set('sort', e.target.value)}><option value="new">Terbaru</option><option value="lo">Harga terendah</option><option value="hi">Harga tertinggi</option><option value="az">Nama A–Z</option></select>
      </div>
      {busy ? <p className="text-stone-500">Memuat…</p> : rows.length ? <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{rows.map((p) => <ProductCard key={p.id} p={p} />)}</div> : <div className="box">Tidak ada buket yang cocok. Ubah kata kunci atau filter.</div>}
      <div className="mt-6 flex justify-center gap-1">{Array.from({ length: pages }, (_, i) => <button key={i} onClick={() => set('page', i + 1)} className={`btn ${f.page === i + 1 ? '' : 'btn-alt'}`}>{i + 1}</button>)}</div>
    </>
  )
}

export function ProductDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { add } = useCart()
  const nav = useNavigate()
  const [p, setP] = useState(null)
  useEffect(() => {
    const load = () => supabase.from('products').select(SEL).eq('id', id).maybeSingle().then(({ data }) => setP(data ?? false))
    load()
    const ch = supabase.channel('product-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id])
  if (p === null) return <p className="text-stone-500">Memuat…</p>
  if (p === false) return <p>Produk tidak ditemukan.</p>
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="grid h-80 place-items-center overflow-hidden rounded-3xl bg-blush text-9xl">{p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" /> : '💐'}</div>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-stone-500">{p.categories?.name}</span>
        <h1 className="text-3xl font-bold text-plum">{p.name}</h1>
        <p>{p.description}</p>
        <p className="text-2xl font-bold text-peony">{rp(p.price)}</p>
        <p className={p.stock <= 3 ? 'font-bold text-orange-700' : 'text-stone-500'}>{p.stock ? `Stok tersisa ${p.stock}` : 'Stok habis'}</p>
        <button className="btn mt-2 self-start" disabled={!p.stock} onClick={async () => { if (!user) return nav('/masuk'); try { await add(p); nav('/keranjang') } catch (e) { alert(e.message) } }}>Tambah ke keranjang</button>
      </div>
    </div>
  )
}