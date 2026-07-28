import { useState } from 'react'
import type { Item, CadenceState } from '../../types'
import { PlanningCard } from './PlanningCard'
import { getEpicSP } from '../../utils/epicScore'

// Chevron (Lucide chevron-down), pivote de 180° quand le groupe est ouvert.
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
  epicId: string
  epic: Item | undefined
  stories: Item[]
  state: CadenceState
  highlightClient?: string
  highlightType?: string
  compact?: boolean
  sprintEndDate?: string
  onEdit: (item: Item) => void
  onDragGroup: (ids: string[]) => void
  onDragItem:  (id: string)   => void
}

export function PlanningEpicGroup({
  epicId, epic, stories, state, highlightClient, highlightType, compact, sprintEndDate,
  onEdit, onDragGroup, onDragItem,
}: Props) {
  const client   = epic ? state.clients.find(c => c.id === epic.clientId) : undefined
  const groupIds = epic ? [epic.id, ...stories.map(s => s.id)] : stories.map(s => s.id)
  // SP de l'Epic (2026-07-28, corrigé le même jour) : soit un score attribué arbitrairement
  // à l'Epic (champ sp propre, saisi dans Backlog), soit la somme des SP de ses US — jamais
  // les deux additionnés. Voir utils/epicScore.ts (partagé avec RoadmapPage.tsx).
  const sumStories = stories.reduce((acc, s) => acc + s.sp, 0)
  const hasArbitraryScore = !!epic && epic.sp > 0
  const totalSP = getEpicSP(epic, stories)
  // Repliable (2026-07-28) : dans une carte de sprint étroite (Release Planning) ou une cellule
  // Swimlanes, un Epic avec plusieurs US pouvait rendre difficile de voir où il s'arrête et où
  // commencent les items suivants du même sprint — replié par défaut à false (comportement
  // inchangé), l'utilisateur choisit d'ouvrir/fermer chaque groupe individuellement.
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`epic-group${compact ? ' epic-group-compact' : ''}${collapsed ? ' epic-group-collapsed' : ''}`}>
      {/* Header draggable → déplace tout le groupe ; le chevron bascule replié/déplié sans déclencher le drag */}
      <div
        className="epic-group-header"
        draggable
        onDragStart={e => { e.stopPropagation(); onDragGroup(groupIds) }}
        title={`Glisser pour déplacer l'Epic et ses ${stories.length} US`}
        style={{ borderLeft: `3px solid ${client?.color ?? '#6366f1'}` }}
      >
        <button
          type="button"
          className="epic-group-toggle"
          draggable={false}
          data-testid={`epic-group-toggle-${epicId}`}
          title={collapsed ? 'Déplier les US' : 'Replier les US'}
          onClick={e => { e.stopPropagation(); setCollapsed(c => !c) }}
          onDragStart={e => e.stopPropagation()}
        >
          <Chevron open={!collapsed} />
        </button>
        <span className="epic-type-tag">EPIC</span>
        <span className="epic-group-name">{epic?.desc ?? '(Epic)'}</span>
        <span className="epic-group-count" title={hasArbitraryScore
          ? `Score attribué arbitrairement à l'Epic (somme de ses US : ${sumStories} SP, non utilisée)`
          : `Somme des SP de ses ${stories.length} US`}>
          {stories.length} US · {totalSP} SP
        </span>
      </div>

      {/* Stories — chacune draggable individuellement */}
      {!collapsed && (
        <div className="epic-group-stories" data-testid={`epic-group-stories-${epicId}`}>
          {stories.map(story => (
            <PlanningCard
              key={story.id}
              item={story}
              state={state}
              highlightClient={highlightClient}
              highlightType={highlightType}
              sprintEndDate={sprintEndDate}
              onEdit={onEdit}
              onDragStart={id => onDragItem(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
