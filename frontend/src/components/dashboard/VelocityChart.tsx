import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { Sprint, Item, HierarchyNode, KanbanCol } from '../../types'
import type { DashboardWidgetSize } from '../../data/dashboardWidgets'
import { getSprintSP } from '../../utils/hierarchyScore'
import { FlipCard } from './FlipCard'

interface Props {
  sprints: Sprint[]
  items: Item[]
  hierarchyNodes: HierarchyNode[]
  kanbanCols: KanbanCol[]
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio/case à cocher pour éviter qu'un `name` HTML partagé
   *  fasse se marcher dessus 2 instances de ce widget). */
  instanceKey: string
  showPlanned: boolean
  onChangeShowPlanned: (next: boolean) => void
  showTrend: boolean
  onChangeShowTrend: (next: boolean) => void
  /** Taille actuelle de la tuile (M/L/XL, voir dashboardWidgets.ts) — le graphique s'adapte à
   *  l'espace disponible plutôt que de garder une hauteur fixe quelle que soit la taille. */
  size: DashboardWidgetSize
}

// Widget "Graphique de vélocité" (2026-08-06) — 2e widget avec une face cachée de réglages, même
// mécanique que SprintProgressCard.tsx (FlipCard.tsx, générique). 2 réglages indépendants :
// afficher les barres "Planifié" en plus de "Vélocité" (radio, comportement historique par défaut),
// et afficher une courbe de progression par-dessus les barres (case à cocher, off par défaut). Passé
// de `BarChart` à `ComposedChart` (même API recharts) pour pouvoir combiner `Bar` et `Line`.
//
// Adapté à la taille (2026-08-06, suite) — M/L/XL autorisées (voir dashboardWidgets.ts). L et XL ont
// la même hauteur (356px, seule la largeur change, voir WIDGET_SIZE_DIMENSIONS) donc un seul palier
// de compacité suffit : `compact` (M, tuile courte, 160px) vs détaillé (L/XL, tuile haute). En
// compact, la hauteur du graphique se réduit et les graduations numériques de l'axe SP disparaissent
// (juste assez de place pour les barres + l'intitulé des sprints) ; en détaillé, les graduations
// s'affichent. Hauteurs approximées à partir de la tuile (padding 18px haut/bas + titre ≈ 65px de
// marge fixe) plutôt que mesurées dynamiquement — pas de ResizeObserver, cohérent avec le reste du
// Dashboard qui n'a jamais de taille "libre".
export function VelocityChart({ sprints, items, hierarchyNodes, kanbanCols, editable, instanceKey, showPlanned, onChangeShowPlanned, showTrend, onChangeShowTrend, size }: Props) {
  // `getSprintSP()` (2026-08-06, retour Julien : "les autres widgets... semblent prendre en compte
  // seulement les items") plutôt qu'un simple filtre `items.filter(i => i.sprintId === sp.id)` — un
  // Epic assigné à un sprint mais pas encore découpé en US comptait pour 0 SP avant ce correctif
  // (voir le commentaire d'en-tête de `getSprintSP()` dans hierarchyScore.ts).
  const data = sprints.map(sp => {
    const { total: planned, done } = getSprintSP(sp.id, items, hierarchyNodes, kanbanCols)
    const velocity = sp.closed ? (sp.velocitySnapshot ?? done) : done
    return { name: `S${sp.number}`, velocity, planned, closed: sp.closed }
  })

  const avg = data.filter(d => d.closed && d.velocity > 0).reduce((s, d, _, a) => s + d.velocity / a.length, 0)
  const compact = size === 'M'
  const chartHeight = compact ? 90 : 270

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box' }}>
      <div className="dash-widget-title" style={{ marginBottom: 18 }}>Vélocité par sprint</div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis
            tick={compact ? false : { fontSize: 11 }}
            width={compact ? 20 : 34}
            label={{ value: 'SP', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: 'var(--text-muted)' } }}
          />
          <Tooltip formatter={((v: unknown, n: string): [string, string] => [String(v) + ' SP', n === 'velocity' ? 'Vélocité' : n === 'planned' ? 'Planifié' : 'Tendance']) as never} />
          {/* `position: 'right'` (avant 2026-08-06) plaçait le label EN DEHORS de la zone de tracé, à
              droite de l'axe — avec seulement 8px de marge droite sur le graphique (`margin.right`),
              il sortait du SVG et ne s'affichait jamais dans le Dashboard réel (invisible en dehors
              d'un aperçu qui ne reproduisait pas cette contrainte). `insideTopRight` le repositionne
              à l'intérieur de la zone de tracé, au-dessus du trait, aligné à droite. */}
          {avg > 0 && <ReferenceLine y={avg} stroke="#ff9500" strokeDasharray="4 4" label={{ value: `Moy. ${Math.round(avg)}`, fontSize: 10, fill: '#ff9500', position: 'insideTopRight' }} />}
          {showPlanned && <Bar dataKey="planned" fill="var(--text-faint)" radius={[3, 3, 0, 0]} name="planned" />}
          <Bar dataKey="velocity" fill="var(--primary)" radius={[3, 3, 0, 0]} name="velocity" />
          {showTrend && <Line type="monotone" dataKey="velocity" stroke="#34c759" strokeWidth={2} dot={{ r: 3 }} name="trend" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 18 }}>Vélocité par sprint</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`velocity-display-${instanceKey}`}
              data-testid={`dashboard-widget-velocity-with-planned-${instanceKey}`}
              checked={showPlanned}
              onChange={() => onChangeShowPlanned(true)}
            />
            Vélocité + Planifié
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`velocity-display-${instanceKey}`}
              data-testid={`dashboard-widget-velocity-only-${instanceKey}`}
              checked={!showPlanned}
              onChange={() => onChangeShowPlanned(false)}
            />
            Vélocité
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            data-testid={`dashboard-widget-velocity-trend-${instanceKey}`}
            checked={showTrend}
            onChange={e => onChangeShowTrend(e.target.checked)}
          />
          Courbe de progression
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
