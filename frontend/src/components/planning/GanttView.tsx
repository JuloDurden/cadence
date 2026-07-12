import { useState } from 'react'
import type { Item, CadenceState, TeamMember } from '../../types'
import { computeMemberCapacity, isMemberFullyAbsent } from '../../utils/sprintCapacity'

interface Props {
  state: CadenceState
  sprintId: string
  onEdit: (item: Item) => void
  onUpdateItem: (item: Item) => void
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

// ── Carte item non-attribué ───────────────────────────────────────────────
interface UItemProps {
  item: Item; state: CadenceState; dragging: boolean
  onDragStart: () => void; onDragEnd: () => void; onEdit: (i: Item) => void
}
function UnassignedCard({ item, state, dragging, onDragStart, onDragEnd, onEdit }: UItemProps) {
  const client = state.clients.find(c => c.id === item.clientId)
  const pCol   = PRIORITY_COLOR[item.priority ?? 'low'] ?? '#6b7280'

  return (
    <div
      className="sp-uitem"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(item)}
      style={{
        borderLeft: `4px solid ${client?.color ?? 'var(--border)'}`,
        opacity: dragging ? 0.4 : 1,
      }}
    >
      {/* Ligne 1 : key · badges · SP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', flexShrink: 0 }}>{item.key}</span>
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
      <div style={{
        fontSize: 12, lineHeight: 1.45, color: 'var(--text)',
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        marginBottom: 6,
      }}>
        {item.desc}
      </div>
      {/* Ligne 3 : client + tags + deadline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
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
  item: Item; mySP: number; over: boolean; co?: boolean; dragging: boolean
  team: TeamMember[]
  onDragStart: () => void; onDragEnd: () => void; onEdit: (i: Item) => void
}
function MemberItemRow({ item, mySP, over, co = false, dragging, team, onDragStart, onDragEnd, onEdit }: MemberItemRowProps) {
  const pCol        = PRIORITY_COLOR[item.priority ?? 'low'] ?? '#6b7280'
  const coAssignees = !co && item.assignees.length > 1
    ? item.assignees.slice(1).map(id => team.find(m => m.id === id)).filter(Boolean) as TeamMember[]
    : []

  return (
    <div
      className={`sp-member-item${co ? ' sp-member-item-co' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(item)}
      style={{ opacity: dragging ? 0.35 : 1 }}
    >
      {/* Ligne 1 : key · type · [co-avatars] · SP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {co && (
          <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, fontWeight: 700, background: 'rgba(245,158,11,.2)', color: '#d97706', flexShrink: 0 }}>
            co
          </span>
        )}
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-faint)', flexShrink: 0 }}>{item.key}</span>
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
      <div style={{
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
export function GanttView({ state, sprintId, onEdit, onUpdateItem }: Props) {
  const [dragId,  setDragId]  = useState<string | null>(null)
  const [dropCol, setDropCol] = useState<string | null>(null)

  const sprint      = state.sprints.find(s => s.id === sprintId)
  const sprintItems = sprint ? state.items.filter(i => i.sprintId === sprintId) : []
  const unassigned  = sprintItems.filter(i => i.assignees.length === 0)

  function drop(colId: string) {
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
    <div className="sp-view">

      {/* ── Panneau gauche : items non-attribués ─────────────────────────── */}
      <div
        className={`sp-left${dropCol === 'unassigned' ? ' sp-left-drop' : ''}`}
        onDragOver={e => { e.preventDefault(); setDropCol('unassigned') }}
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
          {unassigned.map(item => (
            <UnassignedCard
              key={item.id} item={item} state={state}
              dragging={dragId === item.id}
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
                onDragOver={e => { e.preventDefault(); setDropCol(member.id) }}
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
                  {primaryItems.map(item => (
                    <MemberItemRow
                      key={item.id} item={item}
                      mySP={Math.round(item.sp / Math.max(1, item.assignees.length) * 10) / 10}
                      over={over} co={false} team={state.team}
                      dragging={dragId === item.id}
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
                      {coItems.map(item => (
                        <MemberItemRow
                          key={item.id} item={item}
                          mySP={Math.round(item.sp / Math.max(1, item.assignees.length) * 10) / 10}
                          over={over} co={true} team={state.team}
                          dragging={dragId === item.id}
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
