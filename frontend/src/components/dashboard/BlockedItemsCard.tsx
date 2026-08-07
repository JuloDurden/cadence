import type { Item, KanbanCol, Sprint } from '../../types'
import type { BlockedItemsScope, DashboardWidgetSize } from '../../data/dashboardWidgets'
import { isItemDone } from '../../utils/status'
import { FlipCard } from './FlipCard'

interface Props {
  items: Item[]
  kanbanCols: KanbanCol[]
  currentSprint: Sprint | undefined
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget). */
  instanceKey: string
  scope: BlockedItemsScope
  onChangeScope: (next: BlockedItemsScope) => void
  size: DashboardWidgetSize
}

interface BlockedEntry { item: Item; blockingKeys: string[] }

/** Items du périmètre choisi dont au moins une dépendance (`item.deps`) n'est pas terminée
 *  (`isItemDone()`) — l'item bloquant est cherché dans TOUS les items (`allItems`), pas seulement
 *  ceux du périmètre : il peut être dans un autre sprint ou déjà livré à un autre client, seul son
 *  statut de complétion compte (voir le commentaire de `BlockedItemsScope` dans
 *  dashboardWidgets.ts). Triés par clé croissante, comme "Progression par Epic". */
function computeBlocked(pool: Item[], allItems: Item[], kanbanCols: KanbanCol[]): BlockedEntry[] {
  const byId = new Map(allItems.map(i => [i.id, i]))
  const entries: BlockedEntry[] = []
  for (const item of pool) {
    if (!item.deps || item.deps.length === 0) continue
    const blockingKeys = item.deps
      .map(id => byId.get(id))
      .filter((dep): dep is Item => !!dep && !isItemDone(dep, kanbanCols))
      .map(dep => dep.key)
    if (blockingKeys.length > 0) entries.push({ item, blockingKeys })
  }
  return entries.sort((a, b) => a.item.key.localeCompare(b.item.key))
}

// Widget "Items bloqués par dépendance" (2026-08-07, retour Julien) — 16e widget avec une face
// cachée de réglages (FlipCard.tsx). Un item est "bloqué" si au moins un id de son `deps` désigne un
// item qui n'est pas encore terminé — calcul neuf (voir le commentaire d'en-tête de
// dashboardWidgets.ts pour ce widget), distinct du statut Kanban manuel "Bloqué".
//
// Réglage Sprint en cours (par défaut)/Tout le backlog : les dépendances sont souvent cross-sprint
// (comme le trace déjà DepsOverlay.tsx sur la page Planning), donc le périmètre est une vraie
// question, pas artificielle.
//
// S sur le modèle des KPI existants (BlockersCard.tsx : gros chiffre + légende), comme Actions de
// rétro. M en liste, un item par ligne avec un badge indiquant par quel item il est bloqué (le
// premier si plusieurs, "+N" pour les autres) — même style de badge que le "en retard" de
// RetroActionsCard.tsx.
export function BlockedItemsCard({ items, kanbanCols, currentSprint, editable, instanceKey, scope, onChangeScope, size }: Props) {
  const pool = scope === 'sprint'
    ? (currentSprint ? items.filter(i => i.sprintId === currentSprint.id) : [])
    : items
  const blocked = computeBlocked(pool, items, kanbanCols)
  const heroSize = String(blocked.length).length >= 3 ? 26 : 34

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: size === 'S' ? '10px 12px' : '14px 18px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: size === 'S' ? 4 : 8 }}>Items bloqués</div>
      {scope === 'sprint' && !currentSprint ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
          Aucun sprint actif
        </div>
      ) : blocked.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
          Aucun item bloqué
        </div>
      ) : size === 'S' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gridTemplateRows: 'auto auto', columnGap: 4 }}>
            <span style={{ gridRow: 1, gridColumn: 1, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: heroSize, fontWeight: 800, color: 'var(--danger)', lineHeight: .78, fontVariantNumeric: 'tabular-nums' }}>
              {blocked.length}
            </span>
            <span style={{ gridRow: 1, gridColumn: 2, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: 14, fontWeight: 800, color: 'var(--danger)', opacity: .6 }}>
              {blocked.length > 1 ? 'items' : 'item'}
            </span>
            <span style={{ gridRow: 2, gridColumn: '1 / 3', justifySelf: 'end', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
              dépendance(s) non terminée(s)
            </span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {blocked.map(({ item, blockingKeys }) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--text-muted)' }}>{item.key} ·</span> {item.desc}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#ff3b30', background: 'rgba(255,59,48,.12)', padding: '2px 7px', borderRadius: 10, flexShrink: 0, whiteSpace: 'nowrap' }}>
                bloqué par {blockingKeys[0]}{blockingKeys.length > 1 ? ` +${blockingKeys.length - 1}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Items bloqués</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`blocked-items-scope-${instanceKey}`}
            data-testid={`dashboard-widget-blocked-items-sprint-${instanceKey}`}
            checked={scope === 'sprint'}
            onChange={() => onChangeScope('sprint')}
          />
          Sprint en cours
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`blocked-items-scope-${instanceKey}`}
            data-testid={`dashboard-widget-blocked-items-product-${instanceKey}`}
            checked={scope === 'product'}
            onChange={() => onChangeScope('product')}
          />
          Tout le backlog
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
