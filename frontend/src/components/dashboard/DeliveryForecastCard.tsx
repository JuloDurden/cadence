import type { HierarchyNode, Item, KanbanCol, Sprint } from '../../types'
import type { DashboardWidgetSize } from '../../data/dashboardWidgets'
import { isItemDone } from '../../utils/status'
import { getSprintSP } from '../../utils/hierarchyScore'
import { fmtDateShort, addDaysLocal } from '../../utils/dates'

interface Props {
  sprints: Sprint[]
  items: Item[]
  hierarchyNodes: HierarchyNode[]
  kanbanCols: KanbanCol[]
  currentSprint: Sprint | undefined
  today: string
  size: DashboardWidgetSize
}

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a + 'T00:00:00')
  const d2 = new Date(b + 'T00:00:00')
  return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

// Widget "Forecast de livraison" (2026-08-07, `docs/roadmap-v1.md` : "Forecast de livraison basé
// sur la vélocité moyenne — pas encore fait") — 13e widget Dashboard, pas de face cachée de
// réglages (aucun réglage demandé, comme sprint-absences).
//
// Pas Monte Carlo (voir échange avec Julien avant la maquette) : l'historique de sprints clôturés
// de ce prototype est trop court pour qu'une simulation ait un sens statistique, et une jauge à
// percentiles n'a pas sa place dans une tuile de Dashboard consultée d'un coup d'œil. 3 dates
// simples à la place : Optimiste (vélocité max observée), Moyen (vélocité moyenne, même calcul que
// `avgVelocityAll` dans DashboardPage.tsx), Pessimiste (vélocité min observée) — mêmes sprints
// clôturés que "Vélocité moyenne"/"Graphique de vélocité", `s.velocitySnapshot` en repli sur
// `getSprintSP().done` (Epic assigné au sprint mais pas encore découpé en US compté quand même).
//
// Pas de détail vélocité (moyenne/min/max en chiffres, historique en mini-graphique) sur ce widget
// (retour Julien : "on a déjà un widget de vélocité donc inutile de rajouter cela") — seulement les
// 3 dates projetées, qui EN DÉCOULENT sans dupliquer l'affichage des widgets dédiés.
//
// SP restants = tout le backlog non terminé (`items`, pas de distinction Epic/Initiative — même
// convention "simple" que kpi-done : `state.items.length` comme total, pas un calcul conscient de
// la hiérarchie). Date projetée depuis la fin du sprint en cours (ou aujourd'hui s'il n'y en a pas),
// en ajoutant N sprints à la durée moyenne d'un sprint (`avgSprintLengthDays`, sur TOUS les sprints
// connus, pas seulement les clôturés — c'est une donnée de planification, pas de performance).
export function DeliveryForecastCard({ sprints, items, hierarchyNodes, kanbanCols, currentSprint, today, size }: Props) {
  const remainingSP = items.filter(i => !isItemDone(i, kanbanCols)).reduce((sum, i) => sum + i.sp, 0)
  const totalSP = items.reduce((sum, i) => sum + i.sp, 0)

  const closedSprints = sprints.filter(s => s.closed)
  const velocities = closedSprints.map(s => s.velocitySnapshot ?? getSprintSP(s.id, items, hierarchyNodes, kanbanCols).done)

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: size === 'M' ? '14px 18px' : '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 2 }}>Forecast de livraison</div>
      {remainingSP <= 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          Tout le backlog est terminé
        </div>
      ) : velocities.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          Pas assez d'historique pour un forecast
          <br />(aucun sprint clôturé)
        </div>
      ) : (
        <ForecastBody
          remainingSP={remainingSP} totalSP={totalSP} velocities={velocities}
          sprints={sprints} currentSprint={currentSprint} today={today} size={size}
        />
      )}
    </div>
  )

  return front
}

function ForecastBody({ remainingSP, totalSP, velocities, sprints, currentSprint, today, size }: {
  remainingSP: number; totalSP: number; velocities: number[]
  sprints: Sprint[]; currentSprint: Sprint | undefined; today: string; size: DashboardWidgetSize
}) {
  const avgVelocity = velocities.reduce((s, v) => s + v, 0) / velocities.length
  const maxVelocity = Math.max(...velocities)
  const minVelocity = Math.min(...velocities)

  const avgSprintLengthDays = sprints.length > 0
    ? Math.max(1, Math.round(sprints.reduce((sum, s) => sum + daysBetween(s.startDate, s.endDate) + 1, 0) / sprints.length))
    : 14
  const startPoint = currentSprint ? currentSprint.endDate : today

  function project(velocity: number): { date: string; sprintsNeeded: number } | null {
    if (velocity <= 0) return null
    const sprintsNeeded = Math.ceil(remainingSP / velocity)
    return { date: addDaysLocal(startPoint, sprintsNeeded * avgSprintLengthDays), sprintsNeeded }
  }

  const optimistic = project(maxVelocity)
  const average = project(avgVelocity)
  const pessimistic = project(minVelocity)

  const compact = size === 'M'

  return (
    <>
      <div style={{ fontSize: compact ? 10 : 11, color: 'var(--text-secondary)', marginBottom: compact ? 10 : 16 }}>
        {remainingSP} SP restants sur {totalSP}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end' }}>
          <ForecastColumn label="Optimiste" result={optimistic} compact={compact} emphasize={false} />
          <ForecastColumn label="Moyen" result={average} compact={compact} emphasize />
          <ForecastColumn label="Pessimiste" result={pessimistic} compact={compact} emphasize={false} />
        </div>
        {!compact && (
          <div style={{ height: 6, borderRadius: 3, background: 'linear-gradient(to right, #34c759, var(--primary) 50%, #ff9500)' }} />
        )}
      </div>
    </>
  )
}

function ForecastColumn({ label, result, compact, emphasize }: {
  label: string; result: { date: string; sprintsNeeded: number } | null; compact: boolean; emphasize: boolean
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: compact ? 10 : 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      {result === null ? (
        <div style={{ fontSize: compact ? 14 : 16, color: 'var(--text-muted)' }}>—</div>
      ) : emphasize ? (
        <div style={{ fontFamily: 'var(--font-hero)', fontSize: compact ? 22 : 28, fontWeight: 800, color: 'var(--primary)', lineHeight: .8 }}>
          {fmtDateShort(result.date)}
        </div>
      ) : (
        <div style={{ fontSize: compact ? 14 : 16, fontWeight: 500 }}>{fmtDateShort(result.date)}</div>
      )}
      {!compact && result !== null && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {result.sprintsNeeded > 1 ? `${result.sprintsNeeded} sprints` : '1 sprint'}
        </div>
      )}
    </div>
  )
}
