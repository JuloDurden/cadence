import type { Item, CadenceState } from '../../types'
import { PlanningCard } from './PlanningCard'

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

  return (
    <div className={`epic-group${compact ? ' epic-group-compact' : ''}`}>
      {/* Header draggable → déplace tout le groupe */}
      <div
        className="epic-group-header"
        draggable
        onDragStart={e => { e.stopPropagation(); onDragGroup(groupIds) }}
        title={`Glisser pour déplacer l'Epic et ses ${stories.length} US`}
        style={{ borderLeft: `3px solid ${client?.color ?? '#6366f1'}` }}
      >
        <span className="epic-type-tag">EPIC</span>
        <span className="epic-group-name">{epic?.desc ?? '(Epic)'}</span>
        <span className="epic-group-count">{stories.length} US</span>
      </div>

      {/* Stories — chacune draggable individuellement */}
      <div className="epic-group-stories">
        {stories.map(story => (
          <PlanningCard
            key={story.id}
            item={story}
            state={state}
            highlightClient={highlightClient}
            highlightType={highlightType}
            sprintEndDate={sprintEndDate}
            onEdit={onEdit}
            onDragSt