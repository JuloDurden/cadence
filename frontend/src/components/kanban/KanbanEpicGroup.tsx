import { useState } from 'react'
import type { Item, CadenceState, HierarchyNode } from '../../types'
import { KanbanCard } from './KanbanCard'
import { getEpicSP } from '../../utils/hierarchyScore'

// Affichage groupé par Epic dans Kanban (docs/corrections futures.md, Kanban, 2026-08-17) :
// reprend la structure visuelle de PlanningEpicGroup.tsx (Release Planning), mais avec
// KanbanCard (pas PlanningCard) et le modèle de drag propre au Kanban - un Epic peut être
// réparti sur plusieurs colonnes de statut à la fois (contrairement à Release Planning où un
// Epic n'appartient qu'à un seul sprint), donc chaque instance de ce composant ne représente
// QUE la part de l'Epic présente dans cette colonne. `groupKey` (pas juste `epicId`) sert aux
// data-testid : un même Epic peut être groupé dans plusieurs colonnes simultanément, l'id seul
// ne serait pas unique dans la page (voir KanbanColumn.tsx, qui compose `${col.id}-${epicId}`).
const ICO_CHEVRON = '<path d="m6 9 6 6 6-6"/>'
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      dangerouslySetInnerHTML={{ __html: ICO_CHEVRON }}
    />
  )
}

interface Props {
  groupKey: string
  epic: HierarchyNode | undefined
  items: Item[]
  state: CadenceState
  colColor: string
  onEdit: (item: Item) => void
  onRemoveFromSprint: (id: string) => void
  onDragItem: (id: string) => void
  // Retour Julien (2026-08-17) : glisser l'en-tête du groupe déplace tout l'Epic (ses items
  // présents dans cette colonne + le statut du HierarchyNode lui-même, lu ailleurs pour
  // déterminer si un Epic sans item compte comme "terminé" - voir getSprintSP,
  // utils/hierarchyScore.ts) vers la colonne cible, en un seul geste. Voir KanbanPage.tsx,
  // handleGroupDrop.
  onDragGroup: (ids: string[]) => void
  readOnly?: boolean
}

export function KanbanEpicGroup({
  groupKey, epic, items, state, colColor, onEdit, onRemoveFromSprint, onDragItem, onDragGroup, readOnly = false,
}: Props) {
  const client = epic ? state.clients.find(c => c.id === epic.clientId) : undefined
  const groupIds = epic ? [epic.id, ...items.map(i => i.id)] : items.map(i => i.id)
  const totalSP = getEpicSP(epic, items)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`epic-group epic-group-compact${collapsed ? ' epic-group-collapsed' : ''}`}>
      <div
        className="epic-group-header"
        draggable={!readOnly}
        onDragStart={e => { e.stopPropagation(); if (!readOnly) onDragGroup(groupIds) }}
        title={`Glisser pour déplacer l'Epic et ses ${items.length} item(s) vers une autre colonne`}
        style={{ borderLeft: `3px solid ${client?.color ?? '#6366f1'}` }}
      >
        <button
          type="button"
          className="epic-group-toggle"
          draggable={false}
          data-testid={`epic-group-toggle-${groupKey}`}
          title={collapsed ? 'Déplier les items' : 'Replier les items'}
          onClick={e => { e.stopPropagation(); setCollapsed(c => !c) }}
          onDragStart={e => e.stopPropagation()}
        >
          <Chevron open={!collapsed} />
        </button>
        <span className="epic-type-tag">EPIC</span>
        <span className="epic-group-name">{epic?.desc ?? '(Epic)'}</span>
        <span className="epic-group-count">{items.length} item{items.length > 1 ? 's' : ''} · {totalSP} SP</span>
      </div>

      {!collapsed && (
        <div className="epic-group-stories" data-testid={`epic-group-stories-${groupKey}`}>
          {items.map(item => (
            <KanbanCard
              key={item.id}
              item={item}
              state={state}
              colColor={colColor}
              cardDraggable={!readOnly}
              onEdit={onEdit}
              onRemoveFromSprint={onRemoveFromSprint}
              onDragStart={onDragItem}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  )
}
