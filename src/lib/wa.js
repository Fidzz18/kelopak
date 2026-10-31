// Nomor diubah ke format internasional (08xx -> 628xx). Pesan di-encode agar spasi, baris baru, dan # aman.
export const waLink = (phone, text) => {
  let n = String(phone ?? '').replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}