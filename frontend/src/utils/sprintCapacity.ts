/**
 * Utilitaires sprint : dates, capacité, jours fériés français.
 */

// ── Calcul de la date de fin d'un sprint ─────────────────────────────────
/**
 * Retourne la date de fin d'un sprint = date de début + (semaines × 7) jours.
 * Utilise les composantes locales pour éviter le décalage UTC (UTC+1/+2 en France).
 * Ex : 2 semaines depuis lundi 15/06 → dimanche 28/06.
 */
export function computeSprintEndDate(startStr: string, weeks: number): string {
  const d = new Date(startStr + 'T00:00:00')
  d.setDate(d.getDate() + weeks * 7 - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/**
 * Calcul de la capacité effective d'un sprint après déduction des jours fériés français.
 * Portage fidèle de la logique effectiveMaxCap() + computeHolidaysFR() de cadence.html.
 */

// ── Calcul de Pâques (algorithme de Butcher/Meeus) ─────────────────────
function easterDate(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day   = ((h + l - 7 * m + 114) % 31) + 1
  // Date.UTC évite le décalage UTC+1/+2 (minuit local ≠ minuit UTC)
  return new Date(Date.UTC(year, month, day))
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

function isWorkday(d: Date): boolean {
  const dow = d.getUTCDay()
  return dow !== 0 && dow !== 6
}

// ── Jours fériés français pour une année ──────────────────────────────
export interface HolidayEntry {
  date: string     // YYYY-MM-DD
  name: string
  workday: boolean // false si tombe un samedi ou dimanche
}

export function frenchHolidays(year: number): HolidayEntry[] {
  const easter = easterDate(year)
  const fixed = [
    { d: new Date(Date.UTC(year, 0, 1)),  name: "Jour de l'An"      },
    { d: new Date(Date.UTC(year, 4, 1)),  name: 'Fête du Travail'   },
    { d: new Date(Date.UTC(year, 4, 8)),  name: 'Victoire 1945'     },
    { d: new Date(Date.UTC(year, 6, 14)), name: 'Fête Nationale'    },
    { d: new Date(Date.UTC(year, 7, 15)), name: 'Assomption'        },
    { d: new Date(Date.UTC(year, 10, 1)), name: 'Toussaint'         },
    { d: new Date(Date.UTC(year, 10,11)), name: 'Armistice 1918'    },
    { d: new Date(Date.UTC(year, 11,25)), name: 'Noël'              },
  ]
  const movable = [
    { d: addDays(easter, 1),  name: 'Lundi de Pâques'    },
    { d: addDays(easter, 39), name: 'Ascension'           },
    { d: addDays(easter, 50), name: 'Lundi de Pentecôte' },
  ]
  return [...fixed, ...movable]
    .sort((a, b) => a.d.getTime() - b.d.getTime())
    .map(h => ({
      date:    h.d.toISOString().slice(0, 10),
      name:    h.name,
      workday: isWorkday(h.d),
    }))
}

/** Jours fériés ouvrés tombant dans [startDate, endDate] (inclus). */
export function holidaysInRange(startDate: string, endDate: string): HolidayEntry[] {
  // Couvre les sprints à cheval sur deux années
  const y1 = parseInt(startDate.slice(0, 4), 10)
  const y2 = parseInt(endDate.slice(0, 4),   10)
  const all: HolidayEntry[] = frenchHolidays(y1)
  if (y2 !== y1) all.push(...frenchHolidays(y2))
  return all.filter(h => h.workday && h.date >= startDate && h.date <= endDate)
}

/**
 * Capacité effective du sprint = capacité nominale − SP perdus sur jours fériés.
 * Chaque jour férié ouvré retire la somme des spPerDay de tous les membres de l'équipe.
 *
 * @param sprint  Sprint avec startDate, endDate, capacity
 * @param team    Membres avec spPerDay
 */
export function effectiveCapacity(
  sprint: { capacity: number; startDate: string; endDate: string },
  team:   { spPerDay: number }[]
): number {
  if (!sprint.startDate || !sprint.endDate) return sprint.capacity
  const holidays    = holidaysInRange(sprint.startDate, sprint.endDate)
  const teamSpPerDay = team.reduce((sum, m) => sum + (m.spPerDay || 1), 0)
  const spLost      = holidays.length * teamSpPerDay
  return Math.max(0, sprint.capacity - spLost)
}
