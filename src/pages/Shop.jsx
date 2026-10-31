import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, rp } from '../lib/supabase'
import { useAuth } from '../context/Auth.jsx'
import { useCart } from '../context/Cart.jsx'
import { ProductCard } from '../components/ui.jsx'

const SEL = '*, categories(name)'
export function Home() {
  const [feat, setFeat] = useState([])
  const [cats, setCats] = useState([])
  useEffect(() => {
    supabase.from('products').select(SEL).eq('is_active', true).gt('stock', 0).order('created_at', { ascending: false }).limit(4).then(({ data }) => setFeat(data ?? []))
    supabase.from('categories').select('*').then(({ data }) => setCats(data ?? []))
  }, [])
  return (
    <>
      <section className="grid items-center gap-6 rounded-3xl bg-plum p-8 text-white md:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="text-4xl font-bold leading-tight">Buket segar, dirangkai hari ini untuk hari istimewa Anda.</h1>
          <p className="mt-3 max-w-md text-pink-100">Pilih buket, tentukan tanggal dan jam kirim, kami antar di Yogyakarta dan sekitarnya.</p>
          <Link to="/katalog" className="btn mt-5 !bg-white !text-plum">Lihat katalog</Link>
        </div>
        <div className="text-center text-8xl">💐</div>
      </section>
      <h2 className="mb-3 mt-8 text-2xl font-bold text-plum">Kategori</h2>
      <div className="flex flex-wrap gap-2">{cats.map((c) => <Link key={c.id} to={`/katalog?kategori=${c.id}`} className="btn btn-alt">{c.name}</Link>)}</div>
      <h2 className="mb-3 mt-8 text-2xl font-bold text-plum">Produk unggulan</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{feat.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      <div className="box mt-8"><b className="text-plum">Informasi toko</b><p className="text-sm text-stone-500">Buka setiap hari 08.00–20.00 WIB. Pesanan hari yang sama diterima sampai pukul 13.00. Pembayaran lewat transfer bank, lalu unggah bukti di halaman Pesanan Saya.</p></div>
    </>
  )
}

const PER = 8
export function Catalog() {
  const nav = useNavigate()
  const sp = new URLSearchParams(location.search)
  const [f, setF] = useState({ q: '', cat: sp.get('kategori') ?? '', max: '', sort: 'new', page: 1 })
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [cats, setCats] = useState([])
  const [busy, setBusy] = useState(true)
  const set = (k, v) => setF((o) => ({ ...o, [k]: v, page: k === 'page' ? v : 1 }))
  useEffect(() => { supabase.from('categories').select('*').then(({ data }) => setCats(data ?? [])) }, [])
  // Lepaskan stok dari pesanan kedaluwarsa, lalu muat ulang katalog agar stok tampil terbaru
  useEffect(() => { supabase.rpc('sweep_expired_orders').then(() => setF((o) => ({ ...o }))) }, [])
  useEffect(() => {
    const t = setTimeout(async () => {
      setBusy(true)
      let q = supabase.from('products').select(SEL, { count: 'exact' }).eq('is_active', true)
      if (f.q) q = q.ilike('name', `%${f.q}%`)
      if (f.cat) q = q.eq('category_id', f.cat)
      if (f.max) q = q.lte('price', f.max)
      const o = { new: ['created_at', false], lo: ['price', true], hi: ['price', false], az: ['name', true] }[f.sort]
      const { data, count } = await q.order(o[0], { ascending: o[1] }).range((f.page - 1) * PER, f.page * PER - 1)
      setRows(data ?? []); setCount(count ?? 0); setBusy(false)
    }, 250)
    return () => clearTimeout(t)
  }, [f])
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
  useEffect(() => { supabase.from('products').select(SEL).eq('id', id).maybeSingle().then(({ data }) => setP(data ?? false)) }, [id])
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
