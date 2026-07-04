/** Calcule la date de Pâques (algorithme grégorien anonyme) */
function easterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month, day))
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

function isWorkday(d: Date): boolean {
  const dow = d.getUTCDay()
  return dow !== 0 && dow !== 6
}

export interface Holiday {
  date: string   // YYYY-MM-DD
  name: string
  workday: boolean
}

/** Jours fériés français pour une année donnée */
export function frenchHolidays(year: number): Holiday[] {
  const easter = easterDate(year)
  const fixed: { d: Date; name: string }[] = [
    { d: new Date(Date.UTC(year, 0,  1)), name: "Jour de l'An" },
    { d: new Date(Date.UTC(year, 4,  1)), name: 'Fête du Travail' },
    { d: new Date(Date.UTC(year, 4,  8)), name: 'Victoire 1945' },
    { d: new Date(Date.UTC(year, 6, 14)), name: 'Fête Nationale' },
    { d: new Date(Date.UTC(year, 7, 15)), name: 'Assomption' },
    { d: new Date(Date.UTC(year, 10,  1)), name: 'Toussaint' },
    { d: new Date(Date.UTC(year, 10, 11)), name: 'Armistice 1918' },
    { d: new Date(Date.UTC(year, 11, 25)), name: 'Noël' },
  ]
  const movable: { d: Date; name: string }[] = [
    { d: addDays(easter, 1),  name: 'Lundi de Pâques' },
    { d: addDays(easter, 39), name: 'Ascension' },
    { d: addDays(easter, 50), name: 'Lundi de Pentecôte' },
  ]
  return [...fixed, ...movable]
    .sort((a, b) => a.d.getTime() - b.d.getTime())
    .map(h => ({
      date: h.d.toISOString().split('T')[0],
      name: h.name,
      workday: isWorkday(h.d),
    }))
}

/** Nombre de jours ouvrés entre deux dates YYYY-MM-DD (inclusif) */
export function countWorkdays(start: string, end: string): number {
  const d = new Date(start)
  const endD = new Date(end)
  let count = 0
  while (d <= endD) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}
