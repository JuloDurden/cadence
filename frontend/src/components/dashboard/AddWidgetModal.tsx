import { useEffect, useRef, useState } from 'react'
import { DASHBOARD_WIDGET_CATALOG, DASHBOARD_ZONE_LABELS, widgetScope } from '../../data/dashboardWidgets'
import type { DashboardWidgetId, DashboardWidgetScope } from '../../data/dashboardWidgets'

interface Props {
  onAdd: (id: DashboardWidgetId, zone: DashboardWidgetScope) => void
  onClose: () => void
}

/* ── Tiny inline SVG helper (même convention que Header.tsx/FlipCard.tsx) ──────────── */
function Svg({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}
const ICO_PLUS = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
const ICO_CHEVRON_DOWN = '<path d="m6 9 6 6 6-6"/>'

// Bouton "Ajouter" + menu déroulant de choix de zone (2026-08-06, retour Julien : "les boutons...
// prennent beaucoup trop de place" — remplace les 2 boutons pleine largeur empilés par un seul
// bouton compact, placé à droite du titre/légende plutôt qu'en dessous). Fermeture au clic
// extérieur, même mécanique que les menus de NNLToolbar.tsx (`mousedown` sur `window`).
function AddZoneMenu({ id, onAdd }: { id: DashboardWidgetId; onAdd: (zone: DashboardWidgetScope) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function pick(zone: DashboardWidgetScope) {
    onAdd(zone)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: 11, padding: '6px 10px' }}
        data-testid={`add-widget-${id}-toggle`}
        onClick={() => setOpen(o => !o)}
      >
        <Svg d={ICO_PLUS} size={12} /> Ajouter <Svg d={ICO_CHEVRON_DOWN} size={11} />
      </button>
      {open && (
        <div
          data-testid={`add-widget-${id}-menu`}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,.12)', minWidth: 150, overflow: 'hidden',
          }}
        >
          <button
            type="button"
            className="dash-add-widget-menu-item"
            data-testid={`add-widget-${id}-sprint`}
            onClick={() => pick('sprint')}
          >
            {DASHBOARD_ZONE_LABELS.sprint}
          </button>
          <button
            type="button"
            className="dash-add-widget-menu-item"
            data-testid={`add-widget-${id}-product`}
            onClick={() => pick('product')}
          >
            {DASHBOARD_ZONE_LABELS.product}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Mini mockup héros/indice/légende (2026-08-06, retour Julien : "plutôt que des vignettes, je
 *  préfère des mockups des différents widgets") — reprend fidèlement mais en miniature la grille
 *  CSS héros/indice/légende des 4 KPI (SprintProgressCard.tsx, DoneItemsCard.tsx,
 *  AvgVelocityCard.tsx, BlockersCard.tsx) plutôt qu'un texte générique : chaque carte de la modal
 *  montre à quoi ressemble RÉELLEMENT le widget une fois posé, pas juste son nom. Valeurs figées
 *  (pas de données live) : ce n'est qu'un aperçu de mise en forme, pas un rendu du widget. ── */
function HeroMockup({ value, index, caption, color }: { value: string; index: string; caption: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gridTemplateRows: 'auto auto', columnGap: 3 }}>
        <span style={{ gridRow: 1, gridColumn: 1, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: 30, fontWeight: 800, color, lineHeight: .78, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        <span style={{ gridRow: 1, gridColumn: 2, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: 10, fontWeight: 800, color, opacity: .6 }}>
          {index}
        </span>
        <span style={{ gridRow: 2, gridColumn: '1 / 3', justifySelf: 'end', fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
          {caption}
        </span>
      </div>
    </div>
  )
}

// Mini graphique en barres (velocity-chart) — reprend les proportions de VelocityChart.tsx : barres
// "Planifié" (faint) derrière les barres "Vélocité" (primary), hauteurs figées plausibles.
function VelocityChartMockup() {
  const bars = [
    { v: 60, p: 70 }, { v: 80, p: 75 }, { v: 55, p: 65 }, { v: 90, p: 85 }, { v: 70, p: 70 },
  ]
  return (
    <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', gap: 6, padding: '0 4px' }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', bottom: 0, width: 8, height: `${b.p}%`, background: 'var(--text-faint)', borderRadius: '2px 2px 0 0' }} />
          <div style={{ position: 'absolute', bottom: 0, width: 8, height: `${b.v}%`, background: 'var(--primary)', borderRadius: '2px 2px 0 0', transform: 'translateX(6px)' }} />
        </div>
      ))}
    </div>
  )
}

// Mini graphique en ligne (burndown-chart) — ligne idéale pointillée décroissante + ligne réelle
// pleine, mêmes couleurs que BurndownChart.tsx.
function BurndownChartMockup() {
  return (
    <svg viewBox="0 0 100 48" width="100%" height={64} preserveAspectRatio="none">
      <line x1="4" y1="4" x2="96" y2="44" stroke="var(--text-faint)" strokeWidth="2" strokeDasharray="4 3" />
      <polyline points="4,4 30,10 55,22 78,30 96,42" stroke="var(--primary)" strokeWidth="2" fill="none" />
    </svg>
  )
}

