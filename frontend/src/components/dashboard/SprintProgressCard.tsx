import type { Sprint } from '../../types'
import type { SprintCardEmphasis } from '../../data/dashboardWidgets'
import { FlipCard } from './FlipCard'

interface Props {
  sprint: Sprint | undefined
  doneSP: number
  totalSP: number
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  emphasis: SprintCardEmphasis
  onChangeEmphasis: (next: SprintCardEmphasis) => void
}

// Widget "Sprint actuel" (2026-08-03, retour Julien, plusieurs itérations — spec finale donnée sous
// forme de tableau 2x2) — extrait de DashboardPage.tsx le 2026-08-04, même logique de rendu que le
// reste des widgets Dashboard (StatCard, VelocityChart, BurndownChart, ClientRAG). Vraie grille CSS,
// pas une approximation par flex/absolu (les tentatives précédentes étaient fausses) :
//   ligne 1 / colonne 1 : {héros} — grande police, haut-droite
//   ligne 1 / colonne 2 : {indice} — petite police, haut-droite
//   ligne 2 / colonne 1 : "/{totalSP}" — petite police, bas-droite (seulement en mode 'sp')
//   ligne 2 / colonne 2 : rien
//   ligne 3 (fusionnée)  : légende — alignée sur le bord droit du tableau (même grille, pas un
//   élément à part, pour garantir qu'elle partage exactement le même bord droit)
// Pas de bordure visible (Julien : "je veux absolument pas voir les contours du tableau") — les
// bordures n'ont servi qu'à vérifier la structure pendant les itérations précédentes.
// Taille réduite au-delà de 2 chiffres pour ne jamais déborder du widget carré S (voir
// feedback_dashboard_widget_fixed_size.md côté mémoire).
//
// Face cachée (2026-08-04) — un réglage "SP fait" vs "% complété" mis en avant, 2 boutons radio
// "SP"/"%" sans texte d'explication (2026-08-06 : le réglage est assez évident pour s'en passer) :
//   'sp'      : héros = SP fait, indice = "SP", "/{totalSP}" affiché, légende = "{pct}% complété"
//   'percent' : héros = pourcentage, indice = "%", "/{totalSP}" disparaît, légende = "{doneSP}/{totalSP} SP"
export function SprintProgressCard({ sprint, doneSP, totalSP, editable, emphasis, onChangeEmphasis }: Props) {
  const pct = Math.round((doneSP / Math.max(1, totalSP)) * 100)
  const heroValue = emphasis === 'percent' ? pct : doneSP
  const indexLabel = emphasis === 'percent' ? '%' : 'SP'
  const caption = emphasis === 'percent' ? `${doneSP}/${totalSP} SP` : `${pct}% complété`
  const heroSize = String(heroValue).length >= 3 ? 52 : 68

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title">Sprint actuel</div>
      {sprint ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gridTemplateRows: 'auto auto auto', columnGap: 4 }}>
            <span style={{ gridRow: 1, gridColumn: 1, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: heroSize, fontWeight: 800, color: 'var(--primary)', lineHeight: .78, fontVariantNumeric: 'tabular-nums' }}>
              {heroValue}
            </span>
            <span style={{ gridRow: 1, gridColumn: 2, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: 16, fontWeight: 800, color: 'var(--primary)', opacity: .6 }}>
              {indexLabel}
            </span>
            {emphasis === 'sp' && (
              <span data-testid="dashboard-widget-sprint-total" style={{ gridRow: 2, gridColumn: 1, justifySelf: 'end', alignSelf: 'end', fontFamily: 'var(--font-hero)', fontSize: 16, fontWeight: 400, color: 'var(--primary)', opacity: .6, fontVariantNumeric: 'tabular-nums' }}>
                /{totalSP}
              </span>
            )}
            <span style={{ gridRow: 3, gridColumn: '1 / 3', justifySelf: 'end', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {caption}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun sprint actif
        </div>
      )}
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Sprint actuel</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name="sprint-emphasis"
            data-testid="dashboard-widget-emphasis-sp"
            checked={emphasis === 'sp'}
            onChange={() => onChangeEmphasis('sp')}
          />
          SP
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name="sprint-emphasis"
            data-testid="dashboard-widget-emphasis-percent"
            checked={emphasis === 'percent'}
            onChange={() => onChangeEmphasis('percent')}
          />
          %
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
