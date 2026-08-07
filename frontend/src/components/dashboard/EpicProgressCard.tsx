import type { HierarchyNode, Item, KanbanCol, Sprint } from '../../types'
import type { EpicProgressMetric, EpicProgressScope } from '../../data/dashboardWidgets'
import { FlipCard } from './FlipCard'

interface Props {
  hierarchyNodes: HierarchyNode[]
  items: Item[]
  kanbanCols: KanbanCol[]
  currentSprint: Sprint | undefined
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget). */
  instanceKey: string
  scope: EpicProgressScope
  onChangeScope: (next: EpicProgressScope) => void
  metric: EpicProgressMetric
  onChangeMetric: (next: EpicProgressMetric) => void
}

interface Buckets { done: number; doing: number; todo: number }

/** Classe une colonne Kanban dans l'un des 3 segments de la jauge — même règle que
 *  SprintHealthCard.tsx (dupliquée ici plutôt que partagée, convention déjà suivie dans le projet
 *  pour ces petits helpers), généralise à n'importe quel jeu de colonnes configuré. */
function statusBucket(status: string, kanbanCols: KanbanCol[]): keyof Buckets {
  const col = kanbanCols.find(c => c.id === status)
  if (col?.isDone) return 'done'
  if (col?.isDefault) return 'todo'
  return col ? 'doing' : 'todo'
}

/** Epics du périmètre choisi — en 'product', tous les Epics ; en 'sprint', seulement ceux assignés
 *  au sprint en cours via leur propre champ `sprintId` OU ayant au moins une US dans ce sprint,
 *  même règle que `computeSPBuckets`/`getSprintSP()` (un Epic assigné au sprint mais pas encore
 *  découpé en US doit quand même compter). */
function selectEpics(scope: EpicProgressScope, epics: HierarchyNode[], items: Item[], currentSprint: Sprint | undefined): HierarchyNode[] {
  if (scope === 'product') return epics
  if (!currentSprint) return []
  return epics.filter(e =>
    e.sprintId === currentSprint.id || items.some(i => i.epicId === e.id && i.sprintId === currentSprint.id),
  )
}

/** US de l'Epic à prendre en compte dans la barre — en 'product', toutes ses US quel que soit leur
 *  sprint ; en 'sprint', seulement celles du sprint en cours (un Epic peut avoir des US dans
 *  d'autres sprints, hors périmètre ici). */
function relevantItems(epic: HierarchyNode, items: Item[], scope: EpicProgressScope, currentSprint: Sprint | undefined): Item[] {
  const all = items.filter(i => i.epicId === epic.id)
  return scope === 'product' ? all : all.filter(i => currentSprint && i.sprintId === currentSprint.id)
}

function computeBuckets(epicItems: Item[], kanbanCols: KanbanCol[], metric: EpicProgressMetric): Buckets {
  const buckets: Buckets = { done: 0, doing: 0, todo: 0 }
  for (const item of epicItems) {
    buckets[statusBucket(item.status, kanbanCols)] += metric === 'items' ? 1 : item.sp
  }
  return buckets
}

// Widget "Progression par Epic" (2026-08-07, retour Julien, capture "Epics by Percent Completion"
// en référence de style) — 12e widget avec une face cachée de réglages (FlipCard.tsx). Même système
// de jauge à 3 segments À faire/En cours/Terminé que "Santé du sprint" (`statusBucket`), une ligne
// par Epic plutôt qu'une seule jauge pour tout le sprint.
//
// 2 réglages indépendants (voir le commentaire de `EpicProgressScope`/`EpicProgressMetric` dans
// dashboardWidgets.ts) : périmètre Produit (par défaut)/Sprint en cours, et métrique Story
// Points (par défaut)/nombre d'US — même bascule que "Santé du sprint", appliquée ici en plus au
// choix des Epics affichés (`selectEpics`), pas seulement au calcul de la barre.
//
// Un Epic sans aucune US dans le périmètre choisi affiche "Pas encore découpé en US" plutôt qu'une
// barre vide, même traitement que Santé clients (RAG) — évite une ligne trompeuse à 0%.
export function EpicProgressCard({ hierarchyNodes, items, kanbanCols, currentSprint, editable, instanceKey, scope, onChangeScope, metric, onChangeMetric }: Props) {
  const allEpics = hierarchyNodes.filter(n => n.level === 'epic').sort((a, b) => a.key.localeCompare(b.key))
  const epics = selectEpics(scope, allEpics, items, currentSprint)

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '16px 18px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 12 }}>Progression par Epic</div>
      {scope === 'sprint' && !currentSprint ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun sprint actif
        </div>
      ) : epics.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          {scope === 'sprint' ? 'Aucun Epic dans ce sprint' : 'Aucun Epic'}
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {epics.map(epic => {
              const epicItems = relevantItems(epic, items, scope, currentSprint)
              if (epicItems.length === 0) {
                return (
                  <div key={epic.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {epic.key} · {epic.desc}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', flexShrink: 0 }}>Pas encore découpé en US</span>
                    </div>
                    <div style={{ height: 14, borderRadius: 4, marginTop: 4, background: 'var(--border)' }} />
                  </div>
                )
              }
              const buckets = computeBuckets(epicItems, kanbanCols, metric)
              const total = buckets.done + buckets.doing + buckets.todo
              const pct = total > 0 ? Math.round((buckets.done / total) * 100) : 0
              const segments: { key: keyof Buckets; value: number; color: string }[] = [
                { key: 'todo', value: buckets.todo, color: 'var(--text-faint)' },
                { key: 'doing', value: buckets.doing, color: '#ff9500' },
                { key: 'done', value: buckets.done, color: '#34c759' },
              ]
              return (
                <div key={epic.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {epic.key} · {epic.desc}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{buckets.done}/{total} · {pct}%</span>
                  </div>
                  <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                    {segments.filter(s => s.value > 0).map(s => (
                      <div key={s.key} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)', marginTop: 10, flexShrink: 0 }}>
            <span><span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--text-faint)', display: 'inline-block', marginRight: 3 }} />À faire</span>
            <span><span style={{ width: 7, height: 7, borderRadius: 2, background: '#ff9500', display: 'inline-block', marginRight: 3 }} />En cours</span>
            <span><span style={{ width: 7, height: 7, borderRadius: 2, background: '#34c759', display: 'inline-block', marginRight: 3 }} />Terminé</span>
          </div>
        </>
      )}
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Progression par Epic</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`epic-progress-scope-${instanceKey}`}
              data-testid={`dashboard-widget-epic-progress-product-${instanceKey}`}
              checked={scope === 'product'}
              onChange={() => onChangeScope('product')}
            />
            Produit
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`epic-progress-scope-${instanceKey}`}
              data-testid={`dashboard-widget-epic-progress-sprint-${instanceKey}`}
              checked={scope === 'sprint'}
              onChange={() => onChangeScope('sprint')}
            />
            Sprint en cours
          </label>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`epic-progress-metric-${instanceKey}`}
              data-testid={`dashboard-widget-epic-progress-sp-${instanceKey}`}
              checked={metric === 'sp'}
              onChange={() => onChangeMetric('sp')}
            />
            Story Points
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`epic-progress-metric-${instanceKey}`}
              data-testid={`dashboard-widget-epic-progress-items-${instanceKey}`}
              checked={metric === 'items'}
              onChange={() => onChangeMetric('items')}
            />
            Nombre d'US
          </label>
        </div>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
