import type { DoneItemsDisplay } from '../../data/dashboardWidgets'
import { FlipCard } from './FlipCard'

interface Props {
  doneCount: number
  totalCount: number
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget). */
  instanceKey: string
  display: DoneItemsDisplay
  onChangeDisplay: (next: DoneItemsDisplay) => void
}

// Widget "US terminées" (2026-08-06) — 5e widget avec une face cachée de réglages (FlipCard.tsx).
// Réglage : affichage en nombre ("42 US", comportement historique, défaut) ou en pourcentage du
// total produit ("84%"). La légende affiche l'autre métrique, même principe d'inversion que le
// réglage SP/% de Sprint actuel.
//
// Style de face avant repris de SprintProgressCard.tsx (retour Julien 2026-08-06 : "adapte le
// style comme le SprintProgressCard") plutôt que StatCard : même grille CSS héros/indice/légende,
// même duo count/percent que le duo sp/percent de Sprint actuel (la ligne "/{totalCount}" ne
// s'affiche qu'en mode 'count', tout comme "/{totalSP}" ne s'affiche qu'en mode 'sp').
export function DoneItemsCard({ doneCount, totalCount, editable, instanceKey, display, onChangeDisplay }: Props) {
  const pct = Math.round((doneCount / Math.max(1, totalCount)) * 100)
  const heroValue = display === 'percent' ? pct : doneCount
  const indexLabel = display === 'percent' ? '%' : 'US'
  const caption = display === 'percent' ? `${doneCount}/${totalCount} US` : `${pct}% complété`
  const heroSize = String(heroValue).length >= 3 ? 52 : 68

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title">US terminées</div>
      {totalCount > 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Empilement flex colonne + `alignItems: 'flex-end'` (2026-08-06, retour Julien : "on
              revient à la case départ" — les 2 essais précédents en CSS Grid (span puis colonne 2,
              puis position absolute) tenaient tous pour acquis que la largeur de la colonne héros
              était stable entre les 2 modes. Elle ne l'est pas : `doneCount` et `pct` sont 2 nombres
              différents qui n'ont pas le même nombre de chiffres (ex. "5" vs "29"), donc le bloc
              héros+indice n'a pas la même largeur selon le mode, et ce bloc est lui-même centré
              horizontalement dans le widget (`justifyContent: 'center'` ci-dessus) — son bord droit
              se déplaçait donc avec lui, quelle que soit la technique utilisée pour y ancrer la
              légende. Un flex colonne avec `alignItems: 'flex-end'` fixe la largeur du bloc entier
              sur sa ligne la plus large (systématiquement le héros, en très grande police) et
              aligne TOUTES les lignes (héros+indice, total, légende) sur ce même bord droit — la
              légende partage donc le bord droit du héros par construction, quel que soit le nombre
              de chiffres de chacun. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-hero)', fontSize: heroSize, fontWeight: 800, color: 'var(--primary)', lineHeight: .78, fontVariantNumeric: 'tabular-nums' }}>
                {heroValue}
              </span>
              <span style={{ fontFamily: 'var(--font-hero)', fontSize: 16, fontWeight: 800, color: 'var(--primary)', opacity: .6 }}>
                {indexLabel}
              </span>
            </div>
            {display === 'count' && (
              <span style={{ fontFamily: 'var(--font-hero)', fontSize: 16, fontWeight: 400, color: 'var(--primary)', opacity: .6, fontVariantNumeric: 'tabular-nums' }}>
                /{totalCount}
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, whiteSpace: 'nowrap' }}>
              {caption}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'end', color: 'var(--text-muted)', fontSize: 13 }}>
          Aucune US
        </div>
      )}
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>US terminées</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`done-items-display-${instanceKey}`}
            data-testid={`dashboard-widget-done-count-${instanceKey}`}
            checked={display === 'count'}
            onChange={() => onChangeDisplay('count')}
          />
          Nombre
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`done-items-display-${instanceKey}`}
            data-testid={`dashboard-widget-done-percent-${instanceKey}`}
            checked={display === 'percent'}
            onChange={() => onChangeDisplay('percent')}
          />
          Pourcentage
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
