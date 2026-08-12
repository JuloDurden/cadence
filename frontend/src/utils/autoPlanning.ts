import type { Item, ScenarioSlot } from '../types'

// ── Topological sort (Kahn's algorithm) ───────────────────────────────────
// Bug trouve le 2026-08-12 (portage backend du Compagnon IA, sous-chantier 4 etape 2/2) :
// `Item.deps` stocke des ID reels (voir ItemModal.tsx addDep(i.id), backlogWrite.ts
// resolveDepKeys) - cette fonction comparait pourtant ces valeurs a des CLES d'items
// (`keySet`/`adj`/`inDeg` indexes par `.key`), une comparaison qui ne correspondait donc
// jamais. Consequence : tous les items avaient un degre entrant de 0 (aucune dependance
// jamais reconnue), le resultat etait simplement `items` dans son ordre d'origine - le tri
// topologique etait un no-op silencieux, les dependances jamais respectees dans l'ordre de
// placement d'Auto-planning. Corrige en indexant par `.id` (la vraie cle de `deps`), le
// resultat reste un `Item[]` dans le meme ordre relatif qu'avant pour tout le reste de
// l'appli (aucun autre appelant de cette fonction n'est affecte par ce changement interne).
export function topoSort(items: Item[]): Item[] {
  const idSet = new Set(items.map(i => i.id))
  const inDeg: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  items.forEach(i => { inDeg[i.id] = 0; adj[i.id] = [] })
  items.forEach(i => {
    ;(i.deps ?? []).forEach(depId => {
      if (!idSet.has(depId)) return
      adj[depId] = adj[depId] ?? []; adj[depId].push(i.id)
      inDeg[i.id] = (inDeg[i.id] ?? 0) + 1
    })
  })
  const queue = items.filter(i => inDeg[i.id] === 0)
  const result: Item[] = []
  while (queue.length) {
    const node = queue.shift()!; result.push(node)
    ;(adj[node.id] ?? []).forEach(nid => {
      inDeg[nid]--
      if (inDeg[nid] === 0) { const it = items.find(i => i.id === nid); if (it) queue.push(it) }
    })
  }
  items.forEach(i => { if (!result.includes(i)) result.push(i) })
  return result
}

// ── Movement badge: direction arrow based on sprint number ─────────────────
export type MoveBadge = { text: string; color: string }

export function computeMoveBadge(
  item: Item,
  slotNumber: number,
  sprintsMeta: { id: string; number: number }[],
): MoveBadge | null {
  if (!item.sprintId) return { text: '+', color: '#059669' }  // unassigned → new placement
  const origSprint = sprintsMeta.find(s => s.id === item.sprintId)
  if (!origSprint) return { text: '→', color: '#d97706' }
  if (origSprint.number === slotNumber) return { text: '=', color: 'var(--text-muted)' }
  const dir = origSprint.number > slotNumber ? '↗' : '↘'
  return { text: `S${origSprint.number}${dir}`, color: '#d97706' }
}

// ── Highlight AND logic ────────────────────────────────────────────────────
export function isItemHighlighted(
  item: { clientId?: string | null; type?: string; priority?: string },
  highlightClients: Set<string>,
  highlightTypes:   Set<string>,
  highlightPriority: Set<string>,
): boolean {
  const hasAnyFilter = highlightClients.size > 0 || highlightTypes.size > 0 || highlightPriority.size > 0
  if (!hasAnyFilter) return false
  const clientMatch   = highlightClients.size   === 0 || highlightClients.has(item.clientId ?? '')
  const typeMatch     = highlightTypes.size     === 0 || highlightTypes.has(item.type ?? '')
  const priorityMatch = highlightPriority.size  === 0 || highlightPriority.has(item.priority ?? '')
  return clientMatch && typeMatch && priorityMatch
}

// ── Scenario navigation after delete ──────────────────────────────────────
/** Returns the index to activate after removing `removedIdx` from the list. */
export function nextScenarioIdx(removedIdx: number, totalAfterRemoval: number): number {
  if (totalAfterRemoval === 0) return 0
  return Math.max(0, Math.min(removedIdx - 1, totalAfterRemoval - 1))
}

// ── Slot filter: keep only non-empty slots ─────────────────────────────────
export function isSlotNonEmpty(slot: Pick<ScenarioSlot, 'assigned' | 'usedItems'>): boolean {
  return slot.assigned.length > 0 || (slot.usedItems?.length ?? 0) > 0
}
