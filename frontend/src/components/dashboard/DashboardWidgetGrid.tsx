import { useState } from 'react'
import type { ReactNode } from 'react'
import GridLayout from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import {
  DASHBOARD_GRID_COLS, DASHBOARD_GRID_MARGIN, DASHBOARD_GRID_WIDTH_PX, DASHBOARD_ROW_HEIGHT,
  DASHBOARD_WIDGET_CATALOG, WIDGET_SIZE_DIMENSIONS,
} from '../../data/dashboardWidgets'
import type { DashboardWidgetId, DashboardWidgetPlacement, DashboardWidgetScope, DashboardWidgetSize } from '../../data/dashboardWidgets'

// Phase 4 (roadmap v1), Dashboard widgets (2026-08-03) — placement libre sur grille façon iOS
// Springboard (retour Julien) : on pose un widget où l'on veut, parmi des tailles prédéfinies (S/M/
// L/XL/XLP, voir data/dashboardWidgets.ts), pas de redimensionnement libre à la souris — d'où
// `isResizable` toujours à `false` ; la taille se change via le bouton dédié sur chaque tuile en
// mode édition, qui fait juste passer le widget à la taille suivante dans la liste de tailles qu'il
// autorise. `react-grid-layout` gère le placement/drag/collision — composant volontairement
// générique (ne connaît que des ids/tailles/labels), toute la logique propre au Dashboard (quelles
// données afficher dans chaque widget) reste dans DashboardPage.tsx.
//
// Correctif (2026-08-03, retour Julien répété : les widgets ne doivent JAMAIS être resizés quand on
// réduit/agrandit leur zone, S doit rester un carré en permanence) — plus de `WidthProvider` : ce
// HOC mesurait la largeur du conteneur (donc de la zone) et en déduisait la largeur d'une colonne,
// ce qui déformait les tuiles dès que la zone changeait de taille. `GridLayout` reçoit maintenant
// une largeur fixe en pixels (`DASHBOARD_GRID_WIDTH_PX`, voir data/dashboardWidgets.ts), ce qui fixe
// la largeur de colonne à `DASHBOARD_ROW_HEIGHT` — proportions garanties, quelle que soit la largeur
// de la zone. Si la zone est plus étroite que la grille, elle défile horizontalement au lieu de
// comprimer les tuiles (voir `.dash-widget-grid-viewport` dans index.css).

interface DashboardWidgetGridProps {
  placements: DashboardWidgetPlacement[]
  editable: boolean
  renderWidget: (id: DashboardWidgetId) => ReactNode
  onChangePlacements: (next: DashboardWidgetPlacement[]) => void
  /** Zone rendue par cette grille (voir DashboardZoneSplit.tsx) — restreint le panneau "+ Ajouter
   *  un widget" aux widgets de cette zone, un widget ne pouvant appartenir qu'à une seule zone. */
  scope: DashboardWidgetScope
}

function widgetLabel(id: DashboardWidgetId) {
  return DASHBOARD_WIDGET_CATALOG.find(w => w.id === id)?.label ?? id
}
function widgetDef(id: DashboardWidgetId) {
  return DASHBOARD_WIDGET_CATALOG.find(w => w.id === id)
}

export function DashboardWidgetGrid({ placements, editable, renderWidget, onChangePlacements, scope }: DashboardWidgetGridProps) {
  const [addPanelOpen, setAddPanelOpen] = useState(false)

  const layout = placements.map(p => ({
    i: p.id, x: p.x, y: p.y, ...WIDGET_SIZE_DIMENSIONS[p.size],
  }))

  function handleDragStop(newLayout: Layout[]) {
    const next = placements.map(p => {
      const item = newLayout.find(l => l.i === p.id)
      return item ? { ...p, x: item.x, y: item.y } : p
    })
    onChangePlacements(next)
  }

  function cycleSize(id: DashboardWidgetId) {
    const def = widgetDef(id)
    if (!def || def.allowedSizes.length < 2) return
    const current = placements.find(p => p.id === id)
    if (!current) return
    const idx = def.allowedSizes.indexOf(current.size)
    const nextSize: DashboardWidgetSize = def.allowedSizes[(idx + 1) % def.allowedSizes.length]
    onChangePlacements(placements.map(p => p.id === id ? { ...p, size: nextSize } : p))
  }

  function removeWidget(id: DashboardWidgetId) {
    onChangePlacements(placements.filter(p => p.id !== id))
  }

  function addWidget(id: DashboardWidgetId) {
    const def = widgetDef(id)
    if (!def) return
    const size = def.allowedSizes[0]
    // Ajoutée sous tout le reste (y le plus bas + sa hauteur), à gauche — pas d'emplacement
    // "intelligent" recherché entre les tuiles existantes, l'utilisateur la fait glisser ensuite où
    // il veut.
    const maxY = placements.reduce((m, p) => Math.max(m, p.y + WIDGET_SIZE_DIMENSIONS[p.size].h), 0)
    onChangePlacements([...placements, { id, x: 0, y: maxY, size }])
    setAddPanelOpen(false)
  }

  const available = DASHBOARD_WIDGET_CATALOG.filter(w => w.scope === scope && !placements.some(p => p.id === w.id))

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
              <div key={p.id} className="dash-widget" data-testid={`dashboard-widget-${p.id}`}>
                {editable && (
                  <div className="dash-widget-editbar">
                    <span className="dash-widget-drag-handle" title="Déplacer" aria-hidden="true">⠿⠿</span>
                    {def && def.allowedSizes.length > 1 && (
                      <button
                        type="button"
                        className="dash-widget-size-btn"
                        data-testid={`dashboard-widget-size-${p.id}`}
                        title="Changer la taille"
                        onClick={() => cycleSize(p.id)}
                      >
                        {p.size}
                      </button>
                    )}
                    <button
                      type="button"
                      className="dash-widget-remove-btn"
                      data-testid={`dashboard-widget-remove-${p.id}`}
                      title="Retirer du Dashboard"
                      onClick={() => removeWidget(p.id)}
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="dash-widget-content">{renderWidget(p.id)}</div>
              </div>
            )
          })}
        </GridLayout>
      </div>

      {editable && (
        <div style={{ marginTop: 16 }}>
          {!addPanelOpen ? (
            <button type="button" className="hdr-ctx-btn" data-testid={`dashboard-add-widget-toggle-${scope}`} onClick={() => setAddPanelOpen(true)} disabled={available.length === 0}>
              + Ajouter un widget
            </button>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {available.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tous les widgets sont déjà sur le Dashboard.</span>}
              {available.map(w => (
                <button key={w.id} type="button" className="hdr-ctx-btn" style={{ fontSize: 11 }}
                  data-testid={`dashboard-add-widget-${w.id}`} onClick={() => addWidget(w.id)}>
                  + {widgetLabel(w.id)}
                </button>
              ))}
              <button type="button" className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => setAddPanelOpen(false)}>Fermer</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
