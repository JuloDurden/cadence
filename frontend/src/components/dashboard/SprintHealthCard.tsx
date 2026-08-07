import type { Absence, HierarchyNode, Item, KanbanCol, Sprint, TeamMember } from '../../types'
import type { DashboardWidgetSize, SprintHealthMetric } from '../../data/dashboardWidgets'
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
  size: DashboardWidgetSize
}

interface Buckets { done: number; doing: number; todo: number; blocked: number }

/** Classe une colonne Kanban dans l'un des 4 segments de la jauge — généralise à n'importe quel
 *  jeu de colonnes configuré (voir le commentaire de `SprintHealthMetric` dans dashboardWidgets.ts)
 *  plutôt que de coder en dur des ids de statut ('todo', 'doing'...). Statut inconnu (ne devrait pas
 *  arriver) : classé "à faire" par défaut, l'hypothèse la moins avancée.
 *
 *  "Bloqué" (2026-08-07, retour Julien : "il faut que la jauge affiche les items bloqués") — testé
 *  EN PREMIER, avant de chercher la colonne dans `kanbanCols` : le statut Kanban "Bloqué"
 *  (`id: 'blocked'`, EXTRA_STAGES dans utils/kanbanStages.ts) est optionnel sur un board (pas
 *  ajouté par défaut), mais un item peut porter ce statut même si la colonne n'a pas été ajoutée au
 *  board courant — même principe que le comptage de la statistique "Items bloqués" plus bas, qui
 *  teste directement `item.status === 'blocked'` sans dépendre de la présence de la colonne. */
function statusBucket(status: string, kanbanCols: KanbanCol[]): keyof Buckets {
  if (status === 'blocked') return 'blocked'
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
  const buckets: Buckets = { done: 0, doing: 0, todo: 0, blocked: 0 }

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
  const buckets: Buckets = { done: 0, doing: 0, todo: 0, blocked: 0 }
  for (const item of items) {
    if (item.sprintId !== sprintId) continue
    buckets[statusBucket(item.status, kanbanCols)]++
  }
  return buckets
}

