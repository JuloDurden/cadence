import type { ReactNode } from 'react'
import GridLayout from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import {
  DASHBOARD_GRID_COLS, DASHBOARD_GRID_MARGIN, DASHBOARD_GRID_WIDTH_PX, DASHBOARD_ROW_HEIGHT,
  DASHBOARD_WIDGET_CATALOG, WIDGET_SIZE_DIMENSIONS,
} from '../../data/dashboardWidgets'
import type { DashboardWidgetId, DashboardWidgetPlacement, DashboardWidgetSize } from '../../data/dashboardWidgets'

/* ── Tiny inline SVG helper (même convention que FlipCard.tsx/Header.tsx) ──────────── */
function Svg({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}
const ICO_GRIP = '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>'
// Lucide trash-2 — même tracé que ICO_DELETE (ClientsPage.tsx) et ICO_TRASH (TeamPage.tsx), repris
// tel quel pour rester cohérent avec le reste du projet.
const ICO_TRASH =
  '<path d="M3 6h18"/>' +
  '<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>' +
  '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>' +
  '<line x1="10" x2="10" y1="11" y2="17"/>' +
  '<line x1="14" x2="14" y1="11" y2="17"/>'

// Phase 4 (roadmap v1), Dashboard widgets (2026-08-03) — placement libre sur grille façon iOS
// Springboard : on pose un widget où l'on veut, parmi des tailles prédéfinies (S/M/L/XL/XLP, voir
// data/dashboardWidgets.ts), pas de redimensionnement libre à la souris — d'où `isResizable`
// toujours à `false` ; la taille se change via le bouton dédié sur chaque tuile en mode édition, qui
// fait juste passer le widget à la taille suivante dans la liste de tailles qu'il autorise.
// `react-grid-layout` gère le placement/drag/collision — composant volontairement générique (ne
// connaît que des ids/tailles/labels), toute la logique propre au Dashboard (quelles données
// afficher dans chaque widget) reste dans DashboardPage.tsx.
//
// Correctif (2026-08-03, les widgets ne doivent JAMAIS être resizés quand on réduit/agrandit leur
// zone, S doit rester un carré en permanence) — plus de `WidthProvider` : ce HOC mesurait la largeur
// du conteneur (donc de la zone) et en déduisait la largeur d'une colonne, ce qui déformait les
// tuiles dès que la zone changeait de taille. `GridLayout` reçoit maintenant une largeur fixe en
// pixels (`DASHBOARD_GRID_WIDTH_PX`, voir data/dashboardWidgets.ts), ce qui fixe la largeur de
// colonne à `DASHBOARD_ROW_HEIGHT` — proportions garanties, quelle que soit la largeur de la zone.
// Si la zone est plus étroite que la grille, elle défile horizontalement au lieu de comprimer les
// tuiles (voir `.dash-widget-grid-viewport` dans index.css).
//
// Contrôles d'édition (2026-08-06) — plus de barre dédiée au-dessus de la tuile : les boutons
// taille/suppression sont posés en overlay directement sur le widget (voir
// `.dash-widget-remove-btn`/`.dash-widget-size-btn` dans index.css), sans réserver d'espace ni
// pousser son contenu.
// Poignée de drag (2026-08-06, 2e essai) — la tuile entière saisissable en mode édition (1er essai)
// empêchait d'interagir avec le contenu du widget lui-même : un widget avec des contrôles internes
// (ex. les boutons radio de la face cachée de "Sprint actuel") ne les reçoit jamais, le clic
// démarrant un drag avant d'atteindre l'élément. `draggableCancel` sur un sélecteur `button` ne
// suffisait pas non plus : les contrôles internes d'un widget ne sont pas forcément des `<button>`
// (inputs radio, liens, etc.). Retour à une poignée dédiée (`.dash-widget-drag-handle`, coin
// bas-gauche — bas-droite trop proche de la légende de "Sprint actuel" alignée à droite),
// `draggableHandle` restreint le déclenchement du drag à cette poignée uniquement, tout le reste de
// la tuile redevient cliquable normalement.
//
// Plus de panneau "+ Ajouter un widget" ici (2026-08-06, retour Julien après un 1er essai qui ne
// proposait que les widgets de la zone courante — bug signalé) — l'ajout se fait désormais depuis
// un bouton unique dans le Header (voir DashboardPage.tsx), avec une modal qui choisit la zone
// cible explicitement. Ce composant reste volontairement générique (placement/drag/taille/
// suppression uniquement), toute la logique d'ajout vit au niveau de la page.
//
// Doublons de widgets autorisés (2026-08-06, retour Julien : "possibilité de rajouter plusieurs
// fois des widgets") — un widget n'est plus identifié par son `id` (TYPE, partagé par toutes ses
// instances) mais par `key` (unique par TUILE, voir DashboardWidgetPlacement dans
// dashboardWidgets.ts) : toutes les opérations ci-dessous (layout, drag, taille, suppression) sont
// keyées par `key`. `id` ne sert plus qu'à retrouver la définition catalogue (tailles autorisées).

interface DashboardWidgetGridProps {
  placements: DashboardWidgetPlacement[]
  editable: boolean
  renderWidget: (placement: DashboardWidgetPlacement) => ReactNode
  onChangePlacements: (next: DashboardWidgetPlacement[]) => void
}

function widgetDef(id: DashboardWidgetId) {
  return DASHBOARD_WIDGET_CATALOG.find(w => w.id === id)
}

export function DashboardWidgetGrid({ placements, editable, renderWidget, onChangePlacements }: DashboardWidgetGridProps) {
  const layout = placements.map(p => ({
    i: p.key, x: p.x, y: p.y, ...WIDGET_SIZE_DIMENSIONS[p.size],
  }))

  function handleDragStop(newLayout: Layout[]) {
    const next = placements.map(p => {
      const item = newLayout.find(l => l.i === p.key)
      return item ? { ...p, x: item.x, y: item.y } : p
    })
    onChangePlacements(next)
  }

  function cycleSize(key: string) {
    const current = placements.find(p => p.key === key)
    if (!current) return
    const def = widgetDef(current.id)
    if (!def || def.allowedSizes.length < 2) return
    const idx = def.allowedSizes.indexOf(current.size)
    const nextSize: DashboardWidgetSize = def.allowedSizes[(idx + 1) % def.allowedSizes.length]
    onChangePlacements(placements.map(p => p.key === key ? { ...p, size: nextSize } : p))
  }

  function removeWidget(key: string) {
    onChangePlacements(placements.filter(p => p.key !== key))
  }

  return (
    <div>
      {/* Largeur fixe en pixels (pas WidthProvider) : la grille ne se redimensionne jamais avec la
          zone, elle défile horizontalement si la zone est plus étroite qu'elle. Voir le commentaire
          d'en-tête. */}
      <div className="dash-widget-grid-viewport">
        <GridLayout
          className="dash-widget-grid"
          layout={layout}
          width={DASHBOARD_GRID_WIDTH_PX}
          cols={DASHBOARD_GRID_COLS}
          rowHeight={DASHBOARD_ROW_HEIGHT}
          margin={[DASHBOARD_GRID_MARGIN, DASHBOARD_GRID_MARGIN]}
          // Explicite plutôt que laissé au défaut : `react-grid-layout` fait sinon
          // `containerPadding = containerPadding || margin`, ce qui fausse le calcul de la largeur
          // de colonne par rapport à `DASHBOARD_GRID_WIDTH_PX` (bug trouvé le 2026-08-03, voir
          // commentaire de `DASHBOARD_GRID_WIDTH_PX` dans dashboardWidgets.ts) — sans ce `[0, 0]`,
          // le widget S n'est pas réellement carré.
          containerPadding={[0, 0]}
          isDraggable={editable}
          isResizable={false}
          draggableHandle=".dash-widget-drag-handle"
          onDragStop={handleDragStop}
        >
          {placements.map(p => {
            const def = widgetDef(p.id)
            return (
              <div key={p.key} className="dash-widget" data-testid={`dashboard-widget-${p.key}`}>
                {editable && (
                  <span
                    className="dash-widget-drag-handle"
                    data-testid={`dashboard-widget-drag-${p.key}`}
                    title="Déplacer"
                  >
                    <Svg d={ICO_GRIP} />
                  </span>
                )}
                {editable && (
                  <button
                    type="button"
                    className="dash-widget-remove-btn"
                    data-testid={`dashboard-widget-remove-${p.key}`}
                    title="Retirer du Dashboard"
                    onClick={() => removeWidget(p.key)}
                  >
                    <Svg d={ICO_TRASH} size={13} />
                  </button>
                )}
                {editable && def && def.allowedSizes.length > 1 && (
                  <button
                    type="button"
                    className="dash-widget-size-btn"
                    data-testid={`dashboard-widget-size-${p.key}`}
                    title="Changer la taille"
                    onClick={() => cycleSize(p.key)}
                  >
                    {p.size}
                  </button>
                )}
                <div className="dash-widget-content">{renderWidget(p)}</div>
              </div>
            )
          })}
        </GridLayout>
      </div>
    </div>
  )
}
