import React, { useMemo, useState } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { ItemModal } from '../components/backlog/ItemModal'
import type { Item, ItemType } from '../types'

/* ─── Helpers ────────────────────────────────────────────────────── */
const PRIO_LABEL: Record<string, string>  = { critical: 'P1', high: 'P2', medium: 'P3', low: 'P4' }
const PRIO_COLOR: Record<string, string>  = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#94a3b8' }
const PRIO_ORDER: Record<string, number>  = { critical: 0, high: 1, medium: 2, low: 3 }
const TYPE_LABEL: Record<ItemType, string> = { story: 'Story', epic: '⬡ EPIC', bug: '🐛 Bug', task: '🔧 Tâche', spike: '⚡ Spike' }
const TYPE_COLOR: Record<ItemType, string> = {
  story: '',
  epic:  'var(--primary)',
  bug:   '#dc2626',
  task:  '#2563eb',
  spike: '#d97706',
}

type GroupBy = 'sprint' | 'client' | 'type' | 'status' | 'none'

interface Group {
  id: string
  label: string
  sublabel?: string
  color?: string
  items: Item[]
  capacity?: number
  used?: number
}

/* ─── SVG icons ──────────────────────────────────────────────────── */
function Svg({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}
const SVG_EDIT   = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>'
const SVG_DELETE = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>'

/* ─── Component ─────────────────────────────────────────────────── */
export function BacklogPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined)
  const [filterSprint,   setFilterSprint]   = useState('')
  const [filterClient,   setFilterClient]   = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterTag,      setFilterTag]      = useState('')
  const [groupBy,        setGroupBy]        = useState<GroupBy>('sprint')
  const [sortBy,         setSortBy]         = useState('priority')

  const allTags = useMemo(() => {
    const s = new Set<string>()
    state.items.forEach(i => i.tags.forEach(t => s.add(t)))
    return Array.from(s).sort()
  }, [state.items])

  /* filter */
  const filtered = useMemo(() => {
    let items = [...state.items]
    if (filterSprint === 'unassigned') items = items.filter(i => !i.sprintId)
    else if (filterSprint) items = items.filter(i => i.sprintId === filterSprint)
    if (filterClient)   items = items.filter(i => i.clientId === filterClient)
    if (filterPriority) items = items.filter(i => i.priority === filterPriority)
    if (filterTag)      items = items.filter(i => i.tags.includes(filterTag))
    items.sort((a, b) => {
      if (sortBy === 'sp-desc') return b.sp - a.sp
      if (sortBy === 'sp-asc')  return a.sp - b.sp
      if (sortBy === 'created') return a.createdAt.localeCompare(b.createdAt)
      return (PRIO_ORDER[a.priority] ?? 4) - (PRIO_ORDER[b.priority] ?? 4)
    })
    return items
  }, [state.items, filterSprint, filterClient, filterPriority, filterTag, sortBy])

  /* group */
  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'sprint') {
      const result: Group[] = []
      state.sprints.forEach(sp => {
        const items = filtered.filter(i => i.sprintId === sp.id)
        if (items.length || (!filterSprint && !filterClient && !filterPriority && !filterTag))
          result.push({ id: sp.id, label: sp.label + (sp.closed ? ' ✓' : ''), items,
            capacity: sp.capacity, used: items.reduce((s, i) => s + i.sp, 0) })
      })
      const unassigned = filtered.filter(i => !i.sprintId)
      if (unassigned.length) result.push({ id: 'unassigned', label: 'Non assigné', items: unassigned })
      return result.filter(g => g.items.length)
    }
    if (groupBy === 'client') {
      return state.clients.map(c => ({
        id: c.id, label: c.name, color: c.color,
        items: filtered.filter(i => i.clientId === c.id)
      })).filter(g => g.items.length)
    }
    if (groupBy === 'type') {
      const order: ItemType[] = ['epic', 'story', 'bug', 'task', 'spike']
      return order.map(t => ({
        id: t, label: TYPE_LABEL[t], color: TYPE_COLOR[t] || 'var(--text-muted)',
        items: filtered.filter(i => (i.type ?? 'story') === t)
      })).filter(g => g.items.length)
    }
    if (groupBy === 'status') {
      return state.kanbanCols.map(col => ({
        id: col.id, label: col.label, color: col.color,
        items: filtered.filter(i => i.status === col.id)
      })).filter(g => g.items.length)
    }
    /* none */
    return [{ id: 'all', label: `${filtered.length} items`, items: filtered }]
  }, [groupBy, filtered, state.sprints, state.clients, state.kanbanCols,
      filterSprint, filterClient, filterPriority, filterTag])

  /* actions */
  function handleSave(item: Item) {
    const exists = state.items.find(i => i.id === item.id)
    const next = exists
      ? state.items.map(i => i.id === item.id ? item : i)
      : [...state.items, item]
    dispatch({ type: exists ? 'UPDATE_ITEM' : 'ADD_ITEM', payload: item })
    saveToServer({ ...state, items: next })
    setModalItem(undefined)
  }

  function handleDelete(id: string) {
    if (!confirm('Supprimer cet item ?')) return
    dispatch({ type: 'DELETE_ITEM', payload: id })
    saveToServer({ ...state, items: state.items.filter(i => i.id !== id) })
  }

  /* lookup helpers */
  function getClient(id: string) { return state.clients.find(c => c.id === id) }
  function getMember(id: string) { return state.team.find(m => m.id === id) }
  function getSprint(id: string | null) { return id ? state.sprints.find(s => s.id === id) : null }
  function getStatus(id: string) { return state.kanbanCols.find(c => c.id === id) }
  function getDepItems(ids: string[]) { return ids.map(id => state.items.find(i => i.id === id)).filter(Boolean) as Item[] }

  return (
    <>
      <Header title="Product Backlog">
        <div className="hdr-sep" />
        <select className="hdr-select" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">Clients</option>
          {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="hdr-select" value={filterSprint} onChange={e => setFilterSprint(e.target.value)}>
          <option value="">Sprints</option>
          {state.sprints.map(s => <option key={s.id} value={s.id}>Sprint {s.number}</option>)}
          <option value="unassigned">Non assigné</option>
        </select>
        <select className="hdr-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">Priorité</option>
          <option value="critical">P1 – Critique</option>
          <option value="high">P2 – Haute</option>
          <option value="medium">P3 – Normale</option>
          <option value="low">P4 – Faible</option>
        </select>
        <select className="hdr-select" value={filterTag} onChange={e => setFilterTag(e.target.value)}>
          <option value="">Tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="hdr-sep" />
        <select className="hdr-select" value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}>
          <option value="sprint">Grouper : Sprint</option>
          <option value="client">Grouper : Client</option>
          <option value="type">Grouper : Type</option>
          <option value="status">Grouper : Statut</option>
          <option value="none">Grouper : Aucun</option>
        </select>
        <select className="hdr-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="priority">Tri : Priorité</option>
          <option value="sp-desc">Tri : SP ↓</option>
          <option value="sp-asc">Tri : SP ↑</option>
          <option value="created">Tri : Création</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="hdr-btn primary" onClick={() => setModalItem(null)}>+ Nouvel Item</button>
      </Header>

      <div className="page-content">
        <table className="backlog-table">
          <thead>
            <tr>
              <th style={{ width: 46 }}>Prio.</th>
              <th style={{ width: 88 }}>Clé</th>
              <th style={{ width: 50 }}>Sprint</th>
              <th style={{ width: 108 }}>Client</th>
              <th style={{ width: 100 }}>Statut</th>
              <th>Description</th>
              <th style={{ width: 110 }}>Tags</th>
              <th style={{ width: 80 }}>Assignés</th>
              <th style={{ width: 42, textAlign: 'center' }}>SP</th>
              <th style={{ width: 80 }}>Dép.</th>
              <th style={{ width: 64, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <React.Fragment key={group.id}>
                {/* Group header */}
                <tr className="sprint-row">
                  <td colSpan={11}>
                    <span className="sprint-badge" style={group.color ? { borderLeft: `3px solid ${group.color}`, paddingLeft: 10 } : undefined}>
                      {group.label}
                      {group.capacity !== undefined && (
                        <span className="sprint-capacity">
                          {group.used}/{group.capacity} SP
                          <span className="capacity-bar">
                            <span className="capacity-bar-fill" style={{
                              width: `${Math.min(100, ((group.used ?? 0) / group.capacity) * 100)}%`,
                              background: (group.used ?? 0) > group.capacity ? 'var(--danger)' : 'var(--primary)'
                            }} />
                          </span>
                        </span>
                      )}
                      <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-faint)', fontWeight: 400 }}>
                        {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                        {' · '}{group.items.reduce((s, i) => s + i.sp, 0)} SP
                      </span>
                    </span>
                  </td>
                </tr>

                {/* Items */}
                {group.items.map(item => {
                  const client   = getClient(item.clientId)
                  const sprint   = getSprint(item.sprintId)
                  const status   = getStatus(item.status)
                  const iType    = (item.type ?? 'story') as ItemType
                  const depItems = getDepItems(item.deps ?? [])
                  const dl       = item.deadline

                  return (
                    <tr key={item.id} onDoubleClick={() => setModalItem(item)} style={{ cursor: 'default' }}>

                      {/* Prio */}
                      <td style={{ textAlign: 'center' }}>
                        <span className="prio-badge" style={{ background: PRIO_COLOR[item.priority] }}>
                          {PRIO_LABEL[item.priority]}
                        </span>
                      </td>

                      {/* Clé */}
                      <td>
                        <span className="item-key" style={{ color: client?.color ?? 'var(--primary)', background: (client?.color ?? '#4f46e5') + '18' }}>
                          {item.key}
                        </span>
                      </td>

                      {/* Sprint */}
                      <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {sprint ? `S${sprint.number}` : '—'}
                      </td>

                      {/* Client */}
                      <td>
                        {client && (
                          <span className="badge" style={{ background: client.color + '18', color: client.color }}>
                            {client.name}
                          </span>
                        )}
                      </td>

                      {/* Statut */}
                      <td>
                        {status && (
                          <span className="badge" style={{ background: status.color + '20', color: status.color }}>
                            {status.label}
                          </span>
                        )}
                      </td>

                      {/* Description */}
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          {iType !== 'story' && (
                            <span className="item-type-badge" style={{ background: (TYPE_COLOR[iType] || 'var(--primary)') + '18', color: TYPE_COLOR[iType] || 'var(--primary)', flexShrink: 0, marginTop: 1 }}>
                              {TYPE_LABEL[iType]}
                            </span>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, lineHeight: 1.4 }}>
                              {item.desc}
                            </div>
                            {dl && dl.type !== 'none' && dl.date && (
                              <span className={`deadline-badge deadline-${dl.type}`} style={{ marginTop: 3, display: 'inline-flex' }}>
                                📅 {new Date(dl.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Tags */}
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {item.tags.map(t => <span key={t} className="tag">{t}</span>)}
                        </div>
                      </td>

                      {/* Assignés */}
                      <td>
                        <div style={{ display: 'flex' }}>
                          {item.assignees.map(id => {
                            const m = getMember(id)
                            return m ? (
                              <span key={id} className="avatar" title={m.name}>
                                {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            ) : null
                          })}
                        </div>
                      </td>

                      {/* SP */}
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: 12 }}>
                        {item.sp}
                      </td>

                      {/* Dép. */}
                      <td>
                        {depItems.length === 0
                          ? <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
                          : depItems.length <= 2
                            ? depItems.map(d => (
                                <span key={d.id} style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
                                  color: 'var(--primary)', background: 'var(--primary-light)',
                                  borderRadius: 4, padding: '1px 5px', marginRight: 3 }}>
                                  {d.key}
                                </span>
                              ))
                            : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{depItems.length} dép.</span>
                        }
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button className="btn-icon" onClick={() => setModalItem(item)} title="Modifier" aria-label={`Modifier ${item.key}`}>
                          <Svg d={SVG_EDIT} />
                        </button>
                        <button className="btn-icon danger" onClick={() => handleDelete(item.id)} title="Supprimer" aria-label={`Supprimer ${item.key}`}>
                          <Svg d={SVG_DELETE} />
                        </button>
                      </td>

                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {modalItem !== undefined && (
        <ItemModal item={modalItem} state={state} onSave={handleSave} onClose={() => setModalItem(undefined)} />
      )}
    </>
  )
}
