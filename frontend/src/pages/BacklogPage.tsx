import React from 'react'
import { useState, useMemo } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { ItemModal } from '../components/backlog/ItemModal'
import type { Item } from '../types'

const PRIORITY_LABEL: Record<string, string> = { critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible' }
const SORT_OPTIONS = [
  { value: 'priority', label: 'Priorité' },
  { value: 'sp-desc', label: 'SP ↓' },
  { value: 'sp-asc', label: 'SP ↑' },
  { value: 'created', label: 'Création' },
]

function priorityOrder(p: string) { return { critical: 0, high: 1, medium: 2, low: 3 }[p] ?? 4 }

export function BacklogPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined) // undefined=closed, null=new
  const [filterSprint, setFilterSprint] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [sortBy, setSortBy] = useState('priority')

  const allTags = useMemo(() => {
    const s = new Set<string>()
    state.items.forEach(i => i.tags.forEach(t => s.add(t)))
    return Array.from(s).sort()
  }, [state.items])

  const filteredItems = useMemo(() => {
    let items = [...state.items]
    if (filterSprint === 'unassigned') items = items.filter(i => !i.sprintId)
    else if (filterSprint) items = items.filter(i => i.sprintId === filterSprint)
    if (filterClient) items = items.filter(i => i.clientId === filterClient)
    if (filterTag) items = items.filter(i => i.tags.includes(filterTag))
    items.sort((a, b) => {
      if (sortBy === 'sp-desc') return b.sp - a.sp
      if (sortBy === 'sp-asc') return a.sp - b.sp
      if (sortBy === 'created') return a.createdAt.localeCompare(b.createdAt)
      return priorityOrder(a.priority) - priorityOrder(b.priority)
    })
    return items
  }, [state.items, filterSprint, filterClient, filterTag, sortBy])

  function getClient(id: string) { return state.clients.find(c => c.id === id) }
  function getMember(id: string) { return state.team.find(m => m.id === id) }
  function getStatus(id: string) { return state.kanbanCols.find(c => c.id === id) }

  function handleSave(item: Item) {
    const action = state.items.find(i => i.id === item.id)
      ? { type: 'UPDATE_ITEM' as const, payload: item }
      : { type: 'ADD_ITEM' as const, payload: item }
    dispatch(action)
    saveToServer({ ...state, items: action.type === 'ADD_ITEM' ? [...state.items, item] : state.items.map(i => i.id === item.id ? item : i) })
    setModalItem(undefined)
  }

  function handleDelete(id: string) {
    if (!confirm('Supprimer cette US ?')) return
    dispatch({ type: 'DELETE_ITEM', payload: id })
    saveToServer({ ...state, items: state.items.filter(i => i.id !== id) })
  }

  // Grouper par sprint
  const groups = useMemo(() => {
    const result: { sprintId: string | null; label: string; items: Item[] }[] = []
    const sprintMap = new Map(state.sprints.map(s => [s.id, s]))

    const addedSprints = new Set<string | null>()
    for (const sp of state.sprints) {
      const items = filteredItems.filter(i => i.sprintId === sp.id)
      if (items.length || (!filterSprint && !filterClient && !filterTag)) {
        if (!addedSprints.has(sp.id)) {
          result.push({ sprintId: sp.id, label: sp.label + (sp.closed ? ' ✓' : ''), items })
          addedSprints.add(sp.id)
        }
      }
    }
    const unassigned = filteredItems.filter(i => !i.sprintId)
    if (unassigned.length) result.push({ sprintId: null, label: 'Non assigné', items: unassigned })

    return result.filter(g => g.items.length > 0)
      .map(g => {
        const sp = g.sprintId ? sprintMap.get(g.sprintId) : null
        const usedSP = g.items.reduce((s, i) => s + i.sp, 0)
        return { ...g, sp, usedSP }
      })
  }, [state.sprints, filteredItems, filterSprint, filterClient, filterTag])

  return (
    <>
      <Header title="Backlog">
        <div className="hdr-sep" />
        <select className="hdr-select" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">Tous les clients</option>
          {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="hdr-select" id="backlog-filter-sprint" value={filterSprint} onChange={e => setFilterSprint(e.target.value)}>
          <option value="">Tous les sprints</option>
          {state.sprints.map(s => <option key={s.id} value={s.id}>Sprint {s.number}</option>)}
          <option value="unassigned">Non assigné</option>
        </select>
        <select className="hdr-select" value={filterTag} onChange={e => setFilterTag(e.target.value)}>
          <option value="">Tous les tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="hdr-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="hdr-btn primary" onClick={() => setModalItem(null)}>+ Nouvelle US</button>
      </Header>

      <div className="page-content">
        <table className="backlog-table">
          <thead>
            <tr>
              <th>Clé</th>
              <th>Description</th>
              <th>SP</th>
              <th>Priorité</th>
              <th>Statut</th>
              <th>Client</th>
              <th>Assigné</th>
              <th>Tags</th>
              <th style={{ width: 72 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <React.Fragment key={group.sprintId ?? "unassigned"}>
                <tr className="sprint-row">
                  <td colSpan={9}>
                    <span className="sprint-badge">
                      {group.label}
                      {group.sp && (
                        <span className="sprint-capacity">
                          {group.usedSP}/{group.sp.capacity} SP
                          <span className="capacity-bar">
                            <span className="capacity-bar-fill" style={{ width: `${Math.min(100, (group.usedSP / group.sp.capacity) * 100)}%`, background: group.usedSP > group.sp.capacity ? 'var(--danger)' : 'var(--primary)' }} />
                          </span>
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
                {group.items.map(item => {
                  const client = getClient(item.clientId)
                  const status = getStatus(item.status)
                  return (
                    <tr key={item.id}>
                      <td><span className="item-key">{item.key}</span></td>
                      <td style={{ maxWidth: 280 }}>
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.desc}</span>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>{item.sp}</td>
                      <td>
                        <span className={`badge badge-priority-${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span>
                      </td>
                      <td>
                        {status && (
                          <span className="badge" style={{ background: status.color + '20', color: status.color }}>{status.label}</span>
                        )}
                      </td>
                      <td>
                        {client && (
                          <span className="badge" style={{ background: client.color + '18', color: client.color }}>{client.name}</span>
                        )}
                      </td>
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
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {item.tags.map(t => <span key={t} className="tag">{t}</span>)}
                        </div>
                      </td>
                      <td>
                        <button className="btn-icon" onClick={() => setModalItem(item)} title="Modifier" aria-label={`Modifier ${item.key}`}>✎</button>
                        <button className="btn-icon danger" onClick={() => handleDelete(item.id)} title="Supprimer" aria-label={`Supprimer ${item.key}`}>🗑</button>
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
        <ItemModal
          item={modalItem}
          state={state}
          onSave={handleSave}
          onClose={() => setModalItem(undefined)}
        />
      )}
    </>
  )
}
