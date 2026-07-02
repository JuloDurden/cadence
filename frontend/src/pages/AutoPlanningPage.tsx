import { useState } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import type { Item, Sprint } from '../types'

type CritId = 'priority' | 'client' | 'socle' | 'debt'

interface Criterion { id: CritId; active: boolean; title: string; desc: string }

const DEFAULT_CRITERIA: Criterion[] = [
  { id: 'priority', active: true,  title: 'Priorité',           desc: "Les US de priorité P1 sont placées en premier, puis P2, etc." },
  { id: 'client',   active: false, title: 'Importance client',   desc: "Choisissez l'ordre d'importance des clients. Les US des clients les plus importants remplissent les premiers sprints." },
  { id: 'socle',    active: false, title: 'Socle commun en tête',desc: "Les US sans client associé sont prioritaires sur le premier sprint disponible." },
  { id: 'debt',     active: false, title: 'Dette technique',     desc: "Les items de type Bug sont placés en priorité sur le premier sprint disponible." },
]

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

interface Slot { sprintId: string; label: string; cap: number; used: number; assigned: Item[]; isNew: boolean }
interface Proposal { slots: Slot[]; newCount: number }

function uid() { return 'new-' + Math.random().toString(36).slice(2, 7) }

export function AutoPlanningPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [criteria, setCriteria] = useState<Criterion[]>(DEFAULT_CRITERIA)
  const [clientOrder, setClientOrder] = useState<string[]>(() => state.clients.map(c => c.id))
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [dragCritIdx, setDragCritIdx] = useState<number | null>(null)
  const [dragClientIdx, setDragClientIdx] = useState<number | null>(null)

  // Sort items by active criteria
  function sortItems(items: Item[]): Item[] {
    const active = criteria.filter(c => c.active).map(c => c.id)
    return [...items].sort((a, b) => {
      for (const cid of active) {
        let diff = 0
        if (cid === 'priority') diff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
        else if (cid === 'client') {
          const ia = clientOrder.indexOf(a.clientId), ib = clientOrder.indexOf(b.clientId)
          diff = (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
        } else if (cid === 'socle') diff = (!a.clientId ? 0 : 1) - (!b.clientId ? 0 : 1)
        else if (cid === 'debt') {
          const rank = (i: Item) => (i.tags ?? []).includes('bug') ? 0 : 1
          diff = rank(a) - rank(b)
        }
        if (diff !== 0) return diff
      }
      return 0
    })
  }

  function generate() {
    const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
    const unassigned = state.items.filter(i => !i.sprintId && !doneSt.includes(i.status))
    const allItems = [
      ...state.items.filter(i => i.sprintId && !state.sprints.find(s => s.id === i.sprintId)?.closed && !doneSt.includes(i.status)),
      ...unassigned,
    ]
    const sorted = sortItems(allItems)

    const slots: Slot[] = state.sprints
      .filter(sp => !sp.closed)
      .map(sp => {
        const usedByDone = state.items.filter(i => i.sprintId === sp.id && doneSt.includes(i.status)).reduce((s, i) => s + i.sp, 0)
        return { sprintId: sp.id, label: sp.label || `Sprint ${sp.number}`, cap: sp.capacity, used: usedByDone, assigned: [], isNew: false }
      })

    let newCount = 0
    function ensureSlot(idx: number) {
      while (idx >= slots.length) {
        newCount++
        const num = slots.length + 1
        const defCap = state.settings?.defaultCapacity ?? 40
        slots.push({ sprintId: uid(), label: `Sprint ${num} ✨`, cap: defCap, used: 0, assigned: [], isNew: true })
      }
    }

    for (const item of sorted) {
      let placed = false
      for (let i = 0; i < slots.length + 20; i++) {
        ensureSlot(i)
        const sl = slots[i]
        const used = sl.used + sl.assigned.reduce((s, it) => s + it.sp, 0)
        if (used + item.sp <= sl.cap) { sl.assigned.push(item); placed = true; break }
      }
      if (!placed && slots.length > 0) slots[slots.length - 1].assigned.push(item)
    }

    setProposal({ slots: slots.filter(s => s.assigned.length > 0), newCount })
  }

  function apply() {
    if (!proposal) return
    const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
    let newSprints = state.sprints.map(sp => sp.closed ? sp : { ...sp, items: [] as never[] })
    let newItems = [...state.items]

    // Reassign items
    newItems = newItems.map(i => doneSt.includes(i.status) ? i : { ...i, sprintId: null })

    const sprintsToAdd: Sprint[] = []
    for (const slot of proposal.slots) {
      const existingSp = newSprints.find(s => s.id === slot.sprintId)
      if (!existingSp && slot.isNew) {
        const maxNum = [...newSprints, ...sprintsToAdd].reduce((m, s) => Math.max(m, s.number), 0)
        const today = new Date().toISOString().split('T')[0]
        sprintsToAdd.push({ id: slot.sprintId, number: maxNum + 1, label: '', startDate: today, endDate: today, capacity: slot.cap, closed: false })
      }
      for (const item of slot.assigned) {
        newItems = newItems.map(i => i.id === item.id ? { ...i, sprintId: slot.sprintId } : i)
      }
    }

    newSprints = [...newSprints, ...sprintsToAdd]
    const newState = { ...state, sprints: newSprints, items: newItems }
    dispatch({ type: 'SET_STATE', payload: newState })
    saveToServer(newState)
    setProposal(null)
  }

  // Drag-to-reorder criteria
  function critDrop(toIdx: number) {
    if (dragCritIdx === null || dragCritIdx === toIdx) return
    const arr = [...criteria]
    const [el] = arr.splice(dragCritIdx, 1); arr.splice(toIdx, 0, el)
    setCriteria(arr); setDragCritIdx(null)
  }

  // Drag-to-reorder clients
  function clientDrop(toIdx: number) {
    if (dragClientIdx === null || dragClientIdx === toIdx) return
    const arr = [...clientOrder]
    const [el] = arr.splice(dragClientIdx, 1); arr.splice(toIdx, 0, el)
    setClientOrder(arr); setDragClientIdx(null)
  }

  function toggleCrit(idx: number, checked: boolean) {
    const arr = [...criteria]
    arr[idx] = { ...arr[idx], active: checked }
    const [crit] = arr.splice(idx, 1)
    const insertPos = arr.filter(c => c.active).length
    arr.splice(insertPos, 0, crit)
    setCriteria(arr)
  }

  const clientCritActive = criteria.find(c => c.id === 'client' && c.active)

  return (
    <>
      <Header title="Auto-planning">
        <div style={{ flex: 1 }} />
        {proposal && <button className="hdr-ctx-btn" onClick={() => setProposal(null)} style={{ color: 'var(--danger)' }}>✕ Annuler</button>}
        <button className="hdr-btn primary" onClick={generate}>⚡ Générer la proposition</button>
        {proposal && <button className="hdr-ctx-btn" style={{ background: 'var(--success)', color: '#fff' }} onClick={apply}>✓ Appliquer</button>}
      </Header>

      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Left: criteria */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Critères <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-muted)' }}>(glisser pour réordonner)</span></div>
              {criteria.map((c, i) => {
                const rank = criteria.filter((x, j) => x.active && j <= i).length
                return (
                  <div key={c.id}
                    draggable
                    onDragStart={() => setDragCritIdx(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => critDrop(i)}
                    style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', marginBottom: 6, borderRadius: 8, background: c.active ? 'var(--primary-light, #eff6ff)' : 'var(--surface2)', border: c.active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)', cursor: 'grab' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: c.active ? 'var(--primary)' : 'var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                      {c.active ? rank : '-'}
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

              {clientCritActive && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Ordre des clients <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(glisser)</span></div>
                  {clientOrder.map((cid, i) => {
                    const client = state.clients.find(c => c.id === cid)
                    if (!client) return null
                    return (
                      <div key={cid}
                        draggable
                        onDragStart={() => setDragClientIdx(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => clientDrop(i)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 4, background: 'var(--surface2)', borderRadius: 6, cursor: 'grab' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 16, textAlign: 'center' }}>{i + 1}</span>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: client.color }} />
                        <span style={{ fontSize: 12 }}>{client.name}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--border)' }}>⠿</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <strong>Règles :</strong><br />
              • Les sprints clos et US terminées ne sont pas modifiés.<br />
              • Si plusieurs critères sont actifs, ils s'appliquent dans l'ordre affiché.<br />
              • De nouveaux sprints sont créés si nécessaire pour tout placer.
            </div>
          </div>

          {/* Right: proposal */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 16, minHeight: 300 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Proposition de planification</div>
            {!proposal ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Configurez les critères puis cliquez sur "Générer la proposition".</p>
            ) : (
              <>
                {proposal.newCount > 0 && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff7ed', borderRadius: 8, fontSize: 11, color: '#c2410c', fontWeight: 600 }}>
                    ⚠️ {proposal.newCount} nouveau{proposal.newCount > 1 ? 'x' : ''} sprint{proposal.newCount > 1 ? 's' : ''} seront créés.
                  </div>
                )}
                {proposal.slots.map(slot => {
                  const total = slot.used + slot.assigned.reduce((s, i) => s + i.sp, 0)
                  const pct = slot.cap > 0 ? Math.min(Math.round(total / slot.cap * 100), 100) : 0
                  const over = total > slot.cap
                  return (
                    <div key={slot.sprintId} style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 14px', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 12 }}>{slot.label}</span>
                        {slot.isNew && <span style={{ fontSize: 10, background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>✨ Nouveau</span>}
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: over ? 'var(--danger)' : 'var(--text-muted)', fontWeight: over ? 700 : 400 }}>{total}/{slot.cap} SP{over ? ' ⚠️' : ''}</span>
                      </div>
                      <div style={{ padding: '4px 14px 6px' }}>
                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--danger)' : 'var(--primary)', borderRadius: 2 }} />
                        </div>
                      </div>
                      <div style={{ padding: '0 14px 12px' }}>
                        {slot.assigned.map(item => {
                          const client = state.clients.find(c => c.id === item.clientId)
                          return (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--surface2)', fontSize: 11 }}>
                              {client && <div style={{ width: 8, height: 8, borderRadius: '50%', background: client.color, flexShrink: 0 }} />}
                              <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--primary)', flexShrink: 0 }}>{item.key}</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc}</span>
                              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{item.sp} SP</span>
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
