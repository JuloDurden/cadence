import { useState, useRef } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { SprintColumn } from '../components/planning/SprintColumn'
import { SwimlanesView } from '../components/planning/SwimlanesView'
import { DepsOverlay } from '../components/planning/DepsOverlay'
import { PlanningCard } from '../components/planning/PlanningCard'
import { PlanningEpicGroup } from '../components/planning/PlanningEpicGroup'
import { ItemModal } from '../components/backlog/ItemModal'
import { computeSprintEndDate } from '../utils/sprintCapacity'
import { cascadeSprintDates } from '../utils/dates'
import type { Item, Sprint } from '../types'

type View = 'grid' | 'swimlanes'

function uid() { return Math.random().toString(36).slice(2, 10) }

// ── Header helpers ─────────────────────────────────────────────────────────
function FgIcon({ d }: { d: string }) {
  return <svg className="fg-icon" width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
}
function FgChev() {
  return <svg className="fg-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
}
function ViewIco({ d }: { d: string }) {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
}
const ICO_USERS = '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
const ICO_TAG   = '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'
// Icônes Lucide — paths exacts depuis lucide-static@1.24.0
const ICO_GRID  = '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>'
const ICO_SWIM  = '<path d="M2 12q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 19q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 5q2.5 2 5 0t5 0 5 0 5 0"/>'
const ICO_DEPS  = '<path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/>'
const ICO_PLUS  = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'

const SEG_BTN = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '0 10px', height: 28, fontSize: 11, fontWeight: 500,
  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-muted)',
  transition: 'background .15s, color .15s',
})

