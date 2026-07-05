import { useState } from 'react'
import type { Item, Sprint, CadenceState } from '../../types'
import { PlanningCard } from './PlanningCard'
import { effectiveCapacity, holidaysInRange, computeSprintEndDate } from '../../utils/sprintCapacity'
import { fmtDateShort } from '../../utils/dates'

interface Props {
  sprint: Sprint
  items: Item[]
  state: CadenceState
  isOver: boolean
  onDragStart: (id: string) => void
  onDragOver: (sprintId: string) => void
  onDrop: (sprintId: string) => void
  onEdit: (item: Item) => void
  onUpdateDates: (sprintId: string, startDate: string, endDate: string) => void
}



export function SprintColumn({ sprint, items, state, isOver, onDragStart, onDragOver, onDrop, onEdit, onUpdateDates }: Props) {
  const [editDates, setEditDates] = useState(false)
  const [draftStart, setDraftStart] = useState(sprint.startDate)
  const [draftEnd,   setDraftEnd]   = useState(sprint.endDate)

  const usedSP = items.reduce((s, i) => s + i.sp, 0)
  const effCap = effectiveCapacity(sprint, state.team)
  const holidays = sprint.startDate && sprint.endDate ? holidaysInRange(sprint.startDate, sprint.endDate) : []
  const pct = effCap > 0 ? Math.min(100, (usedSP / effCap) * 100) : 0
  const over = usedSP > effCap

  function openEditDates() {
    setDraftStart(sprint.startDate)
    setDraftEnd(sprint.endDate)
    setEditDates(true)
  }
  function handleStartChange(val: string) {
    setDraftStart(val)
    if (val) setDraftEnd(computeSprintEndDate(val, state.settings.sprintDuration ?? 2))
  }
  function confirmDates() {
    if (draftStart && draftEnd) onUpdateDates(sprint.id, draftStart, draftEnd)
    setEditDates(false)
  }
  function cancelDates() { setEditDates(false) }

  return (
    <div
      className={`planning-col${isOver ? ' planning-col-over' : ''}${sprint.closed ? ' planning-col-closed' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(sprint.id) }}
      onDrop={e => { e.preventDefault(); onDrop(sprint.id) }}
    >
      <div className="planning-col-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Sprint {sprint.number}</span>
          {sprint.closed && <span style={{ fontSize: 10, background: '#34c75920', color: '#248a3d', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>Clôturé</span>}
          {!sprint.closed && state.sprints.filter(s => !s.closed).indexOf(sprint) === 0 && (
            <span style={{ fontSize: 10, background: 'var(--primary-light)', color: 'var(--primary)', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>En cours</span>
          )}
        </div>
        {editDates ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
            <input type="date" value={draftStart} onChange={e => handleStartChange(e.target.value)}
              style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface)', color: 'var(--text)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
            <input type="date" value={draftEnd} onChange={e => setDraftEnd(e.target.value)}
              style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface)', color: 'var(--text)' }} />
            <button onClick={confirmDates} style={{ fontSize: 10, padding: '2px 7px', border: 'none', borderRadius: 4, background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>✓</button>
            <button onClick={cancelDates}  style={{ fontSize: 10, padding: '2px 7px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <span
            onClick={openEditDates}
            title="Cliquer pour modifier les dates"
            style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            {sprint.startDate && sprint.endDate ? `${fmtDateShort(sprint.startDate)} → ${fmtDateShort(sprint.endDate)}` : <em>Dates non définies</em>}
            {holidays.length > 0 && (
              <span style={{ color: '#d97706', fontWeight: 600 }} title={holidays.map(h => h.name).join(', ')}>
                🏖 -{holidays.length}j
              </span>
            )}
            <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 2 }}>✎</span>
          </span>
        )}
        {sprint.goal && (
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.3 }}>🎯 {sprint.goal}</p>
        )}
        {/* Barre de capacité */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Capacité</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: over ? 'var(--danger)' : 'var(--text-muted)' }}>
              {usedSP}/{effCap} SP{effCap < sprint.capacity ? <span style={{ color: '#d97706' }}> *</span> : null}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--danger)' : 'var(--primary)', borderRadius: 2, transition: 'width .3s' }} />
          </div>
        </div>
      </div>

      <div className="planning-items">
        {items.map(item => (
          <PlanningCard
            key={item.id}
            item={item}
            state={state}
            onEdit={onEdit}
            onDragStart={onDragStart}
          />
        ))}
        {items.length === 0 && !sprint.closed && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 11, border: '1.5px dashed var(--border)', borderRadius: 6 }}>
            Glisser des US ici
          </div>
        )}
      </div>
    </div>
  )
}
