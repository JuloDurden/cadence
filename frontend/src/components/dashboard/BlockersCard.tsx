import type { DailyEntry, Sprint } from '../../types'
import type { BlockersScope } from '../../data/dashboardWidgets'
import { FlipCard } from './FlipCard'

interface Props {
  dailyEntries: DailyEntry[]
  currentSprint: Sprint | undefined
  today: string
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement (`DashboardWidgetPlacement.key`) — suffixe les `name`/`data-testid` des
   *  inputs radio (2026-08-06, retour Julien : doublons de widgets, "les inputs radio ne se sont pas
   *  cochés comme il faut"). Un `name` HTML groupe les radios au niveau du DOCUMENT, pas du
   *  composant React : sans ce suffixe, 2 instances de ce widget partagent le même groupe de radios
   *  et se marchent dessus au clic. */
  instanceKey: string
  scope: BlockersScope
  onChangeScope: (next: BlockersScope) => void
}

// Widget "Blocages actifs" (2026-08-06) — 4e widget avec une face cachée de réglages
// (FlipCard.tsx). Réglage : période du comptage, "aujourd'hui" (comportement historique, défaut)
// ou "sprint en cours" (du jour de début du sprint à aujourd'hui). Compte des entrées de Daily avec
// un champ "blocages" renseigné, pas des membres uniques — même logique de comptage dans les 2 cas,
// seule la fenêtre de dates change.
//
// Style de face avant repris de SprintProgressCard.tsx (retour Julien 2026-08-06 : "adapte le
// style comme le SprintProgressCard") plutôt que StatCard : même grille CSS héros/indice/légende.
// Couleur du héros conservée sémantique (rouge s'il y a au moins un blocage, vert sinon) plutôt que
// var(--primary) : seule différence volontaire avec Sprint actuel.
export function BlockersCard({ dailyEntries, currentSprint, today, editable, instanceKey, scope, onChangeScope }: Props) {
  const todayBlockers = dailyEntries.filter(e => e.date === today && e.blockers.trim().length > 0)
  const sprintBlockers = currentSprint
    ? dailyEntries.filter(e => e.date >= currentSprint.startDate && e.date <= today && e.blockers.trim().length > 0)
    : []
  const value = scope === 'sprint' ? sprintBlockers.length : todayBlockers.length
  const caption = scope === 'sprint'
    ? (currentSprint ? `sprint ${currentSprint.number}` : 'aucun sprint actif')
    : "aujourd'hui"
  const color = value > 0 ? 'var(--danger)' : '#34c759'
  const heroSize = String(value).length >= 3 ? 52 : 68

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title">Blocages actifs</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gridTemplateRows: 'auto auto', columnGap: 4 }}>
          <span style={{ gridRow: 1, gridColumn: 1, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: heroSize, fontWeight: 800, color, lineHeight: .78, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </span>
          <span style={{ gridRow: 1, gridColumn: 2, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: 16, fontWeight: 800, color, opacity: .6 }}>
            {value > 1 ? 'blocages' : 'blocage'}
          </span>
          <span style={{ gridRow: 2, gridColumn: '1 / 3', justifySelf: 'end', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            {caption}
          </span>
        </div>
      </div>
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Blocages actifs</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`blockers-scope-${instanceKey}`}
            data-testid={`dashboard-widget-blockers-today-${instanceKey}`}
            checked={scope === 'today'}
            onChange={() => onChangeScope('today')}
          />
          Aujourd'hui
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`blockers-scope-${instanceKey}`}
            data-testid={`dashboard-widget-blockers-sprint-${instanceKey}`}
            checked={scope === 'sprint'}
            onChange={() => onChangeScope('sprint')}
          />
          Sprint en cours
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