export function PlanningPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [view, setView] = useState<View>('grid')
  const [highlightClient, setHighlightClient] = useState('')
  const [highlightType,   setHighlightType]   = useState('')
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined)
  const [showDeps, setShowDeps] = useState(false)
  const [dragOverSprint, setDragOverSprint] = useState<string | null>(null)
  const dragIds        = useRef<string[]>([])
  const gridContainerRef = useRef<HTMLDivElement | null>(null)

  function itemsForSprint(sprintId: string | null) {
    return state.items.filter(i => i.sprintId === sprintId)
  }

  function handleDrop(sprintId: string) {
    const ids = dragIds.current
    if (!ids.length) return
    setDragOverSprint(null)
    const newSprintId = sprintId === 'unassigned' ? null : sprintId
    const toMove = state.items.filter(i => ids.includes(i.id) && i.sprintId !== newSprintId)
    if (!toMove.length) return
    const updatedItems = state.items.map(i =>
      toMove.find(m => m.id === i.id) ? { ...i, sprintId: newSprintId } : i
    )
    toMove.forEach(item => dispatch({ type: 'UPDATE_ITEM', payload: { ...item, sprintId: newSprintId } }))
    saveToServer({ ...state, items: updatedItems })
    dragIds.current = []
  }

  function handleUpdateDates(sprintId: string, startDate: string, endDate: string) {
    const idx = state.sprints.findIndex(s => s.id === sprintId)
    if (idx === -1) return
    const weeks = state.settings.sprintDuration ?? 2
    const updatedSprints = cascadeSprintDates(state.sprints, idx, startDate, endDate, weeks)
    updatedSprints.forEach(s => dispatch({ type: 'UPDATE_SPRINT', payload: s }))
    saveToServer({ ...state, sprints: updatedSprints })
  }

  function handleActivate(sprintId: string) {
    const updatedSprints = state.sprints.map(s => ({
      ...s,
      active: s.id === sprintId,
      closed: s.id === sprintId ? false : s.closed,
    }))
    updatedSprints.forEach(s => dispatch({ type: 'UPDATE_SPRINT', payload: s }))
    saveToServer({ ...state, sprints: updatedSprints })
  }

  function handleClose(sprintId: string) {
    const sp = state.sprints.find(s => s.id === sprintId)
    if (!sp) return
    const updated = { ...sp, closed: true, active: false }
    dispatch({ type: 'UPDATE_SPRINT', payload: updated })
    saveToServer({ ...state, sprints: state.sprints.map(s => s.id === sprintId ? updated : s) })
  }

  function handleReopen(sprintId: string) {
    const sp = state.sprints.find(s => s.id === sprintId)
    if (!sp) return
    const updated = { ...sp, closed: false }
    dispatch({ type: 'UPDATE_SPRINT', payload: updated })
    saveToServer({ ...state, sprints: state.sprints.map(s => s.id === sprintId ? updated : s) })
  }

  function handleUpdateCapacity(sprintId: string, capacity: number) {
    const sp = state.sprints.find(s => s.id === sprintId)
    if (!sp) return
    const updated = { ...sp, capacity }
    dispatch({ type: 'UPDATE_SPRINT', payload: updated })
    saveToServer({ ...state, sprints: state.sprints.map(s => s.id === sprintId ? updated : s) })
  }

  // Sprint actif = celui marqué active:true, sinon le premier non clôturé
  const activeSprintId = (state.sprints.find(s => s.active)
    ?? state.sprints.find(s => !s.closed))?.id ?? null

  function handleSave(item: Item, keyCounters?: Record<string, number>) {
    const isNew = !state.items.find(i => i.id === item.id)
    if (isNew) {
      dispatch({ type: 'ADD_ITEM', payload: item, keyCounters })
    } else {
      dispatch({ type: 'UPDATE_ITEM', payload: item })
    }
    saveToServer({
      ...state,
      items: isNew ? [...state.items, item] : state.items.map(i => i.id === item.id ? item : i),
      ...(keyCounters ? { itemKeyCounters: keyCounters } : {}),
    })
    setModalItem(undefined)
  }

  function nextMonday(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  function addSprint() {
    const last = state.sprints[state.sprints.length - 1]
    const workingDays = state.settings.sprintDuration ?? 2
    const startDate = last ? nextMonday(last.endDate) : (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0)
      while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
      return d.toISOString().slice(0, 10)
    })()
    const endDate = computeSprintEndDate(startDate, workingDays)
    const newSprint: Sprint = {
      id: 's' + uid(),
      number: (last?.number ?? 0) + 1,
      label: `Sprint ${(last?.number ?? 0) + 1}`,
      startDate, endDate,
      capacity: state.settings.defaultCapacity,
      closed: false,
    }
    dispatch({ type: 'ADD_SPRINT', payload: newSprint })
    saveToServer({ ...state, sprints: [...state.sprints, newSprint] })
  }

  const unassigned  = itemsForSprint(null)
  const assigned    = state.items.filter(i => i.sprintId !== null)
  const totalSP     = state.items.reduce((s, i) => s + i.sp, 0)

  // Groupement Epic dans le panneau non-assigné
  // On groupe TOUTES les stories non-assignées par epicId, peu importe où est l'Epic lui-même
  const childrenByEpicId   = new Map<string, Item[]>()
  const standaloneUnassigned: Item[] = []
  for (const item of unassigned) {
    if (item.type === 'epic') continue
    if (item.epicId) {
      const arr = childrenByEpicId.get(item.epicId) ?? []
      arr.push(item)
      childrenByEpicId.set(item.epicId, arr)
    } else {
      standaloneUnassigned.push(item)
    }
  }
  // Epics non-assignés sans stories non-assignées (toutes en sprint) → carte standalone
  const lonelyUnassignedEpics = unassigned.filter(i => i.type === 'epic' && !childrenByEpicId.has(i.id))
  // Groupes à afficher (epic trouvé dans state.items, même s'il est dans un sprint)
  const epicGroupsUnassigned = Array.from(childrenByEpicId.entries()).map(([epicId, stories]) => ({
    epicId, stories, epic: state.items.find(i => i.id === epicId),
  }))

  return (
    <>
      <Header title="Planning">
        {/* Stats à gauche, collées au titre */}
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{assigned.length} items</span>
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{totalSP} SP</span>

        <div style={{ flex: 1 }} />

        {/* Filtres highlight (client + type) + vue toggle + bouton sprint — tout à droite */}
        <div className="filter-group">
          <div className={`fg-item${highlightClient ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_USERS} />
            <select value={highlightClient} onChange={e => setHighlightClient(e.target.value)}>
              <option value="">Clients</option>
              {state.clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <FgChev />
          </div>
          <div className={`fg-item${highlightType ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_TAG} />
            <select value={highlightType} onChange={e => setHighlightType(e.target.value)}>
              <option value="">Type</option>
              <option value="bug">Bug</option>
              <option value="story">Story</option>
              <option value="task">Tâche</option>
              <option value="epic">Epic</option>
              <option value="spike">Spike</option>
            </select>
            <FgChev />
          </div>
        </div>

        {/* Toggle vues : Grille | Swimlanes | Gantt — icônes seules */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button style={{ ...SEG_BTN(view === 'grid'),      padding: '0 10px' }} onClick={() => setView('grid')}      title="Vue grille">
            <ViewIco d={ICO_GRID} />
          </button>
          <button style={{ ...SEG_BTN(view === 'swimlanes'), padding: '0 10px', borderLeft: '1px solid var(--border)' }} onClick={() => setView('swimlanes')} title="Swimlanes par client">
            <ViewIco d={ICO_SWIM} />
          </button>
        </div>

        {/* Dépendances — uniquement en vue Grille */}
        {view === 'grid' && (
          <button
            className="hdr-btn"
            onClick={() => setShowDeps(v => !v)}
            title="Vue dependances cross-sprint"
            style={showDeps ? { background: 'var(--primary-light)', color: 'var(--primary)' } : undefined}
          >
            <ViewIco d={ICO_DEPS} />
          </button>
        )}

        <button className="hdr-btn primary" onClick={addSprint} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ViewIco d={ICO_PLUS} /> Sprint
        </button>
      </Header>

      <div className="page-content" style={{ padding: '24px 16px' }}>
        {view === 'swimlanes' ? (
          <SwimlanesView
            state={state}
            highlightClient={highlightClient}
            highlightType={highlightType}
            dragIds={dragIds}
            dragOverKey={dragOverSprint}
            onDragOver={key => setDragOverSprint(key)}
            onDragLeave={() => setDragOverSprint(null)}
            onDrop={handleDrop}
            onEdit={item => setModalItem(item)}
          />
        ) : (
          <>
          {/* Conteneur scrollable + référence pour DepsOverlay */}
          <div style={{ overflowX: 'auto', position: 'relative' }} ref={gridContainerRef}>
            <div className="planning-grid">
              {state.sprints.map(sprint => (
                <SprintColumn
                  key={sprint.id}
                  sprint={sprint}
                  items={itemsForSprint(sprint.id)}
                  state={state}
                  isOver={dragOverSprint === sprint.id}
                  isActive={sprint.id === activeSprintId}
                  highlightClient={highlightClient}
                  highlightType={highlightType}
                  onDragStart={id  => { dragIds.current = [id] }}
                  onDragGroup={ids => { dragIds.current = ids }}
                  onDragOver={sprintId => setDragOverSprint(sprintId)}
                  onDrop={handleDrop}
                  onEdit={item => setModalItem(item)}
                  onUpdateDates={handleUpdateDates}
                  onActivate={handleActivate}
                  onClose={handleClose}
                  onReopen={handleReopen}
                  onUpdateCapacity={handleUpdateCapacity}
                />
              ))}
            </div>

            {/* Overlay dépendances cross-sprint */}
            {showDeps && (
              <DepsOverlay containerRef={gridContainerRef} items={state.items} />
            )}
          </div>

          {/* Panneau Non-assigné — sous les sprints */}
          <div
            className={`planning-unassigned-row${dragOverSprint === 'unassigned' ? ' planning-col-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOverSprint('unassigned') }}
            onDragLeave={() => setDragOverSprint(null)}
            onDrop={e => { e.preventDefault(); handleDrop('unassigned') }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Non assigné</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-alt)', padding: '1px 7px', borderRadius: 8 }}>{unassigned.length}</span>
            </div>
            <div className="planning-unassigned-items">
              {/* Groupes Epic (epic dans n'importe quel sprint ou non-assigné) */}
              {epicGroupsUnassigned.map(({ epicId, epic, stories }) => (
                <PlanningEpicGroup
                  key={epicId}
                  epicId={epicId}
                  epic={epic}
                  stories={stories}
                  state={state}
                  highlightClient={highlightClient}
                  highlightType={highlightType}
                  onEdit={item => setModalItem(item)}
                  onDragGroup={ids => { dragIds.current = ids }}
                  onDragItem={id  => { dragIds.current = [id] }}
                />
              ))}
              {/* Epics non-assignés sans stories non-assignées */}
              {lonelyUnassignedEpics.map(item => (
                <PlanningCard
                  key={item.id}
                  item={item}
                  state={state}
                  highlightClient={highlightClient}
                  highlightType={highlightType}
                  onEdit={item => setModalItem(item)}
                  onDragStart={id => { dragIds.current = [id] }}
                />
              ))}
              {/* Items sans Epic */}
              {standaloneUnassigned.map(item => (
                <PlanningCard
                  key={item.id}
                  item={item}
                  state={state}
                  highlightClient={highlightClient}
                  highlightType={highlightType}
                  onEdit={item => setModalItem(item)}
                  onDragStart={id => { dragIds.current = [id] }}
                />
              ))}
              {unassigned.length === 0 && (
                <div style={{ padding: '12px 20px', color: 'var(--text-faint)', fontSize: 11, border: '1.5px dashed var(--border)', borderRadius: 6 }}>
                  Glisser des items ici pour les désassigner
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </div>

      {modalItem !== undefined && (
        <ItemModal
          item={modalItem}
          state={state}
          onSave={handleSave}
          onClose={() => setModalItem(undefined)}
        />
      )}
    </>
  )
}