// Mini liste RAG (client-rag) — 3 lignes, pastille de couleur + barre représentant le nom, même
// palette RAG que ClientRAG.tsx.
function ClientRagMockup() {
  const rows = [{ c: '#34c759', w: 70 }, { c: '#ff9500', w: 50 }, { c: '#ff3b30', w: 60 }]
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 8px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: r.c, flexShrink: 0 }} />
          <div style={{ height: 5, width: `${r.w}%`, background: 'var(--border)', borderRadius: 3 }} />
        </div>
      ))}
    </div>
  )
}

// Mini flux d'activité (recent-activity) — 2 lignes, avatar rond + 2 barres de texte, même
// composition que RecentActivity.tsx.
function RecentActivityMockup() {
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 8px' }}>
      {[0, 1].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <div style={{ height: 5, width: '55%', background: 'var(--text-faint)', borderRadius: 3 }} />
            <div style={{ height: 4, width: '80%', background: 'var(--border)', borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function WidgetPreview({ id }: { id: DashboardWidgetId }) {
  switch (id) {
    case 'kpi-done':
      return <HeroMockup value="42" index="US" caption="84% complété" color="var(--primary)" />
    case 'kpi-velocity':
      return <HeroMockup value="32" index="SP" caption="sur 5 sprints" color="#ff9500" />
    case 'kpi-current-sprint':
      return <HeroMockup value="63" index="SP" caption="63% complété" color="var(--primary)" />
    case 'kpi-blockers':
      return <HeroMockup value="2" index="blocages" caption="aujourd'hui" color="var(--danger)" />
    case 'velocity-chart':
      return <VelocityChartMockup />
    case 'burndown-chart':
      return <BurndownChartMockup />
    case 'client-rag':
      return <ClientRagMockup />
    case 'recent-activity':
      return <RecentActivityMockup />
  }
}

// Modal "+ Ajouter un widget" (2026-08-06, retour Julien après correction de trajectoire — voir
// l'en-tête de DashboardWidgetGrid.tsx) — remplace l'ancien panneau par zone (`addWidget` dans
// DashboardWidgetGrid.tsx, supprimé) qui ne proposait que les widgets de SA zone, bug signalé par
// Julien ("Impossible de rajouter des widgets de l'autre zone"). Ouverte depuis un unique bouton
// dans le Header (DashboardPage.tsx), visible en mode Réorganisation — chaque carte propose
// explicitement les 2 zones cibles (menu `AddZoneMenu` ci-dessus), quel que soit le `scope` par
// défaut du widget dans le catalogue : c'est le seul moyen de placer un widget en dehors de sa
// zone par défaut (voir `DashboardWidgetPlacement.scopeOverride` dans dashboardWidgets.ts).
//
// Mockups plutôt que vignettes texte (2026-08-06, retour Julien : "je préfère des mockups des
// différents widgets") — chaque carte montre une miniature fidèle au rendu réel du widget
// (`WidgetPreview` ci-dessus, valeurs figées) au lieu d'une simple étiquette, pour reconnaître le
// widget visuellement avant de l'ajouter.
//
// Bouton "Ajouter" + menu déroulant plutôt que 2 boutons pleine largeur empilés (2026-08-06,
// retour Julien : "les boutons... prennent beaucoup trop de place") — `AddZoneMenu` en haut à
// droite de chaque carte, à côté du titre/légende, réduit nettement la hauteur de la carte.
//
// Reste ouverte après un ajout plutôt que de se fermer (`onAdd` ne ferme pas la modal) — cohérent
// avec la demande "possibilité de rajouter plusieurs fois des widgets" : pouvoir en poser
// plusieurs à la suite sans rouvrir la modal à chaque fois. Un toast confirme chaque ajout (voir
// `addWidgetToZone` dans DashboardPage.tsx), seul signal visible une fois la carte repliée.
export function AddWidgetModal({ onAdd, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" data-testid="dashboard-add-widget-modal">
        <div className="modal-header">
          <h2 className="modal-title">Ajouter un widget</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Choisissez la zone dans laquelle poser le widget. Un même widget peut être ajouté plusieurs fois.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {DASHBOARD_WIDGET_CATALOG.map(def => (
              <div
                key={def.id}
                data-testid={`add-widget-card-${def.id}`}
                style={{
                  border: '1px solid var(--border)', borderRadius: 10, padding: 14,
                  display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)',
                }}
              >
                <div style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <WidgetPreview id={def.id} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{def.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Par défaut : {DASHBOARD_ZONE_LABELS[widgetScope(def.id)]}
                    </div>
                  </div>
                  <AddZoneMenu id={def.id} onAdd={zone => onAdd(def.id, zone)} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
