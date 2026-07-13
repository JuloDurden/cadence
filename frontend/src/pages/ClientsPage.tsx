import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { ClientModal } from '../components/clients/ClientModal'
import { fmtDateShort } from '../utils/dates'
import type { Client, ClientGroup } from '../types'

// ── Icônes Lucide (SVG inline) ───────────────────────────────────────────
const ICO_LIST_VIEW =
  '<rect width="7" height="7" x="3" y="3" rx="1"/>' +
  '<rect width="7" height="7" x="3" y="14" rx="1"/>' +
  '<path d="M14 4h7"/><path d="M14 9h7"/><path d="M14 15h7"/><path d="M14 20h7"/>'

const ICO_GANTT =
  '<path d="M8 6h10"/><path d="M6 12h9"/><path d="M11 18h7"/>' +
  '<path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'

const ICO_CHEVRON = '<path d="m6 9 6 6 6-6"/>'

const ICO_EDIT =
  '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
  '<path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>'

const ICO_DELETE =
  '<path d="M3 6h18"/>' +
  '<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>' +
  '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>' +
  '<line x1="10" x2="10" y1="11" y2="17"/>' +
  '<line x1="14" x2="14" y1="11" y2="17"/>'

function ViewIco({ d }: { d: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const SEG_BTN = (active: boolean): CSSProperties => ({
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-muted)',
  border: 'none', cursor: 'pointer', padding: '0 9px', height: 30,
  display: 'flex', alignItems: 'center', transition: 'background .15s, color .15s',
})

// ── Constantes ───────────────────────────────────────────────────────────
const RAG_COLOR = { R: '#ff3b30', A: '#ff9500', G: '#34c759' }
const RAG_LABEL = { R: 'Critique', A: 'Attention', G: 'OK' }
const GROUP_COLORS = ['#1d4ed8','#7c3aed','#15803d','#c2410c','#475569','#0891b2','#be185d','#d97706']

function fmtCA(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K€`
  return `${n}€`
}
function uid() { return Math.random().toString(36).slice(2) }

// ── Types locaux ─────────────────────────────────────────────────────────
type ClientStat = {
  client: Client; total: number; done: number
  totalSP: number; doneSP: number; pct: number
}

// ── Card client (réutilisable à l'intérieur d'un groupe et dans le panneau droit) ──
function ClientCard({
  stat, group, compact = false,
  dragging, onDragStart, onDragEnd, onEdit, onDelete,
}: {
  stat: ClientStat
  group?: ClientGroup
  compact?: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { client, total, done, totalSP, doneSP, pct } = stat
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-testid={compact ? `group-member-${client.id}` : `client-card-${client.id}`}
      style={{
        background: 'var(--surface)', borderRadius: compact ? 8 : 'var(--radius)',
        boxShadow: 'var(--shadow)', overflow: 'hidden',
        cursor: 'grab', opacity: dragging ? 0.4 : 1, transition: 'opacity .15s',
      }}
    >
      {/* En-tête coloré */}
      <div style={{ background: client.color, padding: compact ? '6px 10px' : '10px 14px',
        display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontWeight: 800, fontSize: compact ? 11 : 13, color: '#fff', letterSpacing: '0.5px' }}>
          {client.prefix}
        </span>
        {!compact && group && (
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,.28)',
            color: '#fff', borderRadius: 10, padding: '2px 7px', flexShrink: 0 }}>
            {group.name}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button className="btn-icon" title="Modifier"
            onClick={onEdit} onMouseDown={e => e.stopPropagation()}
            style={{ color: 'rgba(255,255,255,.85)', padding: compact ? '1px 3px' : '2px 4px', display: 'flex', alignItems: 'center' }}>
            <ViewIco d={ICO_EDIT} />
          </button>
          {!compact && (
            <button className="btn-icon" title="Supprimer"
              onClick={onDelete} onMouseDown={e => e.stopPropagation()}
              style={{ color: 'rgba(255,255,255,.85)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
              <ViewIco d={ICO_DELETE} />
            </button>
          )}
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding: compact ? '6px 10px' : '10px 14px',
        display: 'flex', flexDirection: 'column', gap: compact ? 3 : 6 }}>
        <div style={{ fontWeight: 700, fontSize: compact ? 12 : 14,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {client.name}
        </div>
        {!compact && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
              background: 'var(--surface2)', color: 'var(--text-secondary)' }}>{client.tier}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{fmtCA(client.annualRevenue)}</span>
          </div>
        )}
        <div style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: RAG_COLOR[client.rag] }}>
          ● {RAG_LABEL[client.rag]}
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: compact ? 9 : 10, color: 'var(--text-muted)' }}>
              {done}/{total} US{!compact && ` · ${doneSP}/${totalSP} SP`}
            </span>
            <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700 }}>{pct}%</span>
          </div>
          <div style={{ height: compact ? 3 : 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: client.color,
              borderRadius: 2, transition: 'width .3s' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal Groupe ─────────────────────────────────────────────────────────
function GroupModal({ group, clients, onSave, onClose }: {
  group: ClientGroup | null; clients: Client[]
  onSave: (g: ClientGroup) => void; onClose: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [color, setColor] = useState(group?.color ?? '#6366f1')
  const [selectedIds, setSelectedIds] = useState<string[]>(group?.clientIds ?? [])

  function toggle(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function handleSubmit() {
    if (!name.trim()) return
    onSave({ id: group?.id ?? 'cg' + uid(), name: name.trim(), color, clientIds: selectedIds })
  }

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}
      data-testid="group-modal">
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <span className="modal-title">{group ? 'Modifier le groupe' : 'Nouveau groupe'}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Nom du groupe</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex : Grands comptes" autoFocus data-testid="group-name-input" />
          </div>
          <div className="form-group">
            <label className="form-label">Couleur</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {GROUP_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: 24, height: 24, borderRadius: '50%', background: c,
                  border: color === c ? '3px solid var(--text)' : '2px solid transparent',
                  cursor: 'pointer', outline: 'none',
                }} />
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Clients membres</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clients.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggle(c.id)}
                    data-testid={`group-cb-${c.id}`} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color,
                    display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{c.tier}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim()}
            data-testid="group-save-btn">Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────
export function ClientsPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [view, setView] = useState<'liste' | 'timeline'>('liste')
  const [modal, setModal] = useState<Client | null | undefined>(undefined)
  const [groupModal, setGroupModal] = useState<ClientGroup | null | undefined>(undefined)

  // Dropdown — position fixe pour échapper à l'overflow du header
  // Fix : deux refs (bouton + menu) pour que mousedown sur le menu ne ferme pas avant le click
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // DnD
  const [draggingClientId, setDraggingClientId] = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)

  const groups = state.clientGroups ?? []

  // Ferme le menu UNIQUEMENT si le clic est en dehors du bouton ET du menu
  useEffect(() => {
    if (!menuOpen) return
    function handle(e: MouseEvent) {
      if (
        !addBtnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setMenuOpen(false)
        setMenuPos(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [menuOpen])

  function openMenu() {
    if (menuOpen) { setMenuOpen(false); setMenuPos(null); return }
    const rect = addBtnRef.current?.getBoundingClientRect()
    if (rect) {
      setMenuOpen(true)
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }

  // ── Client CRUD ──────────────────────────────────────────────────────
  function handleSave(client: Client) {
    const isNew = !state.clients.find(c => c.id === client.id)
    dispatch({ type: isNew ? 'ADD_CLIENT' : 'UPDATE_CLIENT', payload: client })
    saveToServer({ ...state, clients: isNew ? [...state.clients, client] : state.clients.map(c => c.id === client.id ? client : c) })
    setModal(undefined)
  }
  function handleDelete(id: string) {
    if (!confirm('Supprimer ce client ?')) return
    dispatch({ type: 'DELETE_CLIENT', payload: id })
    saveToServer({ ...state, clients: state.clients.filter(c => c.id !== id) })
  }

  // ── Groupe CRUD ──────────────────────────────────────────────────────
  function handleSaveGroup(g: ClientGroup) {
    const isNew = !groups.find(x => x.id === g.id)
    const updated = isNew ? [...groups, g] : groups.map(x => x.id === g.id ? g : x)
    dispatch({ type: isNew ? 'ADD_CLIENT_GROUP' : 'UPDATE_CLIENT_GROUP', payload: g })
    saveToServer({ ...state, clientGroups: updated })
    setGroupModal(undefined)
  }
  function handleDeleteGroup(id: string) {
    if (!confirm('Supprimer ce groupe ?')) return
    dispatch({ type: 'DELETE_CLIENT_GROUP', payload: id })
    saveToServer({ ...state, clientGroups: groups.filter(g => g.id !== id) })
  }

  // ── DnD — déposer dans un groupe ────────────────────────────────────
  function handleDragOver(e: React.DragEvent, groupId: string) {
    e.preventDefault()
    if (dragOverGroupId !== groupId) setDragOverGroupId(groupId)
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroupId(null)
  }
  function handleDrop(e: React.DragEvent, groupId: string) {
    e.preventDefault()
    const cid = draggingClientId
    if (!cid) return
    // Retire du groupe actuel (si existant), puis ajoute au groupe cible
    const updated = groups.map(g => {
      const without = g.clientIds.filter(id => id !== cid)
      return g.id === groupId ? { ...g, clientIds: [...without, cid] } : { ...g, clientIds: without }
    })
    updated.forEach((g, i) => {
      if (g.clientIds.join() !== groups[i].clientIds.join())
        dispatch({ type: 'UPDATE_CLIENT_GROUP', payload: g })
    })
    saveToServer({ ...state, clientGroups: updated })
    setDraggingClientId(null)
    setDragOverGroupId(null)
  }

  // ── DnD — déposer dans le panneau droit = désassigner ───────────────
  function handleDropUnassign(e: React.DragEvent) {
    e.preventDefault()
    const cid = draggingClientId
    if (!cid) return
    const updated = groups.map(g => ({ ...g, clientIds: g.clientIds.filter(id => id !== cid) }))
    updated.forEach((g, i) => {
      if (g.clientIds.join() !== groups[i].clientIds.join())
        dispatch({ type: 'UPDATE_CLIENT_GROUP', payload: g })
    })
    saveToServer({ ...state, clientGroups: updated })
    setDraggingClientId(null)
    setDragOverGroupId(null)
  }
  function handleDragEnd() { setDraggingClientId(null); setDragOverGroupId(null) }

  // ── Stats ────────────────────────────────────────────────────────────
  const clientStats = useMemo((): ClientStat[] => state.clients.map(client => {
    const items = state.items.filter(i => i.clientId === client.id)
    const done = items.filter(i => ['done','delivered'].includes(i.status))
    const totalSP = items.reduce((s, i) => s + i.sp, 0)
    const doneSP = done.reduce((s, i) => s + i.sp, 0)
    return { client, total: items.length, done: done.length, totalSP, doneSP,
      pct: items.length ? Math.round((done.length / items.length) * 100) : 0 }
  }), [state.clients, state.items])

  const menuItemStyle: CSSProperties = {
    display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, color: 'var(--text)',
  }

  return (
    <>
      <Header title="Clients">
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{state.clients.length} clients</span>
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{groups.length} groupes</span>
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button style={SEG_BTN(view === 'liste')} onClick={() => setView('liste')}
            title="Vue Liste" data-testid="btn-view-liste">
            <ViewIco d={ICO_LIST_VIEW} />
          </button>
          <button style={{ ...SEG_BTN(view === 'timeline'), borderLeft: '1px solid var(--border)' }}
            onClick={() => setView('timeline')} title="Vue Timeline" data-testid="btn-view-timeline">
            <ViewIco d={ICO_GANTT} />
          </button>
        </div>

        <button ref={addBtnRef} className="hdr-btn primary" onClick={openMenu}
          data-testid="btn-add-menu"
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          + Ajouter <ViewIco d={ICO_CHEVRON} />
        </button>
      </Header>

      {/* Dropdown en position fixe — rendu hors du header pour échapper à son overflow */}
      {menuOpen && menuPos && (
        <div ref={menuRef} style={{
          position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          minWidth: 160, overflow: 'hidden',
        }}>
          <button style={menuItemStyle} data-testid="menu-new-client"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setModal(null); setMenuOpen(false); setMenuPos(null) }}>
            Nouveau client
          </button>
          <button style={{ ...menuItemStyle, borderTop: '1px solid var(--border)' }} data-testid="menu-new-group"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setGroupModal(null); setMenuOpen(false); setMenuPos(null) }}>
            Nouveau groupe
          </button>
        </div>
      )}

      <div className="page-content">
        {view === 'timeline' ? (
          <TimelineView state={state} />
        ) : (
          <div style={{ display: 'flex', gap: 20, height: '100%', minHeight: 0 }}>

            {/* ── Panneau gauche : Groupes en dropzones (50 %) ── */}
            {groups.length > 0 && (
              <div style={{ width: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16,
                overflowY: 'auto' }} data-testid="groups-panel">
                {groups.map(group => {
                  const isOver = dragOverGroupId === group.id
                  const gc = group.color ?? '#6366f1'
                  const memberStats = group.clientIds.map(id => clientStats.find(s => s.client.id === id)).filter(Boolean) as ClientStat[]

                  return (
                    <div
                      key={group.id}
                      data-testid={`group-card-${group.id}`}
                      onDragOver={e => handleDragOver(e, group.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, group.id)}
                      style={{
                        border: `2px dashed ${isOver ? gc : gc + '70'}`,
                        borderRadius: 12,
                        padding: 14,
                        background: isOver ? gc + '10' : gc + '05',
                        transition: 'background .12s, border-color .12s',
                      }}
                    >
                      {/* En-tête du groupe */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: gc,
                          display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: 14, color: gc, flex: 1 }}>
                          {group.name}
                        </span>
                        <span style={{ fontSize: 11, color: gc, opacity: 0.7 }}>
                          {memberStats.length} client{memberStats.length !== 1 ? 's' : ''}
                        </span>
                        <button className="btn-icon" onClick={() => setGroupModal(group)} title="Modifier"
                          data-testid={`group-edit-${group.id}`}
                          style={{ color: gc, opacity: 0.85, padding: '2px 4px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                          <ViewIco d={ICO_EDIT} />
                        </button>
                        <button className="btn-icon" onClick={() => handleDeleteGroup(group.id)} title="Supprimer"
                          data-testid={`group-delete-${group.id}`}
                          style={{ color: gc, opacity: 0.85, padding: '2px 4px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                          <ViewIco d={ICO_DELETE} />
                        </button>
                      </div>

                      {/* Cards clients à l'intérieur du groupe */}
                      {memberStats.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                          height: 56, fontSize: 12, color: gc, opacity: 0.45, fontStyle: 'italic' }}>
                          Glisser un client ici
                        </div>
                      ) : (
                        <div style={{ display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                          {memberStats.map(stat => (
                            <ClientCard
                              key={stat.client.id}
                              stat={stat}
                              compact
                              dragging={draggingClientId === stat.client.id}
                              onDragStart={() => setDraggingClientId(stat.client.id)}
                              onDragEnd={handleDragEnd}
                              onEdit={() => setModal(stat.client)}
                              onDelete={() => handleDelete(stat.client.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Panneau droit : Toutes les cards clients (draggable source) ── */}
            {/* Déposer ici = désassigner du groupe */}
            <div
              style={{ flex: 1, display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 12, alignContent: 'start', overflowY: 'auto' }}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDropUnassign}
            >
              {clientStats.map(stat => {
                const group = groups.find(g => g.clientIds.includes(stat.client.id))
                return (
                  <ClientCard
                    key={stat.client.id}
                    stat={stat}
                    group={group}
                    compact={false}
                    dragging={draggingClientId === stat.client.id}
                    onDragStart={() => setDraggingClientId(stat.client.id)}
                    onDragEnd={handleDragEnd}
                    onEdit={() => setModal(stat.client)}
                    onDelete={() => handleDelete(stat.client.id)}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>

      {modal !== undefined && (
        <ClientModal client={modal} onSave={handleSave} onClose={() => setModal(undefined)} />
      )}
      {groupModal !== undefined && (
        <GroupModal group={groupModal} clients={state.clients}
          onSave={handleSaveGroup} onClose={() => setGroupModal(undefined)} />
      )}
    </>
  )
}

// ── Vue Timeline ──────────────────────────────────────────────────────────
function TimelineView({ state }: { state: ReturnType<typeof useCadence>['state'] }) {
  const sprintsWithItems = state.sprints.filter(sp => state.items.some(i => i.sprintId === sp.id))
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
              textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 180 }}>Client</th>
            {sprintsWithItems.map(sp => (
              <th key={sp.id} style={{ padding: '10px 12px', background: 'var(--surface2)',
                borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
                textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                Sprint {sp.number}
                <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                  {fmtDateShort(sp.startDate)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.clients.map(client => (
            <tr key={client.id}>
              <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: client.color }} />
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{client.name}</span>
                </div>
              </td>
              {sprintsWithItems.map(sp => {
                const items = state.items.filter(i => i.sprintId === sp.id && i.clientId === client.id)
                const done = items.filter(i => ['done','delivered'].includes(i.status)).length
                if (!items.length) return (
                  <td key={sp.id} style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    padding: '8px 12px', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
                  </td>
                )
                const pct = Math.round((done / items.length) * 100)
                return (
                  <td key={sp.id} style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    padding: '8px 12px' }}>
                    <div style={{ background: client.color + '15', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: client.color }}>{items.length} US</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                        {done}/{items.length} done · {pct}%
                      </div>
                      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: client.color, borderRadius: 2 }} />
                      </div>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
