import { useState, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Item, CadenceState, TeamMember, HierarchyNode } from '../../types'
import { computeMemberCapacity, isMemberFullyAbsent } from '../../utils/sprintCapacity'
import { groupItemsByEpic, getEpicSP } from '../../utils/hierarchyScore'
import { useHierCardTilt } from '../../hooks/useHierCardTilt'

interface Props {
  state: CadenceState
  sprintId: string
  onEdit: (item: Item) => void
  onUpdateItem: (item: Item) => void
  // Phase 2.5 (roadmap v1) — Stakeholder en lecture seule sur Sprint Planning : les cartes
  // restent cliquables (ouvrent l'item en lecture seule) mais ne sont plus draggables, et
  // les colonnes ne réagissent plus au drop. Défaut `false` : comportement inchangé.
  readOnly?: boolean
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#dc2626', high: '#d97706', medium: '#6366f1', low: '#6b7280',
}
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Basse',
}
const TYPE_LABEL: Record<string, string> = {
  story: 'US', bug: 'Bug', task: 'Tâche', epic: 'Epic', spike: 'Spike',
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ── Regroupement par Epic ──────────────────────────────────────────────────
// (docs/corrections futures.md, Sprint Planning, 2026-08-17, retour Julien : "Partout, y
// compris les cartes membre") : reprend la structure visuelle de PlanningEpicGroup.tsx
// (Release Planning) et KanbanEpicGroup.tsx (Kanban), mais sans drag - non demandé ici,
// juste un regroupement visuel repliable. `groupKey` (pas juste `epicId`) sert aux
// data-testid : un même Epic peut apparaître à la fois dans "Non attribué" et dans
// plusieurs cartes membre (primaire ou co-assigné) sur la même page.
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

interface EpicGroupBlockProps {
  groupKey: string
  epic: HierarchyNode
  count: number
  sp: number
  // Cartes hierarchiques (2026-08-20, retour Julien : GanttView n'affichait jusqu'ici aucune
  // couleur/traitement propre à l'Epic, contrairement à Release Planning et Kanban - portée en
  // même temps que le reste du chantier) : nécessaire pour retrouver la couleur du client de
  // l'Epic (voir KanbanEpicGroup.tsx/PlanningEpicGroup.tsx, même principe).
  state: CadenceState
  children: ReactNode
}
function EpicGroupBlock({ groupKey, epic, count, sp, state, children }: EpicGroupBlockProps) {
  const [collapsed, setCollapsed] = useState(false)
  const client = state.clients.find(c => c.id === epic.clientId)
  return (
    <div
      className={`epic-group epic-group-compact${collapsed ? ' epic-group-collapsed' : ''} hc-card hc-epic`}
      style={{ ['--client' as string]: client?.color }}
    >
      <div className="hc-pattern-holo" />
      <div className="epic-group-header hc-text" style={{ cursor: 'default', background: 'transparent', borderBottom: 'none' }}>
        <button
          type="button"
          className="epic-group-toggle"
          data-testid={`epic-group-toggle-${groupKey}`}
          title={collapsed ? 'Déplier les items' : 'Replier les items'}
          onClick={e => { e.stopPropagation(); setCollapsed(c => !c) }}
        >
          <Chevron open={!collapsed} />
        </button>
        <span className="epic-type-tag">EPIC</span>
        <span className="epic-group-name hc-text-holo">{epic.desc}</span>
        <span className="epic-group-count">{count} item{count > 1 ? 's' : ''} · {sp} SP</span>
      </div>
      {!collapsed && (
        <div className="epic-group-stories" data-testid={`epic-group-stories-${groupKey}`}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Carte item non-attribué ───────────────────────────────────────────────
interface UItemProps {
  item: Item; state: CadenceState; dragging: boolean; readOnly?: boolean
  // Cartes hierarchiques (2026-08-20) : voir KanbanCard.tsx/PlanningCard.tsx (même principe) -
  // sommet de groupe (dégradé + motif + reflet) quand hors Epic, carte plate sinon. Défaut `false`.
  standalone?: boolean
  onDragStart: () => void; onDragEnd: () => void; onEdit: (i: Item) => void
}
function UnassignedCard({ item, state, dragging, readOnly = false, standalone = false, onDragStart, onDragEnd, onEdit }: UItemProps) {
  const client = state.clients.find(c => c.id === item.clientId)
  const pCol   = PRIORITY_COLOR[item.priority ?? 'low'] ?? '#6b7280'

  return (
    <div
      className={`sp-uitem hc-card hc-item${standalone ? ' hc-standalone' : ''}`}
      draggable={!readOnly}
      onDragStart={readOnly ? undefined : onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(item)}
      style={{
        opacity: dragging ? 0.4 : 1,
        ['--client' as string]: client?.color,
      }}
    >
      {standalone && <div className="hc-pattern-holo" />}
      {/* Ligne 1 : key · badges · SP */}
      <div className="hc-text" style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <span className="hc-text-holo" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', flexShrink: 0 }}>{item.key}</span>
        {item.type && (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700, background: pCol + '22', color: pCol, flexShrink: 0 }}>
            {TYPE_LABEL[item.type] ?? item.type}
          </span>
        )}
        {item.priority && (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 600, background: pCol + '15', color: pCol, flexShrink: 0 }}>
            {PRIORITY_LABEL[item.priority] ?? item.priority}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: 'var(--text)', lineHeight: 1, flexShrink: 0 }}>
          {item.sp}<span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 1 }}>SP</span>
        </span>
      </div>
      {/* Ligne 2 : description (3 lignes max) */}
      <div className="hc-text hc-text-holo" style={{
        fontSize: 12, lineHeight: 1.45, color: 'var(--text)',
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        marginBottom: 6,
      }}>
        {item.desc}
      </div>
      {/* Ligne 3 : client + tags + deadline */}
      <div className="hc-text" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {client && (
          <span style={{ fontSize: 9, fontWeight: 700, color: client.color ?? 'var(--text-muted)', flexShrink: 0 }}>
            {client.name}
          </span>
        )}
        {item.tags.map(tag => (
          <span key={tag} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'var(--surface2)', color: 'var(--text-muted)' }}>
            {tag}
          </span>
        ))}
        {item.deadline?.date && item.deadline.type !== 'none' && !isNaN(new Date(item.deadline.date + 'T00:00:00').getTime()) && (
          <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--danger)', fontWeight: 600, flexShrink: 0 }}>
            ⚑ {new Date(item.deadline.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Ligne item dans la card membre ────────────────────────────────────────
interface MemberItemRowProps {
  item: Item; mySP: number; over: boolean; co?: boolean; dragging: boolean; readOnly?: boolean
  team: TeamMember[]
  // Cartes hierarchiques (2026-08-20) : voir UnassignedCard ci-dessus (même principe). Défaut
  // `false`. `state` nécessaire pour retrouver la couleur du client (absente jusqu'ici sur les
  // cartes membre, autre incohérence comblée en même temps que ce chantier).
  standalone?: boolean
  state: CadenceState
  onDragStart: () => void; onDragEnd: () => void; onEdit: (i: Item) => void
}
function MemberItemRow({ item, mySP, over, co = false, dragging, readOnly = false, standalone = false, team, state, onDragStart, onDragEnd, onEdit }: MemberItemRowProps) {
  const pCol        = PRIORITY_COLOR[item.priority ?? 'low'] ?? '#6b7280'
  const client       = state.clients.find(c => c.id === item.clientId)
  const coAssignees = !co && item.assignees.length > 1
    ? item.assignees.slice(1).map(id => team.find(m => m.id === id)).filter(Boolean) as TeamMember[]
    : []

  return (
    <div
      className={`sp-member-item${co ? ' sp-member-item-co' : ''} hc-card hc-item${standalone ? ' hc-standalone' : ''}`}
      draggable={!readOnly}
      onDragStart={readOnly ? undefined : onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(item)}
      style={{
        opacity: dragging ? 0.35 : 1,
        ['--client' as string]: client?.color,
        // Le fond plat de .hc-item (hierCards.css) est plus spécifique que .sp-member-item-co et
        // écraserait sinon la mise en évidence "co-assigné" (retour Julien avant ce chantier) ;
        // réaffirmée ici en inline, qui prime toujours sur les classes.
        ...(co ? { background: 'var(--warning-light)', border: '1px dashed rgba(245,158,11,.5)' } : {}),
      }}
    >
      {standalone && <div className="hc-pattern-holo" />}
      {/* Ligne 1 : key · type · [co-avatars] · SP */}
      <div className="hc-text" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {co && (
          <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, fontWeight: 700, background: 'rgba(245,158,11,.2)', color: '#d97706', flexShrink: 0 }}>
            co
          </span>
        )}
        <span className="hc-text-holo" style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-faint)', flexShrink: 0 }}>{item.key}</span>
        {item.type && (
          <span style={{ fontSize: 8, padding: '0 4px', borderRadius: 3, fontWeight: 700, background: pCol + '20', color: pCol, flexShrink: 0 }}>
            {TYPE_LABEL[item.type] ?? item.type}
          </span>
        )}
        {/* Avatars des co-assignés (uniquement sur l'item du dev attitré) */}
        {coAssignees.length > 0 && (
          <div style={{ display: 'flex', gap: 2, marginLeft: 2 }} title={coAssignees.map(m => m.name).join(', ')}>
            {coAssignees.slice(0, 3).map(m => (
              <span
                key={m.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--primary)', color: '#fff',
                  fontSize: 7, fontWeight: 700, flexShrink: 0,
                }}
              >
                {initials(m.name)}
              </span>
            ))}
            {coAssignees.length > 3 && (
              <span style={{ fontSize: 8, color: 'var(--text-faint)', alignSelf: 'center' }}>
                +{coAssignees.length - 3}
              </span>
            )}
          </div>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: over ? '#dc2626' : 'var(--text-muted)', flexShrink: 0 }}>
          {mySP}{item.assignees.length > 1 ? `/${item.sp}` : ''} SP
        </span>
      </div>
      {/* Ligne 2 : description (2 lignes max) */}
      <div className="hc-text hc-text-holo" style={{
        fontSize: 11, lineHeight: 1.35, color: 'var(--text)',
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {item.desc}
      </div>
    </div>
  )
}

