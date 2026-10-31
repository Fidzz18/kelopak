import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) { setProfile(null); setProfileError(false); return }
    let cancelled = false
    setProfileError(false)
    supabase.from('profiles').select('*').eq('id', uid).single().then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) { setProfile(null); setProfileError(true) } else setProfile(data)
    })
    return () => { cancelled = true }
  }, [uid, attempt])
  const value = {
    user: session?.user ?? null, profile, setProfile, profileError,
    retryProfile: () => setAttempt((n) => n + 1),
    loading: session === undefined || (!!uid && !profile && !profileError),
    isAdmin: profile?.role === 'admin',
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}