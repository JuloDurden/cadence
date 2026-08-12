// Phase 6 (roadmap v1), Compagnon IA, sous-chantier 4, etape 2/2 (2026-08-12) : portage cote
// backend de l'algorithme de generation de scenario d'Auto-planning (frontend/src/pages/
// AutoPlanningPage.tsx `generateScenario`/`sortItemsForScenario`, frontend/src/utils/
// autoPlanning.ts `topoSort`, frontend/src/utils/sprintCapacity.ts `effectiveCapacity`), pour que
// le Compagnon IA puisse produire EXACTEMENT le meme resultat qu'Auto-planning plutot que de
// raisonner librement (decision Julien, AskUserQuestion). Meme convention que le reste de ce
// dossier (backlogWrite.ts, ai.ts) : code duplique depuis le frontend, jamais partage entre les
// deux runtimes dans ce prototype - a tenir manuellement a jour si l'algorithme change cote
// frontend (voir aussi les commentaires "portage fidele" ci-dessous, qui renvoient a la fonction
// d'origine pour comparer).
//
// Bug corrige AU PASSAGE, dans les deux implementations en meme temps (decision Julien,
// AskUserQuestion) : `Item.deps` stocke des ID reels (ItemModal.tsx `addDep(i.id)`,
// `resolveDepKeys` ci-dessous), mais l'ordre de placement (topoSort / minIdx par dependance) les
// comparait a des CLES d'items - une comparaison qui ne correspondait jamais, rendant l'ordre de
// placement totalement aveugle aux dependances. Voir le commentaire de tete de `topoSort` cote
// frontend (utils/autoPlanning.ts) pour le detail. Le portage ci-dessous utilise directement les ID
// (deps) en interne, sans avoir besoin de la traduction id->cle que le correctif frontend a du
// faire pour rester compatible avec son `placedAt`/`successors` deja indexes par cle.

import type { CadenceState, Item, HierarchyNode, Sprint, Absence } from './backlogWrite'

// ── Dates ──────────────────────────────────────────────────────────────────────────────────────

function localIso(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDaysLocal(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localIso(d)
}

/** Portage fidele de utils/dates.ts fmtDate (JJ/MM/AAAA), pour des messages de violation identiques. */
function fmtDate(iso: string | undefined | null): string {
  if (!iso) return ''
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function estimateEndDate(slotIdx: number, existing: { endDate?: string }[], weeks: number): string | undefined {
  const lastReal = [...existing].reverse().find(s => s.endDate)
  if (!lastReal?.endDate) return undefined
  const lastRealIdx = existing.indexOf(lastReal)
  const ms = (slotIdx - lastRealIdx) * weeks * 7 * 24 * 3600 * 1000
  return localIso(new Date(new Date(lastReal.endDate + 'T00:00:00').getTime() + ms))
}

// ── Jours feries FR + capacite effective (portage fidele de utils/sprintCapacity.ts) ─────────────

function easterDate(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month, day))
}
function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86_400_000) }
function isWorkday(d: Date): boolean { const dow = d.getUTCDay(); return dow !== 0 && dow !== 6 }

interface HolidayEntry { date: string; workday: boolean }

function frenchHolidays(year: number): HolidayEntry[] {
  const easter = easterDate(year)
  const fixed = [
    new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 4, 1)), new Date(Date.UTC(year, 4, 8)),
    new Date(Date.UTC(year, 6, 14)), new Date(Date.UTC(year, 7, 15)), new Date(Date.UTC(year, 10, 1)),
    new Date(Date.UTC(year, 10, 11)), new Date(Date.UTC(year, 11, 25)),
  ]
  const movable = [addDays(easter, 1), addDays(easter, 39), addDays(easter, 50)]
  return [...fixed, ...movable].map(d => ({ date: d.toISOString().slice(0, 10), workday: isWorkday(d) }))
}

function holidaysInRange(startDate: string, endDate: string): HolidayEntry[] {
  const y1 = parseInt(startDate.slice(0, 4), 10), y2 = parseInt(endDate.slice(0, 4), 10)
  const all = frenchHolidays(y1)
  if (y2 !== y1) all.push(...frenchHolidays(y2))
  return all.filter(h => h.workday && h.date >= startDate && h.date <= endDate)
}

