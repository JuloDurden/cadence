import { useState, useRef, useEffect } from 'react'
import { useCadence } from '../context/StateContext'
import { useAuth } from '../hooks/useAuth'
import { Header } from '../components/layout/Header'
import { ScenarioMiniGraph } from '../components/auto-planning/ScenarioMiniGraph'
import { effectiveCapacity } from '../utils/sprintCapacity'
import { fmtDate, fmtDateShort, localIso } from '../utils/dates'
import { topoSort, computeMoveBadge, isItemHighlighted, nextScenarioIdx, isSlotNonEmpty } from '../utils/autoPlanning'
import { withHistoryEntry } from '../utils/history'
import { buildItemsFirstHierarchy, getItemInitiativeId, getHierarchyNodeSP } from '../utils/hierarchyScore'
import { canExploreWhatIf, canApplyScenario } from '../utils/permissions'
import type { Item, Sprint, Scenario, ScenarioSlot, ScenarioViolation, VirtualItem, ScenarioItemOverride, HistoryEntry, HierarchyNode } from '../types'

// ── Icons ─────────────────────────────────────────────────────────────────
const ICO = {
  zap:     '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  check:   '<path d="M20 6 9 17l-5-5"/>',
  x:       '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  grip:    '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  warn:    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  link:    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  clock:   '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  equal:   '<line x1="5" x2="19" y1="9" y2="9"/><line x1="5" x2="19" y1="15" y2="15"/>',
  plus:    '<path d="M5 12h14"/><path d="M12 5v14"/>',
  star:    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  ghost:   '<path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/>',
  pencil:  '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  eye:     '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  trash:   '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
}
function Ico({ d, size = 13, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

// ── Criteria config ────────────────────────────────────────────────────────
// `epic` ajouté 2026-08-10 (sous-chantier 4, roadmap v1 Phase 6) : jusqu'ici la génération de
// scénario ignorait complètement Epics/Initiatives, deux items d'un même Epic pouvaient
// atterrir dans des sprints sans rapport. Critère "supplémentaire" au sens de Julien - pas une
// contrainte dure comme les dépendances - qui vient s'ajouter aux 4 existants sans les
// remplacer, avec le même mécanisme (case à cocher + ordre par glisser-déposer).
type CritId = 'priority' | 'client' | 'socle' | 'debt' | 'epic'
const CRIT_DEFS: Record<CritId, { title: string; desc: string }> = {
  priority: { title: 'Priorité',            desc: 'Les items critiques et high sont placés en premier.' },
  client:   { title: 'Importance client',   desc: 'Les clients les plus importants remplissent les premiers sprints.' },
  socle:    { title: 'Socle commun en tête',desc: 'Les items sans client associé sont prioritaires.' },
  debt:     { title: 'Dette technique',     desc: 'Les Bugs sont placés en priorité.' },
  epic:     { title: 'Cohésion Epic/Initiative', desc: 'Les items d\'un même Epic ou d\'une même Initiative restent regroupés, dans le même sprint autant que possible.' },
}
const CRIT_ORDER: CritId[] = ['priority', 'client', 'socle', 'debt', 'epic']
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

// Migration des scénarios déjà persistés (localStorage) créés avant l'ajout d'un critère : sans
// ceci, `sc.criteriaOrder` (figé au moment de la création du scénario) n'aurait jamais le nouvel
// id, et la case à cocher correspondante n'apparaîtrait jamais dans la liste (qui itère
// `sc.criteriaOrder`, pas la constante `CRIT_ORDER` - voir plus bas). Ajouté désactivé par
// défaut : un scénario existant ne change pas de comportement tant que Julien ne l'active pas
// lui-même.
function ensureAllCriteria(sc: Scenario): Scenario {
  const missing = CRIT_ORDER.filter(c => !sc.criteriaOrder.includes(c))
  return missing.length === 0 ? sc : { ...sc, criteriaOrder: [...sc.criteriaOrder, ...missing] }
}

// ── Scenario colors palette ────────────────────────────────────────────────
const SCENARIO_COLORS = ['#378ADD','#7F77DD','#1D9E75','#D85A30','#D4537E','#BA7517']

// ── Module-level cache ─────────────────────────────────────────────────────
let _scenarios: Scenario[] = []
let _activeScenarioId: string = ''

// ── Persistance localStorage (Chantier I) ──────────────────────────────────
// Les scénarios what-if ne vivaient que dans la variable de module ci-dessus,
// perdus silencieusement au moindre rechargement de page. "État actuel" (type
// 'current') n'est volontairement jamais persisté : c'est un miroir live des
// données réelles, toujours régénéré au montage via buildCurrentState() — seuls
// les scénarios "auto" (et leurs forks) représentent un vrai travail d'exploration
// à préserver. Choix délibéré : localStorage (brouillon personnel au navigateur),
// pas `state` partagé — voir docs/corrections.md pour la discussion complète.
const STORAGE_KEY_SCENARIOS = 'cadence_autoplanning_scenarios'
const STORAGE_KEY_ACTIVE    = 'cadence_autoplanning_active_id'

function loadPersistedScenarios(): Scenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCENARIOS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s: Scenario) => s?.type !== 'current') : []
  } catch {
    return []
  }
}

