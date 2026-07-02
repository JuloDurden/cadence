import type { Item, Sprint, CadenceState } from '../../types'
import { PlanningCard } from './PlanningCard'

interface Props {
  sprint: Sprint
  items: Item[]
  state: CadenceState
  isOver: boolean
  onDragStart: (id: string) => void
  onDragOver: (sprintId: string) => void
  onDrop: (sprintId: string) => void
  onEdit: (item: Item) => void
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function SprintColumn({ sprint, items, state, isOver, onDragStart, onDragOver, onDrop, onEdit }: Props) {
  const usedSP = items.reduce((s, i) => s + i.sp, 0)
  const pct = sprint.capacity > 0 ? Math.min(100, (usedSP / sprint.capacity) * 100) : 0
  const over = usedSP > sprint.capacity

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
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {fmt(sprint.startDate)} → {fmt(sprint.endDate)}
        </span>
        {sprint.goal && (
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.3 }}>🎯 {sprint.goal}</p>
        )}
        {/* Barre de capacité */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Capacité</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: over ? 'var(--danger)' : 'var(--text-muted)' }}>
              {usedSP}/{sprint.capacity} SP
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
