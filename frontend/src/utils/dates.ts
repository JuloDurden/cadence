/**
 * Formatage centralisé des dates pour toute l'application.
 * Toutes les dates sont affichées au format français JJ/MM/AAAA.
 */

/** JJ/MM/AAAA — format complet */
export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return ''
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** JJ/MM — format court (même année implicite, ex. plages de sprint) */
export function fmtDateShort(iso: string | undefined | null): string {
  if (!iso) return ''
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** JJ/MM/AAAA HH:MM — avec heure */
export function fmtDateTime(iso: string | undefined | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Ajoute N jours à une date ISO, retourne YYYY-MM-DD en heure locale. */
export function addDaysLocal(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localIso(d)
}

/** Formate une Date en YYYY-MM-DD (heure locale, sans décalage UTC). */
export function localIso(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Met à jour les dates du sprint à l'index `idx` et recalcule en cascade
 * tous les sprints suivants (start = end précédent + 1 jour, end = start + weeks×7 − 1).
 * Retourne un nouveau tableau de sprints.
 */
export function cascadeSprintDates<T extends { startDate: string; endDate: string }>(
  sprints: T[],
  idx: number,
  newStart: string,
  newEnd: string,
  weeks: number
): T[] {
  const result = [...sprints]
  result[idx] = { ...result[idx], startDate: newStart, endDate: newEnd }
  for (let i = idx + 1; i < result.length; i++) {
    const start = addDaysLocal(result[i - 1].endDate, 1)
    const end   = addDaysLocal(start, weeks * 7 - 1)
    result[i] = { ...result[i], startDate: start, endDate: end }
  }
  return result
}