function workingDaysCount(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  let n = 0; const d = new Date(s)
  while (d <= e) { const wd = d.getDay(); if (wd !== 0 && wd !== 6) n++; d.setDate(d.getDate() + 1) }
  return n
}

function memberAbsenceSpLoss(memberId: string, sprint: { startDate: string; endDate: string }, spPerDay: number, absences: Absence[]): number {
  const days = absences
    .filter(a => a.memberId === memberId)
    .reduce((tot, a) => {
      const os = a.start > sprint.startDate ? a.start : sprint.startDate
      const oe = a.end < sprint.endDate ? a.end : sprint.endDate
      return os > oe ? tot : tot + workingDaysCount(os, oe)
    }, 0)
  return days * (spPerDay || 1)
}

/** Portage fidele de effectiveCapacity() (utils/sprintCapacity.ts). */
export function effectiveCapacity(sprint: { capacity: number; startDate: string; endDate: string }, team: { id: string; spPerDay: number }[], absences: Absence[] = []): number {
  if (!sprint.startDate || !sprint.endDate) return sprint.capacity
  const holidays = holidaysInRange(sprint.startDate, sprint.endDate)
  const teamSpPerDay = team.reduce((sum, m) => sum + (m.spPerDay || 1), 0)
  const spLostHolidays = holidays.length * teamSpPerDay
  const spLostAbsences = team.reduce((sum, m) => sum + memberAbsenceSpLoss(m.id, sprint, m.spPerDay, absences), 0)
  return Math.max(0, sprint.capacity - spLostHolidays - spLostAbsences)
}

// ── Topological sort (portage fidele, corrige - voir commentaire de tete de fichier) ─────────────

export function topoSort(items: Item[]): Item[] {
  const idSet = new Set(items.map(i => i.id))
  const inDeg: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  items.forEach(i => { inDeg[i.id] = 0; adj[i.id] = [] })
  items.forEach(i => {
    ;(i.deps ?? []).forEach(depId => {
      if (!idSet.has(depId)) return
      adj[depId] = adj[depId] ?? []; adj[depId].push(i.id)
      inDeg[i.id] = (inDeg[i.id] ?? 0) + 1
    })
  })
  const queue = items.filter(i => inDeg[i.id] === 0)
  const result: Item[] = []
  while (queue.length) {
    const node = queue.shift()!; result.push(node)
    ;(adj[node.id] ?? []).forEach(nid => {
      inDeg[nid]--
      if (inDeg[nid] === 0) { const it = items.find(i => i.id === nid); if (it) queue.push(it) }
    })
  }
  items.forEach(i => { if (!result.includes(i)) result.push(i) })
  return result
}

// ── Initiative effective d'un item (portage fidele de utils/hierarchyScore.ts) ───────────────────

export function getItemInitiativeId(item: { epicId?: string | null }, hierarchyNodes: HierarchyNode[]): string | undefined {
  if (!item.epicId) return undefined
  const node = hierarchyNodes.find(n => n.id === item.epicId)
  if (!node) return undefined
  if (node.level === 'initiative') return node.id
  if (node.level === 'epic' && node.parentId) return node.parentId
  return undefined
}

// ── Criteres (portage fidele d'AutoPlanningPage.tsx) ──────────────────────────────────────────────

export type CritId = 'priority' | 'client' | 'socle' | 'debt' | 'epic'
export const CRIT_IDS: CritId[] = ['priority', 'client', 'socle', 'debt', 'epic']
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function criterionDiff(a: Item, b: Item, cid: CritId, clientOrderIds: string[], planningClientIds: Set<string>): number {
  if (cid === 'priority') return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
  if (cid === 'client') {
    const filteredOrder = clientOrderIds.filter(id => planningClientIds.has(id))
    const ia = filteredOrder.indexOf(a.clientId), ib = filteredOrder.indexOf(b.clientId)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  }
  if (cid === 'socle') return (!a.clientId ? 0 : 1) - (!b.clientId ? 0 : 1)
  if (cid === 'debt') return (a.type === 'bug' ? 0 : 1) - (b.type === 'bug' ? 0 : 1)
  return 0
}

function compareByCriteria(a: Item, b: Item, criteria: CritId[], clientOrderIds: string[], planningClientIds: Set<string>): number {
  for (const cid of criteria) {
    const diff = criterionDiff(a, b, cid, clientOrderIds, planningClientIds)
    if (diff !== 0) return diff
  }
  return 0
}

