import { useState, useRef } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { ScenarioBranches } from '../components/auto-planning/ScenarioBranches'
import { effectiveCapacity } from '../utils/sprintCapacity'
import { fmtDate, fmtDateShort, localIso } from '../utils/dates'
import type { Item, Sprint, Scenario, ScenarioSlot, ScenarioViolation, VirtualItem, ScenarioItemOverride } from '../types'

// ── Icons ─────────────────────────────────────────────────────────────────
const ICO = {
  zap:        '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  check:      '<path d="M20 6 9 17l-5-5"/>',
  x:          '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  grip:       '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  warn:       '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  link:       '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  clock:      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  equal:      '<line x1="5" x2="19" y1="9" y2="9"/><line x1="5" x2="19" y1="15" y2="15"/>',
  plus:       '<path d="M5 12h14"/><path d="M12 5v14"/>',
  star:       '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  branch:     '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  merge:      '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 9v4a3 3 0 0 0 3 3h6"/><line x1="6" x2="6" y1="9" y2="21"/>',
  ghost:      '<path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/>',
  pencil:     '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  eye:        '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  trash:      '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  sliders:    '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/>',
}
function Ico({ d, size = 13, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

// ── Criteria config ────────────────────────────────────────────────────────
type CritId = 'priority' | 'client' | 'socle' | 'debt'
const CRIT_DEFS: Record<CritId, { title: string; desc: string }> = {
  priority: { title: 'Priorité',            desc: 'Les items critiques et high sont placés en premier.' },
  client:   { title: 'Importance client',   desc: 'Les clients les plus importants remplissent les premiers sprints.' },
  socle:    { title: 'Socle commun en tête',desc: 'Les items sans client associé sont prioritaires.' },
  debt:     { title: 'Dette technique',     desc: 'Les Bugs sont placés en priorité.' },
}
const CRIT_ORDER: CritId[] = ['priority', 'client', 'socle', 'debt']
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

// ── Scenario colors palette ────────────────────────────────────────────────
const SCENARIO_COLORS = ['#378ADD','#7F77DD','#1D9E75','#D85A30','#D4537E','#BA7517']

// ── Module-level cache ─────────────────────────────────────────────────────
let _scenarios: Scenario[] = []
let _activeScenarioId: string = ''

function uid() { return Math.random().toString(36).slice(2, 9) }

function makeCurrentScenario(): Scenario {
  return {
    id: 'current', name: 'État actuel', color: '#888780', type: 'current',
    criteriaActive: { priority: true }, criteriaOrder: [...CRIT_ORDER],
    clientOrder: [], itemOverrides: [], virtualItems: [],
    capacityOverrides: [], velocityFactor: 1,
    slots: [], violations: [], newCount: 0, generated: false, locked: false,
  }
}

function makeAutoScenario(name: string, color: string, clients: string[], base?: Partial<Scenario>): Scenario {
  return {
    id: uid(), name, color, type: 'auto',
    criteriaActive: base?.criteriaActive ?? { priority: true },
    criteriaOrder: base?.criteriaOrder ?? [...CRIT_ORDER],
    clientOrder: base?.clientOrder ?? [...clients],
    itemOverrides: base?.itemOverrides ?? [],
    virtualItems: base?.virtualItems ?? [],
    capacityOverrides: base?.capacityOverrides ?? [],
    velocityFactor: base?.velocityFactor ?? 1,
    forkFrom: base?.forkFrom,

    slots: [], violations: [], newCount: 0, generated: false, locked: false,
  }
}

// ── Topo sort (Kahn) ──────────────────────────────────────────────────────
function topoSort(items: Item[]): Item[] {
  const keySet = new Set(items.map(i => i.key))
  const inDeg: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  items.forEach(i => { inDeg[i.key] = 0; adj[i.key] = [] })
  items.forEach(i => {
    (i.deps ?? []).forEach(dk => {
      if (!keySet.has(dk)) return
      adj[dk] = adj[dk] ?? []; adj[dk].push(i.key)
      inDeg[i.key] = (inDeg[i.key] ?? 0) + 1
    })
  })
  const queue = items.filter(i => inDeg[i.key] === 0)
  const result: Item[] = []
  while (queue.length) {
    const node = queue.shift()!; result.push(node)
    ;(adj[node.key] ?? []).forEach(nk => {
      inDeg[nk]--
      if (inDeg[nk] === 0) { const it = items.find(i => i.key === nk); if (it) queue.push(it) }
    })
  }
  items.forEach(i => { if (!result.includes(i)) result.push(i) })
  return result
}

function estimateEndDate(slotIdx: number, existing: ScenarioSlot[], weeks: number): string | undefined {
  const lastReal = [...existing].reverse().find(s => s.endDate)
  if (!lastReal?.endDate) return undefined
  const lastRealIdx = existing.indexOf(lastReal)
  const ms = (slotIdx - lastRealIdx) * weeks * 7 * 24 * 3600 * 1000
  return localIso(new Date(new Date(lastReal.endDate + 'T00:00:00').getTime() + ms))
}

// ── Component ─────────────────────────────────────────────────────────────
export function AutoPlanningPage() {
  const { state, dispatch, saveToServer } = useCadence()

  // ── Init module-level cache if empty ──────────────────────────────────
  if (_scenarios.length === 0) {
    const current = makeCurrentScenario()
    const scA = makeAutoScenario('Scénario A', SCENARIO_COLORS[0], state.clients.map(c => c.id))
    _scenarios = [current, scA]
    _activeScenarioId = scA.id
  }

  const [, forceUpdate] = useState(0)
  const bump = () => forceUpdate(n => n + 1)

  const [activeId,  setActiveId]  = useState(_activeScenarioId)
  const [compareId, setCompareId] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  // Item override popup
  const [overrideTarget, setOverrideTarget] = useState<{ scenarioId: string; itemId: string } | null>(null)
  // Virtual item form
  const [virtTarget, setVirtTarget] = useState<{ scenarioId: string; sprintId: string } | null>(null)
  // Capacity panel open
  const [showCap, setShowCap] = useState(false)
  // Criteria DnD
  const [dragCritIdx, setDragCritIdx] = useState<number | null>(null)
  const [dragOverCritIdx, setDragOverCritIdx] = useState<number | null>(null)
  // Client DnD
  const [dragClientIdx, setDragClientIdx] = useState<number | null>(null)
  const [dragOverClientIdx, setDragOverClientIdx] = useState<number | null>(null)

  function getScenario(id: string) { return _scenarios.find(s => s.id === id)! }
  const active = getScenario(activeId)
  const planningClientIds = new Set(state.clients.filter(c => !c.excludeFromPlanning).map(c => c.id))

  // ── Mutate scenario helper (immutable update in _scenarios array) ───────
  function updateScenario(id: string, patch: Partial<Scenario>) {
    _scenarios = _scenarios.map(s => s.id === id ? { ...s, ...patch } : s)
    bump()
  }

  // ── Generate for one scenario ──────────────────────────────────────────
  function generateScenario(sc: Scenario) {
    if (sc.type === 'current') { buildCurrentState(sc); return }

    const doneSt       = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
    const durationWeeks = state.settings.sprintDuration ?? 2
    const epicIds       = new Set(state.items.filter(i => i.epicId).map(i => i.epicId!))

    // Apply item overrides: build effective items
    const effectiveItems: Item[] = state.items.map(item => {
      const ov = sc.itemOverrides.find(o => o.itemId === item.id)
      if (!ov) return item
      return {
        ...item,
        ...(ov.statusOverride   !== undefined && { status:   ov.statusOverride }),
        ...(ov.priorityOverride !== undefined && { priority: ov.priorityOverride }),
        ...(ov.spOverride       !== undefined && { sp:       ov.spOverride }),
        ...(ov.depsOverride     !== undefined && { deps:     ov.depsOverride }),
      }
    })

    // Add virtual items (treat as real items for placement)
    const virtAsItems: Item[] = sc.virtualItems.map(v => ({
      id: v.id, key: v.id.toUpperCase().slice(0, 8),
      desc: v.desc, sp: v.sp, priority: v.priority,
      clientId: v.clientId, type: v.type, status: v.status,
      sprintId: null, assignees: [], tags: [],
      deps: v.deps ?? [], createdAt: new Date().toISOString(),
    }))
    const allItems = [...effectiveItems, ...virtAsItems]

    // For forked scenarios: determine which sprints are inherited
    const forkIdx = sc.forkFrom?.fromSprintIndex ?? 0
    const allSprints = [...state.sprints]
    const openSprints = allSprints.filter(sp => !sp.closed)

    // Items to place: filter out done, closed-sprint, epic-parents
    const itemsToPlace = allItems.filter(i => {
      const sprintForItem = allSprints.find(s => s.id === i.sprintId)
      if (sprintForItem?.closed) return false
      if (doneSt.includes(i.status)) return false
      if (i.type === 'epic' && epicIds.has(i.id)) return false
      return true
    })

    // Build slot array
    const openNonDone = openSprints.filter(sp => {
      const spItems = effectiveItems.filter(i => i.sprintId === sp.id)
      return !(spItems.length > 0 && spItems.every(i => doneSt.includes(i.status)))
    })

    const slots: ScenarioSlot[] = openNonDone.map((sp, idx) => {
      const doneItemsInSlot = effectiveItems
        .filter(i => i.sprintId === sp.id && doneSt.includes(i.status))
      const usedByDone = doneItemsInSlot.reduce((s, i) => s + i.sp, 0)
      const isCurrent = idx === 0
      const label = isCurrent && sp.label ? `Sprint ${sp.number} – ${sp.label}` : `Sprint ${sp.number}`

      // Capacity: check override then effectiveCapacity, then apply velocity factor
      const capOv = sc.capacityOverrides.find(o => o.sprintId === sp.id)
      const baseCap = capOv
        ? capOv.capacity
        : (effectiveCapacity(sp, state.team) || state.settings.defaultCapacity)
      const cap = Math.round(baseCap * sc.velocityFactor)

      return {
        sprintId: sp.id, label, cap,
        used: usedByDone, usedItems: doneItemsInSlot,
        assigned: [], isNew: false, number: sp.number,
        startDate: sp.startDate, endDate: sp.endDate,
      }
    })

    // For forked scenarios, copy parent's slot assignments up to forkIdx
    if (sc.forkFrom) {
      const parent = _scenarios.find(s => s.id === sc.forkFrom!.sourceScenarioId)
      if (parent?.generated) {
        for (let i = 0; i < Math.min(forkIdx, slots.length, parent.slots.length); i++) {
          slots[i].assigned = [...parent.slots[i].assigned]
          slots[i].used     = parent.slots[i].used
        }
      }
    }

    // Sort items (only for unfrozen portion)
    const sortedItems = sortItemsForScenario(itemsToPlace, sc)

    let newCount = 0
    function ensureSlot(idx: number) {
      while (idx >= slots.length) {
        newCount++
        const maxNum = slots.reduce((m, s) => Math.max(m, s.number), 0)
        const cap = Math.round((state.settings.defaultCapacity ?? 40) * sc.velocityFactor)
        const endDate = estimateEndDate(slots.length, slots, durationWeeks)
        const prevEnd = slots[slots.length - 1]?.endDate
        const startDate = prevEnd
          ? localIso(new Date(new Date(prevEnd + 'T00:00:00').getTime() + 3 * 24 * 3600 * 1000))
          : undefined
        slots.push({ sprintId: 'new-' + newCount, label: `Sprint ${maxNum + 1}`, cap, used: 0, usedItems: [], assigned: [], isNew: true, number: maxNum + 1, startDate, endDate })
      }
    }

    const successors: Record<string, string[]> = {}
    sortedItems.forEach(item => {
      (item.deps ?? []).forEach(dk => {
        successors[dk] = successors[dk] ?? []; successors[dk].push(item.key)
      })
    })

    const placedAt: Record<string, number> = {}
    const placedSet = new Set<string>()
    const violations: ScenarioViolation[] = []
    const startPlaceIdx = sc.forkFrom ? forkIdx : 0

    // Pre-seed placedSet with items already in locked slots
    if (sc.forkFrom) {
      for (let i = 0; i < startPlaceIdx && i < slots.length; i++) {
        slots[i].assigned.forEach(item => {
          placedAt[('key' in item ? (item as Item).key : item.id)] = i
          placedSet.add('key' in item ? (item as Item).key : item.id)
        })
      }
    }

    function placeOne(item: Item) {
      if (placedSet.has(item.key)) return
      const minIdx = Math.max(
        startPlaceIdx,
        (item.deps ?? []).reduce((mx, dk) => {
          return placedAt[dk] !== undefined ? Math.max(mx, placedAt[dk] + 1) : mx
        }, 0)
      )
      const hasDeadline = !!item.deadline?.date && item.deadline.type !== 'none'
      let placed = false
      for (let i = minIdx; i < minIdx + 200; i++) {
        ensureSlot(i)
        const sl = slots[i]
        const used = sl.used + sl.assigned.reduce((s, it) => s + it.sp, 0)
        if (used + item.sp <= sl.cap) {
          sl.assigned.push(item); placedAt[item.key] = i; placedSet.add(item.key)
          if (hasDeadline && sl.endDate && item.deadline!.date < sl.endDate) {
            violations.push({ key: item.key, desc: item.desc, type: 'deadline',
              detail: `deadline ${fmtDate(item.deadline!.date)} — placé en Sprint ${sl.number}` })
          }
          placed = true; break
        }
      }
      if (!placed) {
        ensureSlot(Math.max(minIdx, slots.length))
        const sl = slots[Math.max(minIdx, slots.length - 1)]
        sl.assigned.push(item); placedAt[item.key] = slots.indexOf(sl); placedSet.add(item.key)
        if (hasDeadline)
          violations.push({ key: item.key, desc: item.desc, type: 'deadline', detail: `deadline ${fmtDate(item.deadline!.date)} — capacité insuffisante` })
      }
      const succs = (successors[item.key] ?? [])
        .map(k => sortedItems.find(i => i.key === k))
        .filter((i): i is Item => !!i && !placedSet.has(i.key))
      if (succs.length === 1) placeOne(succs[0])
    }

    for (const item of sortedItems) {
      if (!placedSet.has(item.key)) placeOne(item)
    }

    updateScenario(sc.id, {
      slots: slots.filter(s => s.assigned.length > 0 || !s.isNew),
      newCount, violations, generated: true,
    })
  }

  function buildCurrentState(sc: Scenario) {
    const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
    const slots: ScenarioSlot[] = state.sprints
      .filter(sp => !sp.closed)
      .map((sp, idx) => {
        const spItems    = state.items.filter(i => i.sprintId === sp.id && !doneSt.includes(i.status))
        const doneItems  = state.items.filter(i => i.sprintId === sp.id &&  doneSt.includes(i.status))
        const isCurrent  = idx === 0
        const label      = isCurrent && sp.label ? `Sprint ${sp.number} – ${sp.label}` : `Sprint ${sp.number}`
        const cap        = effectiveCapacity(sp, state.team) || state.settings.defaultCapacity
        const used       = doneItems.reduce((s, i) => s + i.sp, 0)
        return { sprintId: sp.id, label, cap, used, usedItems: doneItems, assigned: spItems, isNew: false, number: sp.number, startDate: sp.startDate, endDate: sp.endDate }
      })
      .filter(s => s.assigned.length > 0 || (s.usedItems?.length ?? 0) > 0)
    updateScenario(sc.id, { slots, generated: true, newCount: 0, violations: [] })
  }

  function sortItemsForScenario(items: Item[], sc: Scenario): Item[] {
    const topo = topoSort(items)
    const activeOrder = sc.criteriaOrder.filter(id => sc.criteriaActive[id])
    return topo.sort((a, b) => {
      const dlRank = (i: Item) => i.deadline?.type === 'imposed' ? 0 : i.deadline?.type === 'negotiable' ? 1 : 2
      const ra = dlRank(a), rb = dlRank(b)
      if (ra !== rb) return ra - rb
      if (ra < 2) {
        const da = a.deadline?.date ?? '9999', db = b.deadline?.date ?? '9999'
        if (da !== db) return da.localeCompare(db)
      }
      for (const cid of activeOrder) {
        let diff = 0
        if (cid === 'priority') diff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
        else if (cid === 'client') {
          const filteredOrder = sc.clientOrder.filter(id => planningClientIds.has(id))
          const ia = filteredOrder.indexOf(a.clientId), ib = filteredOrder.indexOf(b.clientId)
          diff = (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
        }
        else if (cid === 'socle') diff = (!a.clientId ? 0 : 1) - (!b.clientId ? 0 : 1)
        else if (cid === 'debt')  diff = (a.type === 'bug' ? 0 : 1) - (b.type === 'bug' ? 0 : 1)
        if (diff !== 0) return diff
      }
      return 0
    })
  }

  // ── Add / remove scenarios ─────────────────────────────────────────────
  function addScenario() {
    const idx = _scenarios.filter(s => s.type !== 'current').length
    const color = SCENARIO_COLORS[idx % SCENARIO_COLORS.length]
    const name = `Scénario ${String.fromCharCode(65 + idx)}`
    const sc = makeAutoScenario(name, color, state.clients.map(c => c.id))
    _scenarios = [..._scenarios, sc]
    _activeScenarioId = sc.id
    setActiveId(sc.id)
    bump()
  }

  function removeScenario(id: string) {
    if (id === 'current') return
    _scenarios = _scenarios.filter(s => s.id !== id)
    const next = _scenarios.find(s => s.type !== 'current') ?? _scenarios[0]
    _activeScenarioId = next.id
    setActiveId(next.id)
    bump()
  }

  function forkScenario(sourceId: string, fromSprintIndex: number) {
    const source = getScenario(sourceId)
    const idx = _scenarios.filter(s => s.type !== 'current').length
    const color = SCENARIO_COLORS[idx % SCENARIO_COLORS.length]
    const name = `${source.name} (fork S${fromSprintIndex + 1})`
    const sc = makeAutoScenario(name, color, state.clients.map(c => c.id), {
      criteriaActive: { ...source.criteriaActive },
      criteriaOrder:  [...source.criteriaOrder],
      clientOrder:    [...source.clientOrder],
      velocityFactor: source.velocityFactor,
      forkFrom: { sourceScenarioId: sourceId, fromSprintIndex },
    })
    _scenarios = [..._scenarios, sc]
    _activeScenarioId = sc.id
    setActiveId(sc.id)
    bump()
  }


  // ── Apply scenario to DB ───────────────────────────────────────────────
  function applyScenario(sc: Scenario) {
    if (!sc.generated) return
    const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
    let newItems: Item[] = state.items.map(i => {
      if (doneSt.includes(i.status)) return i
      const sp = state.sprints.find(s => s.id === i.sprintId)
      if (sp?.closed) return i
      return { ...i, sprintId: null }
    })
    const newSprints: Sprint[] = [...state.sprints]
    for (const slot of sc.slots) {
      if (slot.isNew) {
        const maxNum = newSprints.reduce((m, s) => Math.max(m, s.number), 0)
        newSprints.push({ id: slot.sprintId, number: maxNum + 1, label: '', startDate: localIso(new Date()), endDate: localIso(new Date()), capacity: slot.cap, closed: false })
      }
      slot.assigned.forEach(item => {
        if (item.id.startsWith('virt-')) {
          // Convertir l'item fictif en vrai item
          const virt = sc.virtualItems.find(v => v.id === item.id)
          if (!virt) return
          const client   = state.clients.find((c: any) => c.id === virt.clientId)
          const prefix   = client?.prefix ?? 'VRT'
          // Max global sur tous les items (tous préfixes) pour éviter les doublons de numéro
          const maxNum   = newItems
            .reduce((m, i) => { const n = parseInt(i.key.split('-').pop() ?? '0', 10); return isNaN(n) ? m : Math.max(m, n) }, 0)
          const newItem: Item = {
            id: uid(), key: `${prefix}-${String(maxNum + 1).padStart(3, '0')}`,
            desc: virt.desc, sp: virt.sp, priority: virt.priority,
            clientId: virt.clientId, type: virt.type, status: 'todo',
            sprintId: slot.sprintId.startsWith('new-') ? null : slot.sprintId,
            assignees: [], tags: [], deps: virt.deps ?? [],
            createdAt: new Date().toISOString(),
          }
          newItems = [...newItems, newItem]
        } else {
          newItems = newItems.map(i => i.id === (item as Item).id ? { ...i, sprintId: slot.sprintId, status: 'todo' } : i)
        }
      })
    }
    const newState = { ...state, sprints: newSprints, items: newItems }
    dispatch({ type: 'SET_STATE', payload: newState })
    saveToServer(newState)
  }

  // ── Item override helpers ──────────────────────────────────────────────
  function getOverride(sc: Scenario, itemId: string): ScenarioItemOverride | undefined {
    return sc.itemOverrides.find(o => o.itemId === itemId)
  }
  function setOverride(scId: string, itemId: string, patch: Partial<ScenarioItemOverride>) {
    const sc = getScenario(scId)
    const existing = sc.itemOverrides.find(o => o.itemId === itemId)
    const overrides = existing
      ? sc.itemOverrides.map(o => o.itemId === itemId ? { ...o, ...patch } : o)
      : [...sc.itemOverrides, { itemId, ...patch }]
    updateScenario(scId, { itemOverrides: overrides, generated: false })
  }
  function removeOverride(scId: string, itemId: string) {
    const sc = getScenario(scId)
    updateScenario(scId, { itemOverrides: sc.itemOverrides.filter(o => o.itemId !== itemId), generated: false })
  }

  // ── Virtual item helpers ───────────────────────────────────────────────
  function addVirtualItem(scId: string, data: Omit<VirtualItem, 'id' | 'scenarioId'>) {
    const sc = getScenario(scId)
    const virt: VirtualItem = { id: 'virt-' + uid(), scenarioId: scId, ...data }
    updateScenario(scId, { virtualItems: [...sc.virtualItems, virt], generated: false })
    setVirtTarget(null)
  }
  function removeVirtualItem(scId: string, virtId: string) {
    const sc = getScenario(scId)
    updateScenario(scId, { virtualItems: sc.virtualItems.filter(v => v.id !== virtId), generated: false })
  }

  // ── Criteria DnD helpers ───────────────────────────────────────────────
  function critDrop(scId: string, toIdx: number) {
    if (dragCritIdx === null || dragCritIdx === toIdx) return
    const sc = getScenario(scId)
    const arr = [...sc.criteriaOrder]
    const [el] = arr.splice(dragCritIdx, 1); arr.splice(toIdx, 0, el)
    updateScenario(scId, { criteriaOrder: arr, generated: false })
    setDragCritIdx(null); setDragOverCritIdx(null)
  }
  function toggleCrit(scId: string, critId: string, checked: boolean) {
    const sc = getScenario(scId)
    const newActive = { ...sc.criteriaActive, [critId]: checked }
    let newOrder = [...sc.criteriaOrder]
    const currentIdx = newOrder.indexOf(critId)

    if (checked) {
      // Remonter juste après le dernier coché au-dessus
      if (currentIdx > 0) {
        let insertAfter = -1
        for (let i = 0; i < currentIdx; i++) {
          if (sc.criteriaActive[newOrder[i]]) insertAfter = i
        }
        if (insertAfter < currentIdx - 1) {
          newOrder.splice(currentIdx, 1)
          newOrder.splice(insertAfter + 1, 0, critId)
        }
      }
    } else {
      // Descendre juste après le dernier critère encore coché
      let lastCheckedIdx = -1
      for (let i = 0; i < newOrder.length; i++) {
        if (i !== currentIdx && newActive[newOrder[i]]) lastCheckedIdx = i
      }
      if (lastCheckedIdx > currentIdx) {
        newOrder.splice(currentIdx, 1)
        // après le splice, lastCheckedIdx est le bon index d'insertion (décalé de -1)
        newOrder.splice(lastCheckedIdx, 0, critId)
      }
    }

    updateScenario(scId, { criteriaActive: newActive, criteriaOrder: newOrder, generated: false })
  }
  function clientDrop(scId: string, toIdx: number) {
    if (dragClientIdx === null || dragClientIdx === toIdx) return
    const sc = getScenario(scId)
    const arr = [...sc.clientOrder]
    const [el] = arr.splice(dragClientIdx, 1); arr.splice(toIdx, 0, el)
    updateScenario(scId, { clientOrder: arr, generated: false })
    setDragClientIdx(null); setDragOverClientIdx(null)
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  const doneSt2      = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
  const pendingItems = state.items.filter(i => !doneSt2.includes(i.status) && !state.sprints.find(s => s.id === i.sprintId)?.closed)
  const pendingSP    = pendingItems.reduce((s, i) => s + i.sp, 0)
  const openSprints  = state.sprints.filter(s => !s.closed).length

  // Sprint count for the graph (max of open sprints + new slots across all scenarios)
  const graphSprintCount = Math.max(
    openSprints,
    ..._scenarios.filter(s => s.generated).map(s => s.slots.length)
  )

  const CTRL: React.CSSProperties = { height: 30, border: '1px solid var(--border)', borderRadius: 7, backgroundColor: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }
  const CTRL_PRIMARY: React.CSSProperties  = { ...CTRL, border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: 600 }
  const CTRL_SUCCESS: React.CSSProperties  = { ...CTRL, border: 'none', backgroundColor: 'var(--success)', color: '#fff', fontWeight: 600 }

  return (
    <>
      <Header title="Auto-planning">
        <span className="hdr-ctx-stat">{pendingItems.length} items</span>
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{pendingSP} SP en attente</span>
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{openSprints} sprints ouverts</span>
        <div style={{ flex: 1 }} />
        <button style={{ ...CTRL, gap: 5, background: showCompare ? 'var(--primary-light)' : 'transparent', borderColor: showCompare ? 'var(--primary)' : 'var(--border)' }}
          onClick={() => setShowCompare(v => !v)}>
          <Ico d={ICO.eye} size={12} /> Comparer
        </button>
        <button style={CTRL_PRIMARY} onClick={() => generateScenario(active)}>
          <Ico d={ICO.zap} size={12} stroke="#fff" /> Générer
        </button>
        {active.generated && active.type !== 'current' && (
          <button style={CTRL_SUCCESS} onClick={() => applyScenario(active)}>
            <Ico d={ICO.check} size={12} stroke="#fff" /> Appliquer
          </button>
        )}
        <div className="hdr-sep" />
      </Header>

      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Branch graph ─────────────────────────────────────────── */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 12 }}>Scénarios</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {showCompare && (
                <select style={{ fontSize: 11, height: 26, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text)', paddingLeft: 6 }}
                  value={compareId ?? ''} onChange={e => setCompareId(e.target.value || null)}>
                  <option value="">Comparer avec…</option>
                  {_scenarios.filter(s => s.id !== activeId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
              <button style={CTRL} onClick={addScenario}>
                <Ico d={ICO.plus} size={11} /> Nouveau scénario
              </button>
            </div>
          </div>
          <ScenarioBranches
            scenarios={_scenarios}
            sprintCount={Math.max(graphSprintCount, openSprints, 4)}
            activeId={activeId}
            compareId={compareId}
            onSelect={id => { setActiveId(id); _activeScenarioId = id }}
            onFork={forkScenario}
          />
        </div>

        {/* ── Main area: left panel + proposal(s) ──────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14, alignItems: 'start' }}>

          {/* ── LEFT: config panel ──────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Scenario name + type badge */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: active.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{active.name}</span>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                  background: active.type === 'current' ? 'var(--surface2)' : active.type === 'auto' ? '#dbeafe' : '#fef9c3',
                  color: active.type === 'current' ? 'var(--text-muted)' : active.type === 'auto' ? '#1d4ed8' : '#92400e',
                }}>
                  {active.type === 'current' ? 'DB' : active.type === 'auto' ? 'auto' : 'manuel'}
                </span>
                {active.type !== 'current' && (
                  <button style={{ ...CTRL, padding: '0 8px', height: 24, fontSize: 10, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => removeScenario(activeId)}>
                    <Ico d={ICO.trash} size={10} stroke="var(--danger)" />
                  </button>
                )}
              </div>

              {/* Velocity factor */}
              {active.type !== 'current' && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, fontWeight: 600 }}>
                    <span>Vélocité</span>
                    <span style={{ color: active.velocityFactor < 1 ? 'var(--warning, #d97706)' : 'var(--text-muted)' }}>
                      {Math.round(active.velocityFactor * 100)}%
                    </span>
                  </div>
                  <input type="range" min={40} max={120} step={5}
                    value={Math.round(active.velocityFactor * 100)}
                    onChange={e => updateScenario(activeId, { velocityFactor: Number(e.target.value) / 100, generated: false })}
                    style={{ width: '100%', accentColor: active.color }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)' }}>
                    <span>40%</span><span>Normal</span><span>120%</span>
                  </div>
                </div>
              )}

              {/* Capacity overrides toggle */}
              {active.type !== 'current' && (
                <button style={{ ...CTRL, width: '100%', justifyContent: 'center', fontSize: 11, background: showCap ? 'var(--primary-light)' : 'transparent' }}
                  onClick={() => setShowCap(v => !v)}>
                  <Ico d={ICO.sliders} size={11} /> Capacités par sprint
                </button>
              )}
            </div>

            {/* Sprint capacity overrides */}
            {showCap && active.type !== 'current' && (
              <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>Capacités — {active.name}</div>
                {state.sprints.filter(sp => !sp.closed).map(sp => {
                  const ov = active.capacityOverrides.find(o => o.sprintId === sp.id)
                  const base = effectiveCapacity(sp, state.team) || state.settings.defaultCapacity
                  return (
                    <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, width: 60, flexShrink: 0 }}>S{sp.number}</span>
                      <input type="number" min={0} max={200} step={1}
                        value={ov ? ov.capacity : base}
                        onChange={e => {
                          const cap = Number(e.target.value)
                          const ovs = ov
                            ? active.capacityOverrides.map(o => o.sprintId === sp.id ? { ...o, capacity: cap } : o)
                            : [...active.capacityOverrides, { sprintId: sp.id, capacity: cap }]
                          updateScenario(activeId, { capacityOverrides: ovs, generated: false })
                        }}
                        style={{ width: 56, height: 26, fontSize: 11, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 5, background: 'transparent', color: ov ? 'var(--warning, #d97706)' : 'var(--text)' }}
                      />
                      <input placeholder="Note (optionnel)" style={{ flex: 1, height: 26, fontSize: 10, border: '1px solid var(--border)', borderRadius: 5, padding: '0 6px', background: 'transparent', color: 'var(--text)' }}
                        value={ov?.note ?? ''}
                        onChange={e => {
                          const note = e.target.value
                          const ovs = ov
                            ? active.capacityOverrides.map(o => o.sprintId === sp.id ? { ...o, note } : o)
                            : [...active.capacityOverrides, { sprintId: sp.id, capacity: base, note }]
                          updateScenario(activeId, { capacityOverrides: ovs })
                        }}
                      />
                      {ov && <button style={{ ...CTRL, padding: '0 6px', height: 22, fontSize: 9, color: 'var(--danger)' }} onClick={() => updateScenario(activeId, { capacityOverrides: active.capacityOverrides.filter(o => o.sprintId !== sp.id), generated: false })}>
                        <Ico d={ICO.x} size={9} stroke="var(--danger)" />
                      </button>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Criteria */}
            {active.type !== 'current' && (
              <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>
                  Critères
                  <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>glisser pour réordonner</span>
                </div>
                {active.criteriaOrder.map((critId, i) => {
                  const def = CRIT_DEFS[critId as CritId]
                  const isActive = active.criteriaActive[critId] ?? false
                  const rank = active.criteriaOrder.slice(0, i + 1).filter(id => active.criteriaActive[id]).length
                  const isDropTarget = dragOverCritIdx === i && dragCritIdx !== null && dragCritIdx !== i
                  return (
                    <div key={critId}
                      draggable
                      onDragStart={() => { setDragCritIdx(i); setDragOverCritIdx(null) }}
                      onDragOver={e => { e.preventDefault(); setDragOverCritIdx(i) }}
                      onDragLeave={() => setDragOverCritIdx(null)}
                      onDrop={() => critDrop(activeId, i)}
                      onDragEnd={() => { setDragCritIdx(null); setDragOverCritIdx(null) }}
                      style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 9px', marginBottom: 5, borderRadius: 7, cursor: 'grab',
                        background: isActive ? 'var(--primary-light)' : 'var(--surface2)',
                        border: `1.5px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                        outline: isDropTarget ? '2px solid var(--primary)' : 'none', outlineOffset: 2,
                        opacity: dragCritIdx === i ? 0.5 : 1, transition: 'outline .1s, opacity .15s',
                      }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: isActive ? 'var(--primary)' : 'var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                        {isActive ? rank : '–'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 11 }}>{def.title}</span>
                          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, cursor: 'pointer' }}>
                            <input type="checkbox" checked={isActive} onChange={e => toggleCrit(activeId, critId, e.target.checked)} />
                            Activer
                          </label>
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>{def.desc}</div>
                      </div>
                    </div>
                  )
                })}

                {/* Client order */}
                {active.criteriaActive['client'] && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Ordre des clients</div>
                    {active.clientOrder.filter(cid => planningClientIds.has(cid)).map((cid, i) => {
                      const client = state.clients.find(c => c.id === cid)
                      if (!client) return null
                      const origIdx = active.clientOrder.indexOf(cid)
                      const isClientDrop = dragOverClientIdx === origIdx && dragClientIdx !== null && dragClientIdx !== origIdx
                      return (
                        <div key={cid} draggable
                          onDragStart={() => { setDragClientIdx(origIdx); setDragOverClientIdx(null) }}
                          onDragOver={e => { e.preventDefault(); setDragOverClientIdx(origIdx) }}
                          onDragLeave={() => setDragOverClientIdx(null)}
                          onDrop={() => clientDrop(activeId, origIdx)}
                          onDragEnd={() => { setDragClientIdx(null); setDragOverClientIdx(null) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 9px', marginBottom: 3, background: 'var(--surface2)', borderRadius: 5, cursor: 'grab', outline: isClientDrop ? '2px solid var(--primary)' : 'none', outlineOffset: 2, opacity: dragClientIdx === origIdx ? 0.5 : 1, transition: 'outline .1s, opacity .15s' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 14 }}>{i + 1}</span>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: client.color }} />
                          <span style={{ fontSize: 11, flex: 1 }}>{client.name}</span>
                          <Ico d={ICO.grip} size={11} stroke="var(--text-muted)" />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Rules card */}
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.9 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text)', marginBottom: 6 }}>Règles</div>
              <div>Items terminés et sprints clôturés ne sont pas modifiés.</div>
              <div style={{ display: 'flex', gap: 5 }}><Ico d={ICO.link} size={10} stroke="var(--text-muted)" /><span><strong>Dépendances</strong> : contrainte dure entre sprints.</span></div>
              <div style={{ display: 'flex', gap: 5 }}><Ico d={ICO.clock} size={10} stroke="var(--text-muted)" /><span><strong>Deadlines</strong> : priorité absolue, violation signalée.</span></div>
              <div style={{ marginTop: 4, fontStyle: 'italic', fontSize: 9 }}>Clic droit sur un point du graphe → forker</div>
            </div>
          </div>

          {/* ── RIGHT: proposal(s) ───────────────────────────────────── */}
          <div style={{ display: showCompare && compareId ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <ProposalPanel
              scenario={active}
              allScenarios={_scenarios}
              state={state}
              onOverrideOpen={(itemId) => setOverrideTarget({ scenarioId: activeId, itemId })}
              onAddVirtual={(sprintId) => setVirtTarget({ scenarioId: activeId, sprintId })}
              onRemoveVirtual={(virtId) => removeVirtualItem(activeId, virtId)}
            />
            {showCompare && compareId && (() => {
              const cmpSc = getScenario(compareId)
              return cmpSc ? (
                <ProposalPanel
                  scenario={cmpSc}
                  allScenarios={_scenarios}
                  state={state}
                  onOverrideOpen={(itemId) => setOverrideTarget({ scenarioId: compareId, itemId })}
                  onAddVirtual={(sprintId) => setVirtTarget({ scenarioId: compareId, sprintId })}
                  onRemoveVirtual={(virtId) => removeVirtualItem(compareId, virtId)}
                />
              ) : null
            })()}
          </div>
        </div>
      </div>

      {/* ── Item override popup ───────────────────────────────────────── */}
      {overrideTarget && (() => {
        const sc   = getScenario(overrideTarget.scenarioId)
        const item = state.items.find(i => i.id === overrideTarget.itemId)
        if (!item) return null
        const ov   = getOverride(sc, overrideTarget.itemId)
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => e.target === e.currentTarget && setOverrideTarget(null)}>
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, width: 340, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Override — {item.key}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>{item.desc}</div>
              {(() => {
                const OV_SEL: React.CSSProperties = { display: 'block', width: '100%', marginTop: 4, height: 32, fontSize: 11, border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface)', color: 'var(--text)', padding: '0 6px' }
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={{ fontSize: 11 }}>
                      Statut
                      <select value={ov?.statusOverride ?? item.status}
                        onChange={e => setOverride(overrideTarget.scenarioId, item.id, { statusOverride: e.target.value })}
                        style={OV_SEL}>
                        <option value="todo">À faire</option>
                        <option value="in-progress">En cours</option>
                        <option value="blocked">Bloqué</option>
                        <option value="done">Terminé</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 11 }}>
                      Priorité
                      <select value={ov?.priorityOverride ?? item.priority}
                        onChange={e => setOverride(overrideTarget.scenarioId, item.id, { priorityOverride: e.target.value as any })}
                        style={OV_SEL}>
                        <option value="critical">Critique</option>
                        <option value="high">Haute</option>
                        <option value="medium">Moyenne</option>
                        <option value="low">Basse</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 11 }}>
                      SP (réel : {item.sp})
                      <input type="number" min={1} value={ov?.spOverride ?? item.sp}
                        onChange={e => setOverride(overrideTarget.scenarioId, item.id, { spOverride: Number(e.target.value) })}
                        style={{ ...OV_SEL, padding: '0 6px' }}
                      />
                    </label>
                  </div>
                )
              })()}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                {ov && <button style={{ ...CTRL, color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: 11 }} onClick={() => { removeOverride(overrideTarget.scenarioId, item.id); setOverrideTarget(null) }}>Supprimer l'override</button>}
                <button style={{ ...CTRL, fontSize: 11 }} onClick={() => setOverrideTarget(null)}>Fermer</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Virtual item form ─────────────────────────────────────────── */}
      {virtTarget && (
        <VirtualItemForm
          scenarioId={virtTarget.scenarioId}
          sprintId={virtTarget.sprintId}
          clients={state.clients}
          onSave={(data) => addVirtualItem(virtTarget.scenarioId, data)}
          onClose={() => setVirtTarget(null)}
          CTRL={CTRL}
          CTRL_PRIMARY={CTRL_PRIMARY}
        />
      )}
    </>
  )
}

// ── ProposalPanel ──────────────────────────────────────────────────────────
function ProposalPanel({ scenario, allScenarios: _all, state, onOverrideOpen, onAddVirtual, onRemoveVirtual }: {
  scenario: Scenario
  allScenarios: Scenario[]
  state: any
  onOverrideOpen: (itemId: string) => void
  onAddVirtual: (sprintId: string) => void
  onRemoveVirtual: (virtId: string) => void
}) {
  const ICO2 = {
    zap:   '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    warn:  '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    link:  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    star:  '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    plus:  '<path d="M5 12h14"/><path d="M12 5v14"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    equal: '<line x1="5" x2="19" y1="9" y2="9"/><line x1="5" x2="19" y1="15" y2="15"/>',
    ghost: '<path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/>',
    pencil:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    x:     '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  }
  function Ico2({ d, size = 12, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: 14, minHeight: 200 }}>
      {/* Header — nom + puce couleur uniquement, les boutons sont dans le Header de page */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: scenario.color }} />
        <span style={{ fontWeight: 700, fontSize: 12 }}>{scenario.name}</span>
      </div>

      {!scenario.generated ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Cliquez sur "Générer" dans la barre pour calculer la proposition.</p>
      ) : (
        <>
          {/* Violations */}
          {scenario.violations.length > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 10px', background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 7 }}>
              <div style={{ display: 'flex', gap: 5, fontWeight: 700, fontSize: 11, color: 'var(--danger)', marginBottom: 4 }}>
                <Ico2 d={ICO2.warn} size={11} stroke="var(--danger)" />
                {scenario.violations.length} violation{scenario.violations.length > 1 ? 's' : ''}
              </div>
              {scenario.violations.map((v, i) => (
                <div key={i} style={{ fontSize: 10, color: '#7f1d1d', paddingLeft: 16, marginBottom: 2 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, marginRight: 4 }}>{v.key}</span>{v.detail}
                </div>
              ))}
            </div>
          )}

          {/* New sprints banner */}
          {scenario.newCount > 0 && (
            <div style={{ marginBottom: 10, padding: '7px 10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 7, fontSize: 11, color: '#c2410c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ico2 d={ICO2.warn} size={11} stroke="#c2410c" />
              {scenario.newCount} nouveau{scenario.newCount > 1 ? 'x' : ''} sprint{scenario.newCount > 1 ? 's' : ''} {scenario.newCount > 1 ? 'seront créés' : 'sera créé'}
            </div>
          )}

          {/* Slots */}
          {scenario.slots.map(slot => {
            const total = slot.used + slot.assigned.reduce((s, i) => s + i.sp, 0)
            const pct   = slot.cap > 0 ? Math.min(Math.round(total / slot.cap * 100), 100) : 0
            const over  = total > slot.cap
            const isVirtSlot = slot.sprintId.startsWith('new-')
            return (
              <div key={slot.sprintId} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                <div style={{ padding: '7px 12px', background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontWeight: 700, fontSize: 11 }}>{slot.label}</span>
                    {slot.isNew && <span style={{ fontSize: 9, background: '#d1fae5', color: '#065f46', padding: '1px 5px', borderRadius: 8, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Ico2 d={ICO2.star} size={8} stroke="#065f46" /> Nouveau</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: over ? 'var(--danger)' : 'var(--text-muted)', fontWeight: over ? 700 : 400, display: 'flex', alignItems: 'center', gap: 3 }}>
                      {total}/{slot.cap} SP {over && <Ico2 d={ICO2.warn} size={9} stroke="var(--danger)" />}
                    </span>
                    {/* Add virtual item button */}
                    {scenario.type !== 'current' && (
                      <button title="Ajouter un item fictif"
                        style={{ width: 20, height: 20, borderRadius: 4, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}
                        onClick={() => onAddVirtual(slot.sprintId)}>
                        <Ico2 d={ICO2.plus} size={10} />
                      </button>
                    )}
                  </div>
                  {(slot.startDate || slot.endDate) && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      📅 {slot.startDate ? fmtDateShort(slot.startDate) : '?'} → {slot.endDate ? fmtDateShort(slot.endDate) : '?'}
                    </span>
                  )}
                </div>
                <div style={{ height: 3, background: 'var(--border)', margin: '0 12px 1px' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--danger)' : scenario.color, borderRadius: 2 }} />
                </div>
                <div style={{ padding: '3px 12px 8px' }}>
                  {/* Done items (usedItems) — shown greyed with ✓ badge */}
                  {(slot.usedItems ?? []).map(item => {
                    const client = state.clients.find((c: any) => c.id === item.clientId)
                    return (
                      <div key={item.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid var(--surface2)', fontSize: 10, opacity: .55 }}>
                        <span style={{ fontSize: 9, color: '#059669', fontWeight: 700, flexShrink: 0 }}>✓</span>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: client?.color ?? 'var(--border)', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--primary)', flexShrink: 0, minWidth: 54 }}>{item.key}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>{item.desc}</span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 9 }}>{item.sp} SP</span>
                      </div>
                    )
                  })}
                  {slot.assigned.map(item => {
                    const isVirt      = item.id.startsWith('virt-')
                    const realItem    = isVirt ? null : state.items.find((i: Item) => i.id === item.id)
                    const hasOv       = realItem && scenario.itemOverrides.some((o: ScenarioItemOverride) => o.itemId === item.id)
                    const client      = state.clients.find((c: any) => c.id === item.clientId)
                    const hasDeadline = !isVirt && (item as Item).deadline?.date && (item as Item).deadline!.type !== 'none'
                    const hasDeps     = (item.deps ?? []).length > 0
                    const wasHere     = !isVirt && (item as Item).sprintId === slot.sprintId
                    const isUnassigned = !isVirt && !(item as Item).sprintId
                    const badgeIcon   = slot.isNew ? ICO2.plus : wasHere ? ICO2.equal : isUnassigned ? ICO2.plus : ICO2.arrow
                    const badgeColor  = slot.isNew ? '#059669' : wasHere ? 'var(--text-muted)' : isUnassigned ? 'var(--primary)' : '#d97706'

                    return (
                      <div key={item.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--surface2)', fontSize: 10,
                          background: isVirt ? 'rgba(127,119,221,.05)' : hasOv ? 'rgba(218,90,48,.04)' : 'transparent',
                          border: isVirt ? '1px dashed rgba(127,119,221,.3)' : undefined,
                          borderRadius: isVirt ? 4 : undefined, marginBottom: isVirt ? 2 : 0, paddingLeft: isVirt ? 6 : 0,
                        }}>
                        {/* Virtual / override badge */}
                        {isVirt
                          ? <span title="Item fictif" style={{ color: '#7F77DD' }}><Ico2 d={ICO2.ghost} size={10} stroke="#7F77DD" /></span>
                          : hasOv
                            ? <span title="Override actif" style={{ color: '#D85A30', cursor: 'pointer' }} onClick={() => realItem && onOverrideOpen(realItem.id)}><Ico2 d={ICO2.pencil} size={10} stroke="#D85A30" /></span>
                            : <div style={{ width: 7, height: 7, borderRadius: '50%', background: client?.color ?? 'var(--border)', flexShrink: 0 }} />
                        }
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: isVirt ? '#7F77DD' : 'var(--primary)', flexShrink: 0, minWidth: 54 }}>
                          {isVirt ? '✦ FICTIF' : (item as Item).key}
                        </span>
                        {!isVirt && !hasOv && <span style={{ color: badgeColor, flexShrink: 0 }}><Ico2 d={badgeIcon} size={9} stroke={badgeColor} /></span>}
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isVirt ? '#534AB7' : 'inherit' }}>{item.desc}</span>
                        {hasDeadline && (
                          <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 5, background: (item as Item).deadline!.type === 'imposed' ? '#fee2e2' : '#fef3c7', color: (item as Item).deadline!.type === 'imposed' ? '#dc2626' : '#d97706', flexShrink: 0 }}>
                            {fmtDate((item as Item).deadline!.date)}
                          </span>
                        )}
                        {hasDeps && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 5, background: '#dbeafe', color: '#1d4ed8', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}><Ico2 d={ICO2.link} size={8} stroke="#1d4ed8" />{(item.deps ?? []).length}</span>}
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 9 }}>{item.sp} SP</span>
                        {/* Delete button for virtual items */}
                        {isVirt && (
                          <button title="Supprimer l'item fictif"
                            style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid #fca5a5', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}
                            onClick={() => onRemoveVirtual(item.id)}>
                            <Ico2 d={ICO2.x} size={9} stroke="#dc2626" />
                          </button>
                        )}
                        {/* Override button for real items */}
                        {!isVirt && scenario.type !== 'current' && realItem && (
                          <button title="Modifier dans ce scénario"
                            style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                            onClick={() => onOverrideOpen(realItem.id)}>
                            <Ico2 d={ICO2.pencil} size={9} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── VirtualItemForm ────────────────────────────────────────────────────────
function VirtualItemForm({ scenarioId: _scId, sprintId: _spId, clients, onSave, onClose, CTRL, CTRL_PRIMARY }: {
  scenarioId: string; sprintId: string; clients: any[]
  onSave: (data: Omit<VirtualItem, 'id' | 'scenarioId'>) => void
  onClose: () => void
  CTRL: React.CSSProperties; CTRL_PRIMARY: React.CSSProperties
}) {
  const [form, setForm] = useState({ desc: '', sp: 5, priority: 'high' as any, type: 'bug' as any, clientId: clients[0]?.id ?? '', status: 'todo' })
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm(f => ({ ...f, [k]: v })) }
  const SEL: React.CSSProperties = { display: 'block', width: '100%', marginTop: 4, height: 32, fontSize: 11, border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface)', color: 'var(--text)', padding: '0 6px' }
  const INP: React.CSSProperties = { ...SEL }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, width: 340, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Ajouter un item fictif</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11 }}>
            Description
            <input value={form.desc} onChange={e => set('desc', e.target.value)} placeholder="ex : Bug crash paiement prod"
              style={{ ...INP, height: 30, padding: '0 8px' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ fontSize: 11 }}>
              Type
              <select value={form.type} onChange={e => set('type', e.target.value)} style={SEL}>
                <option value="bug">Bug</option>
                <option value="story">Story</option>
                <option value="task">Tâche</option>
                <option value="spike">Spike</option>
                <option value="epic">Épic</option>
              </select>
            </label>
            <label style={{ fontSize: 11 }}>
              SP
              <input type="number" min={1} value={form.sp} onChange={e => set('sp', Number(e.target.value))} style={INP} />
            </label>
            <label style={{ fontSize: 11 }}>
              Priorité
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={SEL}>
                <option value="critical">Critique</option>
                <option value="high">Haute</option>
                <option value="medium">Moyenne</option>
                <option value="low">Basse</option>
              </select>
            </label>
            <label style={{ fontSize: 11 }}>
              Client
              <select value={form.clientId} onChange={e => set('clientId', e.target.value)} style={SEL}>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button style={{ ...CTRL, fontSize: 11 }} onClick={onClose}>Annuler</button>
          <button style={{ ...CTRL_PRIMARY, fontSize: 11 }} onClick={() => form.desc.trim() && onSave({ ...form })}>Ajouter</button>
        </div>
      </div>
    </div>
  )
}
