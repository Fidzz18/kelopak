import { useEffect, useState } from 'react'
import { supabase } from './supabase'
export const hhmm = (t, d) => (t ? String(t).slice(0, 5) : d)
export function useSettings() {
  const [s, setS] = useState(null)
  useEffect(() => { supabase.from('store_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => setS(data)) }, [])
  return s
}
