import type { Item, CadenceState } from '../../types'

const PRIORITY_DOT: Record<string, string> = {
  critical: '#ff3b30', high: '#ff9500', medium: '#34c759', low: '#aeaeb2'
}

interface Props {
  item: Item
  state: CadenceState
  onEdit: (item: Item) => void
  onDelete: (id: string) => void
  onDragStart: (id: string) => void
}

export function KanbanCard({ item, state, onEdit, onDelete, onDragStart }: Props) {
  const client = state.clients.find(c => c.id === item.clientId)
  const assignees = item.assignees.map(id => state.team.find(m => m.id === id)).filter(Boolean)

  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={() => onDragStart(item.id)}
      style={{ borderLeft: `3px solid ${client?.color ?? 'var(--border)'}` }}
    >
      <div className="kanban-card-header">
        <span className="item-key">{item.key}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[item.priority], flexShrink: 0, marginTop: 2 }} title={item.priority} />
          <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>{item.sp} SP</span>
        </span>
      </div>
      <p className="kanban-card-desc">{item.desc}</p>
      {item.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 6 }}>
          {item.tags.map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      )}
      <div className="kanban-card-footer">
        <div style={{ display: 'flex' }}>
          {assignees.map(m => m && (
            <span key={m.id} className="avatar" title={m.name} style={{ width: 18, height: 18, fontSize: 8 }}>
              {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="btn-icon" style={{ padding: '2px 4px', fontSize: 11 }} onClick={() => onEdit(item)} title="Modifier">✎</button>
          <button className="btn-icon danger" style={{ padding: '2px 4px', fontSize: 11 }} onClick={() => onDelete(item.id)} title="Supprimer">🗑</button>
        </div>
      </div>
    </div>
  )
}
