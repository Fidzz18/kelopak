export const perStore = (p) =>
  (p.store_stock ?? [])
    .filter((r) => r.stores?.is_active && r.stock > 0)
    .sort((a, b) => a.stores.name.localeCompare(b.stores.name))

export const stockAt = (p, storeId) =>
  (p.store_stock ?? []).find((r) => r.stores?.id === storeId && r.stores.is_active)?.stock ?? 0