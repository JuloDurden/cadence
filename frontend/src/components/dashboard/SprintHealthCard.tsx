import type { Absence, HierarchyNode, Item, KanbanCol, Sprint, TeamMember } from '../../types'
import type { SprintHealthMetric } from '../../data/dashboardWidgets'
import { isItemDone } from '../../utils/status'
import { getHierarchyNodeSP } from '../../utils/hierarchyScore'
import { effectiveCapacity } from '../../utils/sprintCapacity'
import { FlipCard } from './FlipCard'

interface Props {
  sprint: Sprint | undefined
  items: Item[]
  hierarchyNodes: HierarchyNode[]
  kanbanCols: KanbanCol[]
  team: TeamMember[]
  absences: Absence[]
  today: string
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget). */
  instanceKey: string
  metric: SprintHealthMetric
  onChangeMetric: (next: SprintHealthMetric) => void
}

interface Buckets { done: number; doing: number; todo: number }

/** Classe une colonne Kanban dans l'un des 3 segments de la jauge — généralise à n'importe quel
 *  jeu de colonnes configuré (voir le commentaire de `SprintHealthMetric` dans dashboardWidgets.ts)
 *  plutôt que de coder en dur des ids de statut ('todo', 'doing'...). Statut inconnu (ne devrait pas
 *  arriver) : classé "à faire" par défaut, l'hypothèse la moins avancée. */
function statusBucket(status: string, kanbanCols: KanbanCol[]): keyof Buckets {
  const col = kanbanCols.find(c => c.id === status)
  if (col?.isDone) return 'done'
  if (col?.isDefault) return 'todo'
  return col ? 'doing' : 'todo'
}

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a + 'T00:00:00')
  const d2 = new Date(b + 'T00:00:00')
  return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

/** Jauge en Story Points — même angle mort déjà corrigé sur `getSprintSP()` (Epic assigné au sprint
 *  via son propre champ, pas encore découpé en US, doit quand même compter) mais ventilé en 3
 *  segments Terminé/En cours/À faire au lieu de fait/total. Quand un Epic a À LA FOIS un score
 *  arbitraire ET des US dans ce sprint, la jauge privilégie la somme réelle de ses US (statut par
 *  statut) plutôt que le score arbitraire — nécessaire pour que les 3 segments s'additionnent
 *  exactement à la largeur de la barre ; seule différence avec `getSprintSP()`, cas rare. */
function computeSPBuckets(sprintId: string, items: Item[], hierarchyNodes: HierarchyNode[], kanbanCols: KanbanCol[]): Buckets {
  const sprintItems = items.filter(i => i.sprintId === sprintId)
  const epicsInSprint = hierarchyNodes.filter(n => n.level === 'epic' && n.sprintId === sprintId)
  const epicIds = new Set(epicsInSprint.map(e => e.id))
  const buckets: Buckets = { done: 0, doing: 0, todo: 0 }

  for (const epic of epicsInSprint) {
    const epicItems = sprintItems.filter(i => i.epicId === epic.id)
    if (epicItems.length > 0) {
      for (const item of epicItems) buckets[statusBucket(item.status, kanbanCols)] += item.sp
    } else {
      const epicSP = getHierarchyNodeSP(epic, [])
      buckets[statusBucket(epic.status ?? '', kanbanCols)] += epicSP
    }
  }

  const directItems = sprintItems.filter(i => !i.epicId || !epicIds.has(i.epicId))
  for (const item of directItems) buckets[statusBucket(item.status, kanbanCols)] += item.sp

  return buckets
}

/** Jauge en nombre d'US (`Item`) du sprint — chacune classée individuellement selon son propre
 *  statut, comptée pour 1 quel que soit son SP. Comptage simple plutôt qu'une ventilation par
 *  Epic/Initiative (2026-08-06, retour Julien après le 1er essai : "le réglage Epic/Initiative
 *  traité n'est pas assez souple, retournons au nombre d'items") — pas d'agrégation, pas de notion
 *  de hiérarchie ici, contrairement à `computeSPBuckets`. */
function computeItemCountBuckets(sprintId: string, items: Item[], kanbanCols: KanbanCol[]): Buckets {
  const buckets: Buckets = { done: 0, doing: 0, todo: 0 }
  for (const item of items) {
    if (item.sprintId !== sprintId) continue
    buckets[statusBucket(item.status, kanbanCols)]++
  }
  return buckets
}

