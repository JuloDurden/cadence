import React, { useMemo, useState } from 'react'
import { useCadence } from '../context/StateContext'
import { useAuth } from '../hooks/useAuth'
import { Header } from '../components/layout/Header'
import { ItemModal } from '../components/backlog/ItemModal'
import { EXTRA_STAGES } from '../utils/kanbanStages'
import { fmtDate } from '../utils/dates'
import { findEpicChildren, detachEpicChildren, findDependents, detachDependents } from '../utils/cascadeDelete'
import type { Item, ItemType, BugSeverity } from '../types'

/* ─── Error Boundary ─────────────────────────────────────────────── */
class ModalErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ItemModal crash]', error, info)
  }
  render() {
    if (this.state.error) return (
      <div className="modal-overlay" onClick={this.props.onClose}>
        <div className="modal" style={{ padding: 24 }}>
          <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>Erreur dans la modal :</p>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: 'var(--text)', background: 'var(--surface2)', padding: 10, borderRadius: 6 }}>
            {this.state.error.message}
          </pre>
          <button className="hdr-ctx-btn" style={{ marginTop: 12 }} onClick={this.props.onClose}>Fermer</button>
        </div>
      </div>
    )
    return this.props.children
  }
}

/* ─── Constants ─────────────────────────────────────────────────── */

const PRIO_LABEL:   Record<string, string> = { critical: 'P1', high: 'P2', medium: 'P3', low: 'P4' }
const PRIO_COLOR:   Record<string, string> = { critical: '#FF2929', high: '#FF981C', medium: '#165FCC', low: '#9CC9F4' }
const PRIO_TEXT:    Record<string, string> = { critical: '#fff', high: '#fff', medium: '#fff', low: '#0d1a33' }
const PRIO_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const TYPE_LABEL: Record<ItemType, string> = { story: 'US', epic: 'Epic', bug: 'Bug', task: 'Tâche', spike: 'Spike' }
const TYPE_BG:    Record<ItemType, string> = { story: '#165FCC18', epic: '#7c3aed18', bug: '#FF292918', task: '#6b728018', spike: '#0891b218' }
const TYPE_FG:    Record<ItemType, string> = { story: '#165FCC',   epic: '#7c3aed',   bug: '#FF2929',   task: '#6b7280',   spike: '#0891b2'   }
const SEV_LABEL:  Record<BugSeverity, string> = { critical: 'Crit.', major: 'Maj.', minor: 'Min.' }
const SEV_COLOR:  Record<BugSeverity, string> = { critical: '#FF2929', major: '#FF981C', minor: '#165FCC' }

type GroupBy = 'sprint' | 'client' | 'type' | 'status' | 'epic' | 'none'

interface Group {
  id: string; label: string; sublabel?: string; color?: string
  items: Item[]; capacity?: number; used?: number
  epicSP?: number; epicFixed?: boolean; doneCount?: number
}

