import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { supabase, rp } from '../lib/supabase'
import { useAuth } from '../context/Auth.jsx'
import { useCart } from '../context/Cart.jsx'

export function Layout() {
  const { user, profile, isAdmin } = useAuth()
  const { count } = useCart()
  const nav = useNavigate()
  const l = ({ isActive }) => `rounded-full px-3 py-1.5 text-sm ${isActive ? 'bg-blush font-bold text-plum' : ''}`
  return (
    <>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-stone-200 bg-[#fbf7f9] px-5 py-3">
        <Link to="/" className="mr-auto text-xl font-bold text-plum">🌸 Kelopak Jogja</Link>
        <nav className="flex flex-wrap gap-1">
          <NavLink to="/" end className={l}>Beranda</NavLink>
          <NavLink to="/katalog" className={l}>Katalog</NavLink>
          {user && !isAdmin && <NavLink to="/pesanan" className={l}>Pesanan Saya</NavLink>}
          {user && !isAdmin && <NavLink to="/keranjang" className={l}>Keranjang ({count})</NavLink>}
          {isAdmin && <NavLink to="/admin" className={l}>Admin</NavLink>}
          {user && <NavLink to="/profil" className={l}>Profil</NavLink>}
        </nav>
        {user
          ? <button className="btn btn-alt" onClick={async () => { await supabase.auth.signOut(); nav('/') }}>Keluar ({profile?.full_name?.split(' ')[0]})</button>
          : <Link to="/masuk" className="btn">Masuk</Link>}
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-6"><Outlet /></main>
    </>
  )
}

export function RequireAuth({ admin }) {
  const { user, isAdmin, loading, profileError, retryProfile } = useAuth()
  if (loading) return <p className="p-8 text-center text-stone-500">Memuat…</p>
  if (!user) return <Navigate to="/masuk" replace />
  if (profileError) return (
    <div className="box mx-auto mt-6 grid max-w-sm gap-2 text-sm">
      <p>Gagal memuat profil Anda. Periksa koneksi lalu coba lagi.</p>
      <div className="flex gap-2">
        <button className="btn" onClick={retryProfile}>Coba lagi</button>
        <button className="btn btn-alt" onClick={() => supabase.auth.signOut()}>Keluar</button>
      </div>
    </div>
  )
  if (admin && !isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}

export function ProductCard({ p }) {
  const { user } = useAuth()
  const { add } = useCart()
  const nav = useNavigate()
  const onAdd = async () => {
    if (!user) return nav('/masuk')
    try { await add(p) } catch (e) { alert(e.message) }
  }
  return (
    <div className="box flex flex-col gap-1 overflow-hidden !p-0">
      <Link to={`/produk/${p.id}`} className="grid h-40 place-items-center bg-blush text-6xl">
        {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" /> : '💐'}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link to={`/produk/${p.id}`} className="font-bold text-plum">{p.name}</Link>
        <span className="text-xs text-stone-500">{p.categories?.name}</span>
        <span className="font-bold text-peony">{rp(p.price)}</span>
        <span className={`text-xs ${p.stock <= 3 ? 'font-bold text-orange-700' : 'text-stone-500'}`}>{p.stock ? `Stok ${p.stock}` : 'Stok habis'}</span>
        <button className="btn mt-auto" disabled={!p.stock} onClick={onAdd}>Tambah ke keranjang</button>
      </div>
    </div>
  )
}
