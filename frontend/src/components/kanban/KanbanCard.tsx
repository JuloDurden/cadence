import type { Item, CadenceState } from '../../types'

const PRIORITY_DOT: Record<string, string> = {
  critical: '#ff3b30', high: '#ff9500', medium: '#34c759', low: '#aeaeb2',
}

function Ico({ d, size = 13, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const ICO = {
  pencil:      '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  // circle with minus = "remove from sprint"
  circleMinus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
}

interface Props {
  item: Item
  state: CadenceState
  colColor: string
  cardDraggable: boolean
  onEdit: (item: Item) => void
  onRemoveFromSprint: (id: string) => void
  onDragStart: (id: string) => void
  // Phase 2.5 (roadmap v1) — Stakeholder en lecture seule sur Kanban : la carte reste
  // cliquable (édition ouverte en lecture seule via ItemModal) mais l'action "Retirer du
  // sprint" (mutation directe, hors ItemModal) est masquée. Défaut `false`.
  readOnly?: boolean
  // Cartes hierarchiques (2026-08-20) : un item "orphelin" (hors Epic, voir KanbanColumn.tsx)
  // est le sommet de son propre groupe au meme titre qu'un Epic hors Initiative - il porte donc
  // le degrade couleur client + le reflet holo plein cadre + le motif (comme
  // .hc-card.hc-epic/.hc-standalone dans hierCards.css), plutot que le fond plat d'un item
  // range dans un groupe. Defaut `false` (item range dans un KanbanEpicGroup).
  standalone?: boolean
}

export function KanbanCard({ item, state, colColor, cardDraggable, onEdit, onRemoveFromSprint, onDragStart, readOnly = false, standalone = false }: Props) {
  const client    = state.clients.find(c => c.id === item.clientId)
  const assignees = item.assignees.map(id => state.team.find(m => m.id === id)).filter(Boolean)

  return (
    <div
      className={`kanban-card hc-card hc-item${standalone ? ' hc-standalone' : ''}`}
      draggable={cardDraggable}
      onDragStart={() => cardDraggable && onDragStart(item.id)}
      style={{
        cursor: cardDraggable ? 'grab' : 'default',
        ['--client' as string]: client?.color,
      }}
    >
      {standalone && <div className="hc-pattern-holo" />}
      <div className="kanban-card-header hc-text">
        <span className="item-key hc-text-holo">{item.key}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[item.priority], flexShrink: 0 }}
            title={item.priority}
          />
          <span className="hc-text-holo" style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>{item.sp} SP</span>
        </span>
      </div>

      <p className="kanban-card-desc hc-text hc-text-holo">{item.desc}</p>

      {item.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 6 }}>
          {item.tags.map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      )}

      <div className="kanban-card-footer hc-text">
        <div style={{ display: 'flex' }}>
          {assignees.map(m => m && (
            <span key={m.id} className="avatar" title={m.name} style={{ width: 18, height: 18, fontSize: 8 }}>
              {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            className="btn-icon"
            style={{ padding: '2px 4px' }}
            onClick={() => onEdit(item)}
            title="Modifier"
          >
            <Ico d={ICO.pencil} size={12} />
          </button>
          {!readOnly && (
            <button
              className="btn-icon"
              style={{ padding: '2px 4px' }}
              onClick={() => onRemoveFromSprint(item.id)}
              title="Retirer du sprint"
            >
              <Ico d={ICO.circleMinus} size={12} stroke="var(--text-muted)" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