// ── Vue principale ────────────────────────────────────────────────────────
export function GanttView({ state, sprintId, onEdit, onUpdateItem, readOnly = false }: Props) {
  const [dragId,  setDragId]  = useState<string | null>(null)
  const [dropCol, setDropCol] = useState<string | null>(null)

  const sprint      = state.sprints.find(s => s.id === sprintId)
  const sprintItems = sprint ? state.items.filter(i => i.sprintId === sprintId) : []
  const unassigned  = sprintItems.filter(i => i.assignees.length === 0)
  const { groups: unassignedGroups, orphans: unassignedOrphans } = groupItemsByEpic(unassigned, state.hierarchyNodes)
  // Cartes hierarchiques (2026-08-20) : un seul hook pour toute la vue (panneau Non attribué +
  // toutes les cartes membre) - même raison que SwimlanesView.tsx, les cartes membre sont
  // rendues inline dans un .map() sans composant dédié, un hook ne peut pas y être appelé.
  const viewRef = useRef<HTMLDivElement>(null)
  useHierCardTilt(viewRef)

  function drop(colId: string) {
    if (readOnly) return
    if (!dragId) return
    setDropCol(null)
    const item = state.items.find(i => i.id === dragId)
    if (!item) return
    onUpdateItem({ ...item, assignees: colId === 'unassigned' ? [] : [colId] })
  }

  if (state.sprints.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
      Aucun sprint — créez un sprint depuis la vue Release Planning.
    </div>
  )

  return (
    <div className="sp-view" ref={viewRef}>

      {/* ── Panneau gauche : items non-attribués ─────────────────────────── */}
      <div
        className={`sp-left${dropCol === 'unassigned' ? ' sp-left-drop' : ''}`}
        onDragOver={e => { e.preventDefault(); if (!readOnly) setDropCol('unassigned') }}
        onDragLeave={() => setDropCol(null)}
        onDrop={() => drop('unassigned')}
      >
        <div className="sp-left-hd">
          <span>Non attribué</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
            {unassigned.length} item{unassigned.length !== 1 ? 's' : ''} · {unassigned.reduce((s, i) => s + i.sp, 0)} SP
          </span>
        </div>
        <div className="sp-left-body">
          {unassignedGroups.map(({ epicId, epic, items: groupItems }) => (
            <EpicGroupBlock
              key={epicId}
              groupKey={`unassigned-${epicId}`}
              epic={epic}
              count={groupItems.length}
              sp={getEpicSP(epic, groupItems)}
              state={state}
            >
              {groupItems.map(item => (
                <UnassignedCard
                  key={item.id} item={item} state={state}
                  dragging={dragId === item.id}
                  readOnly={readOnly}
                  onDragStart={() => setDragId(item.id)}
                  onDragEnd={() => setDragId(null)}
                  onEdit={onEdit}
                />
              ))}
            </EpicGroupBlock>
          ))}
          {unassignedOrphans.map(item => (
            <UnassignedCard
              key={item.id} item={item} state={state}
              dragging={dragId === item.id}
              readOnly={readOnly}
              standalone
              onDragStart={() => setDragId(item.id)}
              onDragEnd={() => setDragId(null)}
              onEdit={onEdit}
            />
          ))}
          {unassigned.length === 0 && (
            <div className="sp-left-empty">Tous les items sont attribués</div>
          )}
        </div>
      </div>

      {/* ── Panneau droit : grille membres ──────────────────────────────── */}
      <div className="sp-right">
        <div className="sp-members-wrap">
          {state.team.filter(m => sprint ? !isMemberFullyAbsent(m.id, sprint, state) : true).map(member => {
            // Dev attitré = assignees[0], co-assigné = assignees[1+]
            const primaryItems = sprintItems.filter(i => i.assignees[0] === member.id)
            const coItems      = sprintItems.filter(i => i.assignees.length > 1 && i.assignees.slice(1).includes(member.id))
            // Regroupement par Epic (retour Julien : "partout, y compris les cartes membre") :
            // groupKey inclut member.id + primaire/co pour rester unique sur la page, un même
            // Epic pouvant apparaître chez plusieurs membres et dans les deux sections à la fois.
            const { groups: primaryGroups, orphans: primaryOrphans } = groupItemsByEpic(primaryItems, state.hierarchyNodes)
            const { groups: coGroups, orphans: coOrphans } = groupItemsByEpic(coItems, state.hierarchyNodes)
            // Charge = part SP de chaque item où le membre est impliqué
            const usedSP  = [...primaryItems, ...coItems].reduce((s, i) => s + i.sp / Math.max(1, i.assignees.length), 0)
            const cap     = sprint ? computeMemberCapacity(member, sprint, state) : 0
            const pct     = cap > 0 ? Math.min(100, (usedSP / cap) * 100) : 0
            const over    = cap > 0 && usedSP > cap
            const barCol  = over ? '#dc2626' : pct >= 85 ? '#d97706' : 'var(--primary)'

            return (
              <div
                key={member.id}
                className={`sp-member-card${dropCol === member.id ? ' sp-col-drop' : ''}`}
                onDragOver={e => { e.preventDefault(); if (!readOnly) setDropCol(member.id) }}
                onDragLeave={() => setDropCol(null)}
                onDrop={() => drop(member.id)}
              >
                {/* En-tête membre */}
                <div className="sp-member-hd">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span className="avatar" style={{ width: 30, height: 30, fontSize: 10, flexShrink: 0 }}>
                      {initials(member.name)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                        {member.role}
                      </div>
                      {member.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 5 }}>
                          {member.tags.slice(0, 4).map(tag => (
                            <span key={tag} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600 }}>
                              {tag}
                            </span>
                          ))}
                          {member.tags.length > 4 && (
                            <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>+{member.tags.length - 4}</span>
                          )}
                        </div>
                      )}
                      {cap > 0 && (
                        <>
                          <div className="sp-cap-bar-wrap">
                            <div className="sp-cap-bar" style={{ width: `${pct}%`, background: barCol }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: over ? '#dc2626' : 'var(--text-faint)', fontWeight: over ? 700 : 400, marginTop: 2 }}>
                            <span>{Math.round(usedSP * 10) / 10}/{cap} SP</span>
                            <span>{Math.round(pct)}%</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items assignés */}
                <div className="sp-member-body">
                  {/* Items dont ce membre est dev attitré */}
                  {primaryGroups.map(({ epicId, epic, items: groupItems }) => (
                    <EpicGroupBlock
                      key={epicId}
                      groupKey={`${member.id}-${epicId}`}
                      epic={epic}
                      count={groupItems.length}
                      sp={getEpicSP(epic, groupItems)}
                      state={state}
                    >
                      {groupItems.map(item => (
                        <MemberItemRow
                          key={item.id} item={item}
                          mySP={Math.round(item.sp / Math.max(1, item.assignees.length) * 10) / 10}
                          over={over} co={false} team={state.team} state={state}
                          dragging={dragId === item.id}
                          readOnly={readOnly}
                          onDragStart={() => setDragId(item.id)}
                          onDragEnd={() => setDragId(null)}
                          onEdit={onEdit}
                        />
                      ))}
                    </EpicGroupBlock>
                  ))}
                  {primaryOrphans.map(item => (
                    <MemberItemRow
                      key={item.id} item={item}
                      mySP={Math.round(item.sp / Math.max(1, item.assignees.length) * 10) / 10}
                      over={over} co={false} team={state.team} state={state}
                      dragging={dragId === item.id}
                      readOnly={readOnly}
                      standalone
                      onDragStart={() => setDragId(item.id)}
                      onDragEnd={() => setDragId(null)}
                      onEdit={onEdit}
                    />
                  ))}
                  {/* Items dont ce membre est co-assigné — toujours labellisé */}
                  {coItems.length > 0 && (
                    <>
                      <div className="sp-member-co-sep">
                        {primaryItems.length > 0 ? '— Co-assigné' : 'Co-assigné'}
                      </div>
                      {coGroups.map(({ epicId, epic, items: groupItems }) => (
                        <EpicGroupBlock
                          key={epicId}
                          groupKey={`${member.id}-co-${epicId}`}
                          epic={epic}
                          count={groupItems.length}
                          sp={getEpicSP(epic, groupItems)}
                          state={state}
                        >
                          {groupItems.map(item => (
                            <MemberItemRow
                              key={item.id} item={item}
                              mySP={Math.round(item.sp / Math.max(1, item.assignees.length) * 10) / 10}
                              over={over} co={true} team={state.team} state={state}
                              dragging={dragId === item.id}
                              readOnly={readOnly}
                              onDragStart={() => setDragId(item.id)}
                              onDragEnd={() => setDragId(null)}
                              onEdit={onEdit}
                            />
                          ))}
                        </EpicGroupBlock>
                      ))}
                      {coOrphans.map(item => (
                        <MemberItemRow
                          key={item.id} item={item}
                          mySP={Math.round(item.sp / Math.max(1, item.assignees.length) * 10) / 10}
                          over={over} co={true} team={state.team} state={state}
                          dragging={dragId === item.id}
                          readOnly={readOnly}
                          standalone
                          onDragStart={() => setDragId(item.id)}
                          onDragEnd={() => setDragId(null)}
                          onEdit={onEdit}
                        />
                      ))}
                    </>
                  )}
                  {primaryItems.length === 0 && coItems.length === 0 && (
                    <div className="sp-member-empty">Déposer ici</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
