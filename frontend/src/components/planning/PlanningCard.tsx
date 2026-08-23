import { memo } from 'react'
import type { Item, Client, TeamMember, KanbanCol } from '../../types'

const PRIORITY_DOT: Record<string, string> = {
  critical: '#ff3b30', high: '#ff9500', medium: '#34c759', low: '#aeaeb2'
}

function fmtDeadline(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

interface Props {
  item: Item
  // Phase 7, perf (2026-08-23) : `clients`/`team`/`kanbanCols` plutôt que `state: CadenceState`
  // entier - même raison que KanbanCard.tsx (voir docs/corrections.md, "Chantier Phase 7
  // Performance") : ces 3 tranches gardent leur référence tant qu'elles ne changent pas
  // elles-mêmes (reducer par spread), contrairement à `state` qui change à chaque dispatch.
  clients: Client[]
  team: TeamMember[]
  kanbanCols: KanbanCol[]
  highlightClient?: string
  highlightType?: string
  sprintEndDate?: string   // pour détecter les dépassements de deadline
  onEdit: (item: Item) => void
  onDragStart: (id: string) => void
  // Phase 2.5 (roadmap v1) — Stakeholder en lecture seule sur Release Planning : la carte reste
  // cliquable (ouvre l'item en lecture seule via ItemModal, canManage/canOperate déjà à false
  // côté page appelante), mais n'est plus draggable. Défaut `false` : comportement inchangé pour
  // les autres rôles.
  readOnly?: boolean
  // Cartes hierarchiques (2026-08-20) : voir KanbanCard.tsx (même principe) - un item hors Epic
  // est le sommet de son propre groupe (degrade + motif + reflet plein cadre), contrairement à
  // un item range dans un PlanningEpicGroup (carte plate, texte seul reactif). Defaut `false`.
  standalone?: boolean
}

function PlanningCardImpl({ item, clients, team, kanbanCols, highlightClient, highlightType, sprintEndDate, onEdit, onDragStart, readOnly = false, standalone = false }: Props) {
  const client = clients.find(c => c.id === item.clientId)
  const status = kanbanCols.find(c => c.id === item.status)
  const assignees = item.assignees.map(id => team.find(m => m.id === id)).filter(Boolean)
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
      className={`planning-card hc-card hc-item${standalone ? ' hc-standalone' : ''}`}
      data-item-id={item.id}
      draggable={!readOnly}
      onDragStart={() => { if (!readOnly) onDragStart(item.id) }}
      onClick={() => onEdit(item)}
      style={{
        opacity: isDimmed ? 0.22 : 1,
        transition: 'opacity .2s',
        outline: dlLate ? '1.5px solid #dc2626' : undefined,
        ['--client' as string]: client?.color,
      }}
      title={item.desc}
    >
      {standalone && <div className="hc-pattern-holo" />}
      <div className="hc-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <span className="item-key hc-text-holo">{item.key}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {dl && (
            <span
              style={{
                fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 4,
                background: dlColor ? `${dlColor}18` : 'var(--surface2)',
                color: dlColor ?? 'var(--text-muted)',
                border: `1px solid ${dlColor ?? 'var(--border)'}`,
              }}
              title={`Deadline ${dl.type === 'imposed' ? 'imposée' : 'négociable'} : ${dl.date}${dlLate ? ' ⚠ sprint trop tardif' : ''}`}
            >
              ⚑ {fmtDeadline(dl.date)}
            </span>
          )}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_DOT[item.priority] }} />
          <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>{item.sp}</span>
        </span>
      </div>
      <p className="hc-text hc-text-holo" style={{ fontSize: 12, margin: '4px 0 0', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {item.desc}
      </p>
      <div className="hc-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        {status && (
          <span style={{ fontSize: 10, color: status.color, fontWeight: 600 }}>{status.label}</span>
        )}
        <div style={{ display: 'flex', marginLeft: 'auto' }}>
          {assignees.map(m => m && (
            <span key={m.id} className="avatar" title={m.name} style={{ width: 16, height: 16, fontSize: 7 }}>
              {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Phase 7, perf (2026-08-23) : voir KanbanCard.tsx pour la justification complète. Les appelants
// (PlanningEpicGroup.tsx, SprintColumn.tsx, SwimlanesView.tsx) doivent passer des callbacks
// stables (useCallback) pour que ce memo() serve à quelque chose.
export const PlanningCard = memo(PlanningCardImpl)
