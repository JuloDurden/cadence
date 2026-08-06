import type { HierarchyNode, Item, KanbanCol, Sprint } from '../../types'
import type { SprintCardEmphasis } from '../../data/dashboardWidgets'
import { getSprintSP } from '../../utils/hierarchyScore'
import { FlipCard } from './FlipCard'

interface Props {
  sprint: Sprint | undefined
  items: Item[]
  hierarchyNodes: HierarchyNode[]
  kanbanCols: KanbanCol[]
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget). */
  instanceKey: string
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
//
// `doneSP`/`totalSP` calculés ici via `getSprintSP()` (2026-08-06, retour Julien : "les autres
// widgets... semblent prendre en compte seulement les items") plutôt que reçus précalculés depuis
// DashboardPage.tsx — un Epic assigné au sprint mais pas encore découpé en US comptait pour 0 SP
// avant ce correctif (voir le commentaire d'en-tête de `getSprintSP()` dans hierarchyScore.ts).
// Recalcul interne à partir des données brutes (items/hierarchyNodes/kanbanCols), même convention
// que BurndownChart.tsx/VelocityChart.tsx plutôt qu'un DashboardPage.tsx qui précalculerait pour
// tout le monde — une seule fonction partagée, pas de risque de divergence entre widgets.
export function SprintProgressCard({ sprint, items, hierarchyNodes, kanbanCols, editable, instanceKey, emphasis, onChangeEmphasis }: Props) {
  const { total: totalSP, done: doneSP } = sprint ? getSprintSP(sprint.id, items, hierarchyNodes, kanbanCols) : { total: 0, done: 0 }
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
          {/* Empilement flex colonne + `alignItems: 'flex-end'` (2026-08-06, même correctif que
              DoneItemsCard.tsx — les 2 essais précédents en CSS Grid, span puis position absolute,
              tenaient pour acquis que la largeur du bloc héros+indice était stable entre les 2
              modes. Elle ne l'est pas dès que `doneSP` et `pct` n'ont pas le même nombre de
              chiffres : ce bloc étant centré horizontalement (`justifyContent: 'center'`
              ci-dessus), son bord droit se déplace avec lui. Pas de décalage visible avec les
              valeurs testées ici (23 SP / 37 %, même nombre de chiffres) mais la même cause que
              DoneItemsCard.tsx, corrigée par précaution avec la même technique : un flex colonne
              avec `alignItems: 'flex-end'` fixe la largeur du bloc sur sa ligne la plus large
              (le héros) et aligne toutes les lignes sur ce même bord droit, quel que soit le
              nombre de chiffres de chacune. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-hero)', fontSize: heroSize, fontWeight: 800, color: 'var(--primary)', lineHeight: .78, fontVariantNumeric: 'tabular-nums' }}>
                {heroValue}
              </span>
              <span style={{ fontFamily: 'var(--font-hero)', fontSize: 16, fontWeight: 800, color: 'var(--primary)', opacity: .6 }}>
                {indexLabel}
              </span>
            </div>
            {emphasis === 'sp' && (
              <span data-testid={`dashboard-widget-sprint-total-${instanceKey}`} style={{ fontFamily: 'var(--font-hero)', fontSize: 16, fontWeight: 400, color: 'var(--primary)', opacity: .6, fontVariantNumeric: 'tabular-nums' }}>
                /{totalSP}
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, whiteSpace: 'nowrap' }}>
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
            name={`sprint-emphasis-${instanceKey}`}
            data-testid={`dashboard-widget-emphasis-sp-${instanceKey}`}
            checked={emphasis === 'sp'}
            onChange={() => onChangeEmphasis('sp')}
          />
          SP
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`sprint-emphasis-${instanceKey}`}
            data-testid={`dashboard-widget-emphasis-percent-${instanceKey}`}
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
