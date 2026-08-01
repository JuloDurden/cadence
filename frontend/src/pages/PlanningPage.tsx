import { useState, useRef } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { SprintColumn } from '../components/planning/SprintColumn'
import { SwimlanesView } from '../components/planning/SwimlanesView'
import { DepsOverlay } from '../components/planning/DepsOverlay'
import { PlanningCard } from '../components/planning/PlanningCard'
import { PlanningEpicGroup } from '../components/planning/PlanningEpicGroup'
import { ItemModal } from '../components/backlog/ItemModal'
import { computeSprintEndDate, teamCapacity } from '../utils/sprintCapacity'
import { getCurrentSprint } from '../utils/sprints'
import { cascadeSprintDates } from '../utils/dates'
import { activateSprint, closeSprint, reopenSprint, sprintLifecycleHistoryEntry, getUnresolvedUnfinishedItems, getSprintDeletionBlockReason, deleteSprintCascade } from '../utils/sprintLifecycle'
import { useAuth } from '../hooks/useAuth'
import { isReadOnlyForRole } from '../utils/permissions'
import { withHistoryEntry } from '../utils/history'
import { useDialog } from '../context/DialogContext'
import { attachItemsToEpics } from '../utils/hierarchyScore'
import type { Item, Sprint, HistoryEntry } from '../types'

type View = 'grid' | 'swimlanes'

function uid() { return Math.random().toString(36).slice(2, 10) }

// ── Header helpers ─────────────────────────────────────────────────────────
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
function ViewIco({ d }: { d: string }) {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
}
const ICO_USERS = '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
const ICO_TAG   = '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'
// Icônes Lucide — paths exacts depuis lucide-static@1.24.0
const ICO_GRID  = '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>'
const ICO_SWIM  = '<path d="M2 12q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 19q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 5q2.5 2 5 0t5 0 5 0 5 0"/>'
const ICO_DEPS  = '<path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/>'
const ICO_PLUS  = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'

const SEG_BTN = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '0 10px', height: 28, fontSize: 11, fontWeight: 500,
  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-muted)',
  transition: 'background .15s, color .15s',
})

