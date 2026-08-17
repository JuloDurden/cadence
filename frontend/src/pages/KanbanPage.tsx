import { useState, useMemo, useRef, useEffect } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { KanbanColumn } from '../components/kanban/KanbanColumn'
import { ItemModal } from '../components/backlog/ItemModal'
import { effectiveCapacity } from '../utils/sprintCapacity'
import { getCurrentSprint } from '../utils/sprints'
import { useAuth } from '../hooks/useAuth'
import { withHistoryEntry } from '../utils/history'
import { useDialog } from '../context/DialogContext'
import { BASE_COL_IDS, WORKFLOW_ORDER, EXTRA_STAGES } from '../utils/kanbanStages'
import { isReadOnlyForRole } from '../utils/permissions'
import type { Item, KanbanCol, HistoryEntry } from '../types'

// Ré-exportés pour compatibilité : ces constantes vivaient ici jusqu'au Chantier G (2026-07-23),
// déplacées dans `utils/kanbanStages.ts` pour être importables depuis `ItemModal.tsx` sans créer
// de cycle (KanbanPage → ItemModal → KanbanPage). Voir ce fichier pour le détail.
export { BASE_COL_IDS, WORKFLOW_ORDER, EXTRA_STAGES }

// ── Icons ─────────────────────────────────────────────────────────────────
const ICO = {
  arrowUpDown: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  gripVertical:'<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  plus:        '<path d="M5 12h14"/><path d="M12 5v14"/>',
  chevDown:    '<path d="m6 9 6 6 6-6"/>',
}

