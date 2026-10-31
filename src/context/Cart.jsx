import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth.jsx'
const Ctx = createContext(null)
export const useCart = () => useContext(Ctx)

// Keranjang disimpan di database (carts + cart_items) sehingga persisten antar perangkat.
export function CartProvider({ children }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const load = useCallback(async () => {
    if (!user) return setItems([])
    const { data } = await supabase.from('cart_items')
      .select('id, quantity, products(id, name, price, stock, image_url)')
    setItems(data ?? [])
  }, [user])
  useEffect(() => { load() }, [load])

  const cartId = async () => {
    const { data, error } = await supabase.from('carts').upsert({ user_id: user.id }, { onConflict: 'user_id' }).select('id').single()
    if (error) throw error
    return data.id
  }
  const add = async (product, n = 1) => {
    const cur = items.find((i) => i.products.id === product.id)?.quantity ?? 0
    const quantity = Math.min(cur + n, product.stock)
    if (quantity === cur) throw new Error('Jumlah sudah mencapai stok tersedia')
    const { error } = await supabase.from('cart_items')
      .upsert({ cart_id: await cartId(), product_id: product.id, quantity }, { onConflict: 'cart_id,product_id' })
    if (error) throw error
    await load()
  }
  const setQty = async (item, quantity) => {
    if (quantity <= 0) await supabase.from('cart_items').delete().eq('id', item.id)
    else await supabase.from('cart_items').update({ quantity: Math.min(quantity, item.products.stock) }).eq('id', item.id)
    await load()
  }
  const count = items.reduce((a, i) => a + i.quantity, 0)
  const total = items.reduce((a, i) => a + i.quantity * i.products.price, 0)
  return <Ctx.Provider value={{ items, add, setQty, count, total, reload: load }}>{children}</Ctx.Provider>
}
