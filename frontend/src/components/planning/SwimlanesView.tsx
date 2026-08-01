import type { Item, CadenceState } from '../../types'
import { PlanningCard } from './PlanningCard'
import { PlanningEpicGroup } from './PlanningEpicGroup'
import { attachItemsToEpics, getHierarchyNodeSP } from '../../utils/hierarchyScore'

interface Props {
  state: CadenceState
  highlightClient?: string
  highlightType?: string
  dragIds: React.MutableRefObject<string[]>
  dragOverKey: string | null
  onDragOver: (key: string) => void
  onDragLeave: () => void
  onDrop: (sprintId: string) => void
  onEdit: (item: Item) => void
  // Phase 2.5 (roadmap v1) — voir PlanningCard.tsx (même principe : lecture seule = plus de drag).
  readOnly?: boolean
}

/** key de cellule : "clientId:sprintId" ou "clientId:unassigned" */
function cellKey(clientId: string, sprintId: string | null) {
  return `${clientId}:${sprintId ?? 'unassigned'}`
}

export function SwimlanesView({
  state, highlightClient, highlightType,
  dragIds, dragOverKey, onDragOver, onDragLeave, onDrop, onEdit, readOnly = false,
}: Props) {
  const clientsWithItems = state.clients.filter(c =>
    !c.excludeFromPlanning &&
    state.items.some(i => i.clientId === c.id)
  )

  if (clientsWithItems.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
        Aucun item dans le backlog.
      </div>
    )
  }

  return (
    <div className="swimlanes-view">
      {/* ── En-tête colonnes (sprints + non-assigné) ─── */}
      <div className="swimlanes-header">
        <div className="swimlanes-client-col" /> {/* coin vide */}
        {state.sprints.map(sprint => (
          <div key={sprint.id} className={`swimlanes-sprint-head${sprint.active ? ' sl-active' : ''}${sprint.closed ? ' sl-closed' : ''}`}>
            <span style={{ fontWeight: 700, fontSize: 12 }}>Sprint {sprint.number}</span>
            {sprint.active && <span style={{ fontSize: 9, background: 'var(--primary)', color: '#fff', padding: '1px 5px', borderRadius: 8, marginLeft: 4 }}>Actif</span>}
          </div>
        ))}
        <div className="swimlanes-sprint-head sl-unassigned-head">
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Non assigné</span>
        </div>
      </div>

      {/* ── Lignes clients ───────────────────────────── */}
      {clientsWithItems.map(client => {
        const clientItems = state.items.filter(i => i.clientId === client.id)
        const totalSP     = clientItems.reduce((s, i) => s + i.sp, 0)

        return (
          <div key={client.id} className="swimlanes-row">
            {/* Étiquette client */}
            <div
              className="swimlanes-client-col swimlanes-client-label"
              style={{ borderLeft: `4px solid ${client.color}` }}
            >
              <span style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{clientItems.length} items · {totalSP} SP</span>
            </div>

            {/* Cellules sprint */}
            {state.sprints.map(sprint => {
              const key        = cellKey(client.id, sprint.id)
              const isOver     = dragOverKey === key
              const sprintItems = clientItems.filter(i => i.sprintId === sprint.id)

              // Groupement Epic intra-cellule : Epics de ce client assignés à ce sprint, y
              // compris sans aucun item (retour Julien, 2026-07-29) — `attachItemsToEpics()`
              // les inclut nativement, contrairement à l'ancien groupement item-first.
              const cellEpics = state.hierarchyNodes.filter(n => n.level === 'epic' && n.sprintId === sprint.id && n.clientId === client.id)
              const { groups: epicGroups, orphans: standalone } = attachItemsToEpics(cellEpics, sprintItems)
              const emptyEpicsSP = epicGroups.filter(g => g.items.length === 0).reduce((s, g) => s + getHierarchyNodeSP(g.epic, []), 0)
              const sprintSP   = sprintItems.reduce((s, i) => s + i.sp, 0) + emptyEpicsSP

              return (
                <div
                  key={sprint.id}
                  className={`swimlanes-cell${isOver ? ' swimlanes-cell-over' : ''}${sprint.closed ? ' swimlanes-cell-closed' : ''}`}
                  onDragOver={e => { e.preventDefault(); onDragOver(key) }}
                  onDragLeave={onDragLeave}
                  onDrop={e => { e.preventDefault(); onDrop(sprint.id) }}
                >
                  {(sprintItems.length > 0 || emptyEpicsSP > 0) && (
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', textAlign: 'right', marginBottom: 4 }}>
                      {sprintSP} SP
                    </div>
                  )}
                  {epicGroups.map(({ epicId, epic, items: stories }) => (
                    <PlanningEpicGroup
                      key={epicId}
                      epicId={epicId}
                      epic={epic}
                      stories={stories}
                      state={state}
                      highlightClient={highlightClient}
                      highlightType={highlightType}
                      sprintEndDate={sprint.endDate}
                      compact
                      onEdit={onEdit}
                      onDragGroup={ids => { dragIds.current = ids }}
                      onDragItem={id  => { dragIds.current = [id] }}
                      readOnly={readOnly}
                    />
                  ))}
                  {standalone.map(item => (
                    <PlanningCard
                      key={item.id}
                      item={item}
                      state={state}
                      highlightClient={highlightClient}
                      highlightType={highlightType}
                      sprintEndDate={sprint.endDate}
                      onEdit={onEdit}
                      onDragStart={id => { dragIds.current = [id] }}
                      readOnly={readOnly}
                    />
                  ))}
                  {sprintItems.length === 0 && epicGroups.length === 0 && !sprint.closed && (
                    <div style={{ height: 36, border: '1.5px dashed var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>–</span>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Cellule non-assigné */}
            {(() => {
              const key  = cellKey(client.id, null)
              const isOver = dragOverKey === key
              const unassignedItems = clientItems.filter(i => i.sprintId === null)
              return (
                <div
                  className={`swimlanes-cell sl-unassigned-cell${isOver ? ' swimlanes-cell-over' : ''}`}
                  onDragOver={e => { e.preventDefault(); onDragOver(key) }}
                  onDragLeave={onDragLeave}
                  onDrop={e => { e.preventDefault(); onDrop('unassigned') }}
                >
                  {unassignedItems.map(item => (
                    <PlanningCard
                      key={item.id}
                      item={item}
                      state={state}
                      highlightClient={highlightClient}
                      highlightType={highlightType}
                      onEdit={onEdit}
                      onDragStart={id => { dragIds.current = [id] }}
                      readOnly={readOnly}
                    />
                  ))}
                  {unassignedItems.length === 0 && (
                    <div style={{ height: 36, border: '1.5px dashed var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>–</span>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
