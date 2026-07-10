import type { Item, CadenceState } from '../../types'
import { holidaysInRange } from '../../utils/sprintCapacity'

interface Props {
  state: CadenceState
  highlightClient?: string
  highlightType?: string
  onEdit: (item: Item) => void
}

function workingDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate   + 'T00:00:00')
  let days = 0
  const d = new Date(start)
  while (d <= end) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) days++
    d.setDate(d.getDate() + 1)
  }
  return days
}

export function GanttView({ state, highlightClient, highlightType, onEdit }: Props) {
  const sprints = state.sprints
  const team    = state.team

  if (team.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
        Aucun membre dans l'équipe — ajoutez des membres dans la page Équipe.
      </div>
    )
  }

  return (
    <div className="gantt-view">
      {/* ── En-tête sprints ─────────────────────────────────────────── */}
      <div className="gantt-header">
        <div className="gantt-member-col gantt-corner" />
        {sprints.map(sprint => (
          <div key={sprint.id} className={`gantt-sprint-head${sprint.active ? ' gantt-sprint-active' : ''}${sprint.closed ? ' gantt-sprint-closed' : ''}`}>
            <span style={{ fontWeight: 700, fontSize: 12 }}>Sprint {sprint.number}</span>
            {sprint.active && <span style={{ fontSize: 9, background: 'var(--primary)', color: '#fff', padding: '1px 5px', borderRadius: 8, marginLeft: 4 }}>Actif</span>}
            {sprint.closed && <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 4 }}>Clôturé</span>}
          </div>
        ))}
        {/* Colonne non assigné */}
        <div className="gantt-sprint-head gantt-unassigned-head">
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Non assigné</span>
        </div>
      </div>

      {/* ── Lignes membres ─────────────────────────────────────────── */}
      {team.map(member => (
        <div key={member.id} className="gantt-member-row">
          {/* Étiquette membre */}
          <div className="gantt-member-col gantt-member-label">
            <span className="avatar" style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
              {member.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{member.spPerDay} SP/j</div>
            </div>
          </div>

          {/* Cellules sprint */}
          {sprints.map(sprint => {
            const wd = sprint.startDate && sprint.endDate ? workingDays(sprint.startDate, sprint.endDate) : 0
            const holidays = sprint.startDate && sprint.endDate ? holidaysInRange(sprint.startDate, sprint.endDate) : []
            const effectiveDays = Math.max(0, wd - holidays.length)
            const memberCap = Math.round(member.spPerDay * effectiveDays)

            const memberItems = state.items.filter(i =>
              i.sprintId === sprint.id && i.assignees.includes(member.id)
            )
            const usedSP = memberItems.reduce((s, i) => s + i.sp, 0)
            const pct    = memberCap > 0 ? Math.min(100, (usedSP / memberCap) * 100) : 0
            const over   = memberCap > 0 && usedSP > memberCap
            const barCol = over ? '#dc2626' : pct >= 85 ? '#d97706' : 'var(--primary)'

            const clientMismatch = (i: Item) => !!highlightClient && i.clientId !== highlightClient
            const typeMismatch   = (i: Item) => !!highlightType   && i.type    !== highlightType

            return (
              <div key={sprint.id} className={`gantt-cell${over ? ' gantt-cell-over' : ''}`}>
                {/* Barre de charge */}
                {memberCap > 0 && (
                  <>
                    <div className="gantt-bar-wrap">
                      <div className="gantt-bar" style={{ width: `${pct}%`, background: barCol }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 9, color: over ? '#dc2626' : 'var(--text-faint)', marginBottom: 4, fontWeight: over ? 700 : 400 }}>
                      {usedSP}/{memberCap} SP{holidays.length > 0 ? ` (−${holidays.length}j)` : ''}
                    </div>
                  </>
                )}
                {memberItems.length === 0 ? (
                  <div className="gantt-cell-empty" />
                ) : (
                  memberItems.map(item => {
                    const client = state.clients.find(c => c.id === item.clientId)
                    const dimmed = clientMismatch(item) || typeMismatch(item)
                    return (
                      <div
                        key={item.id}
                        data-item-id={item.id}
                        className="gantt-item"
                        onClick={() => onEdit(item)}
                        style={{
                          borderLeft: `3px solid ${client?.color ?? 'var(--border)'}`,
                          opacity: dimmed ? 0.22 : 1,
                        }}
                        title={item.desc}
                      >
                        <span className="item-key" style={{ fontSize: 9 }}>{item.key}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 'auto' }}>{item.sp} SP</span>
                      </div>
                    )
                  })
                )}
              </div>
            )
          })}

          {/* Cellule non assigné */}
          <div className="gantt-cell gantt-unassigned-cell">
            {state.items
              .filter(i => i.sprintId === null && i.assignees.includes(member.id))
              .map(item => {
                const client = state.clients.find(c => c.id === item.clientId)
                return (
                  <div
                    key={item.id}
                    className="gantt-item"
                    onClick={() => onEdit(item)}
                    style={{ borderLeft: `3px solid ${client?.color ?? 'var(--border)'}`, opacity: 0.6 }}
                    title={item.desc}
                  >
                    <span className="item-key" style={{ fontSize: 9 }}>{item.key}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 'auto' }}>{item.sp} SP</span>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}
