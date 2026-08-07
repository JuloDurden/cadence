import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DashboardWidgetGrid } from './DashboardWidgetGrid'
import { DASHBOARD_ZONE_LABELS, placementScope, zoneRowSpan } from '../../data/dashboardWidgets'
import type { DashboardWidgetPlacement, DashboardWidgetScope } from '../../data/dashboardWidgets'

// Phase 4 (roadmap v1), Dashboard widgets, suite (2026-08-03, retour Julien après le 1er essai) —
// distingue les widgets "Sprint en cours" (opérationnel, change à chaque sprint) des widgets
// "Vue produit" (tendance/historique) : 2 zones séparées, chacune sa propre grille. Orientation
// (côte à côte / empilées) et partage de l'espace entre les 2 zones réglables par un Admin/PO,
// persistés comme le reste (state.settings).
//
// Ordre des zones interchangeable (2026-08-06, retour Julien : "on ne peut pas interchanger leur
// ordre" — les zones étaient toujours affichées Sprint en cours puis Vue produit, gauche/droite ou
// haut/bas selon l'orientation, sans réglage) — `zonesSwapped` persisté comme le reste, bouton dédié
// à côté du choix d'orientation.
//
// La zone d'un widget suit le catalogue par défaut (voir dashboardWidgets.ts), mais un placement
// peut la surcharger via `scopeOverride` — pour l'instant, seul le réglage "périmètre" de Santé
// clients (RAG) le fait automatiquement quand on le change (voir ClientRAG.tsx dans
// DashboardPage.tsx) : pas de bouton dédié "changer de zone" (retour Julien : "je ne pensais pas à
// rajouter un bouton supplémentaire"), le comportement suit un réglage déjà existant du widget.
//
// "Redimensionnable par paliers dans la limite de leur remplissage" (demande de Julien) : une
// vraie poignée à glisser (pas un simple sélecteur de boutons — accepté avec Julien que c'est une
// interaction non testable visuellement dans cet environnement, donc plus à risque), qui accroche
// sur 5 paliers prédéfinis (20/80, 35/65, 50/50, 65/35, 80/20). "Limite de leur remplissage" : pas
// une mesure DOM réelle (la largeur d'une zone n'a pas de minimum "physique", react-grid-layout
// réduit juste ses colonnes proportionnellement) — approximé via `zoneRowSpan` (nombre de lignes de
// grille occupées par les widgets de chaque zone) : un palier qui donnerait à une zone moins de la
// moitié de sa "part équitable" de lignes par rapport à l'autre zone est exclu des paliers
// disponibles. Documenté comme une approximation, pas une garantie physique de non-recouvrement.
const SPLIT_STEPS = [20, 35, 50, 65, 80]

interface DashboardZoneSplitProps {
  placements: DashboardWidgetPlacement[]
  orientation: 'horizontal' | 'vertical'
  splitPercent: number
  zonesSwapped: boolean
  editable: boolean
  renderWidget: (placement: DashboardWidgetPlacement) => ReactNode
  onChangePlacements: (next: DashboardWidgetPlacement[]) => void
  onChangeOrientation: (o: 'horizontal' | 'vertical') => void
  onChangeSplit: (pct: number) => void
  onChangeZonesSwapped: (next: boolean) => void
  onZoneColsChange?: (zone: DashboardWidgetScope, cols: number) => void
}

