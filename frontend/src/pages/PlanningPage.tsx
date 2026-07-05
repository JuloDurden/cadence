import { useState, useMemo, useRef } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { SprintColumn } from '../components/planning/SprintColumn'
import { CalendarView } from '../components/planning/CalendarView'
import { PlanningCard } from '../components/planning/PlanningCard'
import { ItemModal } from '../components/backlog/ItemModal'
import { computeSprintEndDate } from '../utils/sprintCapacity'
import { cascadeSprintDates } from '../utils/dates'
import type { Item, Sprint } from '../types'

type View = 'grid' | 'calendar'

function uid() { return Math.random().toString(36).slice(2, 10) }

export function PlanningPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [view, setView] = useState<View>('grid')
  const [filterClient, setFilterClient] = useState('')
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined)
  const [dragOverSprint, setDragOverSprint] = useState<string | null>(null)
  const dragItemId = useRef<string | null>(null)

  const filteredItems = useMemo(() => {
    return filterClient ? state.items.filter(i => i.clientId === filterClient) : state.items
  }, [state.items, filterClient])

  function itemsForSprint(sprintId: string | null) {
    return filteredItems.filter(i => i.sprintId === sprintId)
  }

  function handleDrop(sprintId: string) {
    const id = dragItemId.current
    if (!id) return
    setDragOverSprint(null)
    const item = state.items.find(i => i.id === id)
    const newSprintId = sprintId === 'unassigned' ? null : sprintId
    if (!item || item.sprintId === newSprintId) return
    const updated = { ...item, sprintId: newSprintId }
    dispatch({ type: 'UPDATE_ITEM', payload: updated })
    saveToServer({ ...state, items: state.items.map(i => i.id === id ? updated : i) })
    dragItemId.current = null
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

  function handleSave(item: Item) {
    const isNew = !state.items.find(i => i.id === item.id)
    dispatch({ type: isNew ? 'ADD_ITEM' : 'UPDATE_ITEM', payload: item })
    saveToServer({ ...state, items: isNew ? [...state.items, item] : state.items.map(i => i.id === item.id ? item : i) })
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

  const unassigned = itemsForSprint(null)
  const totalSP = state.items.reduce((s, i) => s + i.sp, 0)

  return (
    <>
      <Header title="Planning">
        <div className="hdr-sep" />
        {/* Filtre clients en pills */}
        <button
          className={`hdr-ctx-btn${!filterClient ? ' active' : ''}`}
          onClick={() => setFilterClient('')}
          style={!filterClient ? { background: 'var(--primary)', color: '#fff' } : {}}
        >
          Tous
        </button>
        {state.clients.map(c => (
          <button
            key={c.id}
            className="hdr-ctx-btn"
            onClick={() => setFilterClient(filterClient === c.id ? '' : c.id)}
            style={filterClient === c.id ? { background: c.color, color: '#fff' } : { borderLeft: `3px solid ${c.color}` }}
          >
            {c.name}
          </button>
        ))}
        <div className="hdr-sep" />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalSP} SP total</span>
        <div style={{ flex: 1 }} />
        {/* Toggle vue */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button
            className="hdr-ctx-btn"
            style={{ borderRadius: 0, background: view === 'grid' ? 'var(--primary)' : undefined, color: view === 'grid' ? '#fff' : undefined }}
            onClick={() => setView('grid')}
            title="Vue grille"
          >⊞ Grille</button>
          <button
            className="hdr-ctx-btn"
            style={{ borderRadius: 0, borderLeft: '1px solid var(--border)', background: view === 'calendar' ? 'var(--primary)' : undefined, color: view === 'calendar' ? '#fff' : undefined }}
            onClick={() => setView('calendar')}
            title="Vue calendrier"
          >📅 Calendrier</button>
        </div>
        <button className="hdr-btn primary" onClick={addSprint}>+ Sprint</button>
      </Header>

      <div className="page-content" style={{ padding: '24px 16px' }}>
        {view === 'calendar' ? (
          <CalendarView state={state} />
        ) : (
          <div className="planning-grid">
            {state.sprints.map(sprint => (
              <SprintColumn
                key={sprint.id}
                sprint={sprint}
                items={itemsForSprint(sprint.id)}
                state={state}
                isOver={dragOverSprint === sprint.id}
                isActive={sprint.id === activeSprintId}
                onDragStart={id => { dragItemId.current = id }}
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
            {/* Colonne non assigné */}
            {(unassigned.length > 0 || !filterClient) && (
              <div
                className={`planning-col planning-col-unassigned${dragOverSprint === 'unassigned' ? ' planning-col-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOverSprint('unassigned') }}
                onDrop={e => { e.preventDefault(); handleDrop('unassigned') }}
              >
                <div className="planning-col-header">
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>Non assigné</span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{unassigned.length} US</span>
                </div>
                <div className="planning-items">
                  {unassigned.map(item => (
                    <PlanningCard
                      key={item.id}
                      item={item}
                      state={state}
                      onEdit={item => setModalItem(item)}
                      onDragStart={id => { dragItemId.current = id }}
                    />
                  ))}
                  {unassigned.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 11, border: '1.5px dashed var(--border)', borderRadius: 6 }}>
                      Glisser des US ici
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