function persistScenarios(scenarios: Scenario[], activeId: string) {
  try {
    localStorage.setItem(STORAGE_KEY_SCENARIOS, JSON.stringify(scenarios.filter(s => s.type !== 'current')))
    localStorage.setItem(STORAGE_KEY_ACTIVE, activeId)
  } catch {
    // Quota dépassé ou navigation privée stricte : perte silencieuse acceptée,
    // comportement identique à avant ce correctif dans ce cas limite.
  }
}

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
  const { userName, userRole } = useAuth()
  const canExplore = canExploreWhatIf(userRole)
  const canApply   = canApplyScenario(userRole)

  if (_scenarios.length === 0) {
    const current = makeCurrentScenario()
    const persisted = loadPersistedScenarios().map(ensureAllCriteria)
    _scenarios = [current, ...persisted]
    const savedActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE)
    _activeScenarioId = savedActiveId && _scenarios.some(s => s.id === savedActiveId) ? savedActiveId : 'current'
  }
  // Ensure État actuel is active if it's the only card (e.g. on re-mount after reset)
  if (_scenarios.length === 1 && _scenarios[0].type === 'current') {
    _activeScenarioId = 'current'
  }

  const [, forceUpdate] = useState(0)
  const bump = () => {
    persistScenarios(_scenarios, _activeScenarioId)
    forceUpdate(n => n + 1)
  }

  const [activeId,     setActiveId]     = useState(_activeScenarioId)
  const [compareId,    setCompareId]    = useState<string | null>(null)
  const [showCompare,  setShowCompare]  = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['velocity', 'criteria']))
  const [overrideTarget, setOverrideTarget] = useState<{ scenarioId: string; itemId: string } | null>(null)
  const [virtTarget,   setVirtTarget]   = useState<{ scenarioId: string; sprintId: string } | null>(null)
  const [dragCritIdx,      setDragCritIdx]      = useState<number | null>(null)
  const [dragOverCritIdx,  setDragOverCritIdx]  = useState<number | null>(null)
  const [dragClientIdx,    setDragClientIdx]    = useState<number | null>(null)
  const [dragOverClientIdx,setDragOverClientIdx]= useState<number | null>(null)
  // Animation state: Map<id, 'entering'|'entered'>
  const [cardAnim, setCardAnim] = useState<Map<string, boolean>>(() => new Map())
  const [prevActiveId, setPrevActiveId] = useState<string | null>(null)
  // État actuel highlight filters
  const [hlClients,  setHlClients]  = useState<Set<string>>(() => new Set())
  const [hlTypes,    setHlTypes]    = useState<Set<string>>(() => new Set())
  const [hlPriority, setHlPriority] = useState<Set<string>>(() => new Set())
  const [openCurrentSections, setOpenCurrentSections] = useState<Set<string>>(() => new Set(['clients']))

  function getScenario(id: string) { return _scenarios.find(s => s.id === id)! }
  const planningClientIds = new Set(state.clients.filter(c => !c.excludeFromPlanning).map(c => c.id))

  function updateScenario(id: string, patch: Partial<Scenario>) {
    _scenarios = _scenarios.map(s => s.id === id ? { ...s, ...patch } : s)
    bump()
  }

  // ── Entrance animation helper ──────────────────────────────────────────
  function triggerEntrance(newId: string, fromId: string) {
    setPrevActiveId(fromId)
    setCardAnim(prev => new Map(prev).set(newId, false))
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setCardAnim(prev => new Map(prev).set(newId, true))
      setTimeout(() => {
        setCardAnim(prev => { const m = new Map(prev); m.delete(newId); return m })
        setPrevActiveId(null)
      }, 450)
    }))
  }

  // ── Generate for one scenario ──────────────────────────────────────────
  function generateScenario(sc: Scenario) {
    if (sc.type === 'current') { buildCurrentState(sc); return }

    const doneSt        = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
    const durationWeeks = state.settings.sprintDuration ?? 2

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

    const virtAsItems: Item[] = sc.virtualItems.map(v => ({
      id: v.id, key: v.id.toUpperCase().slice(0, 8),
      desc: v.desc, sp: v.sp, priority: v.priority,
      clientId: v.clientId, type: v.type, status: v.status,
      sprintId: null, assignees: [], tags: [],
      deps: v.deps ?? [], createdAt: new Date().toISOString(),
    }))
    const allItems = [...effectiveItems, ...virtAsItems]
    // `Item.deps` stocke des ID reels (voir ItemModal.tsx), jamais des cles - meme correctif que
    // topoSort() (utils/autoPlanning.ts, voir son commentaire) : `placedAt`/`successors`
    // ci-dessous restent indexes par CLE (utilise ailleurs pour l'affichage/les violations), donc
    // on traduit les ID de `item.deps` en cles via cette map avant de les consulter, plutot que de
    // reindexer tout par ID.
    const keyById = new Map(allItems.map(it => [it.id, it.key]))

    const forkIdx    = sc.forkFrom?.fromSprintIndex ?? 0
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

    const slots: ScenarioSlot[] = openNonDone.map((sp, idx) => {
      const doneItemsInSlot = effectiveItems.filter(i => i.sprintId === sp.id && doneSt.includes(i.status))
      const usedByDone      = doneItemsInSlot.reduce((s, i) => s + i.sp, 0)
      const isCurrent       = idx === 0
      const label           = isCurrent && sp.label ? `Sprint ${sp.number} – ${sp.label}` : `Sprint ${sp.number}`
      const capOv           = sc.capacityOverrides.find(o => o.sprintId === sp.id)
      const baseCap         = capOv ? capOv.capacity : (effectiveCapacity(sp, state.team, state.absences) || state.settings.defaultCapacity)
      const cap             = Math.round(baseCap * sc.velocityFactor)
      return { sprintId: sp.id, label, cap, used: usedByDone, usedItems: doneItemsInSlot, assigned: [], isNew: false, number: sp.number, startDate: sp.startDate, endDate: sp.endDate }
    })

    if (sc.forkFrom) {
      const parent = _scenarios.find(s => s.id === sc.forkFrom!.sourceScenarioId)
      if (parent?.generated) {
        for (let i = 0; i < Math.min(forkIdx, slots.length, parent.slots.length); i++) {
          slots[i].assigned = [...parent.slots[i].assigned]
          slots[i].used     = parent.slots[i].used
        }
      }
    }

    const sortedItems = sortItemsForScenario(itemsToPlace, sc)

    let newCount = 0
    function ensureSlot(idx: number) {
      while (idx >= slots.length) {
        newCount++
        const maxNum = slots.reduce((m, s) => Math.max(m, s.number), 0)
        const cap    = Math.round((state.settings.defaultCapacity ?? 40) * sc.velocityFactor)
        const endDate   = estimateEndDate(slots.length, slots, durationWeeks)
        const prevEnd   = slots[slots.length - 1]?.endDate
        const startDate = prevEnd ? localIso(new Date(new Date(prevEnd + 'T00:00:00').getTime() + 3 * 24 * 3600 * 1000)) : undefined
        slots.push({ sprintId: 'new-' + newCount, label: `Sprint ${maxNum + 1}`, cap, used: 0, usedItems: [], assigned: [], isNew: true, number: maxNum + 1, startDate, endDate })
      }
    }

    const successors: Record<string, string[]> = {}
    sortedItems.forEach(item => { (item.deps ?? []).forEach(depId => {
      const dk = keyById.get(depId)
      if (!dk) return
      successors[dk] = successors[dk] ?? []; successors[dk].push(item.key)
    }) })

    const placedAt: Record<string, number> = {}
    const placedSet = new Set<string>()
    const violations: ScenarioViolation[] = []
    const startPlaceIdx = sc.forkFrom ? forkIdx : 0

    if (sc.forkFrom) {
      for (let i = 0; i < startPlaceIdx && i < slots.length; i++) {
        slots[i].assigned.forEach(item => {
          placedAt[('key' in item ? (item as Item).key : item.id)] = i
          placedSet.add('key' in item ? (item as Item).key : item.id)
        })
      }
    }

    // Garde-fou anti-cycle (2026-08-12) : necessaire a partir du moment ou placeOne() se rappelle
    // lui-meme sur une dependance non encore placee (voir ci-dessous) - un vrai cycle de dependances
    // (A depend de B qui depend de A) provoquerait sinon une recursion infinie. `placingNow` marque
    // les items en cours de placement le temps de leur propre appel ; retomber dessus signale un
    // cycle, ignore silencieusement (meme tolerance que topoSort face a un cycle).
    const placingNow = new Set<string>()

    function placeOne(item: Item) {
      if (placedSet.has(item.key)) return
      if (placingNow.has(item.key)) return
      placingNow.add(item.key)
      // Garantit qu'une dependance est toujours placee AVANT son dependant (retour Julien,
      // 2026-08-12), quel que soit l'ordre de sortedItems - sans ce pre-placement recursif, un item
      // de priorite plus elevee que sa propre dependance pouvait se retrouver traite (et place) en
      // premier, la dependance atterrissant alors n'importe ou, y compris APRES son dependant.
      for (const depId of item.deps ?? []) {
        const dk = keyById.get(depId)
        if (!dk || placedSet.has(dk)) continue
        const depItem = allItems.find(it => it.id === depId)
        if (depItem) placeOne(depItem)
      }
      placingNow.delete(item.key)
      const depKeys    = (item.deps ?? []).map(depId => keyById.get(depId)).filter((k): k is string => !!k)
      // Assouplissement (retour Julien, 2026-08-12) : une dependance peut desormais partager le
      // MEME sprint que son dependant (ordre interne au sprint, tres courant en pratique - ex.
      // "API" puis "UI qui l'appelle" le meme sprint), plus seulement un sprint strictement
      // anterieur comme avant - `placedAt[dk]` plutot que `placedAt[dk] + 1`. Voir la violation
      // 'dep' plus bas, qui signale ce cas pour que l'equipe sache qu'un sequencement interne au
      // sprint est necessaire.
      const minIdx     = Math.max(startPlaceIdx, depKeys.reduce((mx, dk) => placedAt[dk] !== undefined ? Math.max(mx, placedAt[dk]) : mx, 0))
      const hasDeadline = !!item.deadline?.date && item.deadline.type !== 'none'
      let placed = false
      for (let i = minIdx; i < minIdx + 200; i++) {
        ensureSlot(i)
        const sl   = slots[i]
        const used = sl.used + sl.assigned.reduce((s, it) => s + it.sp, 0)
        if (used + item.sp <= sl.cap) {
          sl.assigned.push(item); placedAt[item.key] = i; placedSet.add(item.key)
          if (hasDeadline && sl.endDate && item.deadline!.date < sl.endDate)
            violations.push({ key: item.key, desc: item.desc, type: 'deadline', detail: `deadline ${fmtDate(item.deadline!.date)} — placé en Sprint ${sl.number}` })
          placed = true; break
        }
      }
      if (!placed) {
        ensureSlot(Math.max(minIdx, slots.length))
        const sl = slots[Math.max(minIdx, slots.length - 1)]
        sl.assigned.push(item); placedAt[item.key] = slots.indexOf(sl); placedSet.add(item.key)
        if (hasDeadline) violations.push({ key: item.key, desc: item.desc, type: 'deadline', detail: `deadline ${fmtDate(item.deadline!.date)} — capacité insuffisante` })
      }
      const succs = (successors[item.key] ?? []).map(k => sortedItems.find(i => i.key === k)).filter((i): i is Item => !!i && !placedSet.has(i.key))
      if (succs.length === 1) placeOne(succs[0])
    }

    // Placement atomique des groupes Epic/Initiative (2026-08-11, retour Julien après un 2e essai
    // réel) : même avec le tri qui les regroupe déjà (sortItemsForScenario), le remplissage restait
    // item par item ci-dessous (placeOne) - un groupe qui ne tenait plus tout entier dans le sprint
    // en cours d'était placé quand même partiellement (premier arrivé, premier casé), coupé en 2
    // même quand des items SANS Epic, plus petits, auraient pu combler exactement ce qui restait à
    // la place. Avant la boucle habituelle, on tente donc de caser chaque groupe D'UN SEUL BLOC dans
    // le premier sprint qui a la place pour la totalité de son SP - s'il ne rentre nulle part dans
    // la fenêtre de recherche (200 sprints), on laisse ses membres non placés : ils repassent par
    // placeOne() ci-dessous comme avant (même filet de sécurité qu'aujourd'hui, y compris la
    // violation "capacité insuffisante"). Les items SANS Epic ne sont jamais concernés ici, ils
    // gardent leur logique actuelle et viennent naturellement combler les trous laissés par un
    // groupe basculé au sprint suivant.
    function placeGroupAtomically(groupItems: Item[]): boolean {
      // Pre-placement des dependances EXTERNES au groupe (2026-08-12, meme raison que placeOne
      // ci-dessus) - jamais une dependance qui est elle-meme membre de CE groupe : elle sera de
      // toute facon placee avec le reste du groupe juste en dessous, la sortir via placeOne casserait
      // l'atomicite Epic/Initiative que ce mecanisme garantit justement.
      const groupKeys = new Set(groupItems.map(it => it.key))
      for (const it of groupItems) {
        for (const depId of it.deps ?? []) {
          const dk = keyById.get(depId)
          if (!dk || placedSet.has(dk) || groupKeys.has(dk)) continue
          const depItem = allItems.find(x => x.id === depId)
          if (depItem) placeOne(depItem)
        }
      }
      const totalSp = groupItems.reduce((s, it) => s + it.sp, 0)
      // Assouplissement identique a placeOne (meme sprint autorise, voir son commentaire).
      const minIdx = Math.max(startPlaceIdx, ...groupItems.map(it => {
        const depKeys = (it.deps ?? []).map(depId => keyById.get(depId)).filter((k): k is string => !!k)
        return depKeys.reduce((mx, dk) => placedAt[dk] !== undefined ? Math.max(mx, placedAt[dk]) : mx, 0)
      }))
      for (let i = minIdx; i < minIdx + 200; i++) {
        ensureSlot(i)
        const sl   = slots[i]
        const used = sl.used + sl.assigned.reduce((s, it) => s + it.sp, 0)
        if (used + totalSp <= sl.cap) {
          for (const it of groupItems) {
            sl.assigned.push(it); placedAt[it.key] = i; placedSet.add(it.key)
            const hasDeadline = !!it.deadline?.date && it.deadline.type !== 'none'
            if (hasDeadline && sl.endDate && it.deadline!.date < sl.endDate)
              violations.push({ key: it.key, desc: it.desc, type: 'deadline', detail: `deadline ${fmtDate(it.deadline!.date)}, placé en Sprint ${sl.number}` })
          }
          return true
        }
      }
      return false
    }

    // Niveau Initiative (2026-08-11, retour Julien après un 3e essai réel) : chaque Epic reste
    // bien entier (voir passe ci-dessous), mais plusieurs Epics d'une même Initiative pouvaient
    // encore atterrir dans des sprints différents - l'Initiative apparaît "coupée" même si aucun
    // Epic individuel ne l'est. Règle proposée par Julien, reprise telle quelle : si la somme de
    // TOUS les items de l'Initiative (ses Epics ET ses items rattachés directement) tient dans un
    // seul sprint, on la tente d'un bloc (réutilise placeGroupAtomically, même mécanisme que pour
    // un Epic) ; sinon on la laisse se répartir en gardant simplement chaque Epic entier - c'est
    // exactement ce que fait la passe Epic juste après, aucun traitement spécial à écrire pour ce
    // cas : `placeGroupAtomically` échoue naturellement (aucun sprint, existant ou neuf, n'a assez
    // de place pour la totalité) sans rien placer, laissant tous les membres de l'Initiative
    // disponibles pour la passe Epic.
    if (sc.criteriaActive['epic']) {
      const byInitiative = new Map<string, Item[]>()
      const initiativeOrder: string[] = []
      for (const item of sortedItems) {
        const initId = getItemInitiativeId(item, state.hierarchyNodes)
        if (!initId) continue
        if (!byInitiative.has(initId)) { byInitiative.set(initId, []); initiativeOrder.push(initId) }
        byInitiative.get(initId)!.push(item)
      }
      for (const initId of initiativeOrder) {
        const members = byInitiative.get(initId)!.filter(it => !placedSet.has(it.key))
        if (members.length > 0) placeGroupAtomically(members)
      }
    }

    if (sc.criteriaActive['epic']) {
      const byGroup = new Map<string, Item[]>()
      const groupOrder: string[] = []
      for (const item of sortedItems) {
        const gid = item.epicId
        if (!gid) continue
        if (!byGroup.has(gid)) { byGroup.set(gid, []); groupOrder.push(gid) }
        byGroup.get(gid)!.push(item)
      }
      for (const gid of groupOrder) {
        const members = byGroup.get(gid)!.filter(it => !placedSet.has(it.key))
        if (members.length > 0) placeGroupAtomically(members)
      }
    }

    for (const item of sortedItems) { if (!placedSet.has(item.key)) placeOne(item) }

    // Violation 'dep' (retour Julien, 2026-08-12) : une dépendance peut désormais partager le même
    // sprint que son dépendant (assouplissement demandé, voir placeOne/placeGroupAtomically
    // ci-dessus) - avertissement purement informatif (pas un vrai problème comme une deadline ou un
    // Epic scindé), pour que l'équipe sache qu'un séquencement interne au sprint est nécessaire.
    // Toujours vérifiée (contrairement à 'epic-split'), les dépendances existent indépendamment des
    // critères actifs.
    for (const item of itemsToPlace) {
      const idx = placedAt[item.key]
      if (idx === undefined) continue
      const depKeys = (item.deps ?? []).map(depId => keyById.get(depId)).filter((k): k is string => !!k)
      const sameSprintDeps = depKeys.filter(dk => placedAt[dk] === idx)
      if (sameSprintDeps.length === 0) continue
      violations.push({ key: item.key, desc: item.desc, type: 'dep', detail: `même sprint que sa dépendance ${sameSprintDeps.join(', ')} : à séquencer en interne` })
    }

    // Violation 'epic-split' (sous-chantier 4, 2026-08-10) : signalée seulement si le critère de
    // cohésion est actif - un Epic/Initiative réparti sur plusieurs sprints n'est un problème que
    // si Julien a explicitement demandé à les garder groupés ; sinon c'est un comportement normal
    // (contrainte de capacité), pas une anomalie à signaler. Le tri les place déjà côte à côte
    // quand c'est possible (voir sortItemsForScenario) : cette violation couvre le cas où le
    // groupe est trop gros pour tenir dans un seul sprint.
    if (sc.criteriaActive['epic']) {
      const slotsByGroup = new Map<string, Set<number>>()
      for (const item of itemsToPlace) {
        if (!item.epicId) continue
        const idx = placedAt[item.key]
        if (idx === undefined) continue
        if (!slotsByGroup.has(item.epicId)) slotsByGroup.set(item.epicId, new Set())
        slotsByGroup.get(item.epicId)!.add(idx)
      }
      for (const [groupId, idxSet] of slotsByGroup) {
        if (idxSet.size <= 1) continue
        const node = state.hierarchyNodes.find((n: HierarchyNode) => n.id === groupId)
        if (!node) continue
        const sprintLabels = [...idxSet].sort((x, y) => x - y).map(i => slots[i]?.label ?? `Sprint ${i + 1}`)
        violations.push({ key: node.key, desc: node.desc, type: 'epic-split', detail: `réparti sur ${idxSet.size} sprints (${sprintLabels.join(', ')})` })
      }

      // Même vérification, agrégée cette fois par Initiative effective (directe ou via l'Epic
      // parent - voir getItemInitiativeId) : un Epic peut rester entier tout en atterrissant dans
      // un sprint différent d'un AUTRE Epic de la même Initiative, qui apparaît alors répartie
      // sans qu'aucun Epic pris individuellement ne le soit (cas remonté par Julien, 2026-08-11).
      const slotsByInitiative = new Map<string, Set<number>>()
      for (const item of itemsToPlace) {
        const initId = getItemInitiativeId(item, state.hierarchyNodes)
        if (!initId) continue
        const idx = placedAt[item.key]
        if (idx === undefined) continue
        if (!slotsByInitiative.has(initId)) slotsByInitiative.set(initId, new Set())
        slotsByInitiative.get(initId)!.add(idx)
      }
      for (const [initId, idxSet] of slotsByInitiative) {
        if (idxSet.size <= 1) continue
        const node = state.hierarchyNodes.find((n: HierarchyNode) => n.id === initId)
        if (!node) continue
        const sprintLabels = [...idxSet].sort((x, y) => x - y).map(i => slots[i]?.label ?? `Sprint ${i + 1}`)
        violations.push({ key: node.key, desc: node.desc, type: 'epic-split', detail: `réparti sur ${idxSet.size} sprints (${sprintLabels.join(', ')})` })
      }
    }

    updateScenario(sc.id, { slots: slots.filter(s => isSlotNonEmpty(s)), newCount, violations, generated: true })
  }

  function buildCurrentState(sc: Scenario) {
    const doneSt  = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
    const slots: ScenarioSlot[] = state.sprints
      .filter(sp => !sp.closed)
      .map((sp, idx) => {
        const spItems   = state.items.filter(i => i.sprintId === sp.id && !doneSt.includes(i.status))
        const doneItems = state.items.filter(i => i.sprintId === sp.id &&  doneSt.includes(i.status))
        const isCurrent = idx === 0
        const label     = isCurrent && sp.label ? `Sprint ${sp.number} – ${sp.label}` : `Sprint ${sp.number}`
        const cap       = effectiveCapacity(sp, state.team, state.absences) || state.settings.defaultCapacity
        const used      = doneItems.reduce((s, i) => s + i.sp, 0)
        return { sprintId: sp.id, label, cap, used, usedItems: doneItems, assigned: spItems, isNew: false, number: sp.number, startDate: sp.startDate, endDate: sp.endDate }
      })
      .filter(s => isSlotNonEmpty(s))
    updateScenario(sc.id, { slots, generated: true, newCount: 0, violations: [] })
  }

  // Diff d'un seul critère (hors 'epic', qui n'est pas un critère par-item mais par-groupe -
  // voir plus bas) - extrait de sortItemsForScenario pour être réutilisé à la fois dans la
  // boucle de tri principale ET dans le calcul du "représentant" de chaque groupe Epic/Initiative.
  function criterionDiff(a: Item, b: Item, cid: CritId, sc: Scenario): number {
    if (cid === 'priority') return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
    if (cid === 'client') {
      const filteredOrder = sc.clientOrder.filter(id => planningClientIds.has(id))
      const ia = filteredOrder.indexOf(a.clientId), ib = filteredOrder.indexOf(b.clientId)
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
    }
    if (cid === 'socle') return (!a.clientId ? 0 : 1) - (!b.clientId ? 0 : 1)
    if (cid === 'debt')  return (a.type === 'bug' ? 0 : 1) - (b.type === 'bug' ? 0 : 1)
    return 0
  }
  function compareByCriteria(a: Item, b: Item, criteria: CritId[], sc: Scenario): number {
    for (const cid of criteria) {
      const diff = criterionDiff(a, b, cid, sc)
      if (diff !== 0) return diff
    }
    return 0
  }

  function sortItemsForScenario(items: Item[], sc: Scenario): Item[] {
    const topo        = topoSort(items)
    const activeOrder = sc.criteriaOrder.filter(id => sc.criteriaActive[id]) as CritId[]
    const nonEpicOrder = activeOrder.filter(cid => cid !== 'epic')
    const epicActive  = activeOrder.includes('epic')

    // Représentant de chaque groupe (Epic ou Initiative - `item.epicId` pointe indifféremment
    // vers l'un ou l'autre, voir hierarchyScore.ts), pour départager DEUX groupes différents :
    // son item le mieux classé selon les AUTRES critères actifs, dans leur ordre actuel - pas
    // figé sur la priorité : si Julien active "Importance client" en tête, les groupes se
    // classent par client, conformément à sa demande (retour 2026-08-11).
    const groupBest = new Map<string, Item>()
    if (epicActive) {
      for (const item of items) {
        const gid = item.epicId
        if (!gid) continue
        const cur = groupBest.get(gid)
        if (!cur || compareByCriteria(item, cur, nonEpicOrder, sc) < 0) groupBest.set(gid, item)
      }
    }

    const candidate = [...topo].sort((a, b) => {
      const dlRank = (i: Item) => i.deadline?.type === 'imposed' ? 0 : i.deadline?.type === 'negotiable' ? 1 : 2
      const ra = dlRank(a), rb = dlRank(b)
      if (ra !== rb) return ra - rb
      if (ra < 2) { const da = a.deadline?.date ?? '9999', db = b.deadline?.date ?? '9999'; if (da !== db) return da.localeCompare(db) }
      for (const cid of activeOrder) {
        let diff = 0
        if (cid === 'epic') {
          const ga = a.epicId, gb = b.epicId
          if (ga && gb && ga === gb) { diff = 0 }
          else {
            // "Groupé" avant "non groupé" (retour Julien 2026-08-11 : caler un maximum d'Epics
            // d'abord, remplir ensuite avec les items sans Epic) - même principe que le critère
            // 'socle' existant ("sans client" prioritaire), juste inversé.
            diff = (ga ? 0 : 1) - (gb ? 0 : 1)
            if (diff === 0) {   // deux groupes DIFFÉRENTS : décidé par les autres critères actifs
              const ra2 = ga ? (groupBest.get(ga) ?? a) : a
              const rb2 = gb ? (groupBest.get(gb) ?? b) : b
              diff = compareByCriteria(ra2, rb2, nonEpicOrder, sc)
            }
          }
        } else {
          diff = criterionDiff(a, b, cid, sc)
        }
        if (diff !== 0) return diff
      }
      return 0
    })

    if (!epicActive) return candidate

    // Regroupement final, garanti (2026-08-11, retour Julien après le premier essai réel : sans
    // ça, "caler les items sans Epic d'abord puis tous les Epics à la suite" restait possible, et
    // un Epic pouvait quand même se retrouver réparti sur plusieurs sprints). Le comparateur
    // ci-dessus donne un bon ordre de base mais ne GARANTIT pas à lui seul que deux items du même
    // groupe restent côte à côte : un critère positionné avant 'epic' dans la liste (ex.
    // Priorité) peut les départager avant même d'atteindre la branche 'epic' ci-dessus. Passe
    // stable supplémentaire : chaque groupe prend la position de son PREMIER item dans l'ordre
    // candidat, tous ses autres membres sont ramenés juste derrière, dans leur ordre relatif
    // d'origine - c'est cette passe, pas le simple tri comparatif, qui empêche réellement un
    // Epic/Initiative de se retrouver réparti sur plusieurs sprints.
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

  // ── Add / remove / fork ────────────────────────────────────────────────
  function addScenario() {
    const prevId = activeId
    const idx    = _scenarios.filter(s => s.type !== 'current').length
    const color  = SCENARIO_COLORS[idx % SCENARIO_COLORS.length]
    const name   = `Scénario ${String.fromCharCode(65 + idx)}`
    const sc     = makeAutoScenario(name, color, state.clients.map(c => c.id))
    _scenarios        = [..._scenarios, sc]
    _activeScenarioId = sc.id
    setActiveId(sc.id)
    bump()
    triggerEntrance(sc.id, prevId)
  }

  function removeScenario(id: string) {
    if (id === 'current') return
    const removedIdx = _scenarios.findIndex(s => s.id === id)
    _scenarios = _scenarios.filter(s => s.id !== id)
    const nextIdx = nextScenarioIdx(removedIdx, _scenarios.length)
    const next = _scenarios[nextIdx] ?? _scenarios[0]
    _activeScenarioId = next.id
    setActiveId(next.id)
    bump()
  }

  function forkScenario(sourceId: string, fromSprintIndex: number) {
    const prevId  = activeId
    const source  = getScenario(sourceId)
    const idx     = _scenarios.filter(s => s.type !== 'current').length
    const color   = SCENARIO_COLORS[idx % SCENARIO_COLORS.length]
    const name    = `${source.name} (fork S${fromSprintIndex + 1})`
    const sc      = makeAutoScenario(name, color, state.clients.map(c => c.id), {
      criteriaActive: { ...source.criteriaActive },
      criteriaOrder:  [...source.criteriaOrder],
      clientOrder:    [...source.clientOrder],
      velocityFactor: source.velocityFactor,
      forkFrom: { sourceScenarioId: sourceId, fromSprintIndex },
    })
    _scenarios        = [..._scenarios, sc]
    _activeScenarioId = sc.id
    setActiveId(sc.id)
    bump()
    triggerEntrance(sc.id, prevId)
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
    let newSprintsCount = 0
    let reassignedCount = 0
    let createdCount = 0
    for (const slot of sc.slots) {
      if (slot.isNew) {
        const maxNum = newSprints.reduce((m, s) => Math.max(m, s.number), 0)
        newSprints.push({ id: slot.sprintId, number: maxNum + 1, label: '', startDate: localIso(new Date()), endDate: localIso(new Date()), capacity: slot.cap, closed: false })
        newSprintsCount++
      }
      slot.assigned.forEach(item => {
        if (item.id.startsWith('virt-')) {
          const virt   = sc.virtualItems.find(v => v.id === item.id)
          if (!virt) return
          const client = state.clients.find((c: any) => c.id === virt.clientId)
          const prefix = client?.prefix ?? 'VRT'
          const maxNum = newItems.reduce((m, i) => { const n = parseInt(i.key.split('-').pop() ?? '0', 10); return isNaN(n) ? m : Math.max(m, n) }, 0)
          const newItem: Item = {
            id: uid(), key: `${prefix}-${String(maxNum + 1).padStart(3, '0')}`,
            desc: virt.desc, sp: virt.sp, priority: virt.priority,
            clientId: virt.clientId, type: virt.type, status: 'todo',
            sprintId: slot.sprintId.startsWith('new-') ? null : slot.sprintId,
            assignees: [], tags: [], deps: virt.deps ?? [], createdAt: new Date().toISOString(),
          }
          newItems = [...newItems, newItem]
          createdCount++
        } else {
          newItems = newItems.map(i => i.id === (item as Item).id ? { ...i, sprintId: slot.sprintId, status: 'todo' } : i)
          reassignedCount++
        }
      })
    }
    const newState = { ...state, sprints: newSprints, items: newItems }
    dispatch({ type: 'SET_STATE', payload: newState })
    // Chantier B (tranche Auto-planning) : une seule entrée résumé plutôt qu'une
    // par item déplacé, pour ne pas inonder le journal d'une action qui peut
    // toucher des dizaines d'items en un clic.
    const parts = [`${newSprintsCount} sprint(s) créé(s)`, `${reassignedCount} item(s) réaffecté(s)`]
    if (createdCount > 0) parts.push(`${createdCount} item(s) créé(s)`)
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'scenario_apply',
      timestamp: new Date().toISOString(),
      detail: `Scénario "${sc.name}" appliqué : ${parts.join(', ')}`,
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry(newState, historyEntry))
  }

  // ── Override helpers ───────────────────────────────────────────────────
  function getOverride(sc: Scenario, itemId: string): ScenarioItemOverride | undefined { return sc.itemOverrides.find(o => o.itemId === itemId) }
  function setOverride(scId: string, itemId: string, patch: Partial<ScenarioItemOverride>) {
    const sc = getScenario(scId)
    const existing = sc.itemOverrides.find(o => o.itemId === itemId)
    updateScenario(scId, { itemOverrides: existing ? sc.itemOverrides.map(o => o.itemId === itemId ? { ...o, ...patch } : o) : [...sc.itemOverrides, { itemId, ...patch }], generated: false })
  }
  function removeOverride(scId: string, itemId: string) { updateScenario(scId, { itemOverrides: getScenario(scId).itemOverrides.filter(o => o.itemId !== itemId), generated: false }) }

  // ── Virtual item helpers ───────────────────────────────────────────────
  function addVirtualItem(scId: string, data: Omit<VirtualItem, 'id' | 'scenarioId'>) {
    const sc = getScenario(scId)
    updateScenario(scId, { virtualItems: [...sc.virtualItems, { id: 'virt-' + uid(), scenarioId: scId, ...data }], generated: false })
    setVirtTarget(null)
  }
  function removeVirtualItem(scId: string, virtId: string) { updateScenario(scId, { virtualItems: getScenario(scId).virtualItems.filter(v => v.id !== virtId), generated: false }) }

  // ── Criteria DnD ──────────────────────────────────────────────────────
  function critDrop(scId: string, toIdx: number) {
    if (dragCritIdx === null || dragCritIdx === toIdx) return
    const arr = [...getScenario(scId).criteriaOrder]
    const [el] = arr.splice(dragCritIdx, 1); arr.splice(toIdx, 0, el)
    updateScenario(scId, { criteriaOrder: arr, generated: false })
    setDragCritIdx(null); setDragOverCritIdx(null)
  }
  function toggleCrit(scId: string, critId: string, checked: boolean) {
    const sc       = getScenario(scId)
    const newActive = { ...sc.criteriaActive, [critId]: checked }
    let newOrder   = [...sc.criteriaOrder]
    const currentIdx = newOrder.indexOf(critId)
    if (checked) {
      if (currentIdx > 0) {
        let insertAfter = -1
        for (let i = 0; i < currentIdx; i++) { if (sc.criteriaActive[newOrder[i]]) insertAfter = i }
        if (insertAfter < currentIdx - 1) { newOrder.splice(currentIdx, 1); newOrder.splice(insertAfter + 1, 0, critId) }
      }
    } else {
      let lastCheckedIdx = -1
      for (let i = 0; i < newOrder.length; i++) { if (i !== currentIdx && newActive[newOrder[i]]) lastCheckedIdx = i }
      if (lastCheckedIdx > currentIdx) { newOrder.splice(currentIdx, 1); newOrder.splice(lastCheckedIdx, 0, critId) }
    }
    updateScenario(scId, { criteriaActive: newActive, criteriaOrder: newOrder, generated: false })
  }
  function clientDrop(scId: string, toIdx: number) {
    if (dragClientIdx === null || dragClientIdx === toIdx) return
    const arr = [...getScenario(scId).clientOrder]
    const [el] = arr.splice(dragClientIdx, 1); arr.splice(toIdx, 0, el)
    updateScenario(scId, { clientOrder: arr, generated: false })
    setDragClientIdx(null); setDragOverClientIdx(null)
  }

  function toggleSection(key: string) {
    setOpenSections(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  function selectScenario(id: string) {
    setActiveId(id)
    _activeScenarioId = id
    persistScenarios(_scenarios, _activeScenarioId)
    const sc = getScenario(id)
    if (sc.type === 'current' && !sc.generated) buildCurrentState(sc)
  }

  // Rebuild État actuel whenever sprint/item counts change (handles cache → server two-stage load)
  const _lastBuildKey = useRef('')
  useEffect(() => {
    if (state.sprints.length === 0 || state.items.length === 0) return
    const key = `${state.sprints.length}:${state.items.length}`
    if (_lastBuildKey.current === key) return
    _lastBuildKey.current = key
    const current = _scenarios.find(s => s.type === 'current')
    if (current) buildCurrentState(current)
  }, [state.sprints.length, state.items.length]) // eslint-disable-line

  // ── Stats ──────────────────────────────────────────────────────────────
  const doneSt2      = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
  const pendingItems = state.items.filter(i => !doneSt2.includes(i.status) && !state.sprints.find(s => s.id === i.sprintId)?.closed)
  const pendingSP    = pendingItems.reduce((s, i) => s + i.sp, 0)
  const openSprints  = state.sprints.filter(s => !s.closed).length
  const graphSprintCount = Math.max(openSprints, ..._scenarios.filter(s => s.generated).map(s => s.slots.length), 4)

  const CTRL: React.CSSProperties         = { height: 30, border: '1px solid var(--border)', borderRadius: 7, backgroundColor: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }
  const CTRL_PRIMARY: React.CSSProperties = { ...CTRL, border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: 600 }
  const CTRL_SUCCESS: React.CSSProperties = { ...CTRL, border: 'none', backgroundColor: 'var(--success)', color: '#fff', fontWeight: 600 }

  return (
    <>
      {/* CSS animation */}
      <style>{`
        @keyframes cardSlideIn {
          from { transform: translateY(56px); opacity: 0 }
          to   { transform: translateY(0);    opacity: 1 }
        }
      `}</style>

      <Header title="Auto-planning">
        <span className="hdr-ctx-stat">{pendingItems.length} items</span>
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{pendingSP} SP en attente</span>
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{openSprints} sprints ouverts</span>
        <div style={{ flex: 1 }} />
        {showCompare && (
          <select style={{ fontSize: 11, height: 28, width: 150, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text)', padding: '0 8px' }}
            value={compareId ?? ''} onChange={e => setCompareId(e.target.value || null)}>
            <option value="">Comparer avec…</option>
            {_scenarios.filter(s => s.id !== activeId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button style={{ ...CTRL, gap: 5, background: showCompare ? 'var(--primary-light)' : 'transparent', borderColor: showCompare ? 'var(--primary)' : 'var(--border)' }}
          onClick={() => setShowCompare(v => !v)}>
          <Ico d={ICO.eye} size={12} /> Comparer
        </button>
        {canExplore && (
          <button style={CTRL_PRIMARY} onClick={addScenario} data-testid="btn-new-scenario">
            <Ico d={ICO.plus} size={12} stroke="#fff" /> Nouveau scénario
          </button>
        )}
        <div className="hdr-sep" />
      </Header>

      {/* ── Card stack ──────────────────────────────────────────────────── */}
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {_scenarios.map((sc, scIdx) => {
          const isActive     = sc.id === activeId
          const isTransitioning = sc.id === prevActiveId  // stays expanded during entrance anim
          const isExpanded   = isActive || isTransitioning
          const animState    = cardAnim.get(sc.id)
          const isEntering   = animState !== undefined

          // Entrance animation transform
          const cardTransform: React.CSSProperties = isEntering
            ? { transform: animState ? 'translateY(0)' : 'translateY(56px)', opacity: animState ? 1 : 0, transition: animState ? 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease' : 'none' }
            : {}

          return (
            <div key={sc.id} style={{
              background: 'var(--surface)',
              borderRadius: isActive
                ? 'var(--radius)'
                : `var(--radius) var(--radius) 0 0`,
              boxShadow: isActive
                ? '0 8px 24px rgba(0,0,0,.13), 0 2px 6px rgba(0,0,0,.08)'
                : '0 1px 3px rgba(0,0,0,.06)',
              border: `1.5px solid ${isActive ? sc.color + '55' : 'var(--border)'}`,
              overflow: 'hidden',
              opacity: isActive ? 1 : 0.72,
              zIndex: isActive ? 10 : scIdx,
              position: 'relative',
              paddingBottom: isActive ? 0 : 16,
              marginBottom: isActive ? 0 : -16,
              transition: 'box-shadow .2s, opacity .2s, border-color .2s',
              ...cardTransform,
            }}>

              {/* ── Card header ─────────────────────────────────── */}
              <div
                onClick={() => { if (!isActive) selectScenario(sc.id) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 60, cursor: isActive ? 'default' : 'pointer', userSelect: 'none' }}
              >
                {/* Color dot + name + type badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 170, flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: sc.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{sc.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 10,
                    background: sc.type === 'current' ? 'var(--surface2)' : sc.type === 'auto' ? '#dbeafe' : '#fef9c3',
                    color: sc.type === 'current' ? 'var(--text-muted)' : sc.type === 'auto' ? '#1d4ed8' : '#92400e',
                  }}>
                    {sc.type === 'current' ? 'DB' : sc.type === 'auto' ? 'auto' : 'manuel'}
                  </span>
                </div>

                {/* Mini metro graph */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                  <ScenarioMiniGraph scenario={sc} allScenarios={_scenarios} sprintCount={graphSprintCount} onFork={canExplore ? forkScenario : undefined} />
                </div>

                {/* Action buttons (active) or chevron (inactive) */}
                {isActive ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {(sc.type === 'current' || canExplore) && (
                      <button style={CTRL_PRIMARY} onClick={e => { e.stopPropagation(); generateScenario(sc) }} data-testid={`btn-generate-${sc.id}`}>
                        <Ico d={ICO.zap} size={12} stroke="#fff" />
                        {sc.type === 'current' ? 'Actualiser' : sc.generated ? 'Regénérer' : 'Générer'}
                      </button>
                    )}
                    {sc.generated && sc.type !== 'current' && canApply && (
                      <button style={CTRL_SUCCESS} onClick={e => { e.stopPropagation(); applyScenario(sc) }} data-testid={`btn-apply-${sc.id}`}>
                        <Ico d={ICO.check} size={12} stroke="#fff" /> Appliquer
                      </button>
                    )}
                    {sc.type !== 'current' && canExplore && (
                      <button style={{ ...CTRL, padding: '0 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        onClick={e => { e.stopPropagation(); removeScenario(sc.id) }}>
                        <Ico d={ICO.trash} size={11} stroke="var(--danger)" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                    <Ico d={ICO.chevron} size={14} stroke="var(--text-muted)" />
                  </div>
                )}
              </div>

              {/* ── Card body — animated height via CSS grid ─────── */}
              <div style={{
                display: 'grid',
                gridTemplateRows: isExpanded ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.3s ease',
              }}>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ padding: 16 }}>
                    {sc.type === 'current' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>
                        {/* ── Highlight panel ──────────────────── */}
                        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
                          <SectionHeader label="Clients" open={openCurrentSections.has('clients')} firstInGroup
                            onToggle={() => setOpenCurrentSections(prev => { const n = new Set(prev); n.has('clients') ? n.delete('clients') : n.add('clients'); return n })} />
                          {openCurrentSections.has('clients') && (
                            <div style={{ padding: '8px 14px 12px' }}>
                              {state.clients.map((c: any) => (
                                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', cursor: 'pointer', fontSize: 11, fontWeight: 400 }}>
                                  <input type="checkbox" checked={hlClients.has(c.id)}
                                    onChange={e => setHlClients(prev => { const n = new Set(prev); e.target.checked ? n.add(c.id) : n.delete(c.id); return n })} />
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                                  {c.name}
                                </label>
                              ))}
                            </div>
                          )}
                          <SectionHeader label="Type" open={openCurrentSections.has('types')}
                            onToggle={() => setOpenCurrentSections(prev => { const n = new Set(prev); n.has('types') ? n.delete('types') : n.add('types'); return n })} />
                          {openCurrentSections.has('types') && (
                            <div style={{ padding: '8px 14px 12px' }}>
                              {([
                                ['bug',   'Bug'],
                                ['story', 'Story'],
                                ['task',  'Tâche'],
                                ['spike', 'Spike'],
                                ['epic',  'Épic'],
                              ] as const).map(([val, label]) => (
                                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', cursor: 'pointer', fontSize: 11, fontWeight: 400 }}>
                                  <input type="checkbox" checked={hlTypes.has(val)}
                                    onChange={e => setHlTypes(prev => { const n = new Set(prev); e.target.checked ? n.add(val) : n.delete(val); return n })} />
                                  <span style={{ textTransform: 'none', fontWeight: 400 }}>{label}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          <SectionHeader label="Priorité" open={openCurrentSections.has('priority')}
                            onToggle={() => setOpenCurrentSections(prev => { const n = new Set(prev); n.has('priority') ? n.delete('priority') : n.add('priority'); return n })} />
                          {openCurrentSections.has('priority') && (
                            <div style={{ padding: '8px 14px 12px' }}>
                              {([
                                ['critical', 'Critique', '#dc2626'],
                                ['high',     'Haute',    '#ea580c'],
                                ['medium',   'Moyenne',  '#d97706'],
                                ['low',      'Basse',    '#6b7280'],
                              ] as const).map(([val, label, color]) => (
                                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', cursor: 'pointer', fontSize: 11, fontWeight: 400 }}>
                                  <input type="checkbox" checked={hlPriority.has(val)}
                                    onChange={e => setHlPriority(prev => { const n = new Set(prev); e.target.checked ? n.add(val) : n.delete(val); return n })} />
                                  <span style={{ color, fontWeight: 400, textTransform: 'none' }}>{label}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* ── Proposal for état actuel ─────────── */}
                        <ProposalPanel
                          scenario={sc} allScenarios={_scenarios} state={state} sprintsMeta={state.sprints}
                          onOverrideOpen={itemId => setOverrideTarget({ scenarioId: sc.id, itemId })}
                          onAddVirtual={sprintId => setVirtTarget({ scenarioId: sc.id, sprintId })}
                          onRemoveVirtual={virtId => removeVirtualItem(sc.id, virtId)}
                          highlightClients={hlClients} highlightTypes={hlTypes} highlightPriority={hlPriority}
                          readOnly={!canExplore}
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

                        {/* ── Settings accordion ───────────────── */}
                        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>

                          <SectionHeader label="Vélocité" firstInGroup
                            badge={`${Math.round(sc.velocityFactor * 100)}%`}
                            badgeColor={sc.velocityFactor < 1 ? 'var(--warning, #d97706)' : undefined}
                            open={openSections.has('velocity')} onToggle={() => toggleSection('velocity')} />
                          {openSections.has('velocity') && (
                            <div style={{ padding: '12px 14px' }}>
                              <input type="range" min={40} max={120} step={5}
                                value={Math.round(sc.velocityFactor * 100)}
                                disabled={!canExplore}
                                onChange={e => updateScenario(activeId, { velocityFactor: Number(e.target.value) / 100, generated: false })}
                                style={{ width: '100%', accentColor: sc.color, opacity: canExplore ? 1 : .6, cursor: canExplore ? 'pointer' : 'not-allowed' }} />
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                                <span>40%</span><span>Normal</span><span>120%</span>
                              </div>
                            </div>
                          )}

                          <SectionHeader label="Capacités par sprint"
                            open={openSections.has('capacity')} onToggle={() => toggleSection('capacity')} />
                          {openSections.has('capacity') && (
                            <div style={{ padding: '12px 14px' }}>
                              {state.sprints.filter((sp: Sprint) => !sp.closed).map((sp: Sprint) => {
                                const ov   = sc.capacityOverrides.find(o => o.sprintId === sp.id)
                                const base = effectiveCapacity(sp, state.team, state.absences) || state.settings.defaultCapacity
                                return (
                                  <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontSize: 11, width: 52, flexShrink: 0 }}>S{sp.number}</span>
                                    <input type="number" min={0} max={200} step={1} value={ov ? ov.capacity : base}
                                      disabled={!canExplore}
                                      onChange={e => {
                                        const cap = Number(e.target.value)
                                        updateScenario(activeId, { capacityOverrides: ov ? sc.capacityOverrides.map(o => o.sprintId === sp.id ? { ...o, capacity: cap } : o) : [...sc.capacityOverrides, { sprintId: sp.id, capacity: cap }], generated: false })
                                      }}
                                      style={{ width: 52, height: 26, fontSize: 11, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 5, background: 'transparent', color: ov ? 'var(--warning, #d97706)' : 'var(--text)' }} />
                                    <input placeholder="Note" disabled={!canExplore} style={{ flex: 1, height: 26, fontSize: 10, border: '1px solid var(--border)', borderRadius: 5, padding: '0 6px', background: 'transparent', color: 'var(--text)' }}
                                      value={ov?.note ?? ''}
                                      onChange={e => {
                                        const note = e.target.value
                                        updateScenario(activeId, { capacityOverrides: ov ? sc.capacityOverrides.map(o => o.sprintId === sp.id ? { ...o, note } : o) : [...sc.capacityOverrides, { sprintId: sp.id, capacity: base, note }] })
                                      }} />
                                    {ov && canExplore && <button style={{ ...CTRL, padding: '0 6px', height: 22, color: 'var(--danger)' }}
                                      onClick={() => updateScenario(activeId, { capacityOverrides: sc.capacityOverrides.filter(o => o.sprintId !== sp.id), generated: false })}>
                                      <Ico d={ICO.x} size={9} stroke="var(--danger)" />
                                    </button>}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          <SectionHeader label="Critères" hint="glisser pour réordonner"
                            open={openSections.has('criteria')} onToggle={() => toggleSection('criteria')} />
                          {openSections.has('criteria') && (
                            <div style={{ padding: '12px 14px' }}>
                              {sc.criteriaOrder.map((critId, i) => {
                                const def         = CRIT_DEFS[critId as CritId]
                                const isActiveCrit = sc.criteriaActive[critId] ?? false
                                const rank        = sc.criteriaOrder.slice(0, i + 1).filter(id => sc.criteriaActive[id]).length
                                const isDropTarget = dragOverCritIdx === i && dragCritIdx !== null && dragCritIdx !== i
                                return (
                                  <div key={critId} draggable={canExplore}
                                    onDragStart={() => { if (canExplore) { setDragCritIdx(i); setDragOverCritIdx(null) } }}
                                    onDragOver={e => { if (canExplore) { e.preventDefault(); setDragOverCritIdx(i) } }}
                                    onDragLeave={() => setDragOverCritIdx(null)}
                                    onDrop={() => canExplore && critDrop(activeId, i)}
                                    onDragEnd={() => { setDragCritIdx(null); setDragOverCritIdx(null) }}
                                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 9px', marginBottom: 5, borderRadius: 7, cursor: canExplore ? 'grab' : 'default', background: isActiveCrit ? 'var(--primary-light)' : 'var(--surface2)', border: `1.5px solid ${isActiveCrit ? 'var(--primary)' : 'var(--border)'}`, outline: isDropTarget ? '2px solid var(--primary)' : 'none', outlineOffset: 2, opacity: dragCritIdx === i ? 0.5 : 1, transition: 'outline .1s, opacity .15s' }}>
                                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: isActiveCrit ? 'var(--primary)' : 'var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                                      {isActiveCrit ? rank : '–'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                                        <span style={{ fontWeight: 400, fontSize: 11, textTransform: 'none', letterSpacing: 'normal' }}>{def.title}</span>
                                        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, cursor: canExplore ? 'pointer' : 'default' }}>
                                          <input type="checkbox" checked={isActiveCrit} disabled={!canExplore} onChange={e => toggleCrit(activeId, critId, e.target.checked)} />
                                          Activer
                                        </label>
                                      </div>
                                      <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>{def.desc}</div>
                                    </div>
                                  </div>
                                )
                              })}
                              {sc.criteriaActive['client'] && (
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Ordre des clients</div>
                                  {sc.clientOrder.filter(cid => planningClientIds.has(cid)).map((cid, i) => {
                                    const client   = state.clients.find((c: any) => c.id === cid)
                                    if (!client) return null
                                    const origIdx  = sc.clientOrder.indexOf(cid)
                                    const isClientDrop = dragOverClientIdx === origIdx && dragClientIdx !== null && dragClientIdx !== origIdx
                                    return (
                                      <div key={cid} draggable={canExplore}
                                        onDragStart={() => { if (canExplore) { setDragClientIdx(origIdx); setDragOverClientIdx(null) } }}
                                        onDragOver={e => { if (canExplore) { e.preventDefault(); setDragOverClientIdx(origIdx) } }}
                                        onDragLeave={() => setDragOverClientIdx(null)}
                                        onDrop={() => canExplore && clientDrop(activeId, origIdx)}
                                        onDragEnd={() => { setDragClientIdx(null); setDragOverClientIdx(null) }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 9px', marginBottom: 3, background: 'var(--surface2)', borderRadius: 5, cursor: canExplore ? 'grab' : 'default', outline: isClientDrop ? '2px solid var(--primary)' : 'none', outlineOffset: 2, opacity: dragClientIdx === origIdx ? 0.5 : 1, transition: 'outline .1s, opacity .15s' }}>
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

                          <SectionHeader label="Règles"
                            open={openSections.has('rules')} onToggle={() => toggleSection('rules')} />
                          {openSections.has('rules') && (
                            <div style={{ padding: '12px 14px', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.9 }}>
                              <div>Items terminés et sprints clôturés ne sont pas modifiés.</div>
                              <div style={{ display: 'flex', gap: 5 }}><Ico d={ICO.link} size={10} stroke="var(--text-muted)" /><span><strong>Dépendances</strong> : contrainte dure entre sprints.</span></div>
                              <div style={{ display: 'flex', gap: 5 }}><Ico d={ICO.clock} size={10} stroke="var(--text-muted)" /><span><strong>Deadlines</strong> : priorité absolue, violation signalée.</span></div>
                              <div style={{ marginTop: 4, fontStyle: 'italic', fontSize: 9 }}>Clic droit sur un point du graphe → forker</div>
                            </div>
                          )}
                        </div>

                        {/* ── Proposal ─────────────────────────── */}
                        {(() => {
                          // Compare: older scenario on left, newer on right
                          const cmpSc = showCompare && compareId ? getScenario(compareId) : null
                          const activeIdx = _scenarios.findIndex(s => s.id === sc.id)
                          const cmpIdx    = _scenarios.findIndex(s => s.id === compareId)
                          const leftSc    = cmpSc && cmpIdx < activeIdx ? cmpSc : sc
                          const rightSc   = cmpSc && cmpIdx < activeIdx ? sc    : cmpSc
                          return (
                            <div style={{ display: cmpSc ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                              <ProposalPanel
                                scenario={leftSc} allScenarios={_scenarios} state={state} sprintsMeta={state.sprints}
                                onOverrideOpen={itemId => setOverrideTarget({ scenarioId: leftSc.id, itemId })}
                                onAddVirtual={sprintId => setVirtTarget({ scenarioId: leftSc.id, sprintId })}
                                onRemoveVirtual={virtId => removeVirtualItem(leftSc.id, virtId)}
                                readOnly={!canExplore}
                              />
                              {rightSc && (
                                <ProposalPanel
                                  scenario={rightSc} allScenarios={_scenarios} state={state} sprintsMeta={state.sprints}
                                  onOverrideOpen={itemId => setOverrideTarget({ scenarioId: rightSc.id, itemId })}
                                  onAddVirtual={sprintId => setVirtTarget({ scenarioId: rightSc.id, sprintId })}
                                  onRemoveVirtual={virtId => removeVirtualItem(rightSc.id, virtId)}
                                  readOnly={!canExplore}
                                />
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )
        })}
      </div>

      {/* ── Item override popup ───────────────────────────────────────── */}
      {overrideTarget && (() => {
        const sc   = getScenario(overrideTarget.scenarioId)
        const item = state.items.find((i: Item) => i.id === overrideTarget.itemId)
        if (!item) return null
        const ov   = getOverride(sc, overrideTarget.itemId)
        const OV_SEL: React.CSSProperties = { display: 'block', width: '100%', marginTop: 4, height: 32, fontSize: 11, border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface)', color: 'var(--text)', padding: '0 6px' }
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => e.target === e.currentTarget && setOverrideTarget(null)}>
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, width: 340, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Override — {item.key}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>{item.desc}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 11 }}>Statut<select value={ov?.statusOverride ?? item.status} onChange={e => setOverride(overrideTarget.scenarioId, item.id, { statusOverride: e.target.value })} style={OV_SEL}><option value="todo">À faire</option><option value="in-progress">En cours</option><option value="blocked">Bloqué</option><option value="done">Terminé</option></select></label>
                <label style={{ fontSize: 11 }}>Priorité<select value={ov?.priorityOverride ?? item.priority} onChange={e => setOverride(overrideTarget.scenarioId, item.id, { priorityOverride: e.target.value as any })} style={OV_SEL}><option value="critical">Critique</option><option value="high">Haute</option><option value="medium">Moyenne</option><option value="low">Basse</option></select></label>
                <label style={{ fontSize: 11 }}>SP (réel : {item.sp})<input type="number" min={1} value={ov?.spOverride ?? item.sp} onChange={e => setOverride(overrideTarget.scenarioId, item.id, { spOverride: Number(e.target.value) })} style={{ ...OV_SEL, padding: '0 6px' }} /></label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                {ov && <button style={{ ...CTRL, color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: 11 }} onClick={() => { removeOverride(overrideTarget.scenarioId, item.id); setOverrideTarget(null) }}>Supprimer l'override</button>}
                <button style={{ ...CTRL, fontSize: 11 }} onClick={() => setOverrideTarget(null)}>Fermer</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Virtual item form ─────────────────────────────────────────── */}
      {virtTarget && <VirtualItemForm scenarioId={virtTarget.scenarioId} sprintId={virtTarget.sprintId} clients={state.clients} onSave={data => addVirtualItem(virtTarget.scenarioId, data)} onClose={() => setVirtTarget(null)} CTRL={CTRL} CTRL_PRIMARY={CTRL_PRIMARY} />}
    </>
  )
}

// ── SectionHeader ──────────────────────────────────────────────────────────
function SectionHeader({ label, hint, badge, badgeColor, open, onToggle, firstInGroup }: {
  label: string; hint?: string; badge?: string; badgeColor?: string
  open: boolean; onToggle: () => void; firstInGroup?: boolean
}) {
  return (
    <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '9px 14px', background: 'none', border: 'none', borderTop: firstInGroup ? 'none' : '1px solid var(--border)', cursor: 'pointer', gap: 6, color: 'var(--text)', textTransform: 'none' }}>
      <span style={{ fontWeight: 600, fontSize: 11, flex: 1, textAlign: 'left', textTransform: 'none', letterSpacing: 'normal' }}>{label}</span>
      {hint && <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>{hint}</span>}
      {badge && <span style={{ fontSize: 9, color: badgeColor ?? 'var(--text-muted)', fontWeight: 600 }}>{badge}</span>}
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>
        <path d="m9 18 6-6-6-6"/>
      </svg>
    </button>
  )
}

// ── ProposalPanel ──────────────────────────────────────────────────────────
// `readOnly` : Stakeholder (voir utils/permissions.ts, canExploreWhatIf) — masque les actions
// d'édition (item fictif, override) sans toucher à l'affichage de la proposition elle-même.
function ProposalPanel({ scenario, allScenarios: _all, state, sprintsMeta, onOverrideOpen, onAddVirtual, onRemoveVirtual, highlightClients, highlightTypes, highlightPriority, readOnly }: {
  scenario: Scenario; allScenarios: Scenario[]; state: any; sprintsMeta: Sprint[]
  onOverrideOpen: (itemId: string) => void; onAddVirtual: (sprintId: string) => void; onRemoveVirtual: (virtId: string) => void
  highlightClients?: Set<string>; highlightTypes?: Set<string>; highlightPriority?: Set<string>
  readOnly?: boolean
}) {
  const ICO2 = {
    warn:  '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    link:  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    star:  '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    plus:  '<path d="M5 12h14"/><path d="M12 5v14"/>',
    ghost: '<path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/>',
    pencil:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    x:     '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    cal:   '<path d="M11 14h1v4"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="M8 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/>',
  }
  function Ico2({ d, size = 12, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
  }

  // ── Hover dep-chain state ────────────────────────────────────────────────
  // deps stocke des IDs (ex: "i5"), pas des clés → byId depuis state.items (full objects)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const propItemIds = new Set(
    scenario.slots.flatMap(s => [...s.assigned, ...(s.usedItems ?? [])])
      .filter(i => !i.id.startsWith('virt-')).map(i => i.id)
  )
  const byId = new Map<string, Item>(
    (state.items as Item[]).filter((i: Item) => propItemIds.has(i.id)).map((i: Item) => [i.id, i])
  )
  function depChain(startId: string): Set<string> {
    const ch = new Set<string>()
    function preds(id: string) { const it = byId.get(id); for (const d of (it?.deps ?? [])) { if (!ch.has(d)) { ch.add(d); preds(d) } } }
    function succs(id: string) { for (const [iid, it] of byId) { if ((it.deps ?? []).includes(id) && !ch.has(iid)) { ch.add(iid); succs(iid) } } }
    preds(startId); succs(startId); return ch
  }
  const lvlCache = new Map<string, number>()
  function topoLvl(id: string, vis = new Set<string>()): number {
    if (lvlCache.has(id)) return lvlCache.get(id)!
    if (vis.has(id)) return 0; vis.add(id)
    const it = byId.get(id)
    if (!it || !(it.deps ?? []).length) { lvlCache.set(id, 0); return 0 }
    const lv = 1 + Math.max(0, ...(it.deps ?? []).map(d => topoLvl(d, new Set(vis))))
    lvlCache.set(id, lv); return lv
  }
  const hovChain = hoveredId ? depChain(hoveredId) : null

  // ── Epic/Initiative maps ────────────────────────────────────────────────
  const epicMap = new Map<string, HierarchyNode>(
    state.hierarchyNodes.filter((n: HierarchyNode) => n.level === 'epic').map((n: HierarchyNode): [string, HierarchyNode] => [n.id, n])
  )
  const initiativeMap = new Map<string, HierarchyNode>(
    state.hierarchyNodes.filter((n: HierarchyNode) => n.level === 'initiative').map((n: HierarchyNode): [string, HierarchyNode] => [n.id, n])
  )
  const itemsByGroupId = new Map<string, Item[]>()
  ;(state.items as Item[]).filter((i: Item) => i.epicId).forEach((i: Item) => {
    if (!itemsByGroupId.has(i.epicId!)) itemsByGroupId.set(i.epicId!, [])
    itemsByGroupId.get(i.epicId!)!.push(i)
  })
  const epicChildCount = new Map<string, number>()
  itemsByGroupId.forEach((its, id) => epicChildCount.set(id, its.length))

  // SP total d'un Epic (score arbitraire s'il est renseigné, sinon somme de ses items - même
  // convention que le Backlog, `getHierarchyNodeSP()`) - retour Julien, 2026-08-11 : affiché à côté
  // du titre dans les en-têtes de groupe. Le score d'une Initiative n'est PAS calculé ici en global :
  // affiché par slot (voir `spHere` plus bas, sur `Row['initiative']`), car une Initiative peut être
  // dispatchée sur plusieurs sprints en gardant ses Epics entiers - le score global tromperait sur
  // chaque sprint où elle n'apparaît que partiellement.
  const epicSP = new Map<string, number>()
  epicMap.forEach((epic, id) => epicSP.set(id, getHierarchyNodeSP(epic, (itemsByGroupId.get(id) ?? []).map(i => i.sp))))

  return (
    <div style={{ minHeight: 100 }}>
      {!scenario.generated ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: 0 }}>
          {scenario.type === 'current' ? 'Cliquez sur "Actualiser" pour charger l\'état actuel.' : 'Cliquez sur "Générer" pour calculer la proposition.'}
        </p>
      ) : (
        <>
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

          {scenario.newCount > 0 && (
            <div style={{ marginBottom: 10, padding: '7px 10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 7, fontSize: 11, color: '#c2410c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ico2 d={ICO2.warn} size={11} stroke="#c2410c" />
              {scenario.newCount} nouveau{scenario.newCount > 1 ? 'x' : ''} sprint{scenario.newCount > 1 ? 's' : ''} {scenario.newCount > 1 ? 'seront créés' : 'sera créé'}
            </div>
          )}

          {scenario.slots.map(slot => {
            const total = slot.used + slot.assigned.reduce((s, i) => s + i.sp, 0)
            const pct   = slot.cap > 0 ? Math.min(Math.round(total / slot.cap * 100), 100) : 0
            const over  = total > slot.cap

            // ── Grouper les items par Epic puis Initiative (sous-chantier 4, 2026-08-10) ────
            // `buildItemsFirstHierarchy()` (items-first, 2 niveaux) plutôt que l'ancien
            // `groupItemsByEpic()` (1 niveau, Epic seulement) : un item rattaché DIRECTEMENT à
            // une Initiative (sans Epic intermédiaire, cas prévu par le modèle - voir
            // hierarchyScore.ts) s'affichait jusqu'ici comme orphelin, jamais sous son
            // Initiative - trou identifié dans corrections futures.md ("Vérifier si les
            // initiatives et les Epics sont pris en compte"). Extracteur explicite, même raison
            // que l'ancien appel : `slot.assigned` mélange `Item` et `VirtualItem` (ce dernier
            // n'a pas de champ epicId).
            type Row =
              | { kind: 'initiative'; initiativeId: string; spHere: number }
              | { kind: 'epic'; epicId: string; inInitiative?: string }
              | { kind: 'item'; item: Item | VirtualItem; inEpic?: string; inInitiative?: string }
            const hierarchy = buildItemsFirstHierarchy<Item | VirtualItem>(
              slot.assigned,
              state.hierarchyNodes,
              (it) => !it.id.startsWith('virt-') ? (it as Item).epicId : undefined,
            )
            const storiesHereByEpicId = new Map<string, number>()
            hierarchy.standaloneEpics.forEach(g => storiesHereByEpicId.set(g.epicId, g.items.length))
            hierarchy.initiativeSections.forEach(sec => sec.epics.forEach(g => storiesHereByEpicId.set(g.epicId, g.items.length)))
            // `spHereByEpicId` (retour Julien, 2026-08-12) : score de l'Epic RÉELLEMENT présent dans
            // CE sprint, pas son score global (`epicSP`) - contrairement à ce que supposait l'ancien
            // commentaire ici, un Epic PEUT être scindé sur plusieurs sprints quand le critère
            // "Cohésion Epic" n'est pas actif (placement piloté par la seule capacité) : affichait à
            // tort le score total de l'Epic sur chaque sprint où il n'apparaît que partiellement.
            const spHereByEpicId = new Map<string, number>()
            hierarchy.standaloneEpics.forEach(g => spHereByEpicId.set(g.epicId, g.items.reduce((s, it) => s + it.sp, 0)))
            hierarchy.initiativeSections.forEach(sec => sec.epics.forEach(g => spHereByEpicId.set(g.epicId, g.items.reduce((s, it) => s + it.sp, 0))))
            const rows: Row[] = [
              ...hierarchy.orphans.map(it => ({ kind: 'item' as const, item: it })),
              ...hierarchy.standaloneEpics.flatMap(({ epicId, items }) => [
                { kind: 'epic' as const, epicId },
                ...items.map(it => ({ kind: 'item' as const, item: it, inEpic: epicId })),
              ]),
              // `spHere` (retour Julien, 2026-08-11) : score de l'Initiative RÉELLEMENT présent dans
              // CE sprint, pas son score global - une Initiative trop grosse pour un seul sprint se
              // répartit en gardant chaque Epic entier (voir generateScenario), donc le score global
              // afficherait à tort la totalité sur chaque sprint où elle apparaît partiellement. Somme
              // sur les items de `g.items` (déjà scopés à ce sprint) plutôt que sur `epicSP` (score
              // global de l'Epic) - même correctif que `spHereByEpicId` ci-dessus, 2026-08-12 : un Epic
              // peut lui aussi être scindé (critère "Cohésion Epic" inactif).
              ...hierarchy.initiativeSections.flatMap(sec => {
                const spHere = sec.epics.reduce((s, g) => s + g.items.reduce((s2, it) => s2 + it.sp, 0), 0)
                  + sec.directItems.reduce((s, it) => s + it.sp, 0)
                return [
                  { kind: 'initiative' as const, initiativeId: sec.initiative.id, spHere },
                  ...sec.directItems.map(it => ({ kind: 'item' as const, item: it, inInitiative: sec.initiative.id })),
                  ...sec.epics.flatMap(({ epicId, items }) => [
                    { kind: 'epic' as const, epicId, inInitiative: sec.initiative.id },
                    ...items.map(it => ({ kind: 'item' as const, item: it, inEpic: epicId, inInitiative: sec.initiative.id })),
                  ]),
                ]
              }),
            ]

            return (
              <div key={slot.sprintId} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                <div style={{ padding: '7px 12px', background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontWeight: 700, fontSize: 11 }}>{slot.label}</span>
                    {slot.isNew && <span style={{ fontSize: 9, background: '#d1fae5', color: '#065f46', padding: '1px 5px', borderRadius: 8, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Ico2 d={ICO2.star} size={8} stroke="#065f46" /> Nouveau</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: over ? 'var(--danger)' : 'var(--text-muted)', fontWeight: over ? 700 : 400, display: 'flex', alignItems: 'center', gap: 3 }}>
                      {total}/{slot.cap} SP {over && <Ico2 d={ICO2.warn} size={9} stroke="var(--danger)" />}
                    </span>
                    {scenario.type !== 'current' && !readOnly && (
                      <button title="Ajouter un item fictif"
                        style={{ width: 20, height: 20, borderRadius: 4, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}
                        onClick={() => onAddVirtual(slot.sprintId)}>
                        <Ico2 d={ICO2.plus} size={10} />
                      </button>
                    )}
                  </div>
                  {(slot.startDate || slot.endDate) && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Ico2 d={ICO2.cal} size={9} /> {slot.startDate ? fmtDateShort(slot.startDate) : '?'} {'->'} {slot.endDate ? fmtDateShort(slot.endDate) : '?'}
                    </span>
                  )}
                </div>
                <div style={{ height: 3, background: 'var(--border)', margin: '0 12px 1px' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--danger)' : scenario.color, borderRadius: 2 }} />
                </div>
                <div style={{ padding: '3px 0 8px' }}>
                  {(slot.usedItems ?? []).map(item => {
                    const client = state.clients.find((c: any) => c.id === item.clientId)
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px', borderBottom: '1px solid var(--surface2)', fontSize: 10, opacity: .55 }}>
                        <span style={{ fontSize: 9, color: '#059669', fontWeight: 700, flexShrink: 0 }}>✓</span>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: client?.color ?? 'var(--border)', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--primary)', flexShrink: 0, minWidth: 54 }}>{item.key}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>{item.desc}</span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 9 }}>{item.sp} SP</span>
                      </div>
                    )
                  })}
                  {rows.map((row, rowIdx) => {
                    if (row.kind === 'initiative') {
                      const initiative = initiativeMap.get(row.initiativeId)
                      if (!initiative) return null
                      const initClient = state.clients.find((c: any) => c.id === initiative.clientId)
                      return (
                        <div key={'ihdr-' + row.initiativeId}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px 3px', marginTop: rowIdx > 0 ? 7 : 0, borderBottom: '1.5px solid var(--border)', background: 'var(--surface2)', fontSize: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: initClient?.color ?? 'var(--text-muted)', flexShrink: 0 }} />
                          <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>{initiative.key}</span>
                          <span style={{ flex: 1, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: 9, letterSpacing: '.02em' }}>{initiative.desc}</span>
                          <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>{row.spHere} SP</span>
                        </div>
                      )
                    }
                    if (row.kind === 'epic') {
                      const epic = epicMap.get(row.epicId)
                      if (!epic) return null
                      const storiesHere  = storiesHereByEpicId.get(row.epicId) ?? 0
                      const storiesTotal = epicChildCount.get(row.epicId) ?? 0
                      const epicClient   = state.clients.find((c: any) => c.id === epic.clientId)
                      return (
                        <div key={'ehdr-' + row.epicId}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px 3px', paddingLeft: row.inInitiative ? 22 : 12, marginTop: rowIdx > 0 ? 5 : 0, borderBottom: '1.5px solid var(--border)', fontSize: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: epicClient?.color ?? 'var(--primary)', flexShrink: 0 }} />
                          <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--primary)', fontWeight: 700, flexShrink: 0 }}>{epic.key}</span>
                          <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{epic.desc}</span>
                          <span style={{ fontSize: 8, color: 'var(--text-muted)', flexShrink: 0 }}>{storiesHere}/{storiesTotal}</span>
                          <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>{spHereByEpicId.get(row.epicId) ?? 0}/{epicSP.get(row.epicId) ?? 0} SP</span>
                        </div>
                      )
                    }
                    const { item, inEpic, inInitiative } = row
                    const isVirt       = item.id.startsWith('virt-')
                    const realItem     = isVirt ? null : state.items.find((i: Item) => i.id === item.id)
                    const fullItem     = isVirt ? null : byId.get(item.id) ?? realItem
                    const hasOv        = realItem && scenario.itemOverrides.some((o: ScenarioItemOverride) => o.itemId === item.id)
                    const client       = state.clients.find((c: any) => c.id === item.clientId)
                    const hasDeadline  = !isVirt && (item as Item).deadline?.date && (item as Item).deadline!.type !== 'none'
                    const itemDeps     = fullItem?.deps ?? []
                    const hasDeps      = itemDeps.length > 0
                    const level        = hasDeps ? topoLvl(item.id) : 0
                    // Clés lisibles des deps directes (comme dans le Backlog)
                    const depKeys      = itemDeps.map((depId: string) =>
                      ((state.items as Item[]).find((i: Item) => i.id === depId))?.key ?? depId
                    )
                    const wasHere      = !isVirt && (item as Item).sprintId === slot.sprintId
                    const moveBadge    = (!isVirt && !hasOv && !wasHere)
                      ? computeMoveBadge(item as Item, slot.number, sprintsMeta)
                      : wasHere && !isVirt && !hasOv ? { text: '=', color: 'var(--text-muted)' } : null
                    const isHighlighted = isItemHighlighted(
                      { clientId: item.clientId, type: (item as Item).type, priority: (item as Item).priority },
                      highlightClients ?? new Set(), highlightTypes ?? new Set(), highlightPriority ?? new Set(),
                    )
                    const inChain = !isVirt && (hovChain?.has(item.id) ?? false)
                    const isHov   = !isVirt && item.id === hoveredId
                    // boxShadow inset = pas de layout shift (contrairement à border)
                    const shadow  = inChain ? 'inset 0 0 0 1px rgba(59,130,246,.35)'
                      : isHighlighted ? `inset 0 0 0 1px ${state.clients.find((c: any) => c.id === item.clientId)?.color ?? 'var(--primary)'}44`
                      : isVirt ? 'inset 0 0 0 1px rgba(127,119,221,.3)' : undefined

                    return (
                      <div key={item.id}
                        onMouseEnter={() => !isVirt && setHoveredId(item.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderBottom: '1px solid var(--surface2)', fontSize: 10,
                          paddingLeft: inEpic && inInitiative ? 32 : (inEpic || inInitiative) ? 22 : 12,
                          background: isHov ? 'rgba(59,130,246,.10)'
                            : inChain ? 'rgba(59,130,246,.05)'
                            : isHighlighted ? (state.clients.find((c: any) => c.id === item.clientId)?.color ?? 'var(--primary)') + '12'
                            : isVirt ? 'rgba(127,119,221,.05)' : hasOv ? 'rgba(218,90,48,.04)' : 'transparent',
                          boxShadow: shadow,
                          borderRadius: 3,
                          transition: 'background .12s',
                          cursor: 'default',
                        }}>
                        {isVirt
                          ? <span title="Item fictif"><Ico2 d={ICO2.ghost} size={10} stroke="#7F77DD" /></span>
                          : hasOv
                            ? <span title="Override actif" style={{ cursor: readOnly ? 'default' : 'pointer' }} onClick={() => !readOnly && realItem && onOverrideOpen(realItem.id)}><Ico2 d={ICO2.pencil} size={10} stroke="#D85A30" /></span>
                            : <div style={{ width: 7, height: 7, borderRadius: '50%', background: client?.color ?? 'var(--border)', flexShrink: 0 }} />
                        }
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: isVirt ? '#7F77DD' : 'var(--primary)', flexShrink: 0, minWidth: 54 }}>
                          {isVirt ? '✦ FICTIF' : (item as Item).key}
                        </span>
                        <span style={{ width: 36, flexShrink: 0, display: 'flex', justifyContent: 'flex-start' }}>
                          {moveBadge && (
                            <span style={{ fontSize: 8, fontWeight: 600, padding: '1px 4px', borderRadius: 3, background: moveBadge.color + '22', color: moveBadge.color }}>
                              {moveBadge.text}
                            </span>
                          )}
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isVirt ? '#534AB7' : 'inherit' }}>{item.desc}</span>
                        {hasDeadline && (
                          <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 5, background: (item as Item).deadline!.type === 'imposed' ? '#fee2e2' : '#fef3c7', color: (item as Item).deadline!.type === 'imposed' ? '#dc2626' : '#d97706', flexShrink: 0 }}>
                            {fmtDate((item as Item).deadline!.date)}
                          </span>
                        )}
                        {hasDeps && (
                          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 5, background: (inChain || isHov) ? '#bfdbfe' : '#dbeafe', color: '#1d4ed8', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontWeight: (inChain || isHov) ? 700 : 400, whiteSpace: 'nowrap' }}>
                            <Ico2 d={ICO2.link} size={8} stroke="#1d4ed8" />
                            {depKeys.length === 1 ? depKeys[0] : `${depKeys.length} dép.`}
                            {level > 1 && <span style={{ opacity: .6, fontWeight: 400 }}>Niv.{level}</span>}
                          </span>
                        )}
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 9 }}>{item.sp} SP</span>
                        {isVirt && !readOnly && (
                          <button title="Supprimer l'item fictif"
                            style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid #fca5a5', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => onRemoveVirtual(item.id)}>
                            <Ico2 d={ICO2.x} size={9} stroke="#dc2626" />
                          </button>
                        )}
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
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, width: 340, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Ajouter un item fictif</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11 }}>Description<input value={form.desc} onChange={e => set('desc', e.target.value)} placeholder="ex : Bug crash paiement prod" style={{ ...SEL, height: 30, padding: '0 8px' }} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ fontSize: 11 }}>Type<select value={form.type} onChange={e => set('type', e.target.value)} style={SEL}><option value="bug">Bug</option><option value="story">Story</option><option value="task">Tâche</option><option value="spike">Spike</option><option value="epic">Épic</option></select></label>
            <label style={{ fontSize: 11 }}>SP<input type="number" min={1} value={form.sp} onChange={e => set('sp', Number(e.target.value))} style={SEL} /></label>
            <label style={{ fontSize: 11 }}>Priorité<select value={form.priority} onChange={e => set('priority', e.target.value)} style={SEL}><option value="critical">Critique</option><option value="high">Haute</option><option value="medium">Moyenne</option><option value="low">Basse</option></select></label>
            <label style={{ fontSize: 11 }}>Client<select value={form.clientId} onChange={e => set('clientId', e.target.value)} style={SEL}>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
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
