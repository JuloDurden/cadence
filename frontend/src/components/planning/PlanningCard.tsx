import type { Item, CadenceState } from '../../types'

const PRIORITY_DOT: Record<string, string> = {
  critical: '#ff3b30', high: '#ff9500', medium: '#34c759', low: '#aeaeb2'
}

interface Props {
  item: Item
  state: CadenceState
  onEdit: (item: Item) => void
  onDragStart: (id: string) => void
}

export function PlanningCard({ item, state, onEdit, onDragStart }: Props) {
  const client = state.clients.find(c => c.id === item.clientId)
  const status = state.kanbanCols.find(c => c.id === item.status)
  const assignees = item.assignees.map(id => state.team.find(m => m.id === id)).filter(Boolean)

  return (
    <div
      className="planning-card"
      draggable
      onDragStart={() => onDragStart(item.id)}
      onClick={() => onEdit(item)}
      style={{ borderLeft: `3px solid ${client?.color ?? 'var(--border)'}` }}
      title={item.desc}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <span className="item-key">{item.key}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_DOT[item.priority] }} />
          <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>{item.sp}</span>
        </span>
      </div>
      <p style={{ fontSize: 12, margin: '4px 0 0', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {item.desc}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        {status && (
          <span style={{ fontSize: 10, color: status.color, fontWeight: 600 }}>{status.label}</span>
        )}
        <div style={{ display: 'flex', marginLeft: 'auto' }}>
          {assignees.map(m => m && (
            <span key={m.id} className="avatar" title={m.name} style={{ width: 16, height: 16, fontSize: 7 }}>
              {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
