import { useState } from 'react'

export default function OrderSearch({ term, onSearch }) {
  const [v, setV] = useState(term)
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onSearch(v.trim()) }}>
      <input className="inp !w-48" inputMode="numeric" placeholder="Cari nomor pesanan" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn">Cari</button>
      {term && <button type="button" className="btn btn-alt" onClick={() => { setV(''); onSearch('') }}>Reset</button>}
    </form>
  )
}