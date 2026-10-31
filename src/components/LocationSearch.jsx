import { useState } from 'react'
import { geocode } from '../lib/geo'


export default function LocationSearch({ onPick, placeholder = 'Cari alamat atau nama tempat…', geo = false }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const search = async () => {
    if (q.trim().length < 3) return setMsg('Ketik minimal 3 huruf')
    setBusy(true); setMsg('')
    try {
      const r = await geocode(q)
      setRes(r)
      if (!r.length) setMsg('Tidak ditemukan. Tambahkan nama kecamatan atau kota.')
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  const here = () => {
    if (!navigator.geolocation) return setMsg('Peramban tidak mendukung lokasi')
    setBusy(true); setMsg('')
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); setRes([]); onPick({ label: 'Lokasi saya saat ini', lat: p.coords.latitude, lng: p.coords.longitude }) },
      () => { setBusy(false); setMsg('Izin lokasi ditolak atau gagal') },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <input className="inp" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }} />
        <button type="button" className="btn btn-alt" disabled={busy} onClick={search}>Cari</button>
        {geo && <button type="button" className="btn btn-alt whitespace-nowrap" disabled={busy} onClick={here}>📍 Lokasi saya</button>}
      </div>
      {msg && <p className="text-xs text-red-700">{msg}</p>}
      {res.map((r, i) => (
        <button type="button" key={i} className="rounded-xl border border-stone-200 bg-white p-2 text-left text-xs hover:bg-blush"
          onClick={() => { onPick(r); setRes([]); setQ('') }}>{r.label}</button>
      ))}
    </div>
  )
}