/* ─── SVG helpers ────────────────────────────────────────────────── */
function Svg({ d, size = 13 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
}
function FgIcon({ d }: { d: string }) {
  return <svg className="fg-icon" width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
}
function FgChev() {
  return <svg className="fg-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
}

const SVG_EDIT   = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>'
const SVG_DEL    = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>'
const SVG_CHEV_R = '<path d="m9 18 6-6-6-6"/>'
const SVG_CHEV_D = '<path d="m6 9 6 6 6-6"/>'

const ICO_USERS  = '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
const ICO_CAL    = '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
const ICO_SORT   = '<line x1="4" y1="6" x2="11" y2="6"/><line x1="4" y1="12" x2="11" y2="12"/><line x1="4" y1="18" x2="11" y2="18"/><polyline points="14 9 17 6 20 9"/><polyline points="14 15 17 18 20 15"/>'
const ICO_LAYERS = '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/>'
const ICO_TAG    = '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'
const ICO_PLUS    = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
const ICO_CHECK   = '<path d="M20 6 9 17l-5-5"/>'
const ICO_STATUS  = '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'

/** Retourne null si pas de critères ; sinon { done, total } */
function dorDodStat(items: { done: boolean }[] | undefined): { done: number; total: number } | null {
  if (!items || items.length === 0) return null
  return { done: items.filter(c => c.done).length, total: items.length }
}

/** Pastille DoR ou DoD : ✓ vert si 100%, "X/N" sinon */
function DorDodBadge({ stat, label }: { stat: { done: number; total: number } | null; label: string }) {
  if (!stat) return <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>—</span>
  if (stat.done === stat.total) {
    return (
      <span title={`${label} : ${stat.done}/${stat.total} critères validés`}
        style={{ color: 'var(--success, #22c55e)', display: 'inline-flex', alignItems: 'center' }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </span>
    )
  }
  const pct = stat.done / stat.total
  const color = pct === 0 ? 'var(--text-faint)' : pct >= 0.6 ? '#f59e0b' : 'var(--danger)'
  return (
    <span title={`${label} : ${stat.done}/${stat.total} critères validés`}
      style={{ fontSize: 10, fontWeight: 600, color, fontFamily: 'monospace' }}>
      {stat.done}/{stat.total}
    </span>
  )
}

/* ─── Component ─────────────────────────────────────────────────── */
export function BacklogPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const { userName } = useAuth()
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined)
  const [filterSprint,   setFilterSprint]   = useState('')
  const [filterClient,   setFilterClient]   = useState('')
  const [filterPriority] = useState('')
  const [filterTag,      setFilterTag]      = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterReady,    setFilterReady]    = useState(false)
  const [groupBy,        setGroupBy]        = useState<GroupBy>('none')
  const [sortBy,         setSortBy]         = useState('')
  const [expandedIds,      setExpandedIds]      = useState<Set<string>>(new Set())
  const [collapsedGroups,  setCollapsedGroups]  = useState<Set<string>>(new Set())
  const [hoveredId,        setHoveredId]        = useState<string | null>(null)

  /* ── dep chain: Map<itemId, depth> ── */
  const depChain = useMemo(() => {
    if (!hoveredId) return new Map<string, number>()
    function collect(id: string, depth: number, visited: Set<string>): Map<string, number> {
      const m = new Map<string, number>()
      const it = state.items.find(x => x.id === id)
      if (!it || visited.has(id)) return m
      visited.add(id)
      for (const depId of (it.deps ?? [])) {
        if (!m.has(depId) || m.get(depId)! > depth) m.set(depId, depth)
        collect(depId, depth + 1, visited).forEach((d, k) => {
          if (!m.has(k) || m.get(k)! > d) m.set(k, d)
        })
      }
      return m
    }
    return collect(hoveredId, 1, new Set<string>())
  }, [hoveredId, state.items])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    state.items.forEach(i => i.tags.forEach(t => s.add(t)))
    return Array.from(s).sort()
  }, [state.items])

  /** Catalogue complet des statuts connus (colonnes actives + extra stages) */
  const allStatusCols = useMemo(() => {
    const catalog = new Map([...state.kanbanCols, ...EXTRA_STAGES].map(c => [c.id, c]))
    // Garder uniquement les statuts présents dans les items
    const usedIds = new Set(state.items.map(i => i.status).filter(Boolean))
    return Array.from(usedIds)
      .map(id => catalog.get(id))
      .filter(Boolean)
      .sort((a, b) => a!.label.localeCompare(b!.label)) as typeof EXTRA_STAGES
  }, [state.items, state.kanbanCols])

  /* ── filter + sort ── */
  const filtered = useMemo(() => {
    let items = [...state.items]
    if (filterSprint === 'unassigned') items = items.filter(i => !i.sprintId)
    else if (filterSprint) items = items.filter(i => i.sprintId === filterSprint)
    if (filterClient)   items = items.filter(i => i.clientId === filterClient)
    if (filterPriority) items = items.filter(i => i.priority === filterPriority)
    if (filterTag)      items = items.filter(i => i.tags.includes(filterTag))
    if (filterStatus)   items = items.filter(i => i.status === filterStatus)
    if (filterReady)    items = items.filter(i => { const s = dorDodStat(i.dor); return s !== null && s.done === s.total })
    items.sort((a, b) => {
      if (sortBy === 'sp-desc')   return b.sp - a.sp
      if (sortBy === 'sp-asc')    return a.sp - b.sp
      if (sortBy === 'sprint')    return (a.sprintId ?? 'z').localeCompare(b.sprintId ?? 'z')
      if (sortBy === 'deadline')  return (a.deadline?.date ?? 'z').localeCompare(b.deadline?.date ?? 'z')
      if (sortBy === 'priority')  return (PRIO_ORDER[a.priority] ?? 4) - (PRIO_ORDER[b.priority] ?? 4)
      // '' or 'key' → sort by numeric suffix (004 in AGA-004)
      const keyNum = (k: string) => parseInt(k.match(/(\d+)$/)?.[1] ?? '0', 10)
      return keyNum(a.key) - keyNum(b.key)
    })
    return items
  }, [state.items, filterSprint, filterClient, filterPriority, filterTag, filterStatus, filterReady, sortBy])

  /* ── group ── */
  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'sprint') {
      const result: Group[] = []
      const sprints = state.sprints // trié à la source (StateContext), pas besoin de re-trier ici
      for (const sp of sprints) {
        const items = filtered.filter(i => i.sprintId === sp.id)
        if (items.length || (!filterSprint && !filterClient && !filterPriority && !filterTag && !filterStatus && !filterReady))
          result.push({ id: sp.id, label: `Sprint ${sp.number}`, items, capacity: sp.capacity, used: items.reduce((s, i) => s + i.sp, 0) })
      }
      const unassigned = filtered.filter(i => !i.sprintId)
      if (unassigned.length) result.push({ id: 'unassigned', label: 'Non assigné', items: unassigned })
      return result
    }
    if (groupBy === 'client') return state.clients.map(c => ({ id: c.id, label: c.name, color: c.color, items: filtered.filter(i => i.clientId === c.id) })).filter(g => g.items.length)
    if (groupBy === 'type')   return (['story','epic','bug','task','spike'] as ItemType[]).map(t => ({ id: t, label: TYPE_LABEL[t], items: filtered.filter(i => (i.type ?? 'story') === t) })).filter(g => g.items.length)
    // Chantier G (2026-07-23, complément) : basé sur `state.kanbanCols` seul, ce groupement ne
    // montrait aucun groupe pour un statut qui n'est plus (ou jamais été) une colonne active du
    // Kanban — "Annulé" étant désormais optionnel (3e complément du jour), un item annulé sans
    // colonne dédiée sur le board devenait invisible ici. `allStatusCols` (calculé plus haut,
    // catalogue `kanbanCols` ∪ `EXTRA_STAGES` restreint aux statuts réellement portés par des
    // items) couvre ce cas comme il couvre déjà celui du filtre STATUT juste au-dessus.
    if (groupBy === 'status') return allStatusCols.map(c => ({ id: c.id, label: c.label, color: c.color, items: filtered.filter(i => i.status === c.id) })).filter(g => g.items.length)
    if (groupBy === 'epic') {
      const allEpics = state.items.filter(i => i.type === 'epic')
      // Chantier G (complément, 2026-07-23) : un Epic est un item comme un autre — il doit donc
      // être soumis aux mêmes filtres (client/statut/tag/sprint/prêt) que ses enfants, pas
      // seulement "affiché s'il a un enfant filtré". `filtered` applique déjà tous ces filtres à
      // TOUS les items (Epics compris) ; un Epic est donc "retenu par les filtres actifs" s'il
      // apparaît dans cette liste, indépendamment de ses enfants.
      const matchingEpicIds = new Set(filtered.filter(i => i.type === 'epic').map(i => i.id))
      const result: Group[] = allEpics.map(ep => {
        const children = state.items.filter(i => i.epicId === ep.id)
        const filteredChildren = filtered.filter(i => i.epicId === ep.id)
        const childrenSP = children.reduce((s, i) => s + i.sp, 0)
        const epicFixed = ep.sp > 0
        const epicSP = epicFixed ? ep.sp : childrenSP
        const doneCount = children.filter(i => i.status === 'done').length
        const color = state.clients.find(c => c.id === ep.clientId)?.color
        return { id: ep.id, label: ep.key, sublabel: ep.desc, color, items: filteredChildren, epicSP, epicFixed, doneCount, capacity: epicSP, used: doneCount }
      })
      // Un groupe Epic reste affiché si l'Epic lui-même correspond aux filtres actifs — même sans
      // aucun enfant correspondant (un Epic "vide" au filtrage courant reste un Epic bien réel) —
      // ou s'il a au moins un enfant correspondant (l'Epic peut alors ne pas matcher lui-même,
      // ex. un Epic non daté rattaché malgré tout à des US filtrées). Précédent correctif du jour
      // (`g.items.length > 0` seul) corrigeait la vraie tautologie plus haut mais perdait ce
      // premier cas — signalé par l'utilisateur juste après coup.
        .filter(g => g.items.length > 0 || matchingEpicIds.has(g.id))
      const noEpic = filtered.filter(i => !i.epicId && i.type !== 'epic')
      if (noEpic.length) result.push({ id: 'no-epic', label: 'Sans Epic', items: noEpic })
      return result
    }
    return [{ id: 'all', label: 'Tous les items', items: filtered }]
  }, [groupBy, filtered, state.sprints, state.clients, state.kanbanCols, allStatusCols, filterSprint, filterClient, filterPriority, filterTag, filterStatus, filterReady])

  /* ── save / delete ── */
  function handleSave(item: Item, keyCounters?: Record<string, number>) {
    const isNew = !state.items.find(i => i.id === item.id)

    // Cascade: epic done → tous les enfants passent à 'done'
    const doneStatus = state.kanbanCols.find(c => c.isDone)?.id ?? 'done'
    const epicDoneCascade = item.type === 'epic' && item.status === doneStatus

    let base = isNew ? [...state.items, item] : state.items.map(i => i.id === item.id ? item : i)
    if (epicDoneCascade) {
      base = base.map(i => i.epicId === item.id ? { ...i, status: doneStatus } : i)
    }

    // Dispatch: item principal + enfants mis à jour
    if (isNew) {
      dispatch({ type: 'ADD_ITEM', payload: item, keyCounters })
    } else {
      dispatch({ type: 'UPDATE_ITEM', payload: item })
    }
    if (epicDoneCascade) {
      base.filter(i => i.epicId === item.id).forEach(child => {
        dispatch({ type: 'UPDATE_ITEM', payload: child })
      })
    }
    // Historique
    dispatch({ type: 'ADD_HISTORY', payload: {
      id: crypto.randomUUID(),
      type: isNew ? 'item_create' : 'item_edit',
      timestamp: new Date().toISOString(),
      itemKey: item.key,
      itemDesc: item.desc,
      sprintId: item.sprintId ?? undefined,
      author: userName,
    }})
    saveToServer({ ...state, items: base, ...(keyCounters ? { itemKeyCounters: keyCounters } : {}) })
  }
  function handleDelete(id: string) {
    const item = state.items.find(i => i.id === id)
    const isEpic = item?.type === 'epic'
    const children = isEpic ? findEpicChildren(state.items, id) : []
    const dependents = findDependents(state.items, id)
    const parts: string[] = []
    if (children.length > 0)   parts.push(`${children.length} item(s) enfant(s) seront détaché(s) de cet epic (conservés)`)
    if (dependents.length > 0) parts.push(`retiré des dépendances de ${dependents.length} item(s)`)
    const msg = parts.length > 0 ? `Supprimer cet item ? ${parts.join(', ')}.` : 'Supprimer cet item ?'
    if (!confirm(msg)) return
    dispatch({ type: 'DELETE_ITEM', payload: id })
    children.forEach(c => dispatch({ type: 'UPDATE_ITEM', payload: { ...c, epicId: null } }))
    dependents.forEach(d => dispatch({ type: 'UPDATE_ITEM', payload: { ...d, deps: (d.deps ?? []).filter(x => x !== id) } }))
    dispatch({ type: 'ADD_HISTORY', payload: {
      id: crypto.randomUUID(),
      type: 'item_delete',
      timestamp: new Date().toISOString(),
      itemKey: item?.key,
      itemDesc: item?.desc,
      author: userName,
    }})
    let remaining = state.items.filter(i => i.id !== id)
    if (children.length > 0)   remaining = detachEpicChildren(remaining, id)
    if (dependents.length > 0) remaining = detachDependents(remaining, id)
    saveToServer({ ...state, items: remaining })
  }
  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleGroup(id: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /* ── lookups ── */
  function getClient(id: string) { return state.clients.find(c => c.id === id) }
  function getMember(id: string) { return state.team.find(m => m.id === id) }
  function getSprint(id: string | null) { return id ? state.sprints.find(s => s.id === id) : null }
  function getStatus(id: string) { return state.kanbanCols.find(c => c.id === id) ?? EXTRA_STAGES.find(s => s.id === id) }
  function getDepItems(ids: string[]) { return ids.map(id => state.items.find(i => i.id === id)).filter(Boolean) as Item[] }

  return (
    <>
      <Header title="Product Backlog">
        <div style={{ flex: 1 }} />

        {/* Filter group — style copié du HTML */}
        <div className="filter-group">
          {/* Clients */}
          <div className={`fg-item${filterClient ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_USERS} />
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}>
              <option value="">Clients</option>
              {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <FgChev />
          </div>

          {/* Sprints */}
          <div className={`fg-item${filterSprint ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_CAL} />
            <select value={filterSprint} onChange={e => setFilterSprint(e.target.value)}>
              <option value="">Sprints</option>
              {state.sprints.map(s => <option key={s.id} value={s.id}>Sprint {s.number}</option>)}
              <option value="unassigned">Non assigné</option>
            </select>
            <FgChev />
          </div>

          {/* Tri */}
          <div className={`fg-item${sortBy ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_SORT} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="">Trier</option>
              <option value="key">Clé</option>
              <option value="priority">Priorité</option>
              <option value="sprint">Sprint</option>
              <option value="deadline">Deadline</option>
              <option value="sp-desc">SP ↓</option>
              <option value="sp-asc">SP ↑</option>
            </select>
            <FgChev />
          </div>

          {/* Grouper */}
          <div className={`fg-item${groupBy !== 'none' ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_LAYERS} />
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}>
              <option value="none">Grouper</option>
              <option value="sprint">Sprint</option>
              <option value="client">Client</option>
              <option value="type">Type</option>
              <option value="status">Statut</option>
              <option value="epic">Epic</option>
            </select>
            <FgChev />
          </div>

          {/* Tags */}
          <div className={`fg-item${filterTag ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_TAG} />
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)}>
              <option value="">Tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <FgChev />
          </div>

          {/* Statut */}
          <div className={`fg-item${filterStatus ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_STATUS} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Statut</option>
              {allStatusCols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <FgChev />
          </div>

          {/* Prêt (DoR 100%) */}
          <button
            className={`hdr-ctx-btn${filterReady ? ' filter-active' : ''}`}
            onClick={() => setFilterReady(v => !v)}
            title="Afficher uniquement les items avec DoR complète (prêts pour le sprint)"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: filterReady ? 700 : undefined }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
            Prêt
          </button>
        </div>

        <div className="hdr-ctx-sep" />
        <button className="hdr-btn primary" data-testid="btn-new-item" style={{ gap: 5, display: 'flex', alignItems: 'center' }}
          onClick={() => setModalItem(null)}>
          <Svg d={ICO_PLUS} size={11} /> Nouvel Item
        </button>
      </Header>

      <div className="page-content">
        <table className="backlog-table" data-testid="backlog-table">
          <thead>
            <tr>
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
          </thead>
          <tbody>
            {groups.map(group => {
              const isGroupCollapsed = groupBy === 'epic' && collapsedGroups.has(group.id)
              return (
              <React.Fragment key={group.id}>
                <tr className="sprint-row">
                  <td colSpan={15}>
                    <span className="sprint-badge" style={group.color ? { borderLeft: `3px solid ${group.color}`, paddingLeft: 10 } : undefined}>
                      {groupBy === 'epic' && (
                        <button className="btn-icon" style={{ opacity: .6, marginRight: 4 }}
                          onClick={() => toggleGroup(group.id)}
                          title={isGroupCollapsed ? 'Développer' : 'Réduire'}>
                          <Svg d={isGroupCollapsed ? SVG_CHEV_R : SVG_CHEV_D} size={12} />
                        </button>
                      )}
                      {group.label}
                      {group.sublabel && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>{group.sublabel}</span>}
                      {group.epicSP !== undefined ? (
                        <span className="sprint-capacity">
                          {group.doneCount}/{group.items.length} US terminées
                          <span style={{ marginLeft: 6, fontWeight: 600, color: group.color ?? 'var(--primary)' }}>{group.epicSP} SP</span>
                          {group.epicFixed && <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 3 }}>fixé</span>}
                          {!group.epicFixed && <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 3 }}>calculé</span>}
                        </span>
                      ) : group.capacity !== undefined ? (
                        <span className="sprint-capacity">
                          {group.used}/{group.capacity} SP
                          <span className="capacity-bar">
                            <span className="capacity-bar-fill" style={{
                              width: `${Math.min(100, ((group.used ?? 0) / group.capacity) * 100)}%`,
                              background: (group.used ?? 0) > group.capacity ? 'var(--danger)' : 'var(--primary)'
                            }} />
                          </span>
                        </span>
                      ) : null}
                      <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-faint)', fontWeight: 400 }}>
                        {group.items.length} item{group.items.length !== 1 ? 's' : ''} · {group.epicSP === undefined ? `${group.items.reduce((s, i) => s + i.sp, 0)} SP` : ''}
                      </span>
                    </span>
                  </td>
                </tr>

                {!isGroupCollapsed && group.items.map(item => {
                  const client   = getClient(item.clientId)
                  const sprint   = getSprint(item.sprintId)
                  const status   = getStatus(item.status)
                  const iType    = (item.type ?? 'story') as ItemType
                  const depItems = getDepItems(item.deps ?? [])
                  const dl       = item.deadline
                  const criteria = item.criteria ?? []
                  const hasUS = !!(item.role || item.need || item.benefit)
                  const isExpanded = expandedIds.has(item.id)

                  const depDepth = depChain.get(item.id)
                  const hasDeps = (item.deps ?? []).length > 0
                  const DEP_COLOR = 'var(--primary)'

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        onDoubleClick={() => setModalItem(item)}
                        onMouseEnter={() => setHoveredId(hasDeps ? item.id : null)}
                        onMouseLeave={() => setHoveredId(null)}
                        className={depDepth ? `dep-hl dep-hl-${depDepth}` : ''}
                        style={{ cursor: 'default' }}>
                        {/* Expand */}
                        <td style={{ textAlign: 'center', padding: '0 4px' }}>
                          {(criteria.length > 0 || hasUS) && (
                            <button className="btn-icon" style={{ opacity: .55 }}
                              onClick={e => { e.stopPropagation(); toggleExpand(item.id) }}
                              title={isExpanded ? 'Masquer' : `US${criteria.length > 0 ? ' + CA' : ''}`}>
                              <Svg d={isExpanded ? SVG_CHEV_D : SVG_CHEV_R} size={12} />
                            </button>
                          )}
                        </td>

                        {/* Prio */}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: PRIO_COLOR[item.priority], color: PRIO_TEXT[item.priority], whiteSpace: 'nowrap' }}>
                            {PRIO_LABEL[item.priority]}
                          </span>
                        </td>

                        {/* Clé */}
                        <td style={{ textAlign: 'center' }}>
                          <span className="item-key">{item.key}</span>
                        </td>

                        {/* Type */}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: TYPE_BG[iType], color: TYPE_FG[iType], whiteSpace: 'nowrap' }}>
                              {TYPE_LABEL[iType]}
                            </span>
                            {iType === 'bug' && item.severity && (
                              <span title={SEV_LABEL[item.severity]} style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[item.severity], display: 'inline-block', flexShrink: 0 }} />
                            )}
                          </span>
                        </td>

                        {/* Sprint */}
                        <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {sprint ? `S${sprint.number}` : '—'}
                        </td>

                        {/* Client */}
                        <td style={{ textAlign: 'center' }}>
                          {client && <span style={{ fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap' }}>{client.name}</span>}
                        </td>

                        {/* Statut */}
                        <td style={{ textAlign: 'center' }}>
                          {status && <span className="badge" style={{ background: status.color + '20', color: status.color }}>{status.label}</span>}
                        </td>

                        {/* Description */}
                        <td style={{ maxWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            <div style={{ minWidth: 0 }}>
                              {item.epicId && (() => {
                                const ep = state.items.find(x => x.id === item.epicId)
                                const epColor = ep ? (state.clients.find(c => c.id === ep.clientId)?.color ?? 'var(--primary)') : 'var(--primary)'
                                return ep ? <span title={ep.desc} style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: epColor + '18', color: epColor, marginBottom: 2, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.key}</span> : null
                              })()}
                              <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, lineHeight: 1.4 }}>
                                {item.desc}
                              </div>
                              {dl?.type !== 'none' && dl?.date && (
                                <span className={`deadline-badge deadline-${dl.type}`} style={{ marginTop: 3, display: 'inline-flex' }}>
                                  {fmtDate(dl.date)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Tags */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
                            {item.tags.map(t => <span key={t} className="tag">{t}</span>)}
                          </div>
                        </td>

                        {/* Assignés */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            {item.assignees.map(id => {
                              const m = getMember(id)
                              return m ? <span key={id} className="avatar" title={m.name}>{m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span> : null
                            })}
                          </div>
                        </td>

                        {/* SP */}
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: 12 }}>
                          {iType === 'epic' ? (() => {
                            const fixed = item.sp > 0
                            const sp = fixed ? item.sp : state.items.filter(i => i.epicId === item.id).reduce((s, i) => s + i.sp, 0)
                            return (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                {sp}
                                {!fixed && <span style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 400 }} title="Somme des US enfants">Σ</span>}
                              </span>
                            )
                          })() : item.sp}
                        </td>

                        {/* Dépendances */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {depItems.length === 0 && !depDepth && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>}
                          {depItems.slice(0, 2).map(d => (
                            <span key={d.id} style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', borderRadius: 4, padding: '1px 5px', marginRight: 3 }}>{d.key}</span>
                          ))}
                          {depItems.length > 2 && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 3 }}>{depItems.length} dép.</span>}
                          {depDepth !== undefined && (
                            <span className="dep-level-badge" style={{ background: DEP_COLOR }}>Niv.{depDepth}</span>
                          )}
                        </td>

                        {/* DoR */}
                        <td style={{ textAlign: 'center' }} data-testid="dor-cell">
                          <DorDodBadge stat={dorDodStat(item.dor)} label="DoR" />
                        </td>

                        {/* DoD */}
                        <td style={{ textAlign: 'center' }} data-testid="dod-cell">
                          <DorDodBadge stat={dorDodStat(item.dod)} label="DoD" />
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button className="btn-icon" onClick={() => setModalItem(item)} title="Modifier"><Svg d={SVG_EDIT} /></button>
                          <button className="btn-icon danger" onClick={() => handleDelete(item.id)} title="Supprimer"><Svg d={SVG_DEL} /></button>
                        </td>
                      </tr>

                      {/* US + CA expand */}
                      {isExpanded && (hasUS || criteria.length > 0) && (
                        <tr className="ca-expand-row">
                          <td colSpan={15} className="ca-expand-cell">
                            <div className="ca-expand-inner">
                              {hasUS && (
                                <div className="ca-us-block">
                                  <div className="ca-label-top">User Story</div>
                                  {item.role && <div className="ca-us-row"><span className="ca-us-prefix">En tant que</span><span>{item.role}</span></div>}
                                  {item.need && <div className="ca-us-row"><span className="ca-us-prefix">je souhaite</span><span>{item.need}</span></div>}
                                  {item.benefit && <div className="ca-us-row"><span className="ca-us-prefix">afin de</span><span>{item.benefit}</span></div>}
                                </div>
                              )}
                              {criteria.length > 0 && (
                                <div className="ca-bdd-block">
                                  <div className="ca-label-top">
                                    {item.type === 'bug' ? 'Critères de résolution' : "Critères d'acceptation"}
                                  </div>
                                  {criteria.map((c, ci) => (
                                    <div key={c.id} className="ca-bdd-row">
                                      <span className="ca-bdd-num">#{ci + 1}</span>
                                      <span className="ca-bdd-field given">{c.given}</span>
                                      <span className="ca-bdd-sep">→</span>
                                      <span className="ca-bdd-field when">{c.when}</span>
                                      <span className="ca-bdd-sep">→</span>
                                      <span className="ca-bdd-field then">{c.then}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            )
          })}
          </tbody>
        </table>
      </div>

      {modalItem !== undefined && (
        <ModalErrorBoundary key={modalItem?.id ?? 'new'} onClose={() => setModalItem(undefined)}>
          <ItemModal item={modalItem} state={state} onSave={handleSave} onClose={() => setModalItem(undefined)} />
        </ModalErrorBoundary>
      )}
    </>
  )
}
