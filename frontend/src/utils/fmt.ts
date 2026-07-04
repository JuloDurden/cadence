/** YYYY-MM-DD → JJ/MM/AAAA */
export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}
