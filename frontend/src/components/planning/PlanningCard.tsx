import type { Item, CadenceState } from '../../types'

const PRIORITY_DOT: Record<string, string> = {
  critical: '#ff3b30', high: '#ff9500', medium: '#34c759', low: '#aeaeb2'
}

function fmtDeadline(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

interface Props {
  item: Item
  state: CadenceState
  highlightClient?: string
  highlightType?: string
  sprintEndDate?: string   // pour détecter les dépassements de deadline
  onEdit: (item: Item) => void
  onDragStart: (id: string) => void
}

export function PlanningCard({ item, state, highlightClient, highlightType, sprintEndDate, onEdit, onDragStart }: Props) {
  const client = state.clients.find(c => c.id === item.clientId)
  const status = state.kanbanCols.find(c => c.id === item.status)
  const assignees = item.assignees.map(id => state.team.find(m => m.id === id)).filter(Boolean)
  const clientMismatch = !!highlightClient && item.clientId !== highlightClient
  const typeMismatch   = !!highlightType   && item.type    !== highlightType
  const isDimmed = clientMismatch || typeMismatch

  // Deadline
  const dl = item.deadline?.type && item.deadline.type !== 'none' ? item.deadline : null
  const dlLate = dl && sprintEndDate && dl.date < sprintEndDate  // sprint se termine après la deadline
  const dlColor = dlLate
    ? '#dc2626'
    : dl?.type === 'imposed'    ? '#dc2626'
    : dl?.type === 'negotiable' ? '#d97706'
    : undefined

  return (
    <div
      className="planning-card"
      data-item-id={item.id}
      draggable
      onDragStart={() => onDragStart(item.id)}
      onClick={() => onEdit(item)}
      style={{
        borderLeft: `3px solid ${client?.color ?? 'var(--border)'}`,
        opacity: isDimmed ? 0.22 : 1,
        transition: 'opacity .2s',
        outline: dlLate ? '1.5px solid #dc2626' : undefined,
      }}
      title={item.desc}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <span className="item-key">{item.key}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {dl && (
            <span
              style={{
                fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 4,
                background: dlColor ? `${dlColor}18` : 'var(--surface2)',
                color: dlColor ?? 'var(--text-muted)',
                border: `1px solid ${dlColor ?? 'var(--border)'}`,
              }}
              title={`Deadline ${dl.type === 'imposed' ? 'imposée' : 'négociable'} : ${dl.date}${dlLate ? ' ⚠ spri