// Widget "Santé du sprint" (2026-08-06, retour Julien, capture "Sprint Health Gadget" en référence
// de style) — 10e widget avec une face cachée de réglages (FlipCard.tsx). Jauge à 4 segments
// À faire/En cours/Bloqué/Terminé (voir `statusBucket`) plutôt que le simple fait/total des autres
// widgets KPI : c'est le point qui différencie ce widget de "Sprint actuel" (kpi-current-sprint),
// qui ne distingue pas "en cours" de "à faire".
//
// Réglage `metric` : bascule la jauge et le % de complétion entre Story Points (défaut,
// `computeSPBuckets`) et nombre d'US (`computeItemCountBuckets`) — voir le commentaire de
// `SprintHealthMetric` dans dashboardWidgets.ts pour le détail des règles de classement.
//
// 5 statistiques sous la jauge, pas 2 (retour Julien, widget passé en L/XL : "la taille mériterait
// d'avoir une info en plus") : Temps écoulé et {SP|items} complétés dès la 1ère version, puis
// Capacité utilisée et US avec deadline restantes, puis Items bloqués (2026-08-07). Capacité
// utilisée, US avec deadline et Items bloqués restent toujours en SP/au niveau US quel que soit
// `metric` — la capacité d'un sprint, une deadline et un statut Kanban sont des notions déjà bien
// établies ailleurs dans l'app (voir leurs commentaires respectifs plus bas), aucune ne se traduit
// en "nombre d'US".
//
// Disposition des 5 statistiques par taille (2026-08-07, retour Julien : "sur la taille L on peut
// dispatcher les données en 1 ligne à 3 données, la seconde avec 2 données") — plus de
// `flexWrap: 'wrap'` livré à lui-même (répartition imprévisible selon la largeur des libellés) :
// XL en 1 ligne de 5, L en 2 lignes explicites (3 puis 2), voir `SprintHealthBody`.
export function SprintHealthCard({ sprint, items, hierarchyNodes, kanbanCols, team, absences, today, editable, instanceKey, metric, onChangeMetric, size }: Props) {
  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Santé du sprint</div>
      {!sprint ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun sprint actif
        </div>
      ) : (
        <SprintHealthBody sprint={sprint} items={items} hierarchyNodes={hierarchyNodes} kanbanCols={kanbanCols} team={team} absences={absences} today={today} metric={metric} size={size} />
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

function SprintHealthBody({ sprint, items, hierarchyNodes, kanbanCols, team, absences, today, metric, size }: {
  sprint: Sprint; items: Item[]; hierarchyNodes: HierarchyNode[]; kanbanCols: KanbanCol[]
  team: TeamMember[]; absences: Absence[]; today: string; metric: SprintHealthMetric; size: DashboardWidgetSize
}) {
  const buckets = metric === 'items'
    ? computeItemCountBuckets(sprint.id, items, kanbanCols)
    : computeSPBuckets(sprint.id, items, hierarchyNodes, kanbanCols)
  const total = buckets.done + buckets.doing + buckets.todo + buckets.blocked
  const pctDone = total > 0 ? Math.round((buckets.done / total) * 100) : 0
  const unitPlural = metric === 'items' ? 'items' : 'SP'

  const totalDays = Math.max(1, daysBetween(sprint.startDate, sprint.endDate) + 1)
  const daysLeft = Math.max(0, daysBetween(today, sprint.endDate))
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(sprint.startDate, today) + 1))
  const pctElapsed = Math.round((elapsedDays / totalDays) * 100)

  const deadlinesLeft = items.filter(i =>
    i.sprintId === sprint.id && i.deadline && i.deadline.type !== 'none' && !isItemDone(i, kanbanCols),
  ).length

  // "Items bloqués" (2026-08-07, retour Julien) — 5e statistique, comptage direct des items du
  // sprint au statut Kanban "Bloqué" (`id: 'blocked'`, EXTRA_STAGES dans utils/kanbanStages.ts) :
  // un statut manuel posé à la main sur le Kanban, sans lien avec `Item.deps` (voir le commentaire
  // du widget "Items bloqués par dépendance" dans dashboardWidgets.ts — 2 notions de blocage
  // distinctes dans l'app, celle-ci reprend la 1ère). Le chiffre héros reste le nombre d'items quel
  // que soit `metric` (comme "US avec deadline", un statut Kanban ne se traduit pas nativement en
  // SP) ; le total de SP bloqués est ajouté en complément dans le libellé (retour Julien : "et le
  // nombre de SP bloqués"), pas en unité principale — un item bloqué compte toujours pour 1 dans le
  // chiffre héros, peu importe son SP.
  const blockedItems = items.filter(i => i.sprintId === sprint.id && i.status === 'blocked')
  const blockedCount = blockedItems.length
  const blockedSP = blockedItems.reduce((sum, i) => sum + i.sp, 0)

  // "Capacité utilisée" (retour Julien après le 1er essai : "Scope ajouté"... on ne s'en est jamais
  // servi jusqu'à présent, il faudrait mettre une information cohérente avec ce qu'on a dans
  // l'outil") — remplace le proxy inventé à partir de `createdAt` par `effectiveCapacity()`
  // (utils/sprintCapacity.ts), déjà LA mesure de référence de la capacité d'un sprint dans l'app
  // (Planning, Roadmap, AutoPlanning, Sprint Review) : capacité nominale du sprint, déduite des
  // jours fériés et absences de l'équipe sur sa période. Toujours en SP (`computeSPBuckets`, pas
  // les buckets du réglage `metric` — la capacité est nativement une notion de SP, pas de nombre
  // d'US) plutôt qu'un ratio qui changerait de sens selon le réglage choisi.
  const spBuckets = metric === 'sp' ? buckets : computeSPBuckets(sprint.id, items, hierarchyNodes, kanbanCols)
  const totalSP = spBuckets.done + spBuckets.doing + spBuckets.todo + spBuckets.blocked
  const capacity = effectiveCapacity(sprint, team, absences)
  const pctCapacity = capacity > 0 ? Math.round((totalSP / capacity) * 100) : 0

  // Segment "Bloqué" inséré entre "En cours" et "Terminé" (2026-08-07, retour Julien) — lit comme un
  // parcours À faire → En cours → Bloqué → Terminé, la couleur rouge (`var(--danger)`, même couleur
  // que la statistique "Items bloqués" plus bas) suffit à le distinguer visuellement d'"En cours"
  // sans dépendre de sa position.
  const segments: { key: keyof Buckets; value: number; color: string; label: string }[] = [
    { key: 'todo', value: buckets.todo, color: 'var(--text-faint)', label: 'À faire' },
    { key: 'doing', value: buckets.doing, color: '#ff9500', label: 'En cours' },
    { key: 'blocked', value: buckets.blocked, color: 'var(--danger)', label: 'Bloqué' },
    { key: 'done', value: buckets.done, color: '#34c759', label: 'Terminé' },
  ]

  // Offset cumulé de chaque segment (2026-08-07, retour Julien : "le segment Bloqué n'affiche pas
  // le nombre d'items bloqués") — un segment "Bloqué" est presque toujours minoritaire (peu d'items
  // bloqués sur l'ensemble du sprint), donc sa largeur passe rarement le seuil de 12% qui permet
  // d'afficher son chiffre EN PLACE (même règle que les 3 autres segments). Plutôt que de fausser
  // les proportions réelles de la jauge avec une largeur minimale artificielle, son chiffre est
  // affiché dans un badge flottant centré sur le segment quand il est trop fin pour son propre
  // texte — l'information reste toujours visible, peu importe la largeur réelle.
  let cumulative = 0
  const segmentsWithOffset = segments.map(s => {
    const width = total > 0 ? (s.value / total) * 100 : 0
    const offset = cumulative
    cumulative += width
    return { ...s, width, offset }
  })
  const blockedSegment = segmentsWithOffset.find(s => s.key === 'blocked')

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
        <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', height: 22, borderRadius: 5, overflow: 'hidden' }}>
          {segmentsWithOffset.filter(s => s.value > 0).map(s => (
            <div
              key={s.key}
              style={{
                width: `${s.width}%`, background: s.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff', minWidth: 0, overflow: 'hidden',
              }}
            >
              {s.width >= 12 && s.value}
            </div>
          ))}
        </div>
        {blockedSegment && blockedSegment.value > 0 && blockedSegment.width < 12 && (
          <div style={{
            position: 'absolute', top: '50%', left: `${blockedSegment.offset + blockedSegment.width / 2}%`,
            transform: 'translate(-50%, -50%)', color: '#fff',
            fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {blockedSegment.value}
          </div>
        )}
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

      <StatGrid size={size} stats={[
        { value: `${pctElapsed}%`, label: 'Temps écoulé', color: 'var(--primary)' },
        { value: `${pctDone}%`, label: `${unitPlural} complétés`, color: 'var(--primary)' },
        { value: `${pctCapacity}%`, label: 'Capacité utilisée', color: pctCapacity > 100 ? 'var(--danger)' : 'var(--primary)' },
        { value: deadlinesLeft, label: 'US avec deadline', color: deadlinesLeft > 0 ? 'var(--danger)' : 'var(--primary)' },
        { value: blockedCount, label: blockedSP > 0 ? `Items bloqués · ${blockedSP} SP` : 'Items bloqués', color: blockedCount > 0 ? 'var(--danger)' : 'var(--primary)' },
      ]} />
    </div>
  )
}

interface Stat { value: string | number; label: string; color: string }

function StatCell({ stat }: { stat: Stat }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-hero)', fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stat.label}</div>
    </div>
  )
}

/** Disposition des 5 statistiques (2026-08-07, retour Julien : "sur la taille L on peut dispatcher
 *  les données en 1 ligne à 3 données, la seconde avec 2 données") — 2 lignes explicites (3 puis 2)
 *  en L, 1 seule ligne de 5 en XL, plutôt qu'un `flexWrap` livré à lui-même (répartition
 *  imprévisible selon la largeur des libellés, pas garantie 3+2). */
function StatGrid({ size, stats }: { size: DashboardWidgetSize; stats: Stat[] }) {
  if (size !== 'L') {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', gap: 10 }}>
        {stats.map(s => <StatCell key={s.label} stat={s} />)}
      </div>
    )
  }
  const [row1, row2] = [stats.slice(0, 3), stats.slice(3, 5)]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', gap: 10 }}>
        {row1.map(s => <StatCell key={s.label} stat={s} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center', gap: 30 }}>
        {row2.map(s => <StatCell key={s.label} stat={s} />)}
      </div>
    </div>
  )
}
