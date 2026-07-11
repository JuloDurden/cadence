import { useState } from 'react'
import type { Item, CadenceState, TeamMember, Sprint } from '../../types'
import { holidaysInRange } from '../../utils/sprintCapacity'

interface Props {
  state: CadenceState
  highlightClient?: string
  highlightType?: string
  onEdit: (item: Item) => void
  onUpdateItem: (item: Item) => void
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#dc2626', high: '#d97706', medium: '#6366f1', low: '#6b7280',
}
const TYPE_LABEL: Record<string, string> = {
  story: 'US', bug: 'Bug', task: 'Tâche', epic: 'Epic', spike: 'Spike',
}

function workingDays(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  let n = 0; const d = new Date(s)
  while (d <= e) { const wd = d.getDay(); if (wd !== 0 && wd !== 6) n++; d.setDate(d.getDate() + 1) }
  return n
}

function computeCapacity(member: TeamMember, sprint: Sprint, state: CadenceState): number {
  if (!sprint.startDate || !sprint.endDate) return 0
  const wd  = workingDays(sprint.startDate, sprint.endDate)
  const hol = holidaysInRange(sprint.startDate, sprint.endDate).length
  const abs = state.absences
    .filter(a => a.memberId === member.id)
    .reduce((tot, a) => {
      const os = a.start > sprint.startDate ? a.start : sprint.startDate
      const oe = a.end   < sprint.endDate   ? a.end   : sprint.endDate
      return os > oe ? tot : tot + workingDays(os, oe)
    }, 0)
  return Math.max(0, Math.round(member.spPerDay * (wd - hol - abs)))
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ── Carte item ────────────────────────────────────────────────────────────
interface CardProps {
  item: Item; state: CadenceState; dimmed: boolean; dragging: boolean
  onDragStart: () => void; onDragEnd: () => void; onEdit: (i: Item) => void
}
function SpCard({ item, state, dimmed, dragging, onDragStart, onDragEnd, onEdit }: CardProps) {
  const client = state.clients.find(c => c.id === item.clientId)
  const pCol   = PRIORITY_COLOR[item.priority ?? 'low'] ?? '#6b7280'
  return (
    <div
      data-item-id={item.id}
      className="sp-card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(item)}
      style={{
        borderLeft: `3px solid ${client?.color ?? 'var(--border)'}`,
        opacity: dimmed ? 0.22 : dragging ? 0.4 : 1,
        cursor: 'grab',
      }}
    >
      {/* Ligne 1 : key · type · SP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-faint)', flexShrink: 0 }}>{item.key}</span>
        {item.type && (
          <span style={{ fontSize: 8, padding: '0 3px', borderRadius: 3, fontWeight: 700, background: pCol + '22', color: pCol, flexShrink: 0 }}>
            {TYPE_LABEL[item.type] ?? item.type}
          </span>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
          {item.assignees.length > 1
            ? <>{Math.round(item.sp / item.assignees.length * 10) / 10}<span style={{ fontWeight: 400, fontSize: 9 }}>/{item.sp}</span></>
            : item.sp
          } SP
        </span>
      </div>
      {/* Ligne 2 : description (2 lignes max) */}
      <div className="sp-card-desc">{item.desc}</div>
      {/* Ligne 3 : tags */}
      {item.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
          {item.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{ fontSize: 8, padding: '0 3px', borderRadius: 3, background: 'var(--surface2)', color: 'var(--text-muted)' }}>{tag}</span>
          ))}
          {item.tags.length > 3 && <span style={{ fontSize: 8, color: 'var(--text-faint)' }}>+{item.tags.length - 3}</span>}
        </div>
      )}
    </div>
  )
}

