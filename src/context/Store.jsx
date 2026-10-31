import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

export function StoreProvider({ children }) {
  const [stores, setStores] = useState([])
  const [id, setId] = useState(() => { try { return localStorage.getItem('storeId') ?? '' } catch { return '' } })
  useEffect(() => {
    supabase.from('stores').select('id, name').eq('is_active', true).order('name').then(({ data }) => setStores(data ?? []))
  }, [])
  // jika pilihan tersimpan sudah tidak aktif, pakai toko pertama
  const storeId = stores.some((s) => s.id === id) ? id : (stores[0]?.id ?? '')
  const pick = (v) => { setId(v); try { localStorage.setItem('storeId', v) } catch { /* abaikan */ } }
  return <Ctx.Provider value={{ stores, storeId, pick }}>{children}</Ctx.Provider>
}