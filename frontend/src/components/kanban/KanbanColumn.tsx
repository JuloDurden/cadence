import type { Item, KanbanCol, CadenceState } from '../../types'
import { KanbanCard } from './KanbanCard'

interface Props {
  col: KanbanCol
  items: Item[]
  state: CadenceState
  dragOverCol: string | null
  onDragStart: (itemId: string) => void
  onDragOver: (colId: string) => void
  onDrop: (colId: string) => void
  onEdit: (item: Item) => void
  onDelete: (id: string) => void
}

export function KanbanColumn({ col, items, state, dragOverCol, onDragStart, onDragOver, onDrop, onEdit, onDelete }: Props) {
  const isOver = dragOverCol === col.id

  return (
    <div
      className={`kanban-col${isOver ? ' kanban-col-over' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(col.id) }}
      onDrop={e => { e.preventDefault(); onDrop(col.id) }}
    >
      <div className="kanban-col-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 12 }}>{col.label}</span>
        </span>
        <span className="kanban-col-count">{items.length}</span>
      </div>
      <div className="kanban-cards">
        {items.map(item => (
          <KanbanCard
            key={item.id}
            item={item}
            state={state}
            onEdit={onEdit}
            onDelete={onDelete}
            onDragStart={onDragStart}
          />
        ))}
        {items.length === 0 && (
          <div className="kanban-empty">Glisser ici</div>
        )}
      </div>
    </div>
  )
}
