import { useMemo } from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import type { Item, Client, TeamMember, Sprint, KanbanCol, HierarchyNode } from '../../types'
import { BacklogRow, BacklogRowCells, BacklogRowExpandCells, hasExpandPanel } from './BacklogRow'

// Phase 7, perf (2026-08-23) : au-delà de ce nombre d'items visibles dans UNE table (table plate
// "Grouper : aucun", ou la mini-table d'une card de groupe Sprint/Client/Type/Statut/Epic), on
// bascule sur une liste virtualisée (react-virtuoso) plutôt que de rendre tous les <tr> d'un coup.
// Volontairement bien en dessous du seuil de 500 items déjà mentionné dans docs/roadmap-v1.md
// (marge de sécurité), et très au-dessus de la taille des jeux de données E2E existants (quelques
// dizaines d'items au plus) : ces derniers continuent donc de passer par le chemin non virtualisé,
// inchangé, déjà couvert par les tests E2E existants - voir docs/corrections.md pour le détail de
// cette limite de vérification (le chemin virtualisé n'a pas pu être exercé par les E2E actuels).
export const VIRTUALIZE_THRESHOLD = 200

interface FlatRowEntry { key: string; kind: 'row' | 'expand'; item: Item }

/** Aplati une liste d'items en entrées "ligne" / "panneau US-CA déplié". Nécessaire pour
 *  react-virtuoso : `TableVirtuoso` associe un seul `<tr>` à chaque entrée de `data` (voir
 *  `ItemProps<Data>`, react-virtuoso/dist/index.d.ts) - un item dont le panneau est déplié ne
 *  peut donc plus être un `<React.Fragment>` à 2 `<tr>` comme dans le chemin classique
 *  (BacklogRow.tsx), il doit apparaître comme DEUX entrées consécutives dans le tableau aplati. */
export function buildFlatRowEntries(items: Item[], expandedIds: Set<string>): FlatRowEntry[] {
  const out: FlatRowEntry[] = []
  for (const item of items) {
    out.push({ key: item.id, kind: 'row', item })
    if (expandedIds.has(item.id) && hasExpandPanel(item)) {
      out.push({ key: item.id + '-expand', kind: 'expand', item })
    }
  }
  return out
}

/** En-tête de tableau partagé (15 colonnes, 16 avec la case à cocher) - déplacé depuis
 *  BacklogPage.tsx (Phase 7, perf, 2026-08-23) : seul ce fichier en a désormais besoin, à la fois
 *  pour le `<thead>` classique (BacklogTableHead) et pour `fixedHeaderContent` du chemin
 *  virtualisé (BacklogTableHeadRow seule, sans le `<thead>` - TableVirtuoso fournit le sien). */
function BacklogTableHeadRow({ selectable, allSelected, onToggleAll }: { selectable: boolean; allSelected: boolean; onToggleAll: () => void }) {
  return (
    <tr>
      {selectable && (
        <th style={{ width: 24, textAlign: 'center' }}>
          <input type="checkbox" data-testid="backlog-select-all" checked={allSelected}
            onChange={onToggleAll} title="Sélectionner/désélectionner tous les items filtrés" />
        </th>
      )}
      <th style={{ width: 28 }} />
      <th style={{ width: 46, textAlign: 'center' }}>Prio.</th>
      <th style={{ width: 72, textAlign: 'center' }}>Clé</th>
      <th style={{ width: 68, textAlign: 'center' }}>Type</th>
      <th style={{ width: 50 }}>Sprint</th>
      <th style={{ width: 100, textAlign: 'center' }}>Client</th>
      <th style={{ width: 90, textAlign: 'center' }}>Statut</th>
      <th style={{ maxWidth: 200 }}>Description</th>
      <th style={{ width: 200, textAlign: 'center' }}>Tags</th>
      <th style={{ width: 72, textAlign: 'center' }}>Assignés</th>
      <th style={{ width: 42, textAlign: 'center' }}>SP</th>
      <th style={{ width: 120 }}>Dépendances</th>
      <th style={{ width: 38, textAlign: 'center' }} title="Definition of Ready">DoR</th>
      <th style={{ width: 38, textAlign: 'center' }} title="Definition of Done">DoD</th>
      <th style={{ width: 64, textAlign: 'center' }}>Actions</th>
    </tr>
  )
}

function BacklogTableHead(props: { selectable: boolean; allSelected: boolean; onToggleAll: () => void }) {
  return <thead><BacklogTableHeadRow {...props} /></thead>
}

