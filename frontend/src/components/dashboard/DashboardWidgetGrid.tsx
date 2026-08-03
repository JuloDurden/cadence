import { useState } from 'react'
import type { ReactNode } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import {
  DASHBOARD_GRID_COLS, DASHBOARD_ROW_HEIGHT, DASHBOARD_WIDGET_CATALOG, WIDGET_SIZE_DIMENSIONS,
} from '../../data/dashboardWidgets'
import type { DashboardWidgetId, DashboardWidgetPlacement, DashboardWidgetSize } from '../../data/dashboardWidgets'

// Phase 4 (roadmap v1), Dashboard widgets (2026-08-03) — placement libre sur grille façon iOS
// Springboard (retour Julien) : on pose un widget où l'on veut, parmi 3 tailles prédéfinies (S/M/L,
// voir data/dashboardWidgets.ts), pas de redimensionnement libre à la souris — d'où `isResizable`
// toujours à `false` ; la taille se change via le bouton dédié sur chaque tuile en mode édition,
// qui fait juste passer le widget à la taille suivante dans la liste de tailles qu'il autorise.
// `react-grid-layout` gère le placement/drag/collision — composant volontairement générique (ne
// connaît que des ids/tailles/labels), toute la logique propre au Dashboard (quelles données
// afficher dans chaque widget) reste dans DashboardPage.tsx.
const ResponsiveGridLayout = WidthProvider(GridLayout)

interface DashboardWidgetGridProps {
  placements: DashboardWidgetPlacement[]
  editable: boolean
  renderWidget: (id: DashboardWidgetId) => ReactNode
  onChangePlacements: (next: DashboardWidgetPlacement[]) => void
}

function widgetLabel(id: DashboardWidgetId) {
  return DASHBOARD_WIDGET_CATALOG.find(w => w.id === id)?.label ?? id
}
function widgetDef(id: DashboardWidgetId) {
  return DASHBOARD_WIDGET_CATALOG.find(w => w.id === id)
}

export function DashboardWidgetGrid({ placements, editable, renderWidget, onChangePlacements }: DashboardWidgetGridProps) {
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

  const available = DASHBOARD_WIDGET_CATALOG.filter(w => !placements.some(p => p.id === w.id))

  return (
    <div>
      <ResponsiveGridLayout
        className="dash-grid"
        layout={layout}
        cols={DASHBOARD_GRID_COLS}
        rowHeight={DASHBOARD_ROW_HEIGHT}
        margin={[14, 14]}
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
      </ResponsiveGridLayout>

      {editable && (
        <div style={{ marginTop: 16 }}>
          {!addPanelOpen ? (
            <button type="button" className="hdr-ctx-btn" data-testid="dashboard-add-widget-toggle" onClick={() => setAddPanelOpen(true)} disabled={available.length === 0}>
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