/** Portage fidele de sortItemsForScenario() (AutoPlanningPage.tsx). */
export function sortItemsForPlan(items: Item[], criteria: CritId[], clientOrderIds: string[], planningClientIds: Set<string>): Item[] {
  const topo = topoSort(items)
  const nonEpicOrder = criteria.filter(cid => cid !== 'epic')
  const epicActive = criteria.includes('epic')

  const groupBest = new Map<string, Item>()
  if (epicActive) {
    for (const item of items) {
      const gid = item.epicId
      if (!gid) continue
      const cur = groupBest.get(gid)
      if (!cur || compareByCriteria(item, cur, nonEpicOrder, clientOrderIds, planningClientIds) < 0) groupBest.set(gid, item)
    }
  }

  const candidate = [...topo].sort((a, b) => {
    const dlRank = (i: Item) => i.deadline?.type === 'imposed' ? 0 : i.deadline?.type === 'negotiable' ? 1 : 2
    const ra = dlRank(a), rb = dlRank(b)
    if (ra !== rb) return ra - rb
    if (ra < 2) { const da = a.deadline?.date ?? '9999', db = b.deadline?.date ?? '9999'; if (da !== db) return da.localeCompare(db) }
    for (const cid of criteria) {
      let diff = 0
      if (cid === 'epic') {
        const ga = a.epicId, gb = b.epicId
        if (ga && gb && ga === gb) { diff = 0 } else {
          diff = (ga ? 0 : 1) - (gb ? 0 : 1)
          if (diff === 0) {
            const ra2 = ga ? (groupBest.get(ga) ?? a) : a
            const rb2 = gb ? (groupBest.get(gb) ?? b) : b
            diff = compareByCriteria(ra2, rb2, nonEpicOrder, clientOrderIds, planningClientIds)
          }
        }
      } else {
        diff = criterionDiff(a, b, cid, clientOrderIds, planningClientIds)
      }
      if (diff !== 0) return diff
    }
    return 0
  })

  if (!epicActive) return candidate

  const seen = new Set<string>()
  const clustered: Item[] = []
  for (const item of candidate) {
    if (seen.has(item.key)) continue
    seen.add(item.key)
    clustered.push(item)
    const gid = item.epicId
    if (!gid) continue
    for (const other of candidate) {
      if (other.epicId === gid && !seen.has(other.key)) { seen.add(other.key); clustered.push(other) }
    }
  }
  return clustered
}

// ── Plan : types d'entree ─────────────────────────────────────────────────────────────────────

export interface PlanCapacityOverride { sprintId: string; capacity: number; note?: string }
/** `id` synthetique ('virt-'+tempKey) genere par l'appelant (routes/ai.ts), pour que `deps` (ID
 *  reels ou synthetiques d'autres items fictifs de la meme demande) et le placement fonctionnent
 *  exactement comme des items reels, sans cas particulier dans l'algorithme ci-dessous. */
export interface PlanVirtualItem { id: string; tempKey: string; desc: string; sp: number; priority: string; clientId: string; type: string; deps?: string[] }
export interface PlanItemOverride { itemId: string; status?: string; priority?: string; sp?: number; deps?: string[] }

export interface PlanParams {
  criteria: CritId[]
  clientOrderIds?: string[]
  velocityFactor?: number
  capacityOverrides?: PlanCapacityOverride[]
  virtualItems?: PlanVirtualItem[]
  itemOverrides?: PlanItemOverride[]
  /** Ne planifier qu'a partir de ce sprint (inclus) - sprints ouverts avant lui laisses intacts. */
  fromSprintId?: string
}

export interface PlanPlacedItem { id: string; key: string; desc: string; sp: number; epicId?: string | null; isVirtual: boolean; tempKey?: string }
export interface PlanSlot { sprintId: string; label: string; cap: number; used: number; assigned: PlanPlacedItem[]; isNew: boolean; number: number; startDate?: string; endDate?: string }
export interface PlanViolation { key: string; desc: string; detail: string; type: 'deadline' | 'epic-split' | 'dep' }
export interface PlanResult { slots: PlanSlot[]; violations: PlanViolation[]; newSprintsCount: number }

