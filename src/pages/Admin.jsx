import { useCallback, useEffect, useState } from 'react'
import { supabase, rp, STATUS, PAY } from '../lib/supabase'
import { Badge, ORDER_SEL } from './Orders.jsx'

const TABS = [['dash', 'Dasbor'], ['prod', 'Katalog'], ['ord', 'Pesanan'], ['pay', 'Verifikasi bayar'], ['cus', 'Pelanggan'], ['set', 'Pengaturan']]
const one = (x) => (Array.isArray(x) ? x[0] : x)

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
      <table className="w-full text-left text-sm"><thead><tr><th>Nama</th><th>Kategori</th><th>Harga</th><th>Stok</th><th>Aktif</th><th /></tr></thead><tbody>
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

function OrderList({ orders, run }) {
  return (
    <div className="box overflow-x-auto"><b className="text-plum">Semua pesanan</b>
      <table className="mt-2 w-full text-left text-sm"><thead><tr><th>#</th><th>Pemesan</th><th>Pengiriman</th><th>Total</th><th>Status</th></tr></thead><tbody>
        {orders.map((o) => { const s = one(o.shipping_details); return (
          <tr key={o.id} className="border-t border-stone-100 align-top"><td className="py-2">{o.order_no}</td>
            <td>{s?.recipient_name}<br /><span className="text-xs text-stone-500">{s?.phone} · {s?.address}</span>{o.notes && <><br /><i className="text-xs">“{o.notes}”</i></>}<br /><span className="text-xs text-stone-500">Akun: {o.profiles?.full_name}</span></td>
            <td>{s?.delivery_date}<br />{s?.delivery_time?.slice(0, 5)}</td><td>{rp(o.total_amount)}</td>
            <td><Badge s={o.status} />{!['cancelled', 'completed'].includes(o.status) && (
              <div className="mt-1 flex gap-1"><select className="inp !w-auto !py-1" value={o.status} onChange={(e) => run(supabase.from('orders').update({ status: e.target.value, updated_at: new Date().toISOString() }).eq('id', o.id))}>{['pending', 'paid', 'processing', 'shipped', 'completed'].map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}</select>
              {['pending', 'paid'].includes(o.status) && <button className="btn btn-alt" onClick={() => confirm('Batalkan pesanan dan kembalikan stok?') && run(supabase.rpc('cancel_order', { p_order: o.id }))}>Batalkan</button>}</div>)}</td></tr>) })}
      </tbody></table>
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
