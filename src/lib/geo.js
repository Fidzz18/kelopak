// ---------- Jarak garis lurus (Haversine) ----------
const R = Math.PI / 180

export const km = (la1, lo1, la2, lo2) => {
  const a =
    Math.sin(((la2 - la1) * R) / 2) ** 2 +
    Math.cos(la1 * R) * Math.cos(la2 * R) * Math.sin(((lo2 - lo1) * R) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}

export const fmtKm = (x) => (x < 1 ? `${Math.round(x * 1000)} m` : `${x.toFixed(1)} km`)

export const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

// ---------- Geocoding: OpenStreetMap Nominatim (gratis) ----------
// Ganti isi fungsi ini jika nanti pakai layanan lain (LocationIQ, Mapbox, Google Places).
export async function geocode(q) {
  const r = await fetch(
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=id&q=' +
      encodeURIComponent(q),
  )
  if (!r.ok) throw new Error('Pencarian alamat gagal, coba lagi')
  return (await r.json()).map((x) => ({ label: x.display_name, lat: +x.lat, lng: +x.lon }))
}

// ---------- Rute jalan: OSRM ----------
const OSRM = import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org'

// Jarak dan waktu tempuh lewat jalan dari satu titik ke banyak toko (1 panggilan).
// Hasil: { [storeId]: { km, min } }. Toko yang tidak terjangkau lewat jalan tidak ada di hasil.
export async function routeMatrix(dest, stores) {
  if (!stores.length) return {}
  const pts = [dest, ...stores]
  const coords = pts.map((p) => `${p.lng},${p.lat}`).join(';')
  const r = await fetch(`${OSRM}/table/v1/driving/${coords}?sources=0&annotations=distance,duration`)
  if (!r.ok) throw new Error('Layanan rute tidak tersedia')
  const j = await r.json()
  if (j.code !== 'Ok') throw new Error('Rute tidak dapat dihitung')
  const out = {}
  stores.forEach((s, i) => {
    const m = j.distances?.[0]?.[i + 1]
    const t = j.durations?.[0]?.[i + 1]
    if (m != null) out[s.id] = { km: m / 1000, min: t != null ? Math.round(t / 60) : null }
  })
  return out
}

// Tarif untuk jarak km dari daftar rentang [{ max_km, fee }]; null jika di luar rentang.
export const feeFor = (tiers, km) => {
  const t = [...tiers].sort((a, b) => a.max_km - b.max_km).find((x) => km <= +x.max_km + 1e-9)
  return t ? +t.fee : null
}