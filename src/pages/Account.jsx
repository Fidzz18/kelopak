import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth.jsx'

export function Login() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [reg, setReg] = useState(false)
  const [f, setF] = useState({ name: '', email: '', pw: '' })
  const [msg, setMsg] = useState('')
  if (user) return <Navigate to="/" replace />
  const submit = async (e) => {
    e.preventDefault(); setMsg('')
    const { data, error } = reg
      ? await supabase.auth.signUp({ email: f.email, password: f.pw, options: { data: { full_name: f.name } } })
      : await supabase.auth.signInWithPassword({ email: f.email, password: f.pw })
    if (error) return setMsg(error.message)
    if (reg && !data.session) return setMsg('Pendaftaran berhasil. Cek email Anda untuk konfirmasi, lalu masuk.')
    nav('/')
  }
  return (
    <form onSubmit={submit} className="box mx-auto mt-6 grid max-w-sm gap-3">
      <h1 className="text-2xl font-bold text-plum">{reg ? 'Daftar akun' : 'Masuk'}</h1>
      {msg && <p role="alert" className="rounded-xl bg-blush p-2 text-sm">{msg}</p>}
      {reg && <input className="inp" placeholder="Nama lengkap" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
      <input className="inp" type="email" placeholder="Email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <input className="inp" type="password" placeholder="Kata sandi (min. 6 karakter)" minLength={6} required value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} />
      <button className="btn">{reg ? 'Daftar' : 'Masuk'}</button>
      {!reg && <Link to="/lupa-sandi" className="text-center text-sm text-plum underline">Lupa kata sandi?</Link>}
      <button type="button" className="text-sm text-plum underline" onClick={() => { setReg(!reg); setMsg('') }}>{reg ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>
    </form>
  )
}

export function Profile() {
  const { profile, setProfile, user } = useAuth()
  const [f, setF] = useState({ full_name: profile.full_name, phone: profile.phone ?? '' })
  const [msg, setMsg] = useState('')
  const save = async (e) => {
    e.preventDefault()
    const { data, error } = await supabase.from('profiles').update(f).eq('id', user.id).select().single()
    if (error) return setMsg(error.message)
    setProfile(data); setMsg('Profil disimpan')
  }
  return (
    <form onSubmit={save} className="box mx-auto grid max-w-sm gap-3">
      <h1 className="text-2xl font-bold text-plum">Profil</h1>
      <p className="text-sm text-stone-500">{user.email}</p>
      <input className="inp" required placeholder="Nama lengkap" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
      <input className="inp" placeholder="Nomor telepon" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <button className="btn">Simpan profil</button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </form>
  )
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/atur-ulang-sandi' })
    setBusy(false)
    setMsg(error ? error.message : 'Jika email terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim. Cek kotak masuk dan folder spam.')
  }
  return (
    <form onSubmit={submit} className="box mx-auto mt-6 grid max-w-sm gap-3">
      <h1 className="text-2xl font-bold text-plum">Lupa kata sandi</h1>
      <p className="text-sm text-stone-500">Masukkan email akun Anda. Kami kirim tautan untuk membuat kata sandi baru.</p>
      {msg && <p role="status" className="rounded-xl bg-blush p-2 text-sm">{msg}</p>}
      <input className="inp" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim tautan'}</button>
      <Link to="/masuk" className="text-center text-sm text-plum underline">Kembali ke halaman masuk</Link>
    </form>
  )
}

export function ResetPassword() {
  const { user, loading } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  if (loading) return <p className="p-8 text-center text-stone-500">Memuat…</p>
  if (!user) return (
    <div className="box mx-auto mt-6 max-w-sm text-sm">Tautan tidak valid atau sudah kedaluwarsa. <Link to="/lupa-sandi" className="font-bold text-peony">Minta tautan baru</Link></div>
  )
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setMsg(error.message)
    alert('Kata sandi berhasil diganti'); nav('/')
  }
  return (
    <form onSubmit={submit} className="box mx-auto mt-6 grid max-w-sm gap-3">
      <h1 className="text-2xl font-bold text-plum">Buat kata sandi baru</h1>
      {msg && <p role="alert" className="rounded-xl bg-red-50 p-2 text-sm text-red-800">{msg}</p>}
      <input className="inp" type="password" minLength={6} required placeholder="Kata sandi baru (min. 6 karakter)" value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="btn">Simpan kata sandi</button>
    </form>
  )
}
