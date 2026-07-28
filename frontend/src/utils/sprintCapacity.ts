/**
 * Utilitaires sprint : dates, capacité, jours fériés français.
 */
import type { TeamMember, Sprint, CadenceState, Absence } from '../types'

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

// ── Jours ouvrés entre deux dates (bornes incluses) ──────────────────────

function workingDaysCount(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  let n = 0; const d = new Date(s)
  while (d <= e) { const wd = d.getDay(); if (wd !== 0 && wd !== 6) n++; d.setDate(d.getDate() + 1) }
  return n
}

/**
 * SP perdus sur un sprint pour un membre donné à cause de ses absences,
 * bornées à la période du sprint. Factorisé pour être utilisé à la fois par
 * `effectiveCapacity()` (agrégat équipe) et `computeMemberCapacity()` (par membre).
 */
function memberAbsenceSpLoss(memberId: string, sprint: { startDate: string; endDate: string }, spPerDay: number, absences: Absence[]): number {
  const days = absences
    .filter(a => a.memberId === memberId)
    .reduce((tot, a) => {
      const os = a.start > sprint.startDate ? a.start : sprint.startDate
      const oe = a.end   < sprint.endDate   ? a.end   : sprint.endDate
      return os > oe ? tot : tot + workingDaysCount(os, oe)
    }, 0)
  return days * (spPerDay || 1)
}

/**
 * Capacité "brute" de l'équipe sur la durée d'un sprint = somme des spPerDay de
 * l'équipe × nombre de jours ouvrés, sans déduire fériés ni absences. Sert de valeur
 * de départ réaliste à la création d'un sprint (remplace l'ancienne capacité par
 * défaut fixe des Réglages dès que les dates du sprint sont connues).
 */
export function teamCapacity(
  team: { spPerDay: number }[],
  startDate: string,
  endDate: string
): number {
  if (!startDate || !endDate) return 0
  const wd = workingDaysCount(startDate, endDate)
  const teamSpPerDay = team.reduce((sum, m) => sum + (m.spPerDay || 1), 0)
  return Math.round(teamSpPerDay * wd)
}

/**
 * Capacité effective du sprint = capacité nominale (éditable à la main, `sprint.capacity`)
 * − SP perdus sur jours fériés − SP perdus sur absences de l'équipe.
 * Chaque jour férié ouvré retire la somme des spPerDay de tous les membres de l'équipe ;
 * chaque jour d'absence ne retire que le spPerDay du membre concerné (même logique que
 * `computeMemberCapacity()`, agrégée ici sur toute l'équipe).
 *
 * @param sprint    Sprint avec startDate, endDate, capacity
 * @param team      Membres avec id + spPerDay
 * @param absences  Absences de l'équipe (optionnel — omises, seuls les fériés sont déduits,
 *                   comme avant le Chantier L, pour ne pas casser un appel existant)
 */
export interface CapacityLossBreakdown {
  spLostHolidays: number
  spLostAbsences: number
  holidaysCount: number
}

/**
 * Détail des SP perdus sur un sprint, séparément pour les jours fériés et pour
 * les absences de l'équipe (2026-07-28) : `effectiveCapacity()` ne retournait
 * qu'un total agrégé, ce qui a mené à afficher "(-X après fériés)" dans
 * SprintColumn.tsx même quand la perte venait en réalité d'absences (aucun
 * jour férié dans la période du sprint) — voir docs/corrections.md.
 */
export function capacityLossBreakdown(
  sprint: { capacity: number; startDate: string; endDate: string },
  team:   { id: string; spPerDay: number }[],
  absences: Absence[] = []
): CapacityLossBreakdown {
  if (!sprint.startDate || !sprint.endDate) return { spLostHolidays: 0, spLostAbsences: 0, holidaysCount: 0 }
  const holidays       = holidaysInRange(sprint.startDate, sprint.endDate)
  const teamSpPerDay    = team.reduce((sum, m) => sum + (m.spPerDay || 1), 0)
  const spLostHolidays = holidays.length * teamSpPerDay
  const spLostAbsences = team.reduce((sum, m) => sum + memberAbsenceSpLoss(m.id, sprint, m.spPerDay, absences), 0)
  return { spLostHolidays, spLostAbsences, holidaysCount: holidays.length }
}

/** Texte court décrivant la ou les causes d'une perte de capacité ("fériés", "congés", "fériés et congés"). */
export function describeCapacityLoss(spLostHolidays: number, spLostAbsences: number): string {
  const hasHolidays = spLostHolidays > 0
  const hasAbsences = spLostAbsences > 0
  if (hasHolidays && hasAbsences) return 'fériés et congés'
  if (hasHolidays) return 'fériés'
  if (hasAbsences) return 'congés'
  return ''
}

export function effectiveCapacity(
  sprint: { capacity: number; startDate: string; endDate: string },
  team:   { id: string; spPerDay: number }[],
  absences: Absence[] = []
): number {
  if (!sprint.startDate || !sprint.endDate) return sprint.capacity
  const { spLostHolidays, spLostAbsences } = capacityLossBreakdown(sprint, team, absences)
  return Math.max(0, sprint.capacity - spLostHolidays - spLostAbsences)
}

// ── Capacité individuelle d'un membre sur un sprint ──────────────────────

/**
 * Capacité SP d'un membre sur le sprint donné,
 * en déduisant jours fériés et absences.
 */
export function computeMemberCapacity(member: TeamMember, sprint: Sprint, state: CadenceState): number {
  if (!sprint.startDate || !sprint.endDate) return 0
  const wd  = workingDaysCount(sprint.startDate, sprint.endDate)
  const hol = holidaysInRange(sprint.startDate, sprint.endDate).length
  const abs = state.absences
    .filter(a => a.memberId === member.id)
    .reduce((tot, a) => {
      const os = a.start > sprint.startDate ? a.start : sprint.startDate
      const oe = a.end   < sprint.endDate   ? a.end   : sprint.endDate
      return os > oe ? tot : tot + workingDaysCount(os, oe)
    }, 0)
  return Math.max(0, Math.round(member.spPerDay * (wd - hol - abs)))
}

/**
 * Retourne true si le membre est absent sur TOUTE la durée du sprint
 * (au moins une absence continue couvrant [startDate, endDate]).
 */
export function isMemberFullyAbsent(memberId: string, sprint: Sprint, state: CadenceState): boolean {
  if (!sprint.startDate || !sprint.endDate) return false
  return state.absences.some(a =>
    a.memberId === memberId &&
    a.start <= sprint.startDate &&
    a.end   >= sprint.endDate
  )
}

/**
 * Retourne true si le membre a une absence qui chevauche partiellement le sprint
 * (sans le couvrir entièrement — pour ça, utiliser isMemberFullyAbsent).
 * Un dev partiellement absent ne devrait être que co-assigné, jamais dev attitré.
 */
export function isMemberPartiallyAbsent(memberId: string, sprint: Sprint, state: CadenceState): boolean {
  if (!sprint.startDate || !sprint.endDate) return false
  if (isMemberFullyAbsent(memberId, sprint, state)) return false
  return state.absences.some(a =>
    a.memberId === memberId &&
    a.start <= sprint.endDate &&
    a.end   >= sprint.startDate
  )
}
