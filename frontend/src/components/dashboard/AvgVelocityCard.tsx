import type { VelocityWindow } from '../../data/dashboardWidgets'
import { FlipCard } from './FlipCard'

interface Props {
  avgAll: number
  avgLast3: number
  countAll: number
  countLast3: number
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget). */
  instanceKey: string
  /** Nommé `windowMode` plutôt que `window` pour ne pas masquer l'objet global `window`. */
  windowMode: VelocityWindow
  onChangeWindow: (next: VelocityWindow) => void
}

// Widget "Vélocité moyenne" (2026-08-06) — 6e widget avec une face cachée de réglages
// (FlipCard.tsx). Réglage : fenêtre de calcul, tous les sprints clôturés (comportement historique,
// défaut) ou moyenne glissante sur les 3 derniers, plus représentative d'une tendance récente que
// la moyenne complète. Les 2 moyennes sont calculées dans DashboardPage.tsx (même endroit que
// l'ancien calcul historique) et passées ici toutes prêtes, plutôt que de recevoir les sprints bruts
// — ce composant ne fait que choisir laquelle afficher.
//
// Style de face avant repris de SprintProgressCard.tsx (retour Julien 2026-08-06 : "adapte le
// style comme le SprintProgressCard") plutôt que StatCard : même grille CSS héros/indice/légende.
// Couleur du héros conservée en orange (#ff9500, même code que la vélocité moyenne dans
// VelocityChart.tsx) plutôt que var(--primary) : seule différence volontaire avec Sprint actuel,
// pour garder la cohérence de couleur avec le reste des widgets liés à la vélocité.
export function AvgVelocityCard({ avgAll, avgLast3, countAll, countLast3, editable, instanceKey, windowMode, onChangeWindow }: Props) {
  const avg = windowMode === 'last3' ? avgLast3 : avgAll
  const count = windowMode === 'last3' ? countLast3 : countAll
  const heroSize = String(avg).length >= 3 ? 52 : 68

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title">Vélocité moy.</div>
      {count > 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gridTemplateRows: 'auto auto', columnGap: 4 }}>
            <span style={{ gridRow: 1, gridColumn: 1, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: heroSize, fontWeight: 800, color: '#ff9500', lineHeight: .78, fontVariantNumeric: 'tabular-nums' }}>
              {avg}
            </span>
            <span style={{ gridRow: 1, gridColumn: 2, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: 16, fontWeight: 800, color: '#ff9500', opacity: .6 }}>
              SP
            </span>
            <span style={{ gridRow: 2, gridColumn: '1 / 3', justifySelf: 'end', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              sur {count} sprint{count > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun sprint clôturé
        </div>
      )}
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Vélocité moyenne</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`velocity-window-${instanceKey}`}
            data-testid={`dashboard-widget-velocity-window-all-${instanceKey}`}
            checked={windowMode === 'all'}
            onChange={() => onChangeWindow('all')}
          />
          Tous les sprints
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`velocity-window-${instanceKey}`}
            data-testid={`dashboard-widget-velocity-window-last3-${instanceKey}`}
            checked={windowMode === 'last3'}
            onChange={() => onChangeWindow('last3')}
          />
          3 derniers
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
