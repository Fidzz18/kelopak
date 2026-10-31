import { useCallback, useEffect, useState } from 'react'
import { supabase, rp, STATUS, PAY } from '../lib/supabase'
import { Badge, ORDER_SEL } from './Orders.jsx'
import { waLink } from '../lib/wa'
import { mapsLink } from '../lib/geo'
import LocationSearch from '../components/LocationSearch.jsx'

const TABS = [['dash', 'Dasbor'], ['prod', 'Katalog'], ['sto', 'Toko'], ['stk', 'Stok toko'], ['rate', 'Ongkir'], ['ord', 'Pesanan'], ['pay', 'Verifikasi bayar'], ['cus', 'Pelanggan'], ['set', 'Pengaturan']]
const one = (x) => (Array.isArray(x) ? x[0] : x)
const WA_MSG = {
  pending: 'sudah kami terima. Silakan transfer dan unggah bukti pembayaran ya.',
  paid: 'pembayarannya sudah kami terima. Terima kasih!',
  processing: 'sedang kami rangkai.',
  shipped: 'sedang dalam pengiriman.',
  completed: 'sudah selesai. Terima kasih sudah memesan di Kelopak Jogja!',
}

export default function Admin() {
  const [tab, setTab] = useState('dash')
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [cats, setCats] = useState([])
  const load = useCallback(async () => {
    const [o, p, c] = await Promise.all([
      supabase.from('orders').select(ORDER_SEL).order('created_at', { ascending: false }),
      supabase.from('products').select('*, categories(name)').order('created_at', { ascending: false }),
      supabase.from('categories').select('*'),
    ])
    setOrders(o.data ?? []); setProducts(p.data ?? []); setCats(c.data ?? [])
  }, [])
  useEffect(() => {
    load()
    const ch = supabase.channel('admin').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])
  const run = async (q) => { const { error } = await q; if (error) alert(error.message); load() }
  return (
    <>
      <h1 className="text-2xl font-bold text-plum">Admin</h1>
      <nav className="my-3 flex flex-wrap gap-1">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-sm ${tab === k ? 'bg-blush font-bold text-plum' : ''}`}>{l}</button>)}</nav>
      {tab === 'dash' && <Dash orders={orders} products={products} />}
      {tab === 'prod' && <Products products={products} cats={cats} run={run} reload={load} />}
      {tab === 'ord' && <OrderList orders={orders} run={run} />}
      {tab === 'pay' && <Payments orders={orders} run={run} />}
      {tab === 'cus' && <Customers orders={orders} />}
      {tab === 'set' && <Settings />}
      {tab === 'sto' && <Stores />}
      {tab === 'stk' && <Stock products={products} reload={load} />}
      {tab === 'rate' && <Rates />}
    </>
  )
}

function Dash({ orders, products }) {
  const rev = orders.filter((o) => one(o.payments)?.status === 'verified' && o.status !== 'cancelled').reduce((a, o) => a + +o.total_amount, 0)
  const low = products.filter((p) => p.stock <= 3)
  const S = ({ l, v }) => <div className="box"><span className="text-sm text-stone-500">{l}</span><b className="block text-2xl text-plum">{v}</b></div>
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <S l="Pesanan aktif" v={orders.filter((o) => !['completed', 'cancelled'].includes(o.status)).length} />
        <S l="Pendapatan terverifikasi" v={rp(rev)} />
        <S l="Perlu diverifikasi" v={orders.filter((o) => one(o.payments)?.status === 'waiting').length} />
        <S l="Stok menipis" v={low.length} />
      </div>
      <div className="box mt-4"><b className="text-plum">Stok menipis (≤ 3)</b>{low.map((p) => <div key={p.id} className="flex justify-between py-1 text-sm"><span>{p.name}</span><b className="text-orange-700">{p.stock}</b></div>)}{!low.length && <p className="text-sm text-stone-500">Semua stok aman.</p>}</div>
    </>
  )
}

function Products({ products, cats, run, reload }) {
  const [edit, setEdit] = useState(null)
  return (
    <div className="box overflow-x-auto">
      <div className="mb-2 flex justify-between"><b className="text-plum">Produk</b><button className="btn" onClick={() => setEdit({ name: '', description: '', price: 100000, stock: 5, category_id: cats[0]?.id ?? '', is_active: true })}>+ Produk baru</button></div>
      <table className="w-full text-left text-sm"><thead><tr><th>Nama</th><th>Kategori</th><th>Harga</th><th>Stok Total</th><th>Aktif</th><th /></tr></thead><tbody>
        {products.map((p) => <tr key={p.id} className="border-t border-stone-100"><td className="py-2">{p.name}</td><td>{p.categories?.name}</td><td>{rp(p.price)}</td><td className={p.stock <= 3 ? 'font-bold text-orange-700' : ''}>{p.stock}</td><td>{p.is_active ? 'Ya' : 'Tidak'}</td>
          <td className="space-x-1 whitespace-nowrap"><button className="btn btn-alt" onClick={() => setEdit(p)}>Ubah</button><button className="btn btn-alt" onClick={() => run(supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id))}>{p.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button><button className="btn btn-alt" onClick={() => confirm('Hapus permanen? Sebaiknya Nonaktifkan saja. Riwayat pesanan tetap aman.') && run(supabase.from('products').delete().eq('id', p.id))}>Hapus</button></td></tr>)}
      </tbody></table>
      {edit && <ProductForm p={edit} cats={cats} close={() => setEdit(null)} done={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function ProductForm({ p, cats, close, done }) {
  const [f, setF] = useState({ name: p.name, description: p.description ?? '', price: p.price, stock: p.stock, category_id: p.category_id ?? '', is_active: p.is_active })
  const [file, setFile] = useState(null)
  const [err, setErr] = useState('')
  const up = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async (e) => {
    e.preventDefault(); setErr('')
    const row = { ...f, price: +f.price, stock: +f.stock, category_id: f.category_id || null }
    if (file) {
      const path = `${crypto.randomUUID()}.${file.name.split('.').pop()}`
      const u = await supabase.storage.from('product-images').upload(path, file)
      if (u.error) return setErr(u.error.message)
      row.image_url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }
    const { error } = p.id ? await supabase.from('products').update(row).eq('id', p.id) : await supabase.from('products').insert(row)
    if (error) return setErr(error.message)
    done()
  }
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && close()}>
      <form onSubmit={save} className="box grid max-h-[90vh] w-full max-w-md gap-2 overflow-auto">
        <b className="text-plum">{p.id ? 'Ubah produk' : 'Produk baru'}</b>
        {err && <p role="alert" className="rounded-xl bg-red-50 p-2 text-sm text-red-800">{err}</p>}
        <input className="inp" required placeholder="Nama" value={f.name} onChange={up('name')} />
        <select className="inp" value={f.category_id} onChange={up('category_id')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="grid grid-cols-2 gap-2"><input className="inp" type="number" min="0" required placeholder="Harga" value={f.price} onChange={up('price')} /><input className="inp" type="number" min="0" required placeholder="Stok" value={f.stock} onChange={up('stock')} /></div>
        <textarea className="inp" rows={3} placeholder="Deskripsi" value={f.description} onChange={up('description')} />
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="text-sm" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={up('is_active')} /> Tampilkan di katalog</label>
        <div className="flex gap-2"><button className="btn">Simpan produk</button><button type="button" className="btn btn-alt" onClick={close}>Batal</button></div>
      </form>
    </div>
  )
}

const mapUrl = (s) =>
  s?.dest_lat != null && s?.dest_lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${s.dest_lat},${s.dest_lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s?.address ?? '')}`

const waUrl = (phone) => {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (!d) return null
  return 'https://wa.me/' + (d.startsWith('0') ? '62' + d.slice(1) : d)
}

function OrderList({ orders, run }) {
  return (
    <div className="grid gap-3">
      <b className="text-plum">Semua pesanan</b>
      {!orders.length && <div className="box text-sm text-stone-500">Belum ada pesanan.</div>}
      {orders.map((o) => {
        const s = one(o.shipping_details)
        const wa = waUrl(s?.phone)
        const editable = !['cancelled', 'completed'].includes(o.status)
        const km = +s?.route_km > 0 ? +s.route_km : null
        return (
          <div key={o.id} className="box grid gap-3 md:grid-cols-[1.6fr_1fr_auto]">
            {/* Penerima */}
            <div className="min-w-0 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-plum">#{o.order_no}</b>
                <Badge s={o.status} />
              </div>
              <p className="mt-1 font-bold">{s?.recipient_name}</p>
              {s?.phone && <p className="text-xs text-stone-500">{s.phone}</p>}
              {s?.address && (
                <a className="mt-1 block break-words text-xs text-peony underline" target="_blank" rel="noreferrer" href={mapUrl(s)} title="Buka di Google Maps">
                  📍 {s.address}
                </a>
              )}
              {km && <p className="mt-1 text-xs text-stone-500">Jarak ±{km} km{o.stores?.name ? ` dari ${o.stores.name}` : ''}</p>}
              {!km && o.stores?.name && <p className="mt-1 text-xs text-stone-500">Toko: {o.stores.name}</p>}
              {o.notes && <p className="mt-1 text-xs italic">“{o.notes}”</p>}
              <p className="mt-1 text-xs text-stone-400">Akun: {o.profiles?.full_name}</p>
            </div>

            {/* Pengiriman, item, total */}
            <div className="text-sm">
              <p className="text-xs text-stone-500">Kirim</p>
              <p className="font-bold">{s?.delivery_date} · {s?.delivery_time?.slice(0, 5)}</p>
              <ul className="mt-2 text-xs text-stone-600">
                {o.order_items?.map((i, k) => <li key={k}>{i.product_name ?? i.products?.name ?? 'Produk dihapus'} × {i.quantity}</li>)}
                {+o.shipping_fee > 0 && <li>Ongkir {rp(o.shipping_fee)}</li>}
              </ul>
              <p className="mt-2 text-lg font-bold text-plum">{rp(o.total_amount)}</p>
            </div>

            {/* Aksi */}
            <div className="flex flex-wrap items-start gap-2 md:w-44 md:flex-col">
              {wa && <a className="btn btn-alt !px-3 !py-1 text-xs" target="_blank" rel="noreferrer" href={wa}>Chat WA</a>}
              {editable && (
                <>
                  <select className="inp !w-auto !py-1 text-xs md:!w-full" value={o.status}
                    onChange={(e) => run(supabase.from('orders').update({ status: e.target.value, updated_at: new Date().toISOString() }).eq('id', o.id))}>
                    {['pending', 'paid', 'processing', 'shipped', 'completed'].map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
                  </select>
                  {['pending', 'paid'].includes(o.status) && (
                    <button className="btn btn-alt !px-3 !py-1 text-xs" onClick={() => confirm('Batalkan pesanan dan kembalikan stok?') && run(supabase.rpc('cancel_order', { p_order: o.id }))}>Batalkan</button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Payments({ orders, run }) {
  const list = orders.filter((o) => one(o.payments)?.status === 'waiting')
  const view = async (path) => { const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 60); error ? alert(error.message) : window.open(data.signedUrl, '_blank') }
  return (
    <div className="box"><b className="text-plum">Bukti transfer menunggu verifikasi</b>
      {list.map((o) => { const p = one(o.payments); return (
        <div key={o.id} className="flex flex-wrap items-center gap-2 border-b border-stone-100 py-3 last:border-0">
          <span className="flex-1 text-sm"><b>#{o.order_no}</b> · {o.profiles?.full_name}<br />Harus dibayar {rp(p.amount)}</span>
          <button className="btn btn-alt" onClick={() => view(p.proof_url)}>Lihat bukti</button>
          <button className="btn" onClick={() => run(supabase.rpc('verify_payment', { p_order: o.id, p_ok: true }))}>Verifikasi</button>
          <button className="btn btn-alt" onClick={() => run(supabase.rpc('verify_payment', { p_order: o.id, p_ok: false }))}>Tolak</button>
        </div>) })}
      {!list.length && <p className="mt-2 text-sm text-stone-500">Tidak ada bukti yang menunggu.</p>}
    </div>
  )
}

function Customers({ orders }) {
  const [rows, setRows] = useState([])
  useEffect(() => { supabase.from('profiles').select('*').eq('role', 'customer').order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? [])) }, [])
  return (
    <div className="box overflow-x-auto"><b className="text-plum">Direktori pelanggan</b>
      <table className="mt-2 w-full text-left text-sm"><thead><tr><th>Nama</th><th>Telepon</th><th>Pesanan</th><th>Total belanja</th></tr></thead><tbody>
        {rows.map((u) => { const o = orders.filter((x) => x.user_id === u.id && x.status !== 'cancelled'); return <tr key={u.id} className="border-t border-stone-100"><td className="py-2">{u.full_name}</td><td>{u.phone ?? '-'}</td><td>{o.length}</td><td>{rp(o.reduce((a, x) => a + +x.total_amount, 0))}</td></tr> })}
      </tbody></table>
    </div>
  )
}

function Settings() {
  const [f, setF] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { supabase.from('store_settings').select('*').eq('id', 1).single().then(({ data }) => setF(data)) }, [])
  if (!f) return <p className="text-stone-500">Memuat…</p>
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    const { id, updated_at, ...row } = f
    row.payment_deadline_hours = +row.payment_deadline_hours
    row.min_lead_hours = +row.min_lead_hours
    const { error } = await supabase.from('store_settings').update({ ...row, updated_at: new Date().toISOString() }).eq('id', 1)
    setMsg(error ? error.message : 'Pengaturan disimpan')
  }
  const L = (label, k, type = 'text') => (
    <label className="text-xs text-stone-500">{label}
      <input className="inp" type={type} min={type === 'number' ? 0 : undefined} value={type === 'time' ? String(f[k] ?? '').slice(0, 5) : f[k] ?? ''} onChange={up(k)} />
    </label>
  )
  return (
    <form onSubmit={save} className="box grid max-w-xl gap-3">
      <b className="text-plum">Pengaturan toko</b>
      <p className="text-xs text-stone-500">Rekening tampil di halaman pesanan pelanggan. Jam dan batas waktu dicek juga di server saat checkout (zona WIB).</p>
      <div className="grid grid-cols-2 gap-3">{L('Nama bank', 'bank_name')}{L('Nomor rekening', 'account_no')}</div>
      {L('Atas nama', 'account_name')}
      {L('Nomor WhatsApp toko (mis. 6281234567890)', 'shop_phone')}
      <div className="grid grid-cols-2 gap-3">{L('Jam buka pengiriman', 'open_time', 'time')}{L('Jam tutup pengiriman', 'close_time', 'time')}</div>
      <div className="grid grid-cols-2 gap-3">{L('Batas terima pesanan hari ini', 'cutoff_time', 'time')}{L('Minimal jam sebelum kirim (hari ini)', 'min_lead_hours', 'number')}</div>
      {L('Batas waktu bayar (jam)', 'payment_deadline_hours', 'number')}
      <button className="btn self-start">Simpan pengaturan</button>
       {msg && <p role="status" className="text-sm">{msg}</p>}
    </form>
  )
}
  function Stores() {
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => supabase.from('stores').select('*').order('created_at').then(({ data }) => setRows(data ?? [])), [])
  useEffect(() => { load() }, [load])
  const toggle = async (s) => {
    const { error } = await supabase.from('stores').update({ is_active: !s.is_active }).eq('id', s.id)
    if (error) alert(error.message)
    load()
  }
  return (
    <div className="box overflow-x-auto">
      <div className="mb-2 flex justify-between"><b className="text-plum">Toko / cabang</b>
        <button className="btn" onClick={() => setEdit({ name: '', address: '', phone: '', lat: '', lng: '', delivery_radius_km: '', is_active: true })}>+ Toko baru</button></div>
      <table className="w-full text-left text-sm"><thead><tr><th>Nama</th><th>Alamat</th><th>Koordinat</th><th>Radius</th><th>Aktif</th><th /></tr></thead><tbody>
        {rows.map((s) => (
          <tr key={s.id} className="border-t border-stone-100 align-top">
            <td className="py-2 font-bold">{s.name}</td><td>{s.address}</td>
            <td><a className="text-peony underline" target="_blank" rel="noreferrer" href={mapsLink(s.lat, s.lng)}>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</a></td>
            <td>{s.delivery_radius_km ? `${s.delivery_radius_km} km` : 'Bebas'}</td><td>{s.is_active ? 'Ya' : 'Tidak'}</td>
            <td className="space-x-1 whitespace-nowrap"><button className="btn btn-alt" onClick={() => setEdit(s)}>Ubah</button><button className="btn btn-alt" onClick={() => toggle(s)}>{s.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
          </tr>))}
      </tbody></table>
      {edit && <StoreForm s={edit} close={() => setEdit(null)} done={() => { setEdit(null); load() }} />}
    </div>
  )
}

function StoreForm({ s, close, done }) {
  const [f, setF] = useState({ name: s.name, address: s.address, phone: s.phone ?? '', lat: s.lat, lng: s.lng, delivery_radius_km: s.delivery_radius_km ?? '', is_active: s.is_active })
  const [err, setErr] = useState('')
  const up = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const paste = (v) => {
    const m = v.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
    if (m) setF((o) => ({ ...o, lat: m[1], lng: m[2] }))
  }
  const save = async (e) => {
    e.preventDefault(); setErr('')
    if (f.lat === '' || f.lng === '') return setErr('Tentukan koordinat toko (cari lokasi atau tempel dari Google Maps)')
    const row = { ...f, phone: f.phone || null, lat: +f.lat, lng: +f.lng, delivery_radius_km: f.delivery_radius_km === '' ? null : +f.delivery_radius_km }
    const { error } = s.id ? await supabase.from('stores').update(row).eq('id', s.id) : await supabase.from('stores').insert(row)
    if (error) return setErr(error.message)
    done()
  }
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && close()}>
      <form onSubmit={save} className="box grid max-h-[90vh] w-full max-w-md gap-2 overflow-auto">
        <b className="text-plum">{s.id ? 'Ubah toko' : 'Toko baru'}</b>
        {err && <p role="alert" className="rounded-xl bg-red-50 p-2 text-sm text-red-800">{err}</p>}
        <input className="inp" required placeholder="Nama toko" value={f.name} onChange={up('name')} />
        <textarea className="inp" required rows={2} placeholder="Alamat toko" value={f.address} onChange={up('address')} />
        <input className="inp" placeholder="Telepon / WhatsApp toko" value={f.phone} onChange={up('phone')} />
        <div className="rounded-xl bg-blush p-3">
          <b className="text-xs text-plum">Cari lokasi toko</b>
          <LocationSearch onPick={(r) => setF((o) => ({ ...o, lat: r.lat, lng: r.lng, address: o.address.trim() ? o.address : r.label }))} />
          <input className="inp mt-2" placeholder="Atau tempel koordinat dari Google Maps (mis. -7.7956, 110.3695)" onChange={(e) => paste(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="inp" type="number" step="any" placeholder="Latitude" value={f.lat} onChange={up('lat')} />
          <input className="inp" type="number" step="any" placeholder="Longitude" value={f.lng} onChange={up('lng')} />
        </div>
        {f.lat !== '' && f.lng !== '' && <a className="text-xs text-peony underline" target="_blank" rel="noreferrer" href={mapsLink(f.lat, f.lng)}>Cek lokasi di Google Maps</a>}
        <input className="inp" type="number" min="0" step="0.1" placeholder="Radius layanan (km), kosongkan jika bebas" value={f.delivery_radius_km} onChange={up('delivery_radius_km')} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={up('is_active')} /> Toko aktif</label>
        <div className="flex gap-2"><button className="btn">Simpan toko</button><button type="button" className="btn btn-alt" onClick={close}>Batal</button></div>
      </form>
    </div>
  )
}

function Stock({ products, reload }) {
  const [stores, setStores] = useState([])
  const [sid, setSid] = useState('')
  const [vals, setVals] = useState({})
  const [orig, setOrig] = useState({})
  const [msg, setMsg] = useState('')
  useEffect(() => {
    supabase.from('stores').select('id, name, is_active').order('name').then(({ data }) => {
      setStores(data ?? []); setSid((c) => c || data?.[0]?.id || '')
    })
  }, [])
  useEffect(() => {
    if (!sid) return
    supabase.from('store_stock').select('product_id, stock').eq('store_id', sid).then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.product_id, String(r.stock)]))
      setVals(m); setOrig(m); setMsg('')
    })
  }, [sid])
  const num = (v) => Math.max(0, parseInt(v ?? '0', 10) || 0)
  const save = async () => {
    // Hanya kirim baris yang diubah, supaya tidak menimpa stok yang berubah karena pesanan baru
    const rows = products.filter((p) => num(vals[p.id]) !== num(orig[p.id])).map((p) => ({ store_id: sid, product_id: p.id, stock: num(vals[p.id]) }))
    if (!rows.length) return setMsg('Tidak ada perubahan')
    const { error } = await supabase.from('store_stock').upsert(rows, { onConflict: 'store_id,product_id' })
    if (error) return setMsg(error.message)
    setOrig({ ...vals }); setMsg(`${rows.length} stok disimpan`); reload()
  }
  if (!stores.length) return <div className="box text-sm">Belum ada toko. Tambahkan dulu di tab Toko.</div>
  return (
    <div className="box">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <b className="text-plum">Stok per toko</b>
        <select className="inp !w-auto" value={sid} onChange={(e) => setSid(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? '' : ' (nonaktif)'}</option>)}</select>
        <button className="btn ml-auto" onClick={save}>Simpan stok</button>
      </div>
      {msg && <p role="status" className="mb-2 text-sm">{msg}</p>}
      <table className="w-full text-left text-sm"><thead><tr><th>Produk</th><th className="w-32">Stok</th></tr></thead><tbody>
        {products.map((p) => (
          <tr key={p.id} className="border-t border-stone-100">
            <td className="py-1.5">{p.name}{!p.is_active && <span className="ml-1 text-xs text-stone-500">(nonaktif)</span>}</td>
            <td><input className="inp !py-1" type="number" min="0" value={vals[p.id] ?? '0'} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} /></td>
          </tr>))}
      </tbody></table>
    </div>
  )
}
function Rates() {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    supabase.from('delivery_tiers').select('*').order('max_km').then(({ data }) =>
      setRows((data ?? []).map((r) => ({ max_km: String(r.max_km), fee: String(r.fee) }))))
  }, [])
  if (!rows) return <p className="text-stone-500">Memuat…</p>
  const upd = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const sorted = rows.map((r) => +r.max_km).sort((a, b) => a - b)
  const from = (r) => { const i = sorted.indexOf(+r.max_km); return i > 0 ? sorted[i - 1] : 0 }
  const add = () => {
    const last = rows[rows.length - 1]
    setRows([...rows, { max_km: String((+last?.max_km || 0) + 1), fee: last?.fee ?? '5000' }])
  }
  const save = async (e) => {
    e.preventDefault(); setMsg('')
    const tiers = rows.map((r) => ({ max_km: +r.max_km, fee: +r.fee }))
    if (!tiers.length) return setMsg('Minimal satu tarif')
    if (tiers.some((t) => !(t.max_km > 0) || !(t.fee >= 0))) return setMsg('Batas km harus lebih dari 0 dan tarif tidak boleh negatif')
    if (new Set(tiers.map((t) => t.max_km)).size !== tiers.length) return setMsg('Ada batas km yang sama')
    const { error } = await supabase.rpc('save_delivery_tiers', { p_tiers: tiers })
    setMsg(error ? error.message : 'Tarif ongkir disimpan')
  }
  return (
    <form onSubmit={save} className="box grid max-w-xl gap-3">
      <b className="text-plum">Tarif ongkir per jarak (lewat jalan)</b>
      <p className="text-xs text-stone-500">Isi batas atas tiap rentang. Rentang bawah mengikuti baris sebelumnya. Batas terbesar adalah jarak antar maksimal; di luar itu pesanan ditolak. Perubahan hanya berlaku untuk pesanan baru.</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
          <span className="pb-2 text-sm font-bold">{from(r)}–{r.max_km || '?'} km</span>
          <label className="text-xs text-stone-500">Sampai (km)<input className="inp" type="number" min="0.1" step="0.1" required value={r.max_km} onChange={(e) => upd(i, 'max_km', e.target.value)} /></label>
          <label className="text-xs text-stone-500">Tarif (Rp)<input className="inp" type="number" min="0" step="500" required value={r.fee} onChange={(e) => upd(i, 'fee', e.target.value)} /></label>
          <button type="button" className="btn btn-alt" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Hapus</button>
        </div>
      ))}
      <div className="flex gap-2"><button type="button" className="btn btn-alt" onClick={add}>+ Rentang</button><button className="btn">Simpan tarif</button></div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </form>
  )
}

