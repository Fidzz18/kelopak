import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export const PAGE = 10

// Daftar pesanan berhalaman (10 per muat) + pencarian nomor pesanan + update realtime.
// userId diisi untuk pelanggan; kosongkan untuk admin (RLS yang membatasi).
export function useOrderList({ select, userId, name }) {
  const [rows, setRows] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [term, setTerm] = useState('')
  const loaded = useRef(0)   // jumlah baris yang sedang tampil
  const seq = useRef(0)      // membuang respons basi

  // Ambil take+1 baris mulai dari "from" (baris ekstra hanya untuk mendeteksi masih ada lagi)
  const fetchRows = useCallback((from, take) => {
    let q = supabase.from('orders').select(select).order('order_no', { ascending: false })
    if (userId) q = q.eq('user_id', userId)
    const t = term.trim()
    if (t) {
      const digits = t.replace(/\D/g, '')
      if (!digits || digits.length > 15) return Promise.resolve({ data: [], error: null })
      q = q.eq('order_no', Number(digits))
    }
    return q.range(from, from + take)
  }, [select, userId, term])

  // Muat ulang dari atas, tetapi mempertahankan jumlah baris yang sudah dimuat
  const reload = useCallback(async () => {
    const id = ++seq.current
    const take = Math.max(loaded.current, PAGE)
    const { data, error } = await fetchRows(0, take)
    if (id !== seq.current) return
    if (error) { setError(error.message); setRows((r) => r ?? []); return }
    setError('')
    const list = data ?? []
    setHasMore(list.length > take)
    setRows(list.slice(0, take))
  }, [fetchRows])

  useEffect(() => { loaded.current = rows?.length ?? 0 }, [rows])
  useEffect(() => { reload() }, [reload])

  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    const ch = supabase.channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => reloadRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => reloadRef.current())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [name])

  const loadMore = async () => {
    setLoadingMore(true)
    const id = seq.current
    const { data, error } = await fetchRows(loaded.current, PAGE)
    setLoadingMore(false)
    if (id !== seq.current) return
    if (error) return setError(error.message)
    const list = data ?? []
    setHasMore(list.length > PAGE)
    const add = list.slice(0, PAGE)
    setRows((r) => {
      const seen = new Set((r ?? []).map((x) => x.id))   // cegah baris dobel jika ada pesanan baru di tengah jalan
      return [...(r ?? []), ...add.filter((x) => !seen.has(x.id))]
    })
  }

  const search = (t) => { loaded.current = 0; setRows(null); setTerm(t) }

  return { rows, hasMore, loadingMore, error, term, search, loadMore, reload }
}