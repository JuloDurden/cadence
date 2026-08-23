import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DASHBOARD_WIDGET_CATALOG, DASHBOARD_ZONE_LABELS, widgetScope } from '../../data/dashboardWidgets'
import type { DashboardWidgetDef, DashboardWidgetId, DashboardWidgetScope, DashboardWidgetSize } from '../../data/dashboardWidgets'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useModalFocus } from '../../hooks/useModalFocus'

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
// Même tracé que Header.tsx (icône de recherche du Header) — repris tel quel pour rester cohérent.
const ICO_SEARCH = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'

// Icônes Lucide (2026-08-07, retour Julien : "certaines vignettes se ressemblent un peu trop") —
// tracés copiés depuis le paquet `lucide-static` (mêmes proportions 24×24, `stroke-width: 2`,
// `stroke-linecap/linejoin: round` que le reste des icônes de l'app, voir `Svg` ci-dessus), pas
// dessinés à la main. `rotate-ccw-clock` (Activité récente) et `circle-user-round` (Absences du
// sprint, remplace les ronds de couleur unis) distinguent 2 vignettes de composition quasi
// identique (avatar rond + 2 barres de texte) ; `list-checks` (Actions de rétro), `shield-x`
// (Items bloqués par dépendance) et `thumbs-up` (Prêt pour planification) distinguent 3 vignettes
// de composition quasi identique (2 lignes texte + badge).
const ICO_ROTATE_CCW_CLOCK = '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>'
const ICO_CIRCLE_USER_ROUND = '<path d="M17.925 20.056a6 6 0 0 0-11.851.001"/><circle cx="12" cy="11" r="4"/><circle cx="12" cy="12" r="10"/>'
const ICO_LIST_CHECKS = '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>'
const ICO_SHIELD_X = '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m14.5 9.5-5 5"/><path d="m9.5 9.5 5 5"/>'
const ICO_THUMBS_UP = '<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/>'

// Watermark discret en coin de vignette (2026-08-07) — une icône par widget dont la composition
// visuelle se confond avec une autre (voir commentaire des tracés ci-dessus). Pas de fond ni de
// cercle, juste l'icône en très faible opacité derrière/à côté du contenu de la vignette : sert de
// silhouette reconnaissable, pas un vrai élément d'interface.
const MOCKUP_WATERMARK_ICON: Partial<Record<DashboardWidgetId, string>> = {
  'recent-activity': ICO_ROTATE_CCW_CLOCK,
  'retro-actions': ICO_LIST_CHECKS,
  'blocked-items': ICO_SHIELD_X,
  'ready-for-planning': ICO_THUMBS_UP,
}

// Bouton "Ajouter" + menu déroulant de choix de zone (2026-08-06, retour Julien : "les boutons...
// prennent beaucoup trop de place" — remplace les 2 boutons pleine largeur empilés par un seul
// bouton compact, placé à droite du titre/légende plutôt qu'en dessous). Fermeture au clic
// extérieur, même mécanique que les menus de NNLToolbar.tsx (`mousedown` sur `window`).
//
// Ouverture vers le haut si besoin (2026-08-06, retour Julien : "le dropdown... est masqué quand
// on clique dessus pour un widget tout en bas de la liste") — un simple z-index ne suffit pas : la
// carte est dans `.modal-body` (`overflow-y: auto`), donc un menu qui déborde sous le bas visible
// de cette zone scrollable est rogné quel que soit son z-index, pas caché derrière le footer. On
// mesure l'espace restant sous le bouton à l'ouverture et on bascule le menu au-dessus (`bottom:
// '100%'`) s'il n'y a pas la place pour ses ~2 lignes en dessous.
const MENU_HEIGHT_ESTIMATE = 84
function AddZoneMenu({ id, onAdd }: { id: DashboardWidgetId; onAdd: (zone: DashboardWidgetScope) => void }) {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function toggle() {
    if (!open && ref.current) {
      // La limite réelle n'est pas le bas de la fenêtre mais le bas de `.modal-body` (2026-08-06,
      // retour Julien : "ce n'est toujours pas bon" — la 1ère version comparait à
      // `window.innerHeight`, or la modal ne remplit pas toute la fenêtre, donc ce calcul jugeait
      // à tort qu'il y avait de la place en dessous alors que `.modal-body` (overflow-y: auto)
      // rogne le menu bien avant le bord de la fenêtre).
      const rect = ref.current.getBoundingClientRect()
      const scrollBounds = ref.current.closest('.modal-body')?.getBoundingClientRect()
      const limit = scrollBounds ? scrollBounds.bottom : window.innerHeight
      setOpenUp(limit - rect.bottom < MENU_HEIGHT_ESTIMATE + 12)
    }
    setOpen(o => !o)
  }

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
        onClick={toggle}
      >
        <Svg d={ICO_PLUS} size={12} /> Ajouter <Svg d={ICO_CHEVRON_DOWN} size={11} />
      </button>
      {open && (
        <div
          data-testid={`add-widget-${id}-menu`}
          style={{
            position: 'absolute', right: 0, zIndex: 20,
            ...(openUp ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
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

// Mini graphique multi-courbes (team-velocity) — 3 courbes de couleurs distinctes, mêmes teintes
// que MEMBER_COLORS dans TeamVelocityChart.tsx, tracés figés plausibles façon "sprint velocity".
function TeamVelocityMockup() {
  const lines = [
    { color: '#6366f1', points: '4,30 30,20 55,26 78,10 96,16' },
    { color: '#f59e0b', points: '4,40 30,36 55,18 78,28 96,8' },
    { color: '#10b981', points: '4,20 30,32 55,34 78,22 96,30' },
  ]
  return (
    <svg viewBox="0 0 100 48" width="100%" height={64} preserveAspectRatio="none">
      {lines.map((l, i) => (
        <polyline key={i} points={l.points} stroke={l.color} strokeWidth="2" fill="none" />
      ))}
    </svg>
  )
}

// Mini jauge 3 segments (sprint-health) — mêmes couleurs que SprintHealthCard.tsx (À faire/En
// cours/Terminé), proportions figées plausibles.
function SprintHealthMockup() {
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 8px' }}>
      <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: '28%', background: 'var(--text-faint)' }} />
        <div style={{ width: '16%', background: '#ff9500' }} />
        <div style={{ width: '56%', background: '#34c759' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        <div style={{ height: 5, width: 22, background: 'var(--border)', borderRadius: 3 }} />
        <div style={{ height: 5, width: 22, background: 'var(--border)', borderRadius: 3 }} />
        <div style={{ height: 5, width: 22, background: 'var(--border)', borderRadius: 3 }} />
      </div>
    </div>
  )
}

// Mini liste d'avatars (sprint-absences) — 2 lignes, avatar rond + 2 barres de texte (nom/période),
// même composition que RecentActivityMockup, couleurs de SprintAbsencesCard.tsx. Avatar en icône
// `circle-user-round` teintée (2026-08-07, retour Julien : "les ronds de couleur pourraient être
// remplacés par cet icône, avec les mêmes couleurs") plutôt qu'un simple disque plein, pour se
// distinguer d'Activité récente (composition quasi identique sinon) — `color` sur le conteneur
// teinte l'icône via `stroke="currentColor"` (voir `Svg`), mêmes couleurs qu'avant.
function SprintAbsencesMockup() {
  const rows = [{ c: '#f59e0b' }, { c: '#3b82f6' }]
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 8px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, color: r.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Svg d={ICO_CIRCLE_USER_ROUND} size={16} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <div style={{ height: 5, width: '55%', background: 'var(--text-faint)', borderRadius: 3 }} />
            <div style={{ height: 4, width: '35%', background: 'var(--border)', borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Mini liste de barres 3 segments (epic-progress) — 3 lignes, barre à faire/en cours/terminé,
// mêmes couleurs qu'EpicProgressCard.tsx.
function EpicProgressMockup() {
  const rows = [{ todo: 15, doing: 15, done: 70 }, { todo: 40, doing: 25, done: 35 }, { todo: 0, doing: 0, done: 100 }]
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 8px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', height: 8, borderRadius: 3, overflow: 'hidden' }}>
          {r.todo > 0 && <div style={{ width: `${r.todo}%`, background: 'var(--text-faint)' }} />}
          {r.doing > 0 && <div style={{ width: `${r.doing}%`, background: '#ff9500' }} />}
          {r.done > 0 && <div style={{ width: `${r.done}%`, background: '#34c759' }} />}
        </div>
      ))}
    </div>
  )
}

// Mini 3-colonnes datées (delivery-forecast) — Optimiste/Moyen/Pessimiste, valeur centrale mise en
// avant, mêmes proportions qu'EpicProgressCard.tsx/DeliveryForecastCard.tsx. Barre de plage en
// dégradé ajoutée (2026-08-07, retour Julien : "pourrait intégrer le dégradé de couleur pour
// différencier sa vignette") — même dégradé exact que la taille L réelle du widget
// (DeliveryForecastCard.tsx), pas une approximation.
function DeliveryForecastMockup() {
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
        <div style={{ height: 5, width: 20, background: 'var(--border)', borderRadius: 3 }} />
        <div style={{ height: 14, width: 26, background: 'var(--primary)', borderRadius: 3, opacity: .85 }} />
        <div style={{ height: 5, width: 20, background: 'var(--border)', borderRadius: 3 }} />
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'linear-gradient(to right, #34c759, var(--primary) 50%, #ff9500)' }} />
    </div>
  )
}

// Mini graphique multi-courbes (client-view) — même mockup que team-velocity mais avec des couleurs
// de client plausibles (bleu/vert/violet, cohérent avec `Client.color` réel), pas les teintes indigo
// génériques utilisées ailleurs dans cette modal.
function ClientViewMockup() {
  const lines = [
    { color: '#1d4ed8', points: '4,26 30,20 55,14 78,8 96,6' },
    { color: '#15803d', points: '4,34 30,32 55,36 78,30 96,32' },
    { color: '#7c3aed', points: '4,18 30,28 55,24 78,34 96,26' },
  ]
  return (
    <svg viewBox="0 0 100 48" width="100%" height={64} preserveAspectRatio="none">
      {lines.map((l, i) => (
        <polyline key={i} points={l.points} stroke={l.color} strokeWidth="2" fill="none" />
      ))}
    </svg>
  )
}

// Mini liste texte (retro-actions) — 2 lignes, prénom muted + barre de texte + badge, même esprit
// que RecentActivityMockup mais sans avatar (voir RetroActionsCard.tsx).
function RetroActionsMockup() {
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 8px' }}>
      {[0, 1].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ height: 5, width: '60%', background: 'var(--text-faint)', borderRadius: 3 }} />
          <div style={{ height: 10, width: 30, background: i === 0 ? '#ff3b30' : 'var(--border)', opacity: i === 0 ? .3 : 1, borderRadius: 5, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}

function BlockedItemsMockup() {
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 8px' }}>
      {[0, 1].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ height: 5, width: '55%', background: 'var(--text-faint)', borderRadius: 3 }} />
          <div style={{ height: 10, width: 46, background: '#ff3b30', opacity: .18, borderRadius: 5, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}

function ReadyForPlanningMockup() {
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 8px' }}>
      {[0, 1].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ height: 5, width: '55%', background: 'var(--text-faint)', borderRadius: 3 }} />
          <div style={{ height: 10, width: 30, background: 'var(--border)', borderRadius: 5, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}

function MemberWorkloadMockup() {
  return (
    <div style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 8px' }}>
      {[{ w: '100%', c: 'var(--danger)' }, { w: '55%', c: 'var(--text-faint)' }].map((row, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: row.w, background: row.c }} />
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
    case 'team-velocity':
      return <TeamVelocityMockup />
    case 'sprint-health':
      return <SprintHealthMockup />
    case 'sprint-absences':
      return <SprintAbsencesMockup />
    case 'epic-progress':
      return <EpicProgressMockup />
    case 'delivery-forecast':
      return <DeliveryForecastMockup />
    case 'client-view':
      return <ClientViewMockup />
    case 'retro-actions':
      return <RetroActionsMockup />
    case 'blocked-items':
      return <BlockedItemsMockup />
    case 'ready-for-planning':
      return <ReadyForPlanningMockup />
    case 'member-workload':
      return <MemberWorkloadMockup />
  }
}

// Badges de tailles disponibles (2026-08-07, retour Julien : "rajouter des badges de tailles
// disponibles dans chaque card de widget, placé dans le coin haut droit") — une pastille par taille
// autorisée (`def.allowedSizes`), pas juste le nombre : utile pour filtrer visuellement au premier
// coup d'œil, avant même d'ouvrir le menu "Ajouter" (qui ne montre pas les tailles).
function SizeBadges({ sizes }: { sizes: DashboardWidgetSize[] }) {
  return (
    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 3 }}>
      {sizes.map(s => (
        <span
          key={s}
          style={{
            fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 5, padding: '1px 4px', lineHeight: 1.4,
          }}
        >
          {s}
        </span>
      ))}
    </div>
  )
}

// Cadre commun d'une vignette (2026-08-07) — regroupe la miniature (`WidgetPreview`), les badges de
// taille (coin haut droit) et l'icône de différenciation (seulement pour les quelques widgets qui
// en ont une, voir `MOCKUP_WATERMARK_ICON`), plutôt que de dupliquer ce montage dans chaque carte de
// la grille.
//
// Icône en vrai élément de mise en page, pas en filigrane (2026-08-07, retour Julien après un 1er
// essai en petit filigrane translucide posé en coin : "je les voyais plus gros, hauteur adaptée à
// la vignette, centrés verticalement, alignés à gauche avec la représentation du widget sur la
// droite, couleur plus visible") — colonne de gauche à la hauteur pleine de la vignette (64px),
// icône centrée dedans, `var(--text-muted)` en pleine opacité (plus l'estompage à .5 du 1er essai) ;
// la miniature du widget occupe le reste de la largeur à droite plutôt que de se superposer. Marge
// à gauche de l'icône ajoutée (2026-08-07, 2e retour Julien) — 8px, la même valeur que le padding
// horizontal interne des mockups (`padding: '0 8px'`, ex. RecentActivityMockup/RetroActionsMockup),
// pour que l'icône respire du bord de la vignette autant que son contenu respire de l'icône.
function MockupFrame({ def }: { def: DashboardWidgetDef }) {
  const watermark = MOCKUP_WATERMARK_ICON[def.id]
  return (
    <div style={{ position: 'relative' }}>
      {watermark ? (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flexShrink: 0, width: 40, height: 64, marginLeft: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Svg d={watermark} size={34} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <WidgetPreview id={def.id} />
          </div>
        </div>
      ) : (
        <WidgetPreview id={def.id} />
      )}
      <SizeBadges sizes={def.allowedSizes} />
    </div>
  )
}

const ALL_SIZES: DashboardWidgetSize[] = ['S', 'M', 'L', 'XL', 'XLP']

/** Retire les accents avant comparaison (2026-08-07) — recherche insensible aux accents autant qu'à
 *  la casse ("velocite" retrouve "Vélocité par membre"), plus tolérant qu'une simple `toLowerCase`
 *  pour des libellés très majoritairement en français. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

type SortMode = 'az' | 'za' | 'recent'

// Barre d'outils recherche/tri/filtres (2026-08-07, retour Julien : "étant donné que la modal
// propose pas loin de 20 widgets, il va falloir étoffer le choix") — catalogue passé à 18 entrées
// (voir dashboardWidgets.ts), plus assez grand pour justifier ces 3 aides de découverte, absentes
// jusqu'ici (défilement pur). Recherche sur le libellé uniquement (pas de description longue à
// chercher dedans) ; tri A→Z/Z→A (libellé) ou "Récents" (catalogue inversé — l'ordre du catalogue
// EST l'ordre chronologique d'ajout, chaque widget commente son propre rang au fil du fichier, voir
// dashboardWidgets.ts) ; filtres tailles (multi-sélection, un widget matche s'il propose AU MOINS
// une des tailles cochées) et zone par défaut (mono-sélection). Boutons `.btn.btn-secondary`
// existants, simplement stylés "actifs" par surcharge inline plutôt que d'introduire une nouvelle
// classe CSS de chip pour ce seul usage.
function ToolbarButton({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      data-testid={testId}
      onClick={onClick}
      style={{
        fontSize: 11, padding: '4px 9px',
        ...(active ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}),
      }}
    >
      {children}
    </button>
  )
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
//
// Recherche/tri/filtres (2026-08-07, retour Julien : "la modal propose pas loin de 20 widgets, il
// va falloir étoffer le choix") — état purement local à la modal (pas persisté, pas dans
// `state.settings`), réinitialisé à chaque ouverture : ce sont des aides de découverte ponctuelles,
// pas une préférence à retenir. Filtrent/trient `DASHBOARD_WIDGET_CATALOG` (`visible`, mémorisé via
// `useMemo`) avant le rendu de la grille, le reste du composant (cartes, `AddZoneMenu`) ne change
// pas. Voir `ToolbarButton`/`SizeBadges`/`MockupFrame` ci-dessus.
export function AddWidgetModal({ onAdd, onClose }: Props) {
  useEscapeToClose(onClose)
  const modalRef = useModalFocus<HTMLDivElement>()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('az')
  const [sizeFilter, setSizeFilter] = useState<Set<DashboardWidgetSize>>(new Set())
  const [zoneFilter, setZoneFilter] = useState<DashboardWidgetScope | 'all'>('all')

  function toggleSizeFilter(s: DashboardWidgetSize) {
    setSizeFilter(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  const visible = useMemo(() => {
    const q = normalize(search.trim())
    let list = DASHBOARD_WIDGET_CATALOG.filter(def => {
      if (q && !normalize(def.label).includes(q)) return false
      if (sizeFilter.size > 0 && !def.allowedSizes.some(s => sizeFilter.has(s))) return false
      if (zoneFilter !== 'all' && widgetScope(def.id) !== zoneFilter) return false
      return true
    })
    if (sort === 'az') list = [...list].sort((a, b) => a.label.localeCompare(b.label))
    else if (sort === 'za') list = [...list].sort((a, b) => b.label.localeCompare(a.label))
    else list = [...list].reverse()
    return list
  }, [search, sort, sizeFilter, zoneFilter])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" ref={modalRef} tabIndex={-1} data-testid="dashboard-add-widget-modal">
        <div className="modal-header">
          <h2 className="modal-title">Ajouter un widget</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Choisissez la zone dans laquelle poser le widget. Un même widget peut être ajouté plusieurs fois.
          </p>

          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
              <Svg d={ICO_SEARCH} size={14} />
            </span>
            <input
              className="form-input"
              style={{ paddingLeft: 30 }}
              placeholder="Rechercher un widget..."
              data-testid="add-widget-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)' }}>Trier :</span>
              <ToolbarButton testId="add-widget-sort-az" active={sort === 'az'} onClick={() => setSort('az')}>A→Z</ToolbarButton>
              <ToolbarButton testId="add-widget-sort-za" active={sort === 'za'} onClick={() => setSort('za')}>Z→A</ToolbarButton>
              <ToolbarButton testId="add-widget-sort-recent" active={sort === 'recent'} onClick={() => setSort('recent')}>Récents</ToolbarButton>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)' }}>Taille :</span>
              {ALL_SIZES.map(s => (
                <ToolbarButton key={s} testId={`add-widget-filter-size-${s}`} active={sizeFilter.has(s)} onClick={() => toggleSizeFilter(s)}>
                  {s}
                </ToolbarButton>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)' }}>Zone :</span>
              <ToolbarButton testId="add-widget-filter-zone-all" active={zoneFilter === 'all'} onClick={() => setZoneFilter('all')}>Toutes</ToolbarButton>
              <ToolbarButton testId="add-widget-filter-zone-sprint" active={zoneFilter === 'sprint'} onClick={() => setZoneFilter('sprint')}>
                {DASHBOARD_ZONE_LABELS.sprint}
              </ToolbarButton>
              <ToolbarButton testId="add-widget-filter-zone-product" active={zoneFilter === 'product'} onClick={() => setZoneFilter('product')}>
                {DASHBOARD_ZONE_LABELS.product}
              </ToolbarButton>
            </div>
          </div>

          {visible.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '24px 0' }} data-testid="add-widget-empty">
              Aucun widget ne correspond à ces critères.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {visible.map(def => (
                <div
                  key={def.id}
                  data-testid={`add-widget-card-${def.id}`}
                  style={{
                    border: '1px solid var(--border)', borderRadius: 10, padding: 14,
                    display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)',
                  }}
                >
                  <div style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <MockupFrame def={def} />
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
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
