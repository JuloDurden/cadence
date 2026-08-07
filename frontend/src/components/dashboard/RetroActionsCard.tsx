import type { RetroAction, RetroArchive, RetroSession, TeamMember } from '../../types'
import type { DashboardWidgetSize } from '../../data/dashboardWidgets'
import { fmtDateShort } from '../../utils/dates'

interface Props {
  retroSessions: RetroSession[]
  retroArchives: RetroArchive[]
  team: TeamMember[]
  today: string
  size: DashboardWidgetSize
}

interface OpenAction { action: RetroAction; ownerName: string; overdue: boolean }

// Widget "Actions de rétro" (2026-08-07, retour Julien : "on peut s'occuper de tous [les 4 widgets]
// afin d'avoir une petite vingtaine de widgets") — 15e widget Dashboard, pas de face cachée de
// réglages (aucun réglage demandé, comme sprint-absences).
//
// Actions non cochées (`RetroAction.done === false`) de TOUTES les rétros connues —
// `retroSessions` (rétros en cours, non encore archivées) ET `retroArchives` (rétros passées) —
// scope 'product' plutôt que 'sprint' : une action de rétro reste ouverte quel que soit le sprint où
// elle a été créée, ce n'est pas une donnée bornée au sprint en cours (contrairement aux Absences).
// Triées par échéance croissante, celles sans échéance en dernier — les plus urgentes remontent
// naturellement en premier sans tri dédié.
//
// Pas d'avatar du propriétaire (retour Julien, après une 1ère maquette avec avatar : "je ne suis pas
// sûr que l'avatar soit nécessaire" — remplacé par son prénom en texte, plus compact pour une liste
// où le texte de l'action est l'info principale, l'avatar n'apportait pas grand-chose comparé à
// Absences du sprint où reconnaître une photo aide à scanner vite qui est absent). Résolution du nom
// par `ownerId` (peut être vide si le membre a été supprimé depuis, d'où `?? 'Ancien membre'`).
//
// Taille S retravaillée sur le modèle des KPI existants (BlockersCard.tsx : gros chiffre + légende)
// plutôt qu'un résumé à avatars empilés comme sprint-absences — cohérent avec l'abandon de l'avatar.
export function RetroActionsCard({ retroSessions, retroArchives, team, today, size }: Props) {
  const allActions: RetroAction[] = [
    ...retroSessions.flatMap(s => s.actions),
    ...retroArchives.flatMap(a => a.actions),
  ]
  const openActions: OpenAction[] = allActions
    .filter(a => !a.done)
    .map(action => ({
      action,
      ownerName: team.find(m => m.id === action.ownerId)?.name.split(' ')[0] ?? 'Ancien membre',
      overdue: !!action.dueDate && action.dueDate < today,
    }))
    .sort((a, b) => {
      if (!a.action.dueDate && !b.action.dueDate) return 0
      if (!a.action.dueDate) return 1
      if (!b.action.dueDate) return -1
      return a.action.dueDate < b.action.dueDate ? -1 : a.action.dueDate > b.action.dueDate ? 1 : 0
    })

  const overdueCount = openActions.filter(a => a.overdue).length
  const color = overdueCount > 0 ? 'var(--danger)' : openActions.length > 0 ? 'var(--primary)' : '#34c759'
  const heroSize = String(openActions.length).length >= 3 ? 26 : 34

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: size === 'S' ? '10px 12px' : '14px 18px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: size === 'S' ? 4 : 8 }}>Actions de rétro</div>
      {openActions.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
          Aucune action ouverte
        </div>
      ) : size === 'S' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gridTemplateRows: 'auto auto', columnGap: 4 }}>
            <span style={{ gridRow: 1, gridColumn: 1, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: heroSize, fontWeight: 800, color, lineHeight: .78, fontVariantNumeric: 'tabular-nums' }}>
              {openActions.length}
            </span>
            <span style={{ gridRow: 1, gridColumn: 2, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: 14, fontWeight: 800, color, opacity: .6 }}>
              {openActions.length > 1 ? 'actions' : 'action'}
            </span>
            <span style={{ gridRow: 2, gridColumn: '1 / 3', justifySelf: 'end', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
              {overdueCount > 0 ? `dont ${overdueCount} en retard` : 'aucune en retard'}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {openActions.map(({ action, ownerName, overdue }) => (
            <div key={action.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--text-muted)' }}>{ownerName} ·</span> {action.text}
              </span>
              {overdue ? (
                <span style={{ fontSize: 10, fontWeight: 600, color: '#ff3b30', background: 'rgba(255,59,48,.12)', padding: '2px 7px', borderRadius: 10, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  en retard
                </span>
              ) : (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {action.dueDate ? fmtDateShort(action.dueDate) : 'Sans échéance'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