export function PlanningPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const { userName, userId, userRole } = useAuth()
  // Phase 2.5 (roadmap v1) — Stakeholder en lecture seule totale sur Release Planning : chaque
  // handler mutant a un garde-fou en plus des boutons/drag déjà masqués côté UI (défense en
  // profondeur, voir utils/permissions.ts).
  const readOnly = isReadOnlyForRole(userRole)
  const { confirm, alert } = useDialog()
  const [view, setView] = useState<View>('grid')
  const [highlightClient, setHighlightClient] = useState('')
  const [highlightType,   setHighlightType]   = useState('')
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined)
  const [showDeps, setShowDeps] = useState(false)
  const [dragOverSprint, setDragOverSprint] = useState<string | null>(null)
  const dragIds        = useRef<string[]>([])
  const gridContainerRef = useRef<HTMLDivElement | null>(null)

  function itemsForSprint(sprintId: string | null) {
    return state.items.filter(i => i.sprintId === sprintId)
  }

  function handleDrop(sprintId: string) {
    if (readOnly) return
    const ids = dragIds.current
    if (!ids.length) return
    setDragOverSprint(null)
    const newSprintId = sprintId === 'unassigned' ? null : sprintId
    const toMove = state.items.filter(i => ids.includes(i.id) && i.sprintId !== newSprintId)
    // Un groupe Epic glissé inclut l'id de l'Epic lui-même (voir PlanningEpicGroup.tsx,
    // groupIds) — depuis Phase 1 (2026-07-28), l'Epic est un HierarchyNode, plus un Item,
    // donc son sprintId doit être mis à jour séparément pour que le groupe entier suive
    // réellement le sprint cible (sinon seules ses US se déplaceraient).
    const nodesToMove = state.hierarchyNodes.filter(n => ids.includes(n.id) && n.sprintId !== newSprintId)
    if (!toMove.length && !nodesToMove.length) return
    const updatedItems = state.items.map(i =>
      toMove.find(m => m.id === i.id) ? { ...i, sprintId: newSprintId } : i
    )
    const updatedNodes = state.hierarchyNodes.map(n =>
      nodesToMove.find(m => m.id === n.id) ? { ...n, sprintId: newSprintId } : n
    )
    toMove.forEach(item => dispatch({ type: 'UPDATE_ITEM', payload: { ...item, sprintId: newSprintId } }))
    nodesToMove.forEach(node => dispatch({ type: 'UPDATE_HIERARCHY_NODE', payload: { ...node, sprintId: newSprintId } }))
    // Chantier B (tranche Sprint Planning) : une seule entrée d'Historique par dépôt, résumée
    // si plusieurs items sont déplacés à la fois (multi-sélection).
    const totalMoved = toMove.length + nodesToMove.length
    const targetSprint = state.sprints.find(s => s.id === newSprintId)
    const targetLabel = targetSprint ? (targetSprint.label || `Sprint ${targetSprint.number}`) : 'Non assigné'
    const single = totalMoved === 1 ? (toMove[0] ?? nodesToMove[0]) : undefined
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'item_sprint_change',
      timestamp: new Date().toISOString(),
      sprintId: newSprintId ?? undefined,
      itemKey: single?.key,
      itemDesc: single?.desc,
      detail: totalMoved === 1
        ? `Déplacé vers ${targetLabel}`
        : `${totalMoved} item(s) déplacés vers ${targetLabel}`,
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry({ ...state, items: updatedItems, hierarchyNodes: updatedNodes }, historyEntry))
    dragIds.current = []
  }

  function handleUpdateDates(sprintId: string, startDate: string, endDate: string) {
    if (readOnly) return
    const idx = state.sprints.findIndex(s => s.id === sprintId)
    if (idx === -1) return
    const weeks = state.settings.sprintDuration ?? 2
    const updatedSprints = cascadeSprintDates(state.sprints, idx, startDate, endDate, weeks)
    updatedSprints.forEach(s => dispatch({ type: 'UPDATE_SPRINT', payload: s }))
    saveToServer({ ...state, sprints: updatedSprints })
  }

  function handleActivate(sprintId: string) {
    if (readOnly) return
    const updatedSprints = activateSprint(state.sprints, sprintId)
    updatedSprints.forEach(s => dispatch({ type: 'UPDATE_SPRINT', payload: s }))
    const sp = updatedSprints.find(s => s.id === sprintId)
    const historyEntry = sp ? sprintLifecycleHistoryEntry('activate', sp, userName) : null
    if (historyEntry) dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    const payload = { ...state, sprints: updatedSprints }
    saveToServer(historyEntry ? withHistoryEntry(payload, historyEntry) : payload)
  }

  async function handleClose(sprintId: string) {
    if (readOnly) return
    const sp = state.sprints.find(s => s.id === sprintId)
    if (!sp) return
    // Chantier G (2026-07-23) : même garde-fou que Roadmap — voir commentaire là-bas.
    const unresolved = getUnresolvedUnfinishedItems(state, sprintId)
    if (unresolved.length > 0) {
      const list = unresolved.map(i => `• ${i.key} — ${i.desc}`).join('\n')
      await alert(
        `${unresolved.length} item(s) non terminé(s) n'ont pas encore de décision Sprint Review appliquée.\n\n${list}\n\nRendez-vous sur la Sprint Review pour statuer sur chacun (Reporter / Annuler / Redimensionner) avant de clôturer.`,
        { title: 'Impossible de clôturer ce sprint' }
      )
      return
    }
    const updatedSprints = closeSprint(state.sprints, sprintId)
    const updated = updatedSprints.find(s => s.id === sprintId)!
    dispatch({ type: 'UPDATE_SPRINT', payload: updated })
    const historyEntry = sprintLifecycleHistoryEntry('close', updated, userName)
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry({ ...state, sprints: updatedSprints }, historyEntry))
  }

  function handleReopen(sprintId: string) {
    if (readOnly) return
    const sp = state.sprints.find(s => s.id === sprintId)
    if (!sp) return
    const updatedSprints = reopenSprint(state.sprints, sprintId)
    const updated = updatedSprints.find(s => s.id === sprintId)!
    dispatch({ type: 'UPDATE_SPRINT', payload: updated })
    const historyEntry = sprintLifecycleHistoryEntry('reopen', updated, userName)
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry({ ...state, sprints: updatedSprints }, historyEntry))
  }

  async function handleDeleteSprint(sprintId: string) {
    if (readOnly) return
    const sp = state.sprints.find(s => s.id === sprintId)
    if (!sp) return
    const blockReason = getSprintDeletionBlockReason(state, sprintId)
    if (blockReason) { await alert(blockReason, { title: 'Suppression impossible' }); return }
    const cascade = deleteSprintCascade(state, sprintId)
    const impacts: string[] = []
    if (cascade.deletedGoalId) impacts.push("son objectif de sprint")
    if (cascade.deletedRetroSessionIds.length > 0) impacts.push("sa rétrospective en cours")
    if (cascade.deletedSrSessionIds.length > 0) impacts.push("sa Sprint Review en cours")
    const impactMsg = impacts.length > 0 ? ` Ceci supprimera aussi : ${impacts.join(', ')}.` : ''
    const itemMsg = cascade.detachedItemIds.length > 0
      ? `\n\n${cascade.detachedItemIds.length} item(s) encore assigné(s) seront déplacés vers le Backlog.`
      : ''
    const ok = await confirm(
      `Supprimer définitivement le Sprint ${sp.number} (${sp.label}) ?${impactMsg}${itemMsg}\n\nLes archives déjà clôturées ne sont pas affectées.`,
      { title: 'Supprimer le sprint', confirmLabel: 'Supprimer', danger: true }
    )
    if (!ok) return
    dispatch({ type: 'DELETE_SPRINT', payload: sprintId })
    cascade.detachedItemIds.forEach(id => {
      const item = cascade.items.find(i => i.id === id)
      if (item) dispatch({ type: 'UPDATE_ITEM', payload: item })
    })
    if (cascade.deletedGoalId) dispatch({ type: 'DELETE_ROADMAP_GOAL', payload: cascade.deletedGoalId })
    cascade.deletedRetroSessionIds.forEach(id => dispatch({ type: 'DELETE_RETRO_SESSION', payload: id }))
    cascade.deletedSrSessionIds.forEach(id => dispatch({ type: 'DELETE_SR_SESSION', payload: id }))
    const historyEntry = sprintLifecycleHistoryEntry('delete', sp, userName)
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry({
      ...state,
      sprints: cascade.sprints,
      items: cascade.items,
      roadmap: cascade.roadmap,
      retroSessions: cascade.retroSessions,
      sprintReviewSessions: cascade.sprintReviewSessions,
    }, historyEntry))
  }

  function handleUpdateCapacity(sprintId: string, capacity: number) {
    if (readOnly) return
    const sp = state.sprints.find(s => s.id === sprintId)
    if (!sp) return
    const updated = { ...sp, capacity }
    dispatch({ type: 'UPDATE_SPRINT', payload: updated })
    saveToServer({ ...state, sprints: state.sprints.map(s => s.id === sprintId ? updated : s) })
  }

  const activeSprintId = getCurrentSprint(state)?.id ?? null

  function handleSave(item: Item, keyCounters?: Record<string, number>) {
    if (readOnly) { setModalItem(undefined); return }
    const isNew = !state.items.find(i => i.id === item.id)
    if (isNew) {
      dispatch({ type: 'ADD_ITEM', payload: item, keyCounters })
    } else {
      dispatch({ type: 'UPDATE_ITEM', payload: item })
    }
    saveToServer({
      ...state,
      items: isNew ? [...state.items, item] : state.items.map(i => i.id === item.id ? item : i),
      ...(keyCounters ? { itemKeyCounters: keyCounters } : {}),
    })
    setModalItem(undefined)
  }

  function nextMonday(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  function addSprint() {
    if (readOnly) return
    const last = state.sprints[state.sprints.length - 1]
    const workingDays = state.settings.sprintDuration ?? 2
    const startDate = last ? nextMonday(last.endDate) : (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0)
      while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
      return d.toISOString().slice(0, 10)
    })()
    const endDate = computeSprintEndDate(startDate, workingDays)
    // Capacité de départ = équipe × jours ouvrés du sprint (fériés/absences déduits ensuite
    // à l'affichage par effectiveCapacity()), plutôt que la capacité par défaut fixe des
    // Réglages — repli sur celle-ci uniquement si l'équipe est vide (Chantier L).
    const newSprint: Sprint = {
      id: 's' + uid(),
      number: (last?.number ?? 0) + 1,
      label: `Sprint ${(last?.number ?? 0) + 1}`,
      startDate, endDate,
      capacity: teamCapacity(state.team, startDate, endDate) || state.settings.defaultCapacity,
      closed: false,
    }
    dispatch({ type: 'ADD_SPRINT', payload: newSprint })
    saveToServer({ ...state, sprints: [...state.sprints, newSprint] })
  }

  const unassigned  = itemsForSprint(null)
  const assigned    = state.items.filter(i => i.sprintId !== null)
  const totalSP     = state.items.reduce((s, i) => s + i.sp, 0)

  // Groupement Epic dans le panneau non-assigné (sous-chantier 2, utilitaire partagé) : Epics
  // sans sprint assigné, y compris sans aucune story non-assignée — `attachItemsToEpics()`
  // les inclut nativement (groupe vide), remplaçant l'ancienne construction manuelle à deux
  // listes (`epicGroupsUnassigned` + `lonelyUnassignedEpics`).
  const unassignedEpicNodes = state.hierarchyNodes.filter(n => n.level === 'epic' && !n.sprintId)
  const { groups: epicGroupsUnassigned, orphans: standaloneUnassigned } = attachItemsToEpics(unassignedEpicNodes, unassigned)

  return (
    <>
      <Header title="Planning">
        {/* Stats à gauche, collées au titre */}
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{assigned.length} items</span>
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{totalSP} SP</span>

        <div style={{ flex: 1 }} />

        {/* Filtres highlight (client + type) + vue toggle + bouton sprint — tout à droite */}
        <div className="filter-group">
          <div className={`fg-item${highlightClient ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_USERS} />
            <select value={highlightClient} onChange={e => setHighlightClient(e.target.value)}>
              <option value="">Clients</option>
              {state.clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <FgChev />
          </div>
          <div className={`fg-item${highlightType ? ' filter-active' : ''}`}>
            <FgIcon d={ICO_TAG} />
            <select value={highlightType} onChange={e => setHighlightType(e.target.value)}>
              <option value="">Type</option>
              <option value="bug">Bug</option>
              <option value="story">Story</option>
              <option value="task">Tâche</option>
              <option value="epic">Epic</option>
              <option value="spike">Spike</option>
            </select>
            <FgChev />
          </div>
        </div>

        {/* Toggle vues : Grille | Swimlanes | Gantt — icônes seules */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button style={{ ...SEG_BTN(view === 'grid'),      padding: '0 10px' }} onClick={() => setView('grid')}      title="Vue grille">
            <ViewIco d={ICO_GRID} />
          </button>
          <button style={{ ...SEG_BTN(view === 'swimlanes'), padding: '0 10px', borderLeft: '1px solid var(--border)' }} onClick={() => setView('swimlanes')} title="Swimlanes par client">
            <ViewIco d={ICO_SWIM} />
          </button>
        </div>

        {/* Dépendances — uniquement en vue Grille */}
        {view === 'grid' && (
          <button
            className="hdr-btn"
            onClick={() => setShowDeps(v => !v)}
            title="Vue dependances cross-sprint"
            style={showDeps ? { background: 'var(--primary-light)', color: 'var(--primary)' } : undefined}
          >
            <ViewIco d={ICO_DEPS} />
          </button>
        )}

        {!readOnly && (
          <button className="hdr-btn primary" onClick={addSprint} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ViewIco d={ICO_PLUS} /> Sprint
          </button>
        )}
      </Header>

      <div className="page-content" style={{ padding: '24px 16px' }}>
        {view === 'swimlanes' ? (
          <SwimlanesView
            state={state}
            highlightClient={highlightClient}
            highlightType={highlightType}
            dragIds={dragIds}
            dragOverKey={dragOverSprint}
            onDragOver={key => setDragOverSprint(key)}
            onDragLeave={() => setDragOverSprint(null)}
            onDrop={handleDrop}
            onEdit={item => setModalItem(item)}
            readOnly={readOnly}
          />
        ) : (
          <>
          {/* Conteneur scrollable + référence pour DepsOverlay */}
          <div style={{ overflowX: 'auto', position: 'relative' }} ref={gridContainerRef}>
            <div className="planning-grid">
              {state.sprints.map(sprint => (
                <SprintColumn
                  key={sprint.id}
                  sprint={sprint}
                  items={itemsForSprint(sprint.id)}
                  state={state}
                  isOver={dragOverSprint === sprint.id}
                  isActive={sprint.id === activeSprintId}
                  highlightClient={highlightClient}
                  highlightType={highlightType}
                  onDragStart={id  => { dragIds.current = [id] }}
                  onDragGroup={ids => { dragIds.current = ids }}
                  onDragOver={sprintId => setDragOverSprint(sprintId)}
                  onDrop={handleDrop}
                  onEdit={item => setModalItem(item)}
                  onUpdateDates={handleUpdateDates}
                  onActivate={handleActivate}
                  onClose={handleClose}
                  onReopen={handleReopen}
                  onDelete={handleDeleteSprint}
                  onUpdateCapacity={handleUpdateCapacity}
                  readOnly={readOnly}
                />
              ))}
            </div>

            {/* Overlay dépendances cross-sprint */}
            {showDeps && (
              <DepsOverlay containerRef={gridContainerRef} items={state.items} />
            )}
          </div>

          {/* Panneau Non-assigné — sous les sprints */}
          <div
            className={`planning-unassigned-row${dragOverSprint === 'unassigned' ? ' planning-col-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOverSprint('unassigned') }}
            onDragLeave={() => setDragOverSprint(null)}
            onDrop={e => { e.preventDefault(); handleDrop('unassigned') }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Non assigné</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-alt)', padding: '1px 7px', borderRadius: 8 }}>{unassigned.length}</span>
            </div>
            <div className="planning-unassigned-items">
              {/* Groupes Epic (Epics non assignés à un sprint, y compris sans aucune story
                  non-assignée — groupe vide, `attachItemsToEpics()`). Édition de l'Epic
                  lui-même encore limitée au Backlog (mode "Grouper par Epic") tant qu'une
                  modale dédiée Epic/Initiative n'est pas construite — voir docs/corrections.md. */}
              {epicGroupsUnassigned.map(({ epicId, epic, items: stories }) => (
                <PlanningEpicGroup
                  key={epicId}
                  epicId={epicId}
                  epic={epic}
                  stories={stories}
                  state={state}
                  highlightClient={highlightClient}
                  highlightType={highlightType}
                  onEdit={item => setModalItem(item)}
                  onDragGroup={ids => { dragIds.current = ids }}
                  onDragItem={id  => { dragIds.current = [id] }}
                  readOnly={readOnly}
                />
              ))}
              {/* Items sans Epic */}
              {standaloneUnassigned.map(item => (
                <PlanningCard
                  key={item.id}
                  item={item}
                  state={state}
                  highlightClient={highlightClient}
                  highlightType={highlightType}
                  onEdit={item => setModalItem(item)}
                  onDragStart={id => { dragIds.current = [id] }}
                  readOnly={readOnly}
                />
              ))}
              {unassigned.length === 0 && (
                <div style={{ padding: '12px 20px', color: 'var(--text-faint)', fontSize: 11, border: '1.5px dashed var(--border)', borderRadius: 6 }}>
                  Glisser des items ici pour les désassigner
                </div>
              )}
            </div>
          </div>
          </>
        )}
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
