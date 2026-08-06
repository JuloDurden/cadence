import type { Client, HierarchyNode, Item, KanbanCol, Sprint } from '../../types'
import type { ClientRagIndicator, ClientRagScope, DashboardWidgetSize } from '../../data/dashboardWidgets'
import { isItemDone } from '../../utils/status'
import { FlipCard } from './FlipCard'

const RAG_LABEL = { R: 'Critique', A: 'Attention', G: 'OK' }
const RAG_COLOR = { R: '#ff3b30', A: '#ff9500', G: '#34c759' }

interface Props {
  clients: Client[]
  items: Item[]
  hierarchyNodes: HierarchyNode[]
  kanbanCols: KanbanCol[]
  currentSprint: Sprint | undefined
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget, ex. un doublon "vue produit" + "vue sprint"). */
  instanceKey: string
  size: DashboardWidgetSize
  indicator: ClientRagIndicator
  onChangeIndicator: (next: ClientRagIndicator) => void
  scope: ClientRagScope
  onChangeScope: (next: ClientRagScope) => void
}

interface Bucket { done: number; total: number; pct: number }
function tally(bucketItems: Item[], kanbanCols: KanbanCol[]): Bucket {
  const done = bucketItems.filter(i => isItemDone(i, kanbanCols)).length
  const total = bucketItems.length
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

interface BreakdownRow extends Bucket { id: string; label: string }

// Widget "Santé clients (RAG)" (2026-08-06) — 7e widget avec une face cachée de réglages
// (FlipCard.tsx). 2 réglages indépendants (voir dashboardWidgets.ts) :
//  - `indicator` : ligne complète avec ventilation Epic/Initiative par Epic/Initiative ('gauge',
//    défaut) ou ligne compacte pastille + nom seulement, sans ventilation ('dot'), pour voir plus
//    de clients sans défiler à taille égale.
//  - `scope` : US comptées sur tout le produit ('product', défaut) ou seulement dans le sprint en
//    cours ('sprint') — un client sans US dans le sprint en cours est exclu de la liste.
//
// Ventilation Initiative>Epic>Item (2026-08-06, retour Julien : "RAG Client ne tient pas compte de
// Initiative > Epic > Item", puis complément "les Epics (ou Initiative) sans item ne sont pas
// affichés/comptabilisés") — un simple `items.filter(i => i.clientId === client.id)` ratait :
//  1. Une US peut appartenir à un Epic, directement à une Initiative (sans Epic intermédiaire, voir
//     `buildInitiativeSections` dans hierarchyScore.ts), ou être directe. Ventilé en une ligne "US
//     directes" + une ligne par Epic + une ligne par Initiative portant des US directes, chacune
//     avec son propre {fait}/{total}.
//  2. Un Epic OU une Initiative assigné au client (`HierarchyNode.clientId`) mais pas encore
//     découpé en US n'apparaissait nulle part (voir hierarchyScore.ts : "un Epic sans aucun item...
//     doit quand même compter"). Affiché maintenant avec "Pas encore découpé en US". Une Initiative
//     n'est comptée comme "vide" que si elle n'a ni US directe ni aucun Epic enfant (même vide) :
//     un Epic enfant, vide ou non, porte déjà cette information à son propre niveau, pas la peine
//     de la répéter à celui de l'Initiative.
//  3. En scope 'sprint' (retour Julien, captures Sprint 2 : Epic AGA-004 sans US mais assigné au
//     sprint en cours, invisible) — un 1er correctif du point 2 ne s'appliquait qu'en scope
//     'product', en se basant uniquement sur les US (`item.sprintId`) pour savoir si un Epic
//     "appartient" au sprint affiché. Or un Epic peut être assigné à un sprint via son PROPRE champ
//     `sprintId`, indépendamment de ses US (mêmes principe que `cellEpics` dans SwimlanesView.tsx).
//     Un Epic sans US mais dont `sprintId` pointe vers le sprint affiché est donc aussi affiché en
//     scope 'sprint', avec "Pas encore découpé en US" — sans quoi son client disparaissait purement
//     et simplement de la liste (aucune US = length 0 = exclu). Aucun équivalent pour une Initiative
//     ici : elle n'a pas de champ `sprintId` propre (voir HierarchyNodeModal.tsx).
//
// Disponible en M/L/XL/XLP. En XL (2 fois plus large que L, même hauteur), la liste passe en 2
// colonnes pour profiter de la largeur plutôt que de rester une colonne étirée.
export function ClientRAG({ clients, items, hierarchyNodes, kanbanCols, currentSprint, editable, instanceKey, size, indicator, onChangeIndicator, scope, onChangeScope }: Props) {
  const epicNodes = hierarchyNodes.filter(n => n.level === 'epic')
  const initiativeNodes = hierarchyNodes.filter(n => n.level === 'initiative')
  const nodeById = new Map(hierarchyNodes.map(n => [n.id, n]))

  const rows = clients
    .map(client => {
      const clientItems = scope === 'sprint'
        ? (currentSprint ? items.filter(i => i.clientId === client.id && i.sprintId === currentSprint.id) : [])
        : items.filter(i => i.clientId === client.id)

      const byEpicId = new Map<string, Item[]>()
      const byInitiativeId = new Map<string, Item[]>() // US directes sur une Initiative, sans Epic
      const directItems: Item[] = []
      for (const item of clientItems) {
        const node = item.epicId ? nodeById.get(item.epicId) : undefined
        if (node?.level === 'epic') {
          if (!byEpicId.has(node.id)) byEpicId.set(node.id, [])
          byEpicId.get(node.id)!.push(item)
        } else if (node?.level === 'initiative') {
          if (!byInitiativeId.has(node.id)) byInitiativeId.set(node.id, [])
          byInitiativeId.get(node.id)!.push(item)
        } else {
          directItems.push(item)
        }
      }

      const epicRows: BreakdownRow[] = [...byEpicId.entries()].map(([id, epicItems]) => ({
        id, label: `Epic · ${nodeById.get(id)!.desc}`, ...tally(epicItems, kanbanCols),
      }))
      const initiativeDirectRows: BreakdownRow[] = [...byInitiativeId.entries()].map(([id, initItems]) => ({
        id, label: `Initiative · ${nodeById.get(id)!.desc}`, ...tally(initItems, kanbanCols),
      }))

      // Epics/Initiatives du client sans aucune US dans ce scope — affichés à part (retour Julien,
      // captures Sprint 2 : l'Epic AGA-004 sans US mais assigné au sprint en cours était invisible).
      let emptyRows: BreakdownRow[] = []
      if (scope === 'product') {
        // Vue produit : tout Epic/Initiative du client sans aucune US, peu importe le sprint.
        const emptyEpics = epicNodes.filter(e => e.clientId === client.id && !byEpicId.has(e.id))
        const emptyInitiatives = initiativeNodes.filter(init =>
          init.clientId === client.id &&
          !byInitiativeId.has(init.id) &&
          !epicNodes.some(e => e.parentId === init.id),
        )
        emptyRows = [
          ...emptyEpics.map(e => ({ id: e.id, label: `Epic · ${e.desc}`, done: 0, total: 0, pct: 0 })),
          ...emptyInitiatives.map(i => ({ id: i.id, label: `Initiative · ${i.desc}`, done: 0, total: 0, pct: 0 })),
        ]
      } else if (currentSprint) {
        // Vue sprint : un Epic peut être "affiché sous" un sprint (`HierarchyNode.sprintId`) sans
        // qu'aucune de ses US n'y soit elle-même assignée — même règle que `cellEpics` dans
        // SwimlanesView.tsx et le commentaire de hierarchyScore.ts ("un Epic sans aucun item...
        // doit quand même compter"). Pas d'équivalent pour une Initiative : elle n'a pas de champ
        // `sprintId` propre (couvre plusieurs sprints par nature, voir HierarchyNodeModal.tsx),
        // donc rien à ajouter à ce niveau ici.
        const emptySprintEpics = epicNodes.filter(e =>
          e.clientId === client.id && e.sprintId === currentSprint.id && !byEpicId.has(e.id),
        )
        emptyRows = emptySprintEpics.map(e => ({ id: e.id, label: `Epic · ${e.desc}`, done: 0, total: 0, pct: 0 }))
      }

      const breakdownRows = [...epicRows, ...initiativeDirectRows, ...emptyRows]
      const direct = tally(directItems, kanbanCols)
      // Un client reste affiché s'il a au moins une US directe, ou au moins une ligne de
      // ventilation — même une ligne "vide" (Epic assigné au sprint mais pas encore découpé) compte
      // comme "traité" : ce n'est pas la même chose qu'un client sans aucune trace dans le scope.
      const hasAnything = direct.total > 0 || breakdownRows.length > 0

      return { client, direct, breakdownRows, hasAnything }
    })
    .filter(row => scope === 'product' || row.hasAnything)

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 16 }}>Santé clients (RAG)</div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: size === 'XL' ? 'grid' : 'flex',
          flexDirection: size === 'XL' ? undefined : 'column',
          gridTemplateColumns: size === 'XL' ? '1fr 1fr' : undefined,
          columnGap: size === 'XL' ? 24 : undefined,
          rowGap: 14,
          alignContent: 'start',
        }}
      >
        {rows.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {scope === 'sprint' && !currentSprint ? 'Aucun sprint actif.' : 'Aucun client traité dans ce sprint.'}
          </p>
        )}
        {rows.map(({ client, direct, breakdownRows }) => {
          const color = RAG_COLOR[client.rag]
          return (
            <div key={client.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
                  <span style={{ fontSize: 10, color, fontWeight: 600, flexShrink: 0 }}>{RAG_LABEL[client.rag]}</span>
                </div>
                {indicator === 'gauge' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                    {direct.total > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>US directes</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{direct.done}/{direct.total} · {direct.pct}%</span>
                        </div>
                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
                          <div style={{ height: '100%', width: `${direct.pct}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
                        </div>
                      </div>
                    )}
                    {breakdownRows.map(({ id, label, done, total, pct }) => (
                      <div key={id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                          {total > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{done}/{total} · {pct}%</span>}
                        </div>
                        {total > 0 ? (
                          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
                          </div>
                        ) : (
                          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic' }}>Pas encore découpé en US</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Santé clients (RAG)</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`client-rag-indicator-${instanceKey}`}
              data-testid={`dashboard-widget-client-rag-gauge-${instanceKey}`}
              checked={indicator === 'gauge'}
              onChange={() => onChangeIndicator('gauge')}
            />
            Jauge
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`client-rag-indicator-${instanceKey}`}
              data-testid={`dashboard-widget-client-rag-dot-${instanceKey}`}
              checked={indicator === 'dot'}
              onChange={() => onChangeIndicator('dot')}
            />
            Point de couleur
          </label>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`client-rag-scope-${instanceKey}`}
              data-testid={`dashboard-widget-client-rag-product-${instanceKey}`}
              checked={scope === 'product'}
              onChange={() => onChangeScope('product')}
            />
            Produit
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`client-rag-scope-${instanceKey}`}
              data-testid={`dashboard-widget-client-rag-sprint-${instanceKey}`}
              checked={scope === 'sprint'}
              onChange={() => onChangeScope('sprint')}
            />
            Sprint en cours
          </label>
        </div>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
