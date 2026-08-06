import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import type { Sprint, Item, HierarchyNode, KanbanCol } from '../../types'
import type { BurndownDisplayMode } from '../../data/dashboardWidgets'
import { getSprintSP } from '../../utils/hierarchyScore'
import { FlipCard } from './FlipCard'

interface Props {
  sprint: Sprint
  items: Item[]
  hierarchyNodes: HierarchyNode[]
  kanbanCols: KanbanCol[]
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio/case à cocher pour éviter qu'un `name` HTML partagé
   *  fasse se marcher dessus 2 instances de ce widget). */
  instanceKey: string
  mode: BurndownDisplayMode
  onChangeMode: (next: BurndownDisplayMode) => void
  showToday: boolean
  onChangeShowToday: (next: boolean) => void
}

// Widget "Burndown" (2026-08-06) — 3e widget avec une face cachée de réglages (FlipCard.tsx,
// générique, voir VelocityChart.tsx pour le 2e cas). 2 réglages : burndown ('remaining', SP restants
// décroissant vers 0, défaut — comportement historique) ou burnup ('done', SP terminés croissant
// vers le total) en radio, et un repère "aujourd'hui" en case à cocher.
// La ligne idéale reprend la couleur des barres "Planifié" de VelocityChart.tsx (`var(--text-faint)`,
// au lieu de `var(--border)`) pour rester cohérente entre les 2 graphiques. Le texte "SP
// terminés/restants", jusque-là au-dessus du graphique, passe en dessous avec le même style que la
// légende de pourcentage de SprintProgressCard.tsx (11px, `var(--text-muted)`) — pas celui de
// `dashboard-widget-sprint-total` (le "/{totalSP}" en police héros), rectifié après un premier essai
// qui prenait le mauvais span en référence. Le repère "aujourd'hui" reprend la couleur de la ligne
// de moyenne de VelocityChart.tsx (`#ff9500`), même repère visuel "valeur de référence" entre les
// 2 graphiques.
export function BurndownChart({ sprint, items, hierarchyNodes, kanbanCols, editable, instanceKey, mode, onChangeMode, showToday, onChangeShowToday }: Props) {
  // `getSprintSP()` (2026-08-06, retour Julien : "les autres widgets... semblent prendre en compte
  // seulement les items") plutôt qu'un simple filtre `items.filter(i => i.sprintId === sprint.id)`
  // — un Epic assigné au sprint mais pas encore découpé en US comptait pour 0 SP avant ce correctif
  // (voir le commentaire d'en-tête de `getSprintSP()` dans hierarchyScore.ts).
  const { total: totalSP, done: doneSP } = getSprintSP(sprint.id, items, hierarchyNodes, kanbanCols)

  const start = new Date(sprint.startDate)
  const end = new Date(sprint.endDate)
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  const today = new Date()
  const daysPassed = Math.min(totalDays, Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000)))

  // Ligne idéale : de totalSP à 0 sur totalDays jours (SP restants)
  // Ligne réelle : on simule une progression jusqu'à aujourd'hui
  const data = Array.from({ length: totalDays }, (_, i) => {
    const ideal = Math.round(totalSP - (totalSP / (totalDays - 1)) * i)
    let actual: number | undefined
    if (i <= daysPassed) {
      // Simulation : prorata avec les items done actuels
      const progress = daysPassed > 0 ? doneSP * (i / daysPassed) : 0
      actual = Math.round(Math.max(0, totalSP - progress))
    }
    return { day: `J${i + 1}`, ideal, actual }
  })

  // Burnup : mêmes trajectoires, juste retournées (SP restants -> SP terminés) plutôt que
  // recalculées — une seule source de vérité pour la progression du sprint.
  const chartData = mode === 'done'
    ? data.map(d => ({ day: d.day, ideal: totalSP - d.ideal, actual: d.actual === undefined ? undefined : totalSP - d.actual }))
    : data

  const todayLabel = `J${daysPassed + 1}`

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box' }}>
      <div className="dash-widget-title" style={{ marginBottom: 10 }}>Burndown — Sprint {sprint.number}</div>
      <ResponsiveContainer width="100%" height={270}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={1} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={((v: unknown, n: string) => [v + ' SP', n === 'ideal' ? 'Idéal' : 'Réel']) as never} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          {showToday && daysPassed < totalDays && (
            <ReferenceLine x={todayLabel} stroke="#ff9500" strokeDasharray="4 4" label={{ value: "Aujourd'hui", fontSize: 10, fill: '#ff9500', position: 'top' }} />
          )}
          <Line type="monotone" dataKey="ideal" stroke="var(--text-faint)" strokeDasharray="4 4" dot={false} name="ideal" strokeWidth={2} />
          <Line type="monotone" dataKey="actual" stroke="var(--primary)" dot={false} name="actual" strokeWidth={2} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
        {doneSP}/{totalSP} SP terminés · {totalSP - doneSP} SP restants
      </div>
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 18 }}>Burndown — Sprint {sprint.number}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`burndown-mode-${instanceKey}`}
              data-testid={`dashboard-widget-burndown-remaining-${instanceKey}`}
              checked={mode === 'remaining'}
              onChange={() => onChangeMode('remaining')}
            />
            Burndown
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`burndown-mode-${instanceKey}`}
              data-testid={`dashboard-widget-burndown-done-${instanceKey}`}
              checked={mode === 'done'}
              onChange={() => onChangeMode('done')}
            />
            Burnup
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            data-testid={`dashboard-widget-burndown-today-${instanceKey}`}
            checked={showToday}
            onChange={e => onChangeShowToday(e.target.checked)}
          />
          Repère "aujourd'hui"
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
