import type { Item, KanbanCol, CadenceState } from '../../types'
import { KanbanCard } from './KanbanCard'

interface Props {
  col: KanbanCol
  items: Item[]
  state: CadenceState
  isBase: boolean
  reorgMode: boolean
  isDragOver: boolean
  onCardDragStart:    (itemId: string) => void
  onColDragStart:     (colId: string)  => void
  onDragOver:         (colId: string)  => void
  onDrop:             (colId: string)  => void
  onDeleteCol:        (colId: string)  => void
  onEdit:             (item: Item)     => void
  onRemoveFromSprint: (id: string)     => void
}

function Ico({ d, size = 14, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const ICO = {
  grip:        '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  circleMinus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
}

export function KanbanColumn({
  col, items, state, isBase, reorgMode, isDragOver,
  onCardDragStart, onColDragStart, onDragOver, onDrop,
  onDeleteCol, onEdit, onRemoveFromSprint,
}: Props) {
  return (
    <div
      className={`kanban-col${isDragOver ? ' kanban-col-over' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(col.id) }}
      onDrop={e => { e.preventDefault(); onDrop(col.id) }}
    >
      {/* Header */}
      <div
        className="kanban-col-header"
        style={{ background: col.color + '22', borderBottom: `2px solid ${col.color}44` }}
        draggable={reorgMode}
        onDragStart={e => { if (reorgMode) { e.stopPropagation(); onColDragStart(col.id) } }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {reorgMode && <Ico d={ICO.grip} size={13} stroke={col.color} />}
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', color: col.color }}>
            {col.label.toUpperCase()}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            className="kanban-col-count"
            style={{ background: col.color + '22', color: col.color, borderColor: 'transparent' }}
          >
            {items.length}
          </span>
          {reorgMode && !isBase && (
            <button
              onClick={() => onDeleteCol(col.id)}
              title="Supprimer la colonne"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', borderRadius: 4, display: 'flex', alignItems: 'center', color: 'var(--danger)' }}
            >
              <Ico d={ICO.circleMinus} size={12} stroke="var(--danger)" />
            </button>
          )}
        </span>
      </div>

      {/* Cards area */}
      <div className="kanban-cards" style={{ background: col.color + '0d' }}>
        {items.map(item => (
          <KanbanCard
            key={item.id}
            item={item}
            state={state}
            colColor={col.color}
            cardDraggable={!reorgMode}
            onEdit={onEdit}
            onRemoveFromSprint={onRemoveFromSprint}
            onDragStart={onCardDragStart}
          />
        ))}
        {items.length === 0 && (
          <div className="kanban-empty">Glisser ici</div>
        )}
      </div>
    </div>
  )
}