function Ico({ d, size = 14, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

// ── Sort ──────────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'priority', label: 'Priorité' },
  { value: 'sp-desc',  label: 'SP ↓' },
  { value: 'sp-asc',   label: 'SP ↑' },
  { value: 'assignee', label: 'Assigné' },
]

function priorityOrder(p: string) {
  return ({ critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>)[p] ?? 4
}

// ── Styles ────────────────────────────────────────────────────────────────
const CTRL_BASE: React.CSSProperties = {
  height: 30, border: '1px solid var(--border)', borderRadius: 7,
  backgroundColor: 'transparent', color: 'var(--text)', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none', flexShrink: 0,
}
const SELECT_STYLE: React.CSSProperties  = { ...CTRL_BASE, padding: '0 28px 0 10px' }
const BTN_STYLE: React.CSSProperties    = { ...CTRL_BASE, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }
const BTN_PRIMARY: React.CSSProperties  = { ...BTN_STYLE, border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: 600 }
const SORT_BOX: React.CSSProperties     = { ...CTRL_BASE, display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', position: 'relative' }
const SORT_INNER: React.CSSProperties   = { background: 'none', border: 'none', outline: 'none', appearance: 'none', position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }

// ── Sprint theme helper ───────────────────────────────────────────────────
function sprintTheme(label: string): string {
  const m = label.match(/^Sprint\s+\d+\s*[-–]\s*(.+)$/i)
  if (!m) return label
  const t = m[1].trim()
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

// ── Component ─────────────────────────────────────────────────────────────
export function KanbanPage() {
  const { state, dispatch, saveToServer, stateLoaded } = useCadence()
  const { userName, userId, userRole } = useAuth()
  const { confirm } = useDialog()
  // Phase 2.5 (roadmap v1) — Stakeholder en lecture seule sur Kanban.
  const readOnly = isReadOnlyForRole(userRole)

  const [sprintId, setSprintId] = useState<string>(() => getCurrentSprint(state)?.id ?? '')
  // Le choix par défaut ci-dessus est figé au premier rendu, potentiellement sur les données
  // de démo si le chargement serveur n'est pas encore arrivé. On le corrige une seule fois
  // dès que l'état est définitivement chargé (voir Chantier A, corrections.md).
  const resyncedRef = useRef(false)
  useEffect(() => {
    if (stateLoaded && !resyncedRef.current) {
      resyncedRef.current = true
      setSprintId(getCurrentSprint(state)?.id ?? '')
    }
  }, [stateLoaded, state])
  const [sortBy, setSortBy] = useState('priority')
  const [reorgMode, setReorgMode] = useState(false)
  const [showAddCol, setShowAddCol] = useState(false)
  const [addColPos, setAddColPos] = useState({ top: 0, right: 0 })
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined)

  const dragItemId   = useRef<string | null>(null)
  const dragColId    = useRef<string | null>(null)
  // Drag d'un groupe Epic entier (docs/corrections futures.md, Kanban, 2026-08-17) : contient
  // les ids des items du groupe + l'id du HierarchyNode Epic lui-même (voir KanbanEpicGroup.tsx,
  // groupIds), traité séparément du drag d'une carte seule (dragItemId).
  const dragGroupIds = useRef<string[] | null>(null)
  const addColBtnRef = useRef<HTMLButtonElement>(null)

  const currentSprint = useMemo(
    () => state.sprints.find(s => s.id === sprintId),
    [state.sprints, sprintId]
  )
  const sprintItems = useMemo(
    () => state.items.filter(i => i.sprintId === sprintId),
    [state.items, sprintId]
  )
  const doneSP = useMemo(() => {
    const doneCols = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
    return sprintItems.filter(i => doneCols.includes(i.status)).reduce((s, i) => s + i.sp, 0)
  }, [sprintItems, state.kanbanCols])

  const availableStages = useMemo(
    () => EXTRA_STAGES.filter(s => !state.kanbanCols.find(c => c.id === s.id)),
    [state.kanbanCols]
  )

  // Items per column — backlog/deferred/cancelled ignorent le filtre de sprint courant
  const itemsByCol = useMemo(() => {
    const sorted = [...sprintItems].sort((a, b) => {
      if (sortBy === 'sp-desc') return b.sp - a.sp
      if (sortBy === 'sp-asc')  return a.sp - b.sp
      if (sortBy === 'assignee') return (a.assignees[0] ?? '').localeCompare(b.assignees[0] ?? '')
      return priorityOrder(a.priority) - priorityOrder(b.priority)
    })
    const map: Record<string, Item[]> = {}
    state.kanbanCols.forEach(col => { map[col.id] = [] })

    // Backlog: no-sprint items regardless of current sprint filter
    if ('backlog' in map) {
      map['backlog'] = [...state.items]
        .filter(i => i.status === 'backlog' && !i.sprintId)
        .sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority))
    }
    // Deferred: items from any sprint in deferred status
    if ('deferred' in map) {
      map['deferred'] = [...state.items]
        .filter(i => i.status === 'deferred')
        .sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority))
    }
    // Annulé (Chantier G) : items de n'importe quel sprint, comme Ajourné — mais sans
    // auto-avancement (voir plus bas), un item annulé ne doit jamais revenir tout seul.
    if ('cancelled' in map) {
      map['cancelled'] = [...state.items]
        .filter(i => i.status === 'cancelled')
        .sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority))
    }
    // Regular sprint items
    sorted.forEach(item => {
      if (item.status === 'backlog' || item.status === 'deferred' || item.status === 'cancelled') return
      if (map[item.status] !== undefined) map[item.status].push(item)
      else {
        const def = state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id
        if (def) map[def].push(item)
      }
    })
    return map
  }, [sprintItems, state.items, state.kanbanCols, sortBy])

  // ── Auto-advance deferred items from previous sprints → todo in current sprint ──
  useEffect(() => {
    const current = getCurrentSprint(state)
    if (!current) return
    const toAdvance = state.items.filter(
      i => i.status === 'deferred' && i.sprintId && i.sprintId !== current.id
    )
    if (toAdvance.length === 0) return
    toAdvance.forEach(i => {
      const updated = { ...i, status: 'todo', sprintId: current.id }
      dispatch({ type: 'UPDATE_ITEM', payload: updated })
    })
    // Chantier B (tranche Kanban) : action silencieuse (aucun clic utilisateur), donc
    // particulièrement utile à tracer — une entrée résumé, auteur "Système" plutôt
    // qu'un faux auteur humain puisque personne n'a déclenché cette action à la main.
    const fromLabel = state.kanbanCols.find(c => c.id === 'deferred')?.label ?? 'Ajourné'
    const toLabel   = state.kanbanCols.find(c => c.id === 'todo')?.label ?? 'À faire'
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'item_status',
      timestamp: new Date().toISOString(),
      sprintId: current.id,
      from: fromLabel,
      to: toLabel,
      detail: `Auto-avancement : ${toAdvance.length} item(s) ajourné(s) réactivé(s) automatiquement`,
      author: 'Système',
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry({
      ...state,
      items: state.items.map(i => toAdvance.find(d => d.id === i.id)
        ? { ...i, status: 'todo', sprintId: current.id }
        : i
      ),
    }, historyEntry))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close add-col popup on outside click
  useEffect(() => {
    if (!showAddCol) return
    function onDown(e: MouseEvent) {
      const t = e.target as Element
      if (!t.closest('.kb-addcol-popup') && !t.closest('.kb-addcol-btn')) setShowAddCol(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showAddCol])

  // ── Add-col button handler ────────────────────────────────────────────
  function handleAddColClick() {
    if (addColBtnRef.current) {
      const r = addColBtnRef.current.getBoundingClientRect()
      setAddColPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setShowAddCol(v => !v)
  }

  // ── Drag handlers ────────────────────────────────────────────────────
  function handleDragOver(colId: string) { setDragOverColId(colId) }

  function handleDrop(targetId: string) {
    if (readOnly) return
    setDragOverColId(null)
    if (dragColId.current && dragColId.current !== targetId) {
      const cols = [...state.kanbanCols]
      const si = cols.findIndex(c => c.id === dragColId.current)
      const ti = cols.findIndex(c => c.id === targetId)
      if (si >= 0 && ti >= 0) {
        const [r] = cols.splice(si, 1)
        cols.splice(ti, 0, r)
        dispatch({ type: 'UPDATE_KANBAN_COLS', payload: cols })
        saveToServer({ ...state, kanbanCols: cols })
      }
      dragColId.current = null
    } else if (dragGroupIds.current) {
      const ids = dragGroupIds.current
      dragGroupIds.current = null
      handleGroupDrop(ids, targetId)
    } else if (dragItemId.current) {
      const item = state.items.find(i => i.id === dragItemId.current)
      if (item && item.status !== targetId) {
        const isBacklogCol = targetId === 'backlog'
        const updated = {
          ...item,
          status: targetId,
          sprintId: isBacklogCol ? null : (sprintId || item.sprintId),
        }
        dispatch({ type: 'UPDATE_ITEM', payload: updated })
        // Chantier B (tranche Kanban) : réutilise le type `item_status` déjà prévu dans le
        // modèle (jamais produit jusqu'ici) — les champs from/to sont aussi déjà supportés
        // par l'affichage de la page Historique, juste jamais renseignés.
        const fromLabel = state.kanbanCols.find(c => c.id === item.status)?.label ?? item.status
        const toLabel   = state.kanbanCols.find(c => c.id === targetId)?.label ?? targetId
        const historyEntry: HistoryEntry = {
          id: crypto.randomUUID(),
          type: 'item_status',
          timestamp: new Date().toISOString(),
          itemKey: item.key,
          itemDesc: item.desc,
          sprintId: updated.sprintId ?? undefined,
          from: fromLabel,
          to: toLabel,
          author: userName,
        }
        dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
        saveToServer(withHistoryEntry({ ...state, items: state.items.map(i => i.id === updated.id ? updated : i) }, historyEntry))
      }
      dragItemId.current = null
    }
  }

  // Drag d'un groupe Epic entier (docs/corrections futures.md, Kanban, 2026-08-17, retour Julien :
  // "glisser l'en-tête déplace tout le groupe, comme Release Planning"). `ids` contient les items
  // du groupe (tous dans la même colonne source, puisqu'un groupe n'est affiché que par colonne)
  // + l'id du HierarchyNode Epic lui-même (voir KanbanEpicGroup.tsx) : son propre statut est mis
  // à jour en plus de ses items, il est lu ailleurs (getSprintSP, utils/hierarchyScore.ts) pour
  // savoir si un Epic sans item compte comme "terminé". Une seule entrée d'Historique résumée,
  // pas une par item, même convention que l'auto-avancement des items ajournés plus haut.
  function handleGroupDrop(ids: string[], targetId: string) {
    if (readOnly) return
    const isBacklogCol = targetId === 'backlog'
    const groupItems = state.items.filter(i => ids.includes(i.id) && i.status !== targetId)
    const groupNode = state.hierarchyNodes.find(n => ids.includes(n.id) && n.status !== targetId)
    if (groupItems.length === 0 && !groupNode) return

    const updatedItems = groupItems.map(item => ({
      ...item,
      status: targetId,
      sprintId: isBacklogCol ? null : (sprintId || item.sprintId),
    }))
    updatedItems.forEach(item => dispatch({ type: 'UPDATE_ITEM', payload: item }))

    const updatedNode = groupNode ? { ...groupNode, status: targetId } : null
    if (updatedNode) dispatch({ type: 'UPDATE_HIERARCHY_NODE', payload: updatedNode })

    const epicLabel = (groupNode ?? state.hierarchyNodes.find(n => ids.includes(n.id)))?.desc ?? 'Epic'
    const fromStatus = groupItems[0]?.status ?? groupNode?.status
    const fromLabel = state.kanbanCols.find(c => c.id === fromStatus)?.label ?? fromStatus
    const toLabel = state.kanbanCols.find(c => c.id === targetId)?.label ?? targetId
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'item_status',
      timestamp: new Date().toISOString(),
      sprintId: sprintId || undefined,
      from: fromLabel,
      to: toLabel,
      detail: `Groupe Epic "${epicLabel}" déplacé vers "${toLabel}" (${groupItems.length} item(s))`,
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry({
      ...state,
      items: state.items.map(i => updatedItems.find(u => u.id === i.id) ?? i),
      hierarchyNodes: updatedNode ? state.hierarchyNodes.map(n => n.id === updatedNode.id ? updatedNode : n) : state.hierarchyNodes,
    }, historyEntry))
  }

  // ── Column management ────────────────────────────────────────────────
  function handleAddCol(stage: KanbanCol) {
    if (readOnly) return
    const cols = [...state.kanbanCols]
    const newRank = WORKFLOW_ORDER.indexOf(stage.id)
    // Find first existing col whose workflow rank is strictly greater
    const insertAt = cols.findIndex(c => {
      const r = WORKFLOW_ORDER.indexOf(c.id)
      return r === -1 ? false : r > newRank
    })
    if (insertAt >= 0) cols.splice(insertAt, 0, stage)
    else cols.push(stage)
    dispatch({ type: 'UPDATE_KANBAN_COLS', payload: cols })
    saveToServer({ ...state, kanbanCols: cols })
    setShowAddCol(false)
  }

  async function handleDeleteCol(colId: string) {
    if (readOnly) return
    if (!await confirm('Retirer cette colonne du board ?', { confirmLabel: 'Retirer', danger: true })) return
    const newCols = state.kanbanCols.filter(c => c.id !== colId)

    // Backlog is a virtual view — items keep their status, just hide the column
    if (colId === 'backlog') {
      dispatch({ type: 'UPDATE_KANBAN_COLS', payload: newCols })
      saveToServer({ ...state, kanbanCols: newCols })
      return
    }

    // Chantier G (2026-07-23, bug remonté par l'utilisateur) : "Annulé" doit avoir le même
    // traitement que "Backlog" ci-dessus, et pour une raison plus grave que pour les autres
    // colonnes optionnelles. Le fallback générique ci-dessous prend la colonne VOISINE dans
    // `state.kanbanCols` — or "Annulé" est ajoutée en dernière position du tableau (voir
    // `handleAddCol`/`WORKFLOW_ORDER`, `cancelled` a le rang le plus élevé), juste après une
    // colonne `isDone: true` (ex. "Livré"). Retirer "Annulé" du board réassignait donc en
    // silence tous les items annulés vers ce voisin — les faisant passer pour LIVRÉS, l'exact
    // inverse de leur statut réel. Comme pour "Backlog", retirer cette colonne ne doit faire que
    // masquer la vue dédiée du Kanban, jamais toucher au statut des items déjà annulés.
    if (colId === 'cancelled') {
      dispatch({ type: 'UPDATE_KANBAN_COLS', payload: newCols })
      saveToServer({ ...state, kanbanCols: newCols })
      return
    }

    // Find the column immediately before the deleted one as fallback
    const idx      = state.kanbanCols.findIndex(c => c.id === colId)
    const fallback = state.kanbanCols[idx - 1]?.id ?? state.kanbanCols[idx + 1]?.id ?? 'todo'

    const newItems = state.items.map(i => i.status === colId ? { ...i, status: fallback } : i)
    dispatch({ type: 'UPDATE_KANBAN_COLS', payload: newCols })
    state.items.filter(i => i.status === colId)
      .forEach(i => dispatch({ type: 'UPDATE_ITEM', payload: { ...i, status: fallback } }))
    saveToServer({ ...state, kanbanCols: newCols, items: newItems })
  }

  // ── Item actions ─────────────────────────────────────────────────────
  function handleSave(item: Item, keyCounters?: Record<string, number>) {
    if (readOnly) { setModalItem(undefined); return }
    const exists = !!state.items.find(i => i.id === item.id)
    dispatch(exists ? { type: 'UPDATE_ITEM', payload: item } : { type: 'ADD_ITEM', payload: item, keyCounters })
    saveToServer({
      ...state,
      items: exists ? state.items.map(i => i.id === item.id ? item : i) : [...state.items, item],
      ...(keyCounters ? { itemKeyCounters: keyCounters } : {}),
    })
    setModalItem(undefined)
  }

  function handleRemoveFromSprint(itemId: string) {
    if (readOnly) return
    const item = state.items.find(i => i.id === itemId)
    if (!item) return
    const updated = { ...item, status: 'backlog', sprintId: null }
    dispatch({ type: 'UPDATE_ITEM', payload: updated })
    const fromLabel = state.kanbanCols.find(c => c.id === item.status)?.label ?? item.status
    const toLabel   = state.kanbanCols.find(c => c.id === 'backlog')?.label ?? 'backlog'
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'item_status',
      timestamp: new Date().toISOString(),
      itemKey: item.key,
      itemDesc: item.desc,
      from: fromLabel,
      to: toLabel,
      detail: 'Retiré du sprint',
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry({ ...state, items: state.items.map(i => i.id === itemId ? updated : i) }, historyEntry))
  }

  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? 'Priorité'
  const reorgBtnStyle: React.CSSProperties = reorgMode
    ? { ...BTN_STYLE, backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderColor: 'var(--primary)' }
    : BTN_STYLE

  return (
    <>
      <Header title="Kanban">
        {/* ── LEFT ──────────────────────────────────────── */}
        <select className="hdr-select" style={{ ...SELECT_STYLE, width: 90 }} value={sprintId} onChange={e => setSprintId(e.target.value)}>
          {state.sprints.map(s => <option key={s.id} value={s.id}>Sprint {s.number}</option>)}
        </select>
        {currentSprint && (
          <span className="hdr-ctx-stat" style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            {sprintTheme(currentSprint.label)}
          </span>
        )}
        {currentSprint?.goal && (
          <>
            <div className="hdr-sep" />
            <span className="hdr-ctx-stat" style={{ fontStyle: 'italic', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentSprint.goal}
            </span>
          </>
        )}
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">
          {doneSP} SP / {currentSprint ? effectiveCapacity(currentSprint, state.team, state.absences) : 0} SP
        </span>

        <div style={{ flex: 1 }} />

        {/* ── RIGHT ─────────────────────────────────────── */}
        <div style={SORT_BOX}>
          <Ico d={ICO.arrowUpDown} size={12} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{currentSortLabel}</span>
          <Ico d={ICO.chevDown} size={11} />
          <select title="Tri" style={SORT_INNER} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {!readOnly && (
          <>
            <div className="hdr-sep" />
            <button style={reorgBtnStyle} onClick={() => setReorgMode(v => !v)}>
              <Ico d={ICO.gripVertical} size={13} />
              Réorganiser
            </button>
            {/* Add-col button — popup rendered OUTSIDE header to escape overflow:hidden */}
            <button
              ref={addColBtnRef}
              className="kb-addcol-btn"
              style={BTN_PRIMARY}
              onClick={handleAddColClick}
            >
              <Ico d={ICO.plus} size={13} stroke="#fff" />
              Colonne
            </button>
            <div className="hdr-sep" />
          </>
        )}
      </Header>

      {/* ── Add-col popup — position:fixed escapes header overflow:hidden ── */}
      {showAddCol && (
        <div
          className="kb-addcol-popup"
          style={{
            position: 'fixed', top: addColPos.top, right: addColPos.right, zIndex: 9999,
            minWidth: 190, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--shadow-md)', padding: 6,
          }}
        >
          {availableStages.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', margin: 0 }}>
              Toutes les colonnes sont déjà ajoutées
            </p>
          )}
          {availableStages.map(s => <AddColRow key={s.id} stage={s} onAdd={handleAddCol} />)}
        </div>
      )}

      <div className="page-content" style={{ padding: '24px 16px' }}>
        {/* Signal visuel du mode Réorganiser (docs/corrections futures.md, Kanban) : avant ce
            correctif, seul le bouton "Réorganiser" changeait d'apparence — rien sur le board
            lui-même n'indiquait qu'on réorganise les colonnes plutôt que de manipuler des
            cartes. Le bandeau explicatif est rendu à l'intérieur du cadre pointillé, au-dessus
            des colonnes (voir index.css, .kanban-board-wrap). */}
        <div className={`kanban-board-wrap${reorgMode ? ' reorg-active' : ''}`}>
          {reorgMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--primary-light)', borderLeft: '3px solid var(--primary)',
              borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12,
              color: 'var(--text-muted)',
            }}>
              <Ico d={ICO.gripVertical} size={14} stroke="var(--primary)" />
              <span>
                <strong style={{ color: 'var(--primary)' }}>Mode réorganisation</strong>
                {' '}— glissez les colonnes pour les réordonner, ou supprimez-en une. Les cartes ne sont pas déplaçables tant que ce mode est actif.
              </span>
            </div>
          )}
          <div className="kanban-board">
            {state.kanbanCols.map(col => (
              <KanbanColumn
                key={col.id}
                col={col}
                items={itemsByCol[col.id] ?? []}
                state={state}
                isBase={BASE_COL_IDS.includes(col.id)}
                reorgMode={reorgMode}
                isDragOver={dragOverColId === col.id}
                onCardDragStart={id => { dragItemId.current = id; dragColId.current = null; dragGroupIds.current = null }}
                onGroupDragStart={ids => { dragGroupIds.current = ids; dragItemId.current = null; dragColId.current = null }}
                onColDragStart={id  => { dragColId.current  = id; dragItemId.current = null; dragGroupIds.current = null }}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDeleteCol={handleDeleteCol}
                onEdit={item => setModalItem(item)}
                onRemoveFromSprint={handleRemoveFromSprint}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      </div>

      {modalItem !== undefined && (
        <ItemModal
          item={modalItem}
          state={state}
          onSave={handleSave}
          onClose={() => setModalItem(undefined)}
          currentUserId={userId}
          canManage={!readOnly}
          canOperate={!readOnly}
        />
      )}
    </>
  )
}

// ── Add-col row ───────────────────────────────────────────────────────────
function AddColRow({ stage, onAdd }: { stage: KanbanCol; onAdd: (s: KanbanCol) => void }) {
  return (
    <button
      onClick={() => onAdd(stage)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '7px 10px', borderRadius: 5, fontSize: 12,
        color: 'var(--text)', textAlign: 'left',
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
      {stage.label}
    </button>
  )
}
