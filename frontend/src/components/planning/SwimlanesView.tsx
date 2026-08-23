import { useRef, useCallback } from 'react'
import type { Item, CadenceState } from '../../types'
import { PlanningCard } from './PlanningCard'
import { PlanningEpicGroup } from './PlanningEpicGroup'
import { attachItemsToEpics, epicsWithPlaceholder, getHierarchyNodeSP } from '../../utils/hierarchyScore'
import { useHierCardTilt } from '../../hooks/useHierCardTilt'

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

  // Cartes hierarchiques (2026-08-20) : un seul hook au niveau de toute la vue plutot qu'un par
  // cellule client×sprint (qui ne sont pas des composants distincts ici, juste des <div> issus
  // d'un .map() imbrique - un hook React ne peut pas etre appele dans une boucle). topCard()
  // (useHierCardTilt.ts) ne remonte de toute facon jamais au-dela du plus grand `.hc-card`
  // ancetre, donc un seul ecouteur mousemove pose ici, tout en haut, couvre correctement
  // chaque cellule independamment - exactement comme s'il y en avait un par cellule.
  const viewRef = useRef<HTMLDivElement>(null)
  useHierCardTilt(viewRef)

  // Phase 7, perf (2026-08-24) : `dragIds` est une ref (stable par nature) - ces callbacks
  // n'ont donc besoin d'aucune dépendance pour rester stables eux-mêmes, condition nécessaire
  // pour que memo(PlanningCard)/memo(PlanningEpicGroup) serve à quelque chose ici. Remplace les
  // 3 fonctions fléchées inline précédemment recréées à chaque rendu (une par cellule visitée).
  const handleDragItemStart  = useCallback((id: string) => { dragIds.current = [id] }, [dragIds])
  const handleDragGroupStart = useCallback((ids: string[]) => { dragIds.current = ids }, [dragIds])

  if (clientsWithItems.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
        Aucun item dans le backlog.
      </div>
    )
  }

  return (
    <div className="swimlanes-view" ref={viewRef}>
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
              // `epicsWithPlaceholder()` (2026-08-17) retire les Epics qui ont bien des US mais
              // aucune dans cette cellule (filet de sécurité, voir SprintColumn.tsx).
              const cellEpics = epicsWithPlaceholder(
                state.hierarchyNodes.filter(n => n.level === 'epic' && n.sprintId === sprint.id && n.clientId === client.id),
                sprintItems,
                state.items,
              )
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
                      clients={state.clients}
                      team={state.team}
                      kanbanCols={state.kanbanCols}
                      highlightClient={highlightClient}
                      highlightType={highlightType}
                      sprintEndDate={sprint.endDate}
                      compact
                      onEdit={onEdit}
                      onDragGroup={handleDragGroupStart}
                      onDragItem={handleDragItemStart}
                      readOnly={readOnly}
                    />
                  ))}
                  {standalone.map(item => (
                    <PlanningCard
                      key={item.id}
                      item={item}
                      clients={state.clients}
                      team={state.team}
                      kanbanCols={state.kanbanCols}
                      highlightClient={highlightClient}
                      highlightType={highlightType}
                      sprintEndDate={sprint.endDate}
                      onEdit={onEdit}
                      onDragStart={handleDragItemStart}
                      readOnly={readOnly}
                      standalone
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
                      clients={state.clients}
                      team={state.team}
                      kanbanCols={state.kanbanCols}
                      highlightClient={highlightClient}
                      highlightType={highlightType}
                      onEdit={onEdit}
                      onDragStart={handleDragItemStart}
                      readOnly={readOnly}
                      standalone
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