// Widget "Santé du sprint" (2026-08-06, retour Julien, capture "Sprint Health Gadget" en référence
// de style) — 10e widget avec une face cachée de réglages (FlipCard.tsx). Jauge à 3 segments
// À faire/En cours/Terminé (voir `statusBucket`) plutôt que le simple fait/total des autres widgets
// KPI : c'est le point qui différencie ce widget de "Sprint actuel" (kpi-current-sprint), qui ne
// distingue pas "en cours" de "à faire".
//
// Réglage `metric` : bascule la jauge et le % de complétion entre Story Points (défaut,
// `computeSPBuckets`) et nombre d'US (`computeItemCountBuckets`) — voir le commentaire de
// `SprintHealthMetric` dans dashboardWidgets.ts pour le détail des règles de classement.
//
// 4 statistiques sous la jauge, pas 2 (retour Julien, widget passé en L/XL : "la taille mériterait
// d'avoir une info en plus") : Temps écoulé et {SP|items} complétés dès la 1ère version, puis
// Capacité utilisée et US avec deadline restantes. Capacité utilisée et US avec deadline restent
// toujours en SP/au niveau US quel que soit `metric` — la capacité d'un sprint et une deadline sont
// des notions déjà bien établies ailleurs dans l'app (voir leurs commentaires respectifs plus bas),
// ni l'une ni l'autre ne se traduit en "nombre d'US".
export function SprintHealthCard({ sprint, items, hierarchyNodes, kanbanCols, team, absences, today, editable, instanceKey, metric, onChangeMetric }: Props) {
  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Santé du sprint</div>
      {!sprint ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun sprint actif
        </div>
      ) : (
        <SprintHealthBody sprint={sprint} items={items} hierarchyNodes={hierarchyNodes} kanbanCols={kanbanCols} team={team} absences={absences} today={today} metric={metric} />
      )}
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Santé du sprint</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`sprint-health-metric-${instanceKey}`}
            data-testid={`dashboard-widget-sprint-health-sp-${instanceKey}`}
            checked={metric === 'sp'}
            onChange={() => onChangeMetric('sp')}
          />
          Story Points
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`sprint-health-metric-${instanceKey}`}
            data-testid={`dashboard-widget-sprint-health-items-${instanceKey}`}
            checked={metric === 'items'}
            onChange={() => onChangeMetric('items')}
          />
          Nombre d'US
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}

function SprintHealthBody({ sprint, items, hierarchyNodes, kanbanCols, team, absences, today, metric }: {
  sprint: Sprint; items: Item[]; hierarchyNodes: HierarchyNode[]; kanbanCols: KanbanCol[]
  team: TeamMember[]; absences: Absence[]; today: string; metric: SprintHealthMetric
}) {
  const buckets = metric === 'items'
    ? computeItemCountBuckets(sprint.id, items, kanbanCols)
    : computeSPBuckets(sprint.id, items, hierarchyNodes, kanbanCols)
  const total = buckets.done + buckets.doing + buckets.todo
  const pctDone = total > 0 ? Math.round((buckets.done / total) * 100) : 0
  const unitPlural = metric === 'items' ? 'items' : 'SP'

  const totalDays = Math.max(1, daysBetween(sprint.startDate, sprint.endDate) + 1)
  const daysLeft = Math.max(0, daysBetween(today, sprint.endDate))
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(sprint.startDate, today) + 1))
  const pctElapsed = Math.round((elapsedDays / totalDays) * 100)

  const deadlinesLeft = items.filter(i =>
    i.sprintId === sprint.id && i.deadline && i.deadline.type !== 'none' && !isItemDone(i, kanbanCols),
  ).length

  // "Capacité utilisée" (retour Julien après le 1er essai : "Scope ajouté"... on ne s'en est jamais
  // servi jusqu'à présent, il faudrait mettre une information cohérente avec ce qu'on a dans
  // l'outil") — remplace le proxy inventé à partir de `createdAt` par `effectiveCapacity()`
  // (utils/sprintCapacity.ts), déjà LA mesure de référence de la capacité d'un sprint dans l'app
  // (Planning, Roadmap, AutoPlanning, Sprint Review) : capacité nominale du sprint, déduite des
  // jours fériés et absences de l'équipe sur sa période. Toujours en SP (`computeSPBuckets`, pas
  // les buckets du réglage `metric` — la capacité est nativement une notion de SP, pas de nombre
  // d'US) plutôt qu'un ratio qui changerait de sens selon le réglage choisi.
  const spBuckets = metric === 'sp' ? buckets : computeSPBuckets(sprint.id, items, hierarchyNodes, kanbanCols)
  const totalSP = spBuckets.done + spBuckets.doing + spBuckets.todo
  const capacity = effectiveCapacity(sprint, team, absences)
  const pctCapacity = capacity > 0 ? Math.round((totalSP / capacity) * 100) : 0

  const segments: { key: keyof Buckets; value: number; color: string; label: string }[] = [
    { key: 'todo', value: buckets.todo, color: 'var(--text-faint)', label: 'À faire' },
    { key: 'doing', value: buckets.doing, color: '#ff9500', label: 'En cours' },
    { key: 'done', value: buckets.done, color: '#34c759', label: 'Terminé' },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Sprint {sprint.number}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {daysLeft > 1 ? `${daysLeft} jours restants` : daysLeft === 1 ? '1 jour restant' : 'dernier jour'}
        </span>
      </div>

      {total === 0 ? (
        <div style={{ height: 22, borderRadius: 5, background: 'var(--border)' }} />
      ) : (
        <div style={{ display: 'flex', height: 22, borderRadius: 5, overflow: 'hidden' }}>
          {segments.filter(s => s.value > 0).map(s => (
            <div
              key={s.key}
              style={{
                width: `${(s.value / total) * 100}%`, background: s.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff', minWidth: 0, overflow: 'hidden',
              }}
            >
              {(s.value / total) * 100 >= 12 && s.value}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)' }}>
        {segments.map(s => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-hero)', fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{pctElapsed}%</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Temps écoulé</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-hero)', fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{pctDone}%</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{unitPlural} complétés</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-hero)', fontSize: 20, fontWeight: 800, color: pctCapacity > 100 ? 'var(--danger)' : 'var(--primary)' }}>{pctCapacity}%</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Capacité utilisée</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-hero)', fontSize: 20, fontWeight: 800, color: deadlinesLeft > 0 ? 'var(--danger)' : 'var(--primary)' }}>{deadlinesLeft}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>US avec deadline</div>
        </div>
      </div>
    </div>
  )
}
