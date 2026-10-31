import { Route, Routes } from 'react-router-dom'
import { Layout, RequireAuth } from './components/ui.jsx'
import { Home, Catalog, ProductDetail } from './pages/Shop.jsx'
import { CartPage, Checkout, Orders } from './pages/Orders.jsx'
import { Login, Profile, ForgotPassword, ResetPassword } from './pages/Account.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="katalog" element={<Catalog />} />
        <Route path="produk/:id" element={<ProductDetail />} />
        <Route path="masuk" element={<Login />} />
        <Route path="lupa-sandi" element={<ForgotPassword />} />
        <Route path="atur-ulang-sandi" element={<ResetPassword />} />
        <Route element={<RequireAuth />}>
          <Route path="keranjang" element={<CartPage />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="pesanan" element={<Orders />} />
          <Route path="profil" element={<Profile />} />
        </Route>
        <Route element={<RequireAuth admin />}>
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<p>Halaman tidak ditemukan.</p>} />
      </Route>
    </Routes>
  )
}