interface BacklogItemsTableProps {
  items: Item[]
  clients: Client[]
  team: TeamMember[]
  sprints: Sprint[]
  kanbanCols: KanbanCol[]
  hierarchyNodes: HierarchyNode[]
  itemsById: Map<string, Item>
  depChain: Map<string, number>
  selectedIds: Set<string>
  expandedIds: Set<string>
  canManage: boolean
  canOperate: boolean
  allSelected: boolean
  onToggleSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  onToggleAll: () => void
  onEdit: (item: Item) => void
  onDelete: (id: string) => void
  onHover: (id: string | null) => void
  // Seule la table plate (mode "Grouper : aucun") porte ce testid - voir tests/backlog.spec.js,
  // qui attend `[data-testid="backlog-table"]` en nombre 1 sur la page quel que soit le mode.
  testId?: string
}

/** Table Backlog (table plate "Grouper : aucun" OU mini-table d'une card de groupe) - centralise
 *  le choix entre rendu classique (petites listes, inchangé) et virtualisé (react-virtuoso,
 *  au-delà de VIRTUALIZE_THRESHOLD items) pour ne pas dupliquer cette décision aux 4 points
 *  d'appel de BacklogPage.tsx. Phase 7, perf, 2026-08-23 - voir docs/corrections.md. */
export function BacklogItemsTable({
  items, clients, team, sprints, kanbanCols, hierarchyNodes, itemsById, depChain,
  selectedIds, expandedIds, canManage, canOperate, allSelected,
  onToggleSelect, onToggleExpand, onToggleAll, onEdit, onDelete, onHover, testId,
}: BacklogItemsTableProps) {
  const virtualize = items.length > VIRTUALIZE_THRESHOLD

  // Toujours calculé, même quand non virtualisé (coût négligeable : un `useMemo` ne peut de
  // toute façon pas être appelé conditionnellement - règle des Hooks React).
  const flatEntries = useMemo(
    () => virtualize ? buildFlatRowEntries(items, expandedIds) : [],
    [virtualize, items, expandedIds]
  )

  if (!virtualize) {
    return (
      <table className="backlog-table" data-testid={testId}>
        <BacklogTableHead selectable={canManage} allSelected={allSelected} onToggleAll={onToggleAll} />
        <tbody>
          {items.map(item => (
            <BacklogRow
              key={item.id}
              item={item}
              clients={clients}
              team={team}
              sprints={sprints}
              kanbanCols={kanbanCols}
              hierarchyNodes={hierarchyNodes}
              itemsById={itemsById}
              depDepth={depChain.get(item.id)}
              selected={selectedIds.has(item.id)}
              isExpanded={expandedIds.has(item.id)}
              canManage={canManage}
              canOperate={canOperate}
              onToggleSelect={onToggleSelect}
              onToggleExpand={onToggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
              onHover={onHover}
            />
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div className="backlog-table-virtual-wrap" data-testid={testId}>
      <TableVirtuoso<FlatRowEntry>
        style={{ height: 800 }}
        data={flatEntries}
        computeItemKey={(_, entry) => entry.key}
        components={{
          Table: ({ children, style }) => <table className="backlog-table" style={style}>{children}</table>,
          // `item` (l'entrée aplatie courante) est fourni par TableVirtuoso lui-même
          // (react-virtuoso/dist/index.d.ts, `ItemProps<Data>`) - permet de rattacher les mêmes
          // interactions par ligne (survol pour la mise en évidence des dépendances, double-clic
          // pour éditer) que dans le chemin classique (BacklogRow.tsx), au niveau du <tr> que
          // TableVirtuoso construit pour nous. `context` volontairement ignoré (non utilisé ici).
          TableRow: ({ item: entry, children, context: _context, ...rowProps }) => {
            const hasDeps = (entry.item.deps ?? []).length > 0
            const depDepth = depChain.get(entry.item.id)
            return (
              <tr
                {...rowProps}
                onDoubleClick={entry.kind === 'row' ? () => onEdit(entry.item) : undefined}
                onMouseEnter={entry.kind === 'row' ? () => onHover(hasDeps ? entry.item.id : null) : undefined}
                onMouseLeave={entry.kind === 'row' ? () => onHover(null) : undefined}
                className={entry.kind === 'expand' ? 'ca-expand-row' : (depDepth ? `dep-hl dep-hl-${depDepth}` : undefined)}
              >
                {children}
              </tr>
            )
          },
        }}
        fixedHeaderContent={() => (
          <BacklogTableHeadRow selectable={canManage} allSelected={allSelected} onToggleAll={onToggleAll} />
        )}
        itemContent={(_, entry) => entry.kind === 'row' ? (
          <BacklogRowCells
            item={entry.item}
            clients={clients}
            team={team}
            sprints={sprints}
            kanbanCols={kanbanCols}
            hierarchyNodes={hierarchyNodes}
            itemsById={itemsById}
            depDepth={depChain.get(entry.item.id)}
            selected={selectedIds.has(entry.item.id)}
            isExpanded={expandedIds.has(entry.item.id)}
            canManage={canManage}
            canOperate={canOperate}
            onToggleSelect={onToggleSelect}
            onToggleExpand={onToggleExpand}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <BacklogRowExpandCells item={entry.item} canManage={canManage} />
        )}
      />
    </div>
  )
}
