import type { Item, ScenarioSlot } from '../types'

// ── Topological sort (Kahn's algorithm) ───────────────────────────────────
export function topoSort(items: Item[]): Item[] {
  const keySet = new Set(items.map(i => i.key))
  const inDeg: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  items.forEach(i => { inDeg[i.key] = 0; adj[i.key] = [] })
  items.forEach(i => {
    ;(i.deps ?? []).forEach(dk => {
      if (!keySet.has(dk)) return
      adj[dk] = adj[dk] ?? []; adj[dk].push(i.key)
      inDeg[i.key] = (inDeg[i.key] ?? 0) + 1
    })
  })
  const queue = items.filter(i => inDeg[i.key] === 0)
  const result: Item[] = []
  while (queue.length) {
    const node = queue.shift()!; result.push(node)
    ;(adj[node.key] ?? []).forEach(nk => {
      inDeg[nk]--
      if (inDeg[nk] === 0) { const it = items.find(i => i.key === nk); if (it) queue.push(it) }
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