/** Portage fidele de generateScenario() (AutoPlanningPage.tsx), sans les concepts propres a l'UI
 *  what-if (fork/merge de scenarios nommes, animation) - une seule generation "a plat" a chaque
 *  appel, coherent avec un chat sans etat (routes/ai.ts renvoie tout l'historique a chaque appel).
 */
export function computeSprintPlan(state: CadenceState, params: PlanParams): PlanResult {
  const criteria = params.criteria
  const clientOrderIds = params.clientOrderIds ?? []
  const velocityFactor = params.velocityFactor ?? 1
  const capacityOverrides = params.capacityOverrides ?? []
  const virtualItems = params.virtualItems ?? []
  const itemOverrides = params.itemOverrides ?? []

  const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
  const durationWeeks = state.settings?.sprintDuration ?? 2
  const defaultCapacity = state.settings?.defaultCapacity ?? 40
  const planningClientIds = new Set(state.clients.filter(c => !c.excludeFromPlanning).map(c => c.id))

  const effectiveItems: Item[] = state.items.map(item => {
    const ov = itemOverrides.find(o => o.itemId === item.id)
    if (!ov) return item
    return {
      ...item,
      ...(ov.status !== undefined && { status: ov.status }),
      ...(ov.priority !== undefined && { priority: ov.priority }),
      ...(ov.sp !== undefined && { sp: ov.sp }),
      ...(ov.deps !== undefined && { deps: ov.deps }),
    }
  })

  const virtAsItems: Item[] = virtualItems.map(v => ({
    id: v.id, key: v.tempKey.toUpperCase().slice(0, 8),
    desc: v.desc, sp: v.sp, priority: v.priority,
    clientId: v.clientId, type: v.type, status: 'todo',
    sprintId: null, assignees: [], tags: [],
    deps: v.deps ?? [], createdAt: new Date().toISOString(),
  }))
  const allItems = [...effectiveItems, ...virtAsItems]
  const keyById = new Map(allItems.map(it => [it.id, it.key]))

  const allSprints = [...state.sprints]
  const openSprints = allSprints.filter(sp => !sp.closed)

  const itemsToPlace = allItems.filter(i => {
    const sprintForItem = allSprints.find(s => s.id === i.sprintId)
    if (sprintForItem?.closed) return false
    if (doneSt.includes(i.status)) return false
    return true
  })

  const openNonDone = openSprints.filter(sp => {
    const spItems = effectiveItems.filter(i => i.sprintId === sp.id)
    return !(spItems.length > 0 && spItems.every(i => doneSt.includes(i.status)))
  })

  const slots: PlanSlot[] = openNonDone.map(sp => {
    const doneItemsInSlot = effectiveItems.filter(i => i.sprintId === sp.id && doneSt.includes(i.status))
    const usedByDone = doneItemsInSlot.reduce((s, i) => s + i.sp, 0)
    // Nom personnalise du sprint toujours inclus si present (2026-08-12) - contrairement a
    // Auto-planning qui ne l'affiche que sur le tout premier slot (`isCurrent`), utile ici sur
    // chaque sprint pour que le nom en langage naturel ("Sprint 3", "INTELLIGENCE"...) reste
    // identifiable partout dans le texte renvoye au chat, pas seulement pour le sprint en cours.
    const label = sp.label ? `Sprint ${sp.number} - ${sp.label}` : `Sprint ${sp.number}`
    const capOv = capacityOverrides.find(o => o.sprintId === sp.id)
    const baseCap = capOv ? capOv.capacity : (effectiveCapacity(sp, state.team as { id: string; spPerDay: number }[], state.absences ?? []) || defaultCapacity)
    const cap = Math.round(baseCap * velocityFactor)
    return { sprintId: sp.id, label, cap, used: usedByDone, assigned: [], isNew: false, number: sp.number, startDate: sp.startDate, endDate: sp.endDate }
  })

  const startPlaceIdx = params.fromSprintId ? Math.max(0, slots.findIndex(s => s.sprintId === params.fromSprintId)) : 0

  const sortedItems = sortItemsForPlan(itemsToPlace, criteria, clientOrderIds, planningClientIds)

  let newCount = 0
  function ensureSlot(idx: number) {
    while (idx >= slots.length) {
      newCount++
      const maxNum = slots.reduce((m, s) => Math.max(m, s.number), 0)
      const cap = Math.round(defaultCapacity * velocityFactor)
      const endDate = estimateEndDate(slots.length, slots, durationWeeks)
      const prevEnd = slots[slots.length - 1]?.endDate
      const startDate = prevEnd ? addDaysLocal(prevEnd, 3) : undefined
      slots.push({ sprintId: 'new-' + newCount, label: `Sprint ${maxNum + 1}`, cap, used: 0, assigned: [], isNew: true, number: maxNum + 1, startDate, endDate })
    }
  }

  const successors: Record<string, string[]> = {}
  sortedItems.forEach(item => { (item.deps ?? []).forEach(depId => {
    successors[depId] = successors[depId] ?? []; successors[depId].push(item.id)
  }) })

  const placedAt: Record<string, number> = {}
  const placedSet = new Set<string>()
  const violations: PlanViolation[] = []

  function toPlaced(item: Item): PlanPlacedItem {
    const virt = virtualItems.find(v => v.id === item.id)
    return { id: item.id, key: item.key, desc: item.desc, sp: item.sp, epicId: item.epicId, isVirtual: !!virt, tempKey: virt?.tempKey }
  }

  // Garde-fou anti-cycle (2026-08-12, meme raison que le portage frontend) : necessaire des lors
  // que placeOne() se rappelle lui-meme sur une dependance non encore placee.
  const placingNow = new Set<string>()

  function placeOne(item: Item) {
    if (placedSet.has(item.id)) return
    if (placingNow.has(item.id)) return
    placingNow.add(item.id)
    // Garantit qu'une dependance est toujours placee AVANT son dependant (retour Julien,
    // 2026-08-12), quel que soit l'ordre de sortedItems - portage fidele du meme correctif cote
    // frontend (AutoPlanningPage.tsx).
    for (const depId of item.deps ?? []) {
      if (placedSet.has(depId)) continue
      const depItem = allItems.find(it => it.id === depId)
      if (depItem) placeOne(depItem)
    }
    placingNow.delete(item.id)
    // Assouplissement (retour Julien, 2026-08-12) : une dependance peut desormais partager le MEME
    // sprint que son dependant (ordre interne au sprint) - `placedAt[depId]` plutot que
    // `placedAt[depId] + 1`. Voir la violation 'dep' plus bas.
    const minIdx = Math.max(startPlaceIdx, (item.deps ?? []).reduce((mx, depId) => placedAt[depId] !== undefined ? Math.max(mx, placedAt[depId]) : mx, 0))
    const hasDeadline = !!item.deadline?.date && item.deadline.type !== 'none'
    let placed = false
    for (let i = minIdx; i < minIdx + 200; i++) {
      ensureSlot(i)
      const sl = slots[i]
      const used = sl.used + sl.assigned.reduce((s, it) => s + it.sp, 0)
      if (used + item.sp <= sl.cap) {
        sl.assigned.push(toPlaced(item)); placedAt[item.id] = i; placedSet.add(item.id)
        if (hasDeadline && sl.endDate && item.deadline!.date < sl.endDate)
          violations.push({ key: item.key, desc: item.desc, type: 'deadline', detail: `deadline ${fmtDate(item.deadline!.date)}, place en Sprint ${sl.number}` })
        placed = true; break
      }
    }
    if (!placed) {
      ensureSlot(Math.max(minIdx, slots.length))
      const sl = slots[Math.max(minIdx, slots.length - 1)]
      sl.assigned.push(toPlaced(item)); placedAt[item.id] = slots.indexOf(sl); placedSet.add(item.id)
      if (hasDeadline) violations.push({ key: item.key, desc: item.desc, type: 'deadline', detail: `deadline ${fmtDate(item.deadline!.date)}, capacite insuffisante` })
    }
    const succs = (successors[item.id] ?? []).map(id => sortedItems.find(i => i.id === id)).filter((i): i is Item => !!i && !placedSet.has(i.id))
    if (succs.length === 1) placeOne(succs[0])
  }

  function placeGroupAtomically(groupItems: Item[]): boolean {
    // Pre-placement des dependances EXTERNES au groupe (2026-08-12) - jamais une dependance membre
    // de CE groupe (elle sera placee avec le reste juste en dessous, la sortir via placeOne
    // casserait l'atomicite Epic/Initiative).
    const groupIds = new Set(groupItems.map(it => it.id))
    for (const it of groupItems) {
      for (const depId of it.deps ?? []) {
        if (placedSet.has(depId) || groupIds.has(depId)) continue
        const depItem = allItems.find(x => x.id === depId)
        if (depItem) placeOne(depItem)
      }
    }
    const totalSp = groupItems.reduce((s, it) => s + it.sp, 0)
    // Assouplissement identique a placeOne (meme sprint autorise).
    const minIdx = Math.max(startPlaceIdx, ...groupItems.map(it =>
      (it.deps ?? []).reduce((mx, depId) => placedAt[depId] !== undefined ? Math.max(mx, placedAt[depId]) : mx, 0)
    ))
    for (let i = minIdx; i < minIdx + 200; i++) {
      ensureSlot(i)
      const sl = slots[i]
      const used = sl.used + sl.assigned.reduce((s, it) => s + it.sp, 0)
      if (used + totalSp <= sl.cap) {
        for (const it of groupItems) {
          sl.assigned.push(toPlaced(it)); placedAt[it.id] = i; placedSet.add(it.id)
          const hasDeadline = !!it.deadline?.date && it.deadline.type !== 'none'
          if (hasDeadline && sl.endDate && it.deadline!.date < sl.endDate)
            violations.push({ key: it.key, desc: it.desc, type: 'deadline', detail: `deadline ${fmtDate(it.deadline!.date)}, place en Sprint ${sl.number}` })
        }
        return true
      }
    }
    return false
  }

  if (criteria.includes('epic')) {
    const byInitiative = new Map<string, Item[]>()
    const initiativeOrder: string[] = []
    for (const item of sortedItems) {
      const initId = getItemInitiativeId(item, state.hierarchyNodes)
      if (!initId) continue
      if (!byInitiative.has(initId)) { byInitiative.set(initId, []); initiativeOrder.push(initId) }
      byInitiative.get(initId)!.push(item)
    }
    for (const initId of initiativeOrder) {
      const members = byInitiative.get(initId)!.filter(it => !placedSet.has(it.id))
      if (members.length > 0) placeGroupAtomically(members)
    }
  }

  if (criteria.includes('epic')) {
    const byGroup = new Map<string, Item[]>()
    const groupOrder: string[] = []
    for (const item of sortedItems) {
      const gid = item.epicId
      if (!gid) continue
      if (!byGroup.has(gid)) { byGroup.set(gid, []); groupOrder.push(gid) }
      byGroup.get(gid)!.push(item)
    }
    for (const gid of groupOrder) {
      const members = byGroup.get(gid)!.filter(it => !placedSet.has(it.id))
      if (members.length > 0) placeGroupAtomically(members)
    }
  }

  for (const item of sortedItems) { if (!placedSet.has(item.id)) placeOne(item) }

  // Violation 'dep' (retour Julien, 2026-08-12) : une dependance peut desormais partager le meme
  // sprint que son dependant - avertissement purement informatif (pas un vrai probleme), pour que
  // l'equipe sache qu'un sequencement interne au sprint est necessaire. Toujours verifiee
  // (contrairement a 'epic-split'), independamment des criteres actifs.
  for (const item of itemsToPlace) {
    const idx = placedAt[item.id]
    if (idx === undefined) continue
    const sameSprintDeps = (item.deps ?? []).filter(depId => placedAt[depId] === idx)
    if (sameSprintDeps.length === 0) continue
    const depKeys = sameSprintDeps.map(depId => keyById.get(depId) ?? depId)
    violations.push({ key: item.key, desc: item.desc, type: 'dep', detail: `meme sprint que sa dependance ${depKeys.join(', ')} : a sequencer en interne` })
  }

  if (criteria.includes('epic')) {
    const slotsByGroup = new Map<string, Set<number>>()
    for (const item of itemsToPlace) {
      if (!item.epicId) continue
      const idx = placedAt[item.id]
      if (idx === undefined) continue
      if (!slotsByGroup.has(item.epicId)) slotsByGroup.set(item.epicId, new Set())
      slotsByGroup.get(item.epicId)!.add(idx)
    }
    for (const [groupId, idxSet] of slotsByGroup) {
      if (idxSet.size <= 1) continue
      const node = state.hierarchyNodes.find(n => n.id === groupId)
      if (!node) continue
      const sprintLabels = [...idxSet].sort((x, y) => x - y).map(i => slots[i]?.label ?? `Sprint ${i + 1}`)
      violations.push({ key: node.key, desc: node.desc, type: 'epic-split', detail: `reparti sur ${idxSet.size} sprints (${sprintLabels.join(', ')})` })
    }

    const slotsByInitiative = new Map<string, Set<number>>()
    for (const item of itemsToPlace) {
      const initId = getItemInitiativeId(item, state.hierarchyNodes)
      if (!initId) continue
      const idx = placedAt[item.id]
      if (idx === undefined) continue
      if (!slotsByInitiative.has(initId)) slotsByInitiative.set(initId, new Set())
      slotsByInitiative.get(initId)!.add(idx)
    }
    for (const [initId, idxSet] of slotsByInitiative) {
      if (idxSet.size <= 1) continue
      const node = state.hierarchyNodes.find(n => n.id === initId)
      if (!node) continue
      const sprintLabels = [...idxSet].sort((x, y) => x - y).map(i => slots[i]?.label ?? `Sprint ${i + 1}`)
      violations.push({ key: node.key, desc: node.desc, type: 'epic-split', detail: `reparti sur ${idxSet.size} sprints (${sprintLabels.join(', ')})` })
    }
  }

  return { slots: slots.filter(s => s.assigned.length > 0 || s.used > 0), violations, newSprintsCount: newCount }
}

