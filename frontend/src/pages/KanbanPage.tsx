import { useState, useMemo, useRef } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { KanbanColumn } from '../components/kanban/KanbanColumn'
import { ItemModal } from '../components/backlog/ItemModal'
import type { Item } from '../types'

const SORT_OPTIONS = [
  { value: 'priority', label: 'Priorité' },
  { value: 'sp-desc', label: 'SP ↓' },
  { value: 'sp-asc', label: 'SP ↑' },
  { value: 'assignee', label: 'Assigné' },
]

function priorityOrder(p: string) { return { critical: 0, high: 1, medium: 2, low: 3 }[p] ?? 4 }

export function KanbanPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [sprintIdx, setSprintIdx] = useState(() => {
    const idx = state.sprints.findIndex(s => !s.closed)
    return idx >= 0 ? idx : 0
  })
  const [sortBy, setSortBy] = useState('priority')
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const dragItemId = useRef<string | null>(null)

  const currentSprint = state.sprints[sprintIdx]

  const itemsByCol = useMemo(() => {
    let items = currentSprint
      ? state.items.filter(i => i.sprintId === currentSprint.id)
      : state.items

    items = [...items].sort((a, b) => {
      if (sortBy === 'sp-desc') return b.sp - a.sp
      if (sortBy === 'sp-asc') return a.sp - b.sp
      if (sortBy === 'assignee') return (a.assignees[0] ?? '').localeCompare(b.assignees[0] ?? '')
      return priorityOrder(a.priority) - priorityOrder(b.priority)
    })

    const map: Record<string, Item[]> = {}
    state.kanbanCols.forEach(col => { map[col.id] = [] })
    items.forEach(item => {
      if (map[item.status]) map[item.status].push(item)
      else {
        const defaultCol = state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id
        if (defaultCol) map[defaultCol].push(item)
      }
    })
    return map
  }, [state.items, state.kanbanCols, currentSprint, sortBy])

  function handleDrop(colId: string) {
    const itemId = dragItemId.current
    if (!itemId) return
    setDragOverCol(null)
    const item = state.items.find(i => i.id === itemId)
    if (!item || item.status === colId) return
    const updated = { ...item, status: colId }
    dispatch({ type: 'UPDATE_ITEM', payload: updated })
    saveToServer({ ...state, items: state.items.map(i => i.id === itemId ? updated : i) })
    dragItemId.current = null
  }

  function handleSave(item: Item) {
    const action = state.items.find(i => i.id === item.id)
      ? { type: 'UPDATE_ITEM' as const, payload: item }
      : { type: 'ADD_ITEM' as const, payload: item }
    dispatch(action)
    saveToServer({ ...state, items: action.type === 'ADD_ITEM' ? [...state.items, item] : state.items.map(i => i.id === item.id ? item : i) })
    setModalItem(undefined)
  }

  function handleDelete(id: string) {
    if (!confirm('Supprimer cette US ?')) return
    dispatch({ type: 'DELETE_ITEM', payload: id })
    saveToServer({ ...state, items: state.items.filter(i => i.id !== id) })
  }

  const sprintLabel = currentSprint?.label ?? 'Tous'
  const totalSP = currentSprint ? state.items.filter(i => i.sprintId === currentSprint.id).reduce((s, i) => s + i.sp, 0) : 0

  return (
    <>
      <Header title="Kanban">
        <div className="hdr-sep" />
        <select
          className="hdr-select"
          value={sprintIdx}
          onChange={e => setSprintIdx(Number(e.target.value))}
        >
          {state.sprints.map((s, i) => (
            <option key={s.id} value={i}>Sprint {s.number}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sprintLabel}
        </span>
        {currentSprint?.goal && (
          <>
            <div className="hdr-sep" />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🎯 {currentSprint.goal}
            </span>
          </>
        )}
        <div className="hdr-sep" />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalSP} SP</span>
        <div style={{ flex: 1 }} />
        <select className="hdr-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="hdr-btn primary" onClick={() => setModalItem(null)}>+ Nouvelle US</button>
      </Header>

      <div className="page-content" style={{ padding: '24px 16px' }}>
        <div className="kanban-board">
          {state.kanbanCols.map(col => (
            <KanbanColumn
              key={col.id}
              col={col}
              items={itemsByCol[col.id] ?? []}
              state={state}
              dragOverCol={dragOverCol}
              onDragStart={id => { dragItemId.current = id }}
              onDragOver={colId => setDragOverCol(colId)}
              onDrop={handleDrop}
              onEdit={item => setModalItem(item)}
              onDelete={handleDelete}
            />
          ))}
        </div>
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