export function DashboardZoneSplit({
  placements, orientation, splitPercent, zonesSwapped, editable, renderWidget,
  onChangePlacements, onChangeOrientation, onChangeSplit, onChangeZonesSwapped, onZoneColsChange,
}: DashboardZoneSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragPercent, setDragPercent] = useState<number | null>(null)

  const ZONES: DashboardWidgetScope[] = zonesSwapped ? ['product', 'sprint'] : ['sprint', 'product']

  const byZone: Record<DashboardWidgetScope, DashboardWidgetPlacement[]> = {
    sprint: placements.filter(p => placementScope(p) === 'sprint'),
    product: placements.filter(p => placementScope(p) === 'product'),
  }

  function mergeZone(scope: DashboardWidgetScope, nextZonePlacements: DashboardWidgetPlacement[]) {
    const rest = placements.filter(p => placementScope(p) !== scope)
    onChangePlacements([...rest, ...nextZonePlacements])
  }

  // Palier le plus proche parmi ceux qui laissent à chaque zone au moins la moitié de sa "part
  // équitable" de lignes (voir commentaire d'en-tête) — jamais vide (repli sur tous les paliers si
  // le calcul en exclurait la totalité, cas limite type zone sans aucun widget).
  const rowsSprint = zoneRowSpan(byZone.sprint)
  const rowsProduct = zoneRowSpan(byZone.product)
  const fairShare = (rowsSprint + rowsProduct) > 0 ? (rowsSprint / (rowsSprint + rowsProduct)) * 100 : 50
  const allowedSteps = SPLIT_STEPS.filter(s => s >= fairShare * 0.5 && (100 - s) >= (100 - fairShare) * 0.5)
  const steps = allowedSteps.length > 0 ? allowedSteps : SPLIT_STEPS

  function snapToStep(pct: number): number {
    return steps.reduce((closest, s) => Math.abs(s - pct) < Math.abs(closest - pct) ? s : closest, steps[0])
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!editable) return
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    function onMove(ev: PointerEvent) {
      const rect = container!.getBoundingClientRect()
      const raw = orientation === 'horizontal'
        ? ((ev.clientX - rect.left) / rect.width) * 100
        : ((ev.clientY - rect.top) / rect.height) * 100
      setDragPercent(Math.max(10, Math.min(90, raw)))
    }
    function onUp(ev: PointerEvent) {
      const rect = container!.getBoundingClientRect()
      const raw = orientation === 'horizontal'
        ? ((ev.clientX - rect.left) / rect.width) * 100
        : ((ev.clientY - rect.top) / rect.height) * 100
      onChangeSplit(snapToStep(Math.max(10, Math.min(90, raw))))
      setDragPercent(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const effectiveSplit = dragPercent ?? splitPercent

  return (
    <div>
      {editable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Disposition des zones :</span>
          <button
            type="button"
            className={`hdr-ctx-btn${orientation === 'horizontal' ? ' active' : ''}`}
            style={{ fontSize: 11 }}
            data-testid="dashboard-zone-orientation-horizontal"
            onClick={() => onChangeOrientation('horizontal')}
          >
            ↔ Côte à côte
          </button>
          <button
            type="button"
            className={`hdr-ctx-btn${orientation === 'vertical' ? ' active' : ''}`}
            style={{ fontSize: 11 }}
            data-testid="dashboard-zone-orientation-vertical"
            onClick={() => onChangeOrientation('vertical')}
          >
            ↕ Empilées
          </button>
          <div className="hdr-sep" />
          <button
            type="button"
            className="hdr-ctx-btn"
            style={{ fontSize: 11 }}
            data-testid="dashboard-zone-swap-order"
            title="Inverser l'ordre des 2 zones"
            onClick={() => onChangeZonesSwapped(!zonesSwapped)}
          >
            ⇄ Inverser l'ordre
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className={`dash-zone-split dash-zone-split-${orientation}`}
        data-testid="dashboard-zone-split"
      >
        {ZONES.map((scope, i) => (
          <div key={scope} style={{ display: 'contents' }}>
            <div
              className="dash-zone"
              data-testid={`dashboard-zone-${scope}`}
              style={{ flexBasis: `${i === 0 ? effectiveSplit : 100 - effectiveSplit}%` }}
            >
              <div className="dash-zone-label">{DASHBOARD_ZONE_LABELS[scope]}</div>
              <DashboardWidgetGrid
                placements={byZone[scope]}
                editable={editable}
                renderWidget={renderWidget}
                onChangePlacements={next => mergeZone(scope, next)}
                onColsChange={cols => onZoneColsChange?.(scope, cols)}
              />
            </div>
            {i === 0 && (
              <div
                className={`dash-zone-splitter${editable ? ' editable' : ''}`}
                data-testid="dashboard-zone-splitter"
                onPointerDown={handlePointerDown}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