// ── Application reelle du plan (portage fidele de applyScenario(), AutoPlanningPage.tsx) ─────────

export interface ApplyResult {
  nextState: CadenceState
  newSprintsCount: number
  reassignedCount: number
  createdCount: number
}

export function applySprintPlan(
  state: CadenceState,
  plan: PlanResult,
  virtualItems: PlanVirtualItem[],
  keyCounters: Record<string, number>,
  uid: () => string,
  nextKeyForPrefix: (prefix: string, existingKeys: string[], counters: Record<string, number>) => { key: string; nextCounters: Record<string, number> },
): ApplyResult {
  const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
  let newItems: Item[] = state.items.map(i => {
    if (doneSt.includes(i.status)) return i
    const sp = state.sprints.find(s => s.id === i.sprintId)
    if (sp?.closed) return i
    return { ...i, sprintId: null }
  })
  const newSprints: Sprint[] = [...state.sprints]
  let newSprintsCount = 0
  let reassignedCount = 0
  let createdCount = 0
  let counters = keyCounters
  const allKeysList = [...state.items.map(i => i.key), ...state.hierarchyNodes.map(n => n.key)]

  for (const slot of plan.slots) {
    if (slot.isNew) {
      const maxNum = newSprints.reduce((m, s) => Math.max(m, s.number), 0)
      newSprints.push({ id: slot.sprintId, number: maxNum + 1, label: '', startDate: localIso(new Date()), endDate: localIso(new Date()), capacity: slot.cap, closed: false })
      newSprintsCount++
    }
    for (const placed of slot.assigned) {
      if (placed.isVirtual) {
        const virt = virtualItems.find(v => v.id === placed.id)
        if (!virt) continue
        const client = state.clients.find(c => c.id === virt.clientId)
        const prefix = client?.prefix ?? 'VRT'
        const { key, nextCounters } = nextKeyForPrefix(prefix, [...allKeysList, ...newItems.map(i => i.key)], counters)
        counters = nextCounters
        const newItem: Item = {
          id: uid(), key, desc: virt.desc, sp: virt.sp, priority: virt.priority,
          clientId: virt.clientId, type: virt.type, status: 'todo',
          sprintId: slot.sprintId.startsWith('new-') ? null : slot.sprintId,
          assignees: [], tags: [], deps: [], createdAt: new Date().toISOString(),
        }
        newItems = [...newItems, newItem]
        createdCount++
      } else {
        newItems = newItems.map(i => i.id === placed.id ? { ...i, sprintId: slot.sprintId, status: 'todo' } : i)
        reassignedCount++
      }
    }
  }

  return {
    nextState: { ...state, sprints: newSprints, items: newItems, itemKeyCounters: counters },
    newSprintsCount, reassignedCount, createdCount,
  }
}
