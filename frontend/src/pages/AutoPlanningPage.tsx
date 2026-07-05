import { useState } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { effectiveCapacity } from '../utils/sprintCapacity'
import { fmtDate, localIso } from '../utils/dates'
import type { Item, Sprint } from '../types'

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
}
function Ico({ d, size = 13, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

// ── Types ─────────────────────────────────────────────────────────────────
type CritId = 'priority' | 'client' | 'socle' | 'debt'
interface Criterion { id: CritId; active: boolean; title: string; desc: string }

interface Slot {
  sprintId: string; label: string; cap: number; used: number
  assigned: Item[]; isNew: boolean; number: number; endDate?: string
}
interface Violation { key: string; desc: string; detail: string; type: 'deadline' | 'dep' }
interface Proposal { slots: Slot[]; newCount: number; violations: Violation[] }

// ── Criteria ──────────────────────────────────────────────────────────────
const DEFAULT_CRITERIA: Criterion[] = [
  { id: 'priority', active: true,  title: 'Priorité',            desc: "Les items critiques et high sont placés en premier, puis medium, low." },
  { id: 'client',   active: false, title: 'Importance client',   desc: "Les items des clients les plus importants remplissent les premiers sprints." },
  { id: 'socle',    active: false, title: 'Socle commun en tête',desc: "Les items sans client associé sont prioritaires sur le premier sprint disponible." },
  { id: 'debt',     active: false, title: 'Dette technique',     desc: "Les Bugs sont placés en priorité sur le premier sprint disponible." },
]
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

// ── Module-level proposal cache (survives page navigation) ────────────────
let _cachedProposal: Proposal | null = null

// ── Topo sort (Kahn's algorithm) ──────────────────────────────────────────
function topoSort(items: Item[]): Item[] {
  const keySet = new Set(items.map(i => i.key))
  const inDeg: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  items.forEach(i => { inDeg[i.key] = 0; adj[i.key] = [] })
  items.forEach(i => {
    (i.deps ?? []).forEach(dk => {
      if (!keySet.has(dk)) return
      adj[dk] = adj[dk] ?? []
      adj[dk].push(i.key)
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

// ── Sprint end date estimator for new slots (UTC-safe) ────────────────────
function estimateEndDate(slotIdx: number, existingSlots: Slot[], workingDays: number): string | undefined {
  const lastReal = [...existingSlots].reverse().find(s => s.endDate)
  if (!lastReal?.endDate) return undefined
  const lastRealIdx = existingSlots.indexOf(lastReal)
  const diffSlots = slotIdx - lastRealIdx
  const ms = diffSlots * workingDays * 7 * 24 * 3600 * 1000
  return localIso(new Date(new Date(lastReal.endDate + 'T00:00:00').getTime() + ms))
}

// ── Component ─────────────────────────────────────────────────────────────
export function AutoPlanningPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [criteria, setCriteria] = useState<Criterion[]>(DEFAULT_CRITERIA)
  const [clientOrder, setClientOrder] = useState<string[]>(() => state.clients.map(c => c.id))
  const [proposal, setProposal] = useState<Proposal | null>(_cachedProposal)
  const [dragCritIdx, setDragCritIdx] = useState<number | null>(null)
  const [dragOverCritIdx, setDragOverCritIdx] = useState<number | null>(null)
  const [dragClientIdx, setDragClientIdx] = useState<number | null>(null)
  const [dragOverClientIdx, setDragOverClientIdx] = useState<number | null>(null)

  function updateProposal(p: Proposal | null) {
    _cachedProposal = p
    setProposal(p)
  }

  // ── Clients éligibles au critère Importance client ─────────────────────
  const planningClientIds = new Set(
    state.clients.filter(c => !c.excludeFromPlanning).map(c => c.id)
  )

  // ── Sort items ────────────────────────────────────────────────────────
  function sortItems(items: Item[]): Item[] {
    const topo = topoSort(items)
    const active = criteria.filter(c => c.active).map(c => c.id)
    return topo.sort((a, b) => {
      const dlRank = (i: Item) => i.deadline?.type === 'imposed' ? 0 : i.deadline?.type === 'negotiable' ? 1 : 2
      const ra = dlRank(a), rb = dlRank(b)
      if (ra !== rb) return ra - rb
      if (ra < 2) {
        const da = a.deadline?.date ?? '9999', db = b.deadline?.date ?? '9999'
        if (da !== db) return da.localeCompare(db)
      }
      for (const cid of active) {
        let diff = 0
        if (cid === 'priority') diff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
        else if (cid === 'client') {
          // Exclure les clients marqués excludeFromPlanning
          const filteredOrder = clientOrder.filter(id => planningClientIds.has(id))
          const ia = filteredOrder.indexOf(a.clientId), ib = filteredOrder.indexOf(b.clientId)
          diff = (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
        }
        else if (cid === 'socle') diff = (!a.clientId ? 0 : 1) - (!b.clientId ? 0 : 1)
        else if (cid === 'debt') diff = (a.type === 'bug' ? 0 : 1) - (b.type === 'bug' ? 0 : 1)
        if (diff !== 0) return diff
      }
      return 0
    })
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  function generate() {
    const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
    const durationWeeks = state.settings.sprintDuration ?? 2

    const epicIdsWithChildren = new Set(
      state.items.filter(i => i.epicId).map(i => i.epicId!)
    )

    const itemsToPlace = state.items.filter(i => {
      const sp = state.sprints.find(s => s.id === i.sprintId)
      if (sp?.closed) return false
      if (doneSt.includes(i.status)) return false
      if (i.type === 'epic' && epicIdsWithChildren.has(i.id)) return false
      return true
    })

    const sorted = sortItems(itemsToPlace)

    // Build slots — premier sprint ouvert conserve son thème, les suivants non
    const openNonDone = state.sprints
      .filter(sp => !sp.closed)
      .filter(sp => {
        const spItems = state.items.filter(i => i.sprintId === sp.id)
        return !(spItems.length > 0 && spItems.every(i => doneSt.includes(i.status)))
      })

    const slots: Slot[] = openNonDone.map((sp, idx) => {
      const usedByDone = state.items
        .filter(i => i.sprintId === sp.id && doneSt.includes(i.status))
        .reduce((s, i) => s + i.sp, 0)
      // Conserver le thème uniquement pour le sprint en cours (premier ouvert)
      const isCurrent = idx === 0
      const label = isCurrent && sp.label
        ? `Sprint ${sp.number} – ${sp.label}`
        : `Sprint ${sp.number}`
      const effCap = effectiveCapacity(sp, state.team) || state.settings.defaultCapacity
      return {
        sprintId: sp.id, label, cap: effCap,
        used: usedByDone, assigned: [], isNew: false, number: sp.number, endDate: sp.endDate,
      }
    })

    let newCount = 0
    function ensureSlot(idx: number) {
      while (idx >= slots.length) {
        newCount++
        const maxNum = slots.reduce((m, s) => Math.max(m, s.number), 0)
        const num = maxNum + 1
        const cap = state.settings.defaultCapacity ?? 40
        const endDate = estimateEndDate(slots.length, slots, durationWeeks)
        slots.push({ sprintId: 'new-' + newCount, label: `Sprint ${num}`, cap, used: 0, assigned: [], isNew: true, number: num, endDate })
      }
    }

    const successors: Record<string, string[]> = {}
    sorted.forEach(item => {
      (item.deps ?? []).forEach(dk => {
        successors[dk] = successors[dk] ?? []
        successors[dk].push(item.key)
      })
    })

    const placedAt: Record<string, number> = {}
    const placedSet = new Set<string>()
    const violations: Violation[] = []

    function placeOne(item: Item) {
      if (placedSet.has(item.key)) return

      const minIdx = (item.deps ?? []).reduce((mx, dk) => {
        return placedAt[dk] !== undefined ? Math.max(mx, placedAt[dk] + 1) : mx
      }, 0)

      const hasDeadline = !!item.deadline?.date && item.deadline.type !== 'none'

      let placed = false
      for (let i = minIdx; i < minIdx + 200; i++) {
        ensureSlot(i)
        const sl = slots[i]
        const used = sl.used + sl.assigned.reduce((s, it) => s + it.sp, 0)
        if (used + item.sp <= sl.cap) {
          sl.assigned.push(item)
          placedAt[item.key] = i
          placedSet.add(item.key)
          if (hasDeadline && sl.endDate && item.deadline!.date < sl.endDate) {
            const why = minIdx > 0 ? ' (contraint par dépendances)' : ' (capacité insuffisante)'
            violations.push({
              key: item.key, desc: item.desc,
              type: 'deadline',
              detail: `deadline ${item.deadline!.type === 'imposed' ? 'imposée' : 'négociable'} ${fmtDate(item.deadline!.date)} — placé en Sprint ${sl.number}${why}`,
            })
          }
          placed = true; break
        }
      }
      if (!placed) {
        ensureSlot(Math.max(minIdx, slots.length))
        const sl = slots[Math.max(minIdx, slots.length - 1)]
        sl.assigned.push(item)
        placedAt[item.key] = slots.indexOf(sl)
        placedSet.add(item.key)
        if (hasDeadline)
          violations.push({ key: item.key, desc: item.desc, type: 'deadline', detail: `deadline ${fmtDate(item.deadline!.date)} — item trop grand pour la capacité d'un sprint` })
      }

      const succs = (successors[item.key] ?? [])
        .map(k => sorted.find(i => i.key === k))
        .filter((i): i is Item => !!i && !placedSet.has(i.key))
      if (succs.length === 1) placeOne(succs[0])
    }

    for (const item of sorted) {
      if (!placedSet.has(item.key)) placeOne(item)
    }

    updateProposal({
      slots: slots.filter(s => s.assigned.length > 0),
      newCount,
      violations,
    })
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  function apply() {
    if (!proposal) return
    const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)

    let newItems = state.items.map(i => {
      if (doneSt.includes(i.status)) return i
      const sp = state.sprints.find(s => s.id === i.sprintId)
      if (sp?.closed) return i
      return { ...i, sprintId: null, status: i.status === 'todo' ? 'todo' : i.status }
    })

    const newSprints: Sprint[] = [...state.sprints]
    const sprintsToAdd: Sprint[] = []

    for (const slot of proposal.slots) {
      if (slot.isNew) {
        const maxNum = [...newSprints, ...sprintsToAdd].reduce((m, s) => Math.max(m, s.number), 0)
        const today = localIso(new Date())
        sprintsToAdd.push({
          id: slot.sprintId, number: maxNum + 1, label: '',
          startDate: today, endDate: today,
          capacity: slot.cap, closed: false,
        })
      }
      slot.assigned.forEach(item => {
        newItems = newItems.map(i => i.id === item.id ? { ...i, sprintId: slot.sprintId, status: 'todo' } : i)
      })
    }

    const finalSprints = [...newSprints, ...sprintsToAdd]
    const newState = { ...state, sprints: finalSprints, items: newItems }
    dispatch({ type: 'SET_STATE', payload: newState })
    saveToServer(newState)
    updateProposal(null)
  }

  // ── Drag helpers ──────────────────────────────────────────────────────────
  function critDrop(toIdx: number) {
    if (dragCritIdx === null || dragCritIdx === toIdx) return
    const arr = [...criteria]; const [el] = arr.splice(dragCritIdx, 1); arr.splice(toIdx, 0, el)
    setCriteria(arr); setDragCritIdx(null); setDragOverCritIdx(null)
  }
  function clientDrop(toIdx: number) {
    if (dragClientIdx === null || dragClientIdx === toIdx) return
    const arr = [...clientOrder]; const [el] = arr.splice(dragClientIdx, 1); arr.splice(toIdx, 0, el)
    setClientOrder(arr); setDragClientIdx(null); setDragOverClientIdx(null)
  }
  function toggleCrit(idx: number, checked: boolean) {
    const arr = [...criteria]
    arr[idx] = { ...arr[idx], active: checked }
    const [crit] = arr.splice(idx, 1)
    const insertPos = arr.filter(c => c.active).length
    arr.splice(insertPos, 0, crit)
    setCriteria(arr)
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
  const pendingItems  = state.items.filter(i => !doneSt.includes(i.status) && !state.sprints.find(s => s.id === i.sprintId)?.closed)
  const pendingSP     = pendingItems.reduce((s, i) => s + i.sp, 0)
  const openSprints   = state.sprints.filter(s => !s.closed).length

  const clientCritActive = criteria.find(c => c.id === 'client' && c.active)

  const CTRL: React.CSSProperties = { height: 30, border: '1px solid var(--border)', borderRadius: 7, backgroundColor: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }
  const CTRL_PRIMARY: React.CSSProperties  = { ...CTRL, border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: 600 }
  const CTRL_DANGER: React.CSSProperties   = { ...CTRL, border: '1px solid var(--danger)', color: 'var(--danger)' }
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
        {proposal && (
          <button style={CTRL_DANGER} onClick={() => updateProposal(null)}>
            <Ico d={ICO.x} size={12} stroke="var(--danger)" /> Annuler
          </button>
        )}
        <button style={CTRL_PRIMARY} onClick={generate}>
          <Ico d={ICO.zap} size={12} stroke="#fff" /> Générer la proposition
        </button>
        {proposal && (
          <button style={CTRL_SUCCESS} onClick={apply}>
            <Ico d={ICO.check} size={12} stroke="#fff" /> Appliquer
          </button>
        )}
        <div className="hdr-sep" />
      </Header>

      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── LEFT : Criteria ─────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Criteria card */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                Critères
                <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>glisser pour réordonner</span>
              </div>

              {criteria.map((c, i) => {
                const rank = criteria.filter((x, j) => x.active && j <= i).length
                const isDropTarget = dragOverCritIdx === i && dragCritIdx !== null && dragCritIdx !== i
                return (
                  <div key={c.id}
                    draggable
                    onDragStart={() => { setDragCritIdx(i); setDragOverCritIdx(null) }}
                    onDragOver={e => { e.preventDefault(); setDragOverCritIdx(i) }}
                    onDragLeave={() => setDragOverCritIdx(null)}
                    onDrop={() => critDrop(i)}
                    onDragEnd={() => { setDragCritIdx(null); setDragOverCritIdx(null) }}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '8px 10px', marginBottom: 6, borderRadius: 8, cursor: 'grab',
                      background: c.active ? 'var(--primary-light)' : 'var(--surface2)',
                      border: `1.5px solid ${c.active ? 'var(--primary)' : 'var(--border)'}`,
                      outline: isDropTarget ? '2px solid var(--primary)' : 'none',
                      outlineOffset: 2,
                      opacity: dragCritIdx === i ? 0.5 : 1,
                      transition: 'outline .1s, opacity .15s',
                    }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: c.active ? 'var(--primary)' : 'var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                      {c.active ? rank : '–'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{c.title}</span>
                        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={c.active} onChange={e => toggleCrit(i, e.target.checked)} />
                          Activer
                        </label>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>{c.desc}</div>
                    </div>
                  </div>
                )
              })}

              {/* Client order (only when client criterion active) */}
              {clientCritActive && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    Ordre des clients
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 5 }}>glisser</span>
                  </div>
                  {clientOrder
                    .filter(cid => planningClientIds.has(cid))
                    .map((cid, i) => {
                      const client = state.clients.find(c => c.id === cid)
                      if (!client) return null
                      const origIdx = clientOrder.indexOf(cid)
                      const isClientDropTarget = dragOverClientIdx === origIdx && dragClientIdx !== null && dragClientIdx !== origIdx
                      return (
                        <div key={cid}
                          draggable
                          onDragStart={() => { setDragClientIdx(origIdx); setDragOverClientIdx(null) }}
                          onDragOver={e => { e.preventDefault(); setDragOverClientIdx(origIdx) }}
                          onDragLeave={() => setDragOverClientIdx(null)}
                          onDrop={() => clientDrop(origIdx)}
                          onDragEnd={() => { setDragClientIdx(null); setDragOverClientIdx(null) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 4, background: 'var(--surface2)', borderRadius: 6, cursor: 'grab', outline: isClientDropTarget ? '2px solid var(--primary)' : 'none', outlineOffset: 2, opacity: dragClientIdx === origIdx ? 0.5 : 1, transition: 'outline .1s, opacity .15s' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 16, textAlign: 'center' }}>{i + 1}</span>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, flex: 1 }}>{client.name}</span>
                          <Ico d={ICO.grip} size={12} stroke="var(--text-muted)" />
                        </div>
                      )
                    })
                  }
                </div>
              )}
            </div>

            {/* Rules */}
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.9 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text)', marginBottom: 6 }}>Règles</div>
              <div>Les sprints et items déjà Terminés ne sont pas modifiés.</div>
              <div>Si plusieurs critères sont actifs, ils s'appliquent dans l'ordre affiché.</div>
              <div>De nouveaux sprints sont créés si nécessaire pour tout placer.</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                <Ico d={ICO.link} size={10} stroke="var(--text-muted)" />
                <span><strong>Dépendances</strong> : contrainte dure — une US est toujours placée dans un sprint postérieur à ses prédécesseurs.</span>
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                <Ico d={ICO.clock} size={10} stroke="var(--text-muted)" />
                <span><strong>Deadlines</strong> : priorité absolue (imposée avant négociable, puis par date). Une violation est signalée si la capacité ou les dépendances l'empêchent.</span>
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                <Ico d={ICO.link} size={10} stroke="var(--text-muted)" />
                <span><strong>Chaînes</strong> : les têtes de chaîne sont planifiées en premier ; leur unique successeur est enchaîné immédiatement dans le sprint suivant.</span>
              </div>
            </div>
          </div>

          {/* ── RIGHT : Proposal ────────────────────────────────────── */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: 16, minHeight: 300 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Proposition de planification</div>

            {!proposal ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Configurez les critères puis cliquez sur "Générer la proposition".
              </p>
            ) : (
              <>
                {/* Violations */}
                {proposal.violations.length > 0 && (
                  <div style={{ marginBottom: 14, padding: '10px 12px', background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 700, fontSize: 12, color: 'var(--danger)' }}>
                      <Ico d={ICO.warn} size={13} stroke="var(--danger)" />
                      {proposal.violations.length} violation{proposal.violations.length > 1 ? 's' : ''} détectée{proposal.violations.length > 1 ? 's' : ''}
                    </div>
                    {proposal.violations.map((v, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#7f1d1d', marginBottom: 3, paddingLeft: 19 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, marginRight: 5 }}>{v.key}</span>
                        {v.detail}
                      </div>
                    ))}
                  </div>
                )}

                {/* New sprints banner */}
                {proposal.newCount > 0 && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 11, color: '#c2410c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Ico d={ICO.warn} size={13} stroke="#c2410c" />
                    {proposal.newCount} nouveau{proposal.newCount > 1 ? 'x' : ''} sprint{proposal.newCount > 1 ? 's' : ''} {proposal.newCount > 1 ? 'seront créés' : 'sera créé'}
                  </div>
                )}

                {/* Sprint slots */}
                {proposal.slots.map(slot => {
                  const total = slot.used + slot.assigned.reduce((s, i) => s + i.sp, 0)
                  const pct   = slot.cap > 0 ? Math.min(Math.round(total / slot.cap * 100), 100) : 0
                  const over  = total > slot.cap
                  return (
                    <div key={slot.sprintId} style={{ marginBottom: 14, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      {/* Sprint header */}
                      <div style={{ padding: '8px 14px', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 12 }}>{slot.label}</span>
                        {slot.isNew && (
                          <span style={{ fontSize: 10, background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Ico d={ICO.star} size={9} stroke="#065f46" /> Nouveau
                          </span>
                        )}
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: over ? 'var(--danger)' : 'var(--text-muted)', fontWeight: over ? 700 : 400 }}>
                          {total}/{slot.cap} SP
                          {over && <Ico d={ICO.warn} size={11} stroke="var(--danger)" />}
                        </span>
                      </div>
                      {/* Capacity bar */}
                      <div style={{ padding: '4px 14px 6px', background: 'var(--surface2)' }}>
                        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--danger)' : 'var(--primary)', borderRadius: 2 }} />
                        </div>
                      </div>
                      {/* Items */}
                      <div style={{ padding: '4px 14px 10px' }}>
                        {slot.assigned.map(item => {
                          const client      = state.clients.find(c => c.id === item.clientId)
                          const hasDeadline = item.deadline?.date && item.deadline.type !== 'none'
                          const hasDeps     = (item.deps ?? []).length > 0
                          const wasHere     = item.sprintId === slot.sprintId
                          const isUnassigned = !item.sprintId
                          // Move badge: icône Lucide selon le mouvement
                          const badgeIcon  = slot.isNew    ? ICO.plus
                                           : wasHere       ? ICO.equal
                                           : isUnassigned  ? ICO.plus
                                           : ICO.arrowRight
                          const badgeColor = slot.isNew    ? '#059669'
                                           : wasHere       ? 'var(--text-muted)'
                                           : isUnassigned  ? 'var(--primary)'
                                           : '#d97706'
                          const badgeTip   = slot.isNew    ? 'Nouveau sprint'
                                           : wasHere       ? 'Inchangé'
                                           : isUnassigned  ? 'Non assigné → planifié'
                                           : 'Déplacé depuis un autre sprint'
                          return (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: '1px solid var(--surface2)', fontSize: 11 }}>
                              {/* Client dot */}
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: client?.color ?? 'var(--border)', flexShrink: 0 }} />
                              {/* Key */}
                              <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--primary)', flexShrink: 0, minWidth: 54 }}>{item.key}</span>
                              {/* Move badge */}
                              <span style={{ color: badgeColor, flexShrink: 0, display: 'flex', alignItems: 'center' }} title={badgeTip}>
                                <Ico d={badgeIcon} size={10} stroke={badgeColor} />
                              </span>
                              {/* Description */}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc}</span>
                              {/* Deadline badge */}
                              {hasDeadline && (
                                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: item.deadline!.type === 'imposed' ? '#fee2e2' : '#fef3c7', color: item.deadline!.type === 'imposed' ? '#dc2626' : '#d97706', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0, display: 'inline-block' }} />
                                  {fmtDate(item.deadline!.date)}
                                </span>
                              )}
                              {/* Dep indicator */}
                              {hasDeps && (
                                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: '#dbeafe', color: '#1d4ed8', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  <Ico d={ICO.link} size={9} stroke="#1d4ed8" />
                                  {item.deps!.length}
                                </span>
                              )}
                              {/* SP */}
                              <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{item.sp} SP</span>
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
        </div>
      </div>
    </>
  )
}