// ── Vue principale ────────────────────────────────────────────────────────
export function GanttView({ state, highlightClient, highlightType, onEdit, onUpdateItem }: Props) {
  const defaultSprintId = (state.sprints.find(s => s.active) ?? state.sprints.find(s => !s.closed) ?? state.sprints[0])?.id ?? ''
  const [selectedId, setSelectedId] = useState(defaultSprintId)
  const [dragId,     setDragId]     = useState<string | null>(null)
  const [dropCol,    setDropCol]    = useState<string | null>(null)

  const sprint      = state.sprints.find(s => s.id === selectedId)
  const sprintItems = sprint ? state.items.filter(i => i.sprintId === selectedId) : []
  const unassigned  = sprintItems.filter(i => i.assignees.length === 0)
  const totalSP     = sprintItems.reduce((s, i) => s + i.sp, 0)
  const assignedSP  = sprintItems.filter(i => i.assignees.length > 0).reduce((s, i) => s + i.sp, 0)
  const assignedN   = sprintItems.filter(i => i.assignees.length > 0).length

  function drop(colId: string) {
    if (!dragId) return
    setDropCol(null)
    const item = state.items.find(i => i.id === dragId)
    if (!item) return
    onUpdateItem({ ...item, assignees: colId === 'unassigned' ? [] : [colId] })
  }

  const dimmed = (i: Item) =>
    (!!highlightClient && i.clientId !== highlightClient) ||
    (!!highlightType   && i.type    !== highlightType)

  if (state.sprints.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
      Aucun sprint — créez un sprint depuis la vue Grille.
    </div>
  )

  return (
    <div className="sp-view">
      {/* ── Barre supérieure ─────────────────────────────────────── */}
      <div className="sp-top-bar">
        <select className="sp-sprint-select" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          {state.sprints.map(s => (
            <option key={s.id} value={s.id}>
              {s.label}{s.active ? ' (actif)' : ''}{s.closed ? ' (cloture)' : ''}
            </option>
          ))}
        </select>
        <span className="sp-stat">{assignedSP}/{totalSP} SP assignes</span>
        <span className="sp-stat">{assignedN}/{sprintItems.length} items assignes</span>
        {sprint?.closed && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Sprint cloture</span>}
      </div>

      {/* ── Tableau kanban par membre ────────────────────────────── */}
      <div className="sp-board">

        {/* Colonne Non attribué */}
        <div
          className={`sp-column${dropCol === 'unassigned' ? ' sp-col-drop' : ''}`}
          onDragOver={e => { e.preventDefault(); setDropCol('unassigned') }}
          onDragLeave={() => setDropCol(null)}
          onDrop={() => drop('unassigned')}
        >
          <div className="sp-col-header sp-col-unassigned">
            <div style={{ fontWeight: 700, fontSize: 12 }}>Non attribue</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
              {unassigned.length} item{unassigned.length !== 1 ? 's' : ''} · {unassigned.reduce((s, i) => s + i.sp, 0)} SP
            </div>
          </div>
          <div className="sp-col-body">
            {unassigned.map(item => (
              <SpCard key={item.id} item={item} state={state} dimmed={dimmed(item)}
                dragging={dragId === item.id}
                onDragStart={() => setDragId(item.id)} onDragEnd={() => setDragId(null)} onEdit={onEdit} />
            ))}
            {unassigned.length === 0 && <div className="sp-col-empty">Tous les items sont attribues</div>}
          </div>
        </div>

        {/* Colonnes membres */}
        {state.team.map(member => {
          const memberItems = sprintItems.filter(i => i.assignees[0] === member.id)
          // SP divisé par le nombre d'assignees (part proportionnelle de chaque dev)
          const usedSP  = memberItems.reduce((s, i) => s + i.sp / Math.max(1, i.assignees.length), 0)
          const cap     = sprint ? computeCapacity(member, sprint, state) : 0
          const pct     = cap > 0 ? Math.min(100, (usedSP / cap) * 100) : 0
          const over    = cap > 0 && usedSP > cap
          const barCol  = over ? '#dc2626' : pct >= 85 ? '#d97706' : 'var(--primary)'
          const isOver  = dropCol === member.id

          return (
            <div
              key={member.id}
              className={`sp-column${isOver ? ' sp-col-drop' : ''}`}
              onDragOver={e => { e.preventDefault(); setDropCol(member.id) }}
              onDragLeave={() => setDropCol(null)}
              onDrop={() => drop(member.id)}
            >
              <div className="sp-col-header">
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="avatar" style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
                    {initials(member.name)}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.role}
                    </div>
                    {/* Tags membre */}
                    {member.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
                        {member.tags.slice(0, 3).map(tag => (
                          <span key={tag} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600 }}>{tag}</span>
                        ))}
                        {member.tags.length > 3 && <span style={{ fontSize: 8, color: 'var(--text-faint)' }}>+{member.tags.length - 3}</span>}
                      </div>
                    )}
                    {/* Barre de charge */}
                    {cap > 0 && (
                      <>
                        <div className="sp-cap-bar-wrap">
                          <div className="sp-cap-bar" style={{ width: `${pct}%`, background: barCol }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: over ? '#dc2626' : 'var(--text-faint)', fontWeight: over ? 700 : 400 }}>
                          <span>{usedSP}/{cap} SP</span>
                          <span>{Math.round(pct)}%</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="sp-col-body">
                {memberItems.map(item => (
                  <SpCard key={item.id} item={item} state={state} dimmed={dimmed(item)}
                    dragging={dragId === item.id}
                    onDragStart={() => setDragId(item.id)} onDragEnd={() => setDragId(null)} onEdit={onEdit} />
                ))}
                {memberItems.length === 0 && <div className="sp-col-empty">Deposer ici</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
