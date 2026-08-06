import type { DailyEntry, Sprint, TeamMember } from '../../types'
import type { RecentActivityWindow } from '../../data/dashboardWidgets'
import { FlipCard } from './FlipCard'

interface Props {
  dailyEntries: DailyEntry[]
  team: TeamMember[]
  currentSprint: Sprint | undefined
  today: string
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget). */
  instanceKey: string
  /** Nommé `windowMode` plutôt que `window` pour ne pas masquer l'objet global `window`. */
  windowMode: RecentActivityWindow
  onChangeWindow: (next: RecentActivityWindow) => void
}

const WINDOW_EMPTY_LABEL: Record<RecentActivityWindow, string> = {
  '2h': 'Aucune activité dans les 2 dernières heures.',
  today: "Aucune activité aujourd'hui.",
  week: 'Aucune activité cette semaine.',
  sprint: 'Aucune activité sur le sprint en cours.',
}

function withinWindow(dateStr: string, windowMode: RecentActivityWindow, today: string, currentSprint: Sprint | undefined): boolean {
  if (windowMode === '2h' || windowMode === 'today') return dateStr === today
  if (windowMode === 'week') {
    const diffDays = Math.round((new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000)
    return diffDays >= 0 && diffDays <= 6
  }
  // 'sprint'
  return currentSprint ? dateStr >= currentSprint.startDate && dateStr <= today : false
}

// Widget "Activité récente" (2026-08-06) — 8e widget avec une face cachée de réglages
// (FlipCard.tsx). Réglage : granularité temporelle du flux de Dailies (voir dashboardWidgets.ts
// pour le détail des 4 options et la limite technique de l'option "2 dernières heures" tant qu'un
// vrai journal d'activité horodaté n'existe pas). Toujours limité aux 8 entrées les plus récentes
// dans la fenêtre choisie, comportement historique inchangé au-delà du filtrage par date.
export function RecentActivity({ dailyEntries, team, currentSprint, today, editable, instanceKey, windowMode, onChangeWindow }: Props) {
  const filtered = dailyEntries.filter(e => withinWindow(e.date, windowMode, today, currentSprint))

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', overflow: 'auto' }}>
      <div className="dash-widget-title" style={{ marginBottom: 16 }}>Activité récente</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {windowMode === 'sprint' && !currentSprint ? 'Aucun sprint actif.' : WINDOW_EMPTY_LABEL[windowMode]}
          </p>
        )}
        {[...filtered]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 8)
          .map((entry, i) => {
            const member = team.find(m => m.id === entry.memberId)
            if (!member) return null
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>
                  {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{member.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(entry.date).toLocaleDateString('fr-FR')}</span>
                  </div>
                  {entry.today && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>🎯 {entry.today}</div>}
                  {entry.blockers && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 1 }}>⚠ {entry.blockers}</div>}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Activité récente</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {(['2h', 'today', 'week', 'sprint'] as RecentActivityWindow[]).map(w => (
          <label key={w} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`recent-activity-window-${instanceKey}`}
              data-testid={`dashboard-widget-recent-activity-${w}-${instanceKey}`}
              checked={windowMode === w}
              onChange={() => onChangeWindow(w)}
            />
            {w === '2h' ? '2 dernières heures' : w === 'today' ? "Aujourd'hui" : w === 'week' ? 'Cette semaine' : 'Sprint en cours'}
          </label>
        ))}
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
