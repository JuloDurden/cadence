import React, { useState, useEffect } from 'react'
// Vision Board moved to VisionPage (/vision)
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { computeSprintEndDate, effectiveCapacity, teamCapacity, capacityLossBreakdown, describeCapacityLoss } from '../utils/sprintCapacity'
import { fmtDateShort, cascadeSprintDates } from '../utils/dates'
import { getCurrentSprint } from '../utils/sprints'
import { activateSprint, closeSprint, reopenSprint, sprintLifecycleHistoryEntry, getUnresolvedUnfinishedItems, getSprintDeletionBlockReason, deleteSprintCascade, buildSprintCloseNotification, buildDependencyBlockNotification } from '../utils/sprintLifecycle'
import { useAuth } from '../hooks/useAuth'
import { isReadOnlyForRole } from '../utils/permissions'
import { withHistoryEntry } from '../utils/history'
import { useDialog } from '../context/DialogContext'
import { getEpicSP, attachItemsToEpics } from '../utils/hierarchyScore'
import { api } from '../services/api'
import type { RoadmapGoal } from '../types'

const COLORS = [
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#4f46e5,#4338ca)',
  'linear-gradient(135deg,#059669,#047857)',
  'linear-gradient(135deg,#7c3aed,#6d28d9)',
  'linear-gradient(135deg,#b45309,#92400e)',
  'linear-gradient(135deg,#be185d,#9d174d)',
]

function uid() { return Math.random().toString(36).slice(2) }

function sprintDateLabel(start: string, end: string): string {
  if (!start || !end) return ''
  return `${fmtDateShort(start)} → ${fmtDateShort(end)}`
}

const BTN: React.CSSProperties = {
  fontSize: 10, padding: '2px 8px', border: '1px solid rgba(255,255,255,.4)',
  borderRadius: 5, background: 'rgba(255,255,255,.15)', color: '#fff',
  cursor: 'pointer', fontWeight: 600, backdropFilter: 'blur(2px)',
}
const BTN_DARK: React.CSSProperties = {
  fontSize: 10, padding: '2px 8px', border: '1px solid var(--border)',
  borderRadius: 5, background: 'transparent', color: 'var(--text-muted)',
  cursor: 'pointer', fontWeight: 600,
}

// ── Header helpers ─────────────────────────────────────────────────────
const ICO_PLUS = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'

// Grouper par client (users) / par groupe (layers)
const ICO_USERS =
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>' +
  '<circle cx="9" cy="7" r="4"/>' +
  '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>' +
  '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>'

const ICO_LAYERS =
  '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>' +
  '<path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>' +
  '<path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>'

// Icônes des boutons de carte et du statut
const ICO_SQUARE_PEN =
  '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
  '<path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>'
const ICO_LOCK =
  '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>' +
  '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
const ICO_LOCK_OPEN =
  '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>' +
  '<path d="M7 11V7a5 5 0 0 1 9.9-1"/>'
const ICO_POWER =
  '<path d="M12 2v10"/>' +
  '<path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>'
const ICO_ZAP =
  '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>'
const ICO_CLOCK =
  '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
const ICO_TRASH =
  '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
  '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
  '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'

// Vue Sprints — icône custom (fournie par l'utilisateur)
// viewBox: 0 250 1650 1100  (x: 0→1650, y: 250→1350)
const ICO_VIEW_SPRINTS =
  '<path d="M704.74,570.727l-375.261,186.977l75.575,-412.395l299.686,225.418Z"/>' +
  '<path d="M40.088,1224.64c0,0 751.133,5.291 824.115,0c34.149,-2.476 364.511,-112.873 348.1,-448.755c-18.03,-369.01 -482.471,-550.438 -702.49,-257.929" style="fill:none;stroke:currentColor;stroke-width:125px;"/>' +
  '<path d="M1182.088,1165.793l307.617,0l95.312,65.155l-95.312,57.241l-469.805,0c16.367,-8.791 122.887,-86.632 162.188,-122.396Z"/>' +
  '<path d="M568.529,824.115l136.304,136.304l251.638,-257.929" style="fill:none;stroke:currentColor;stroke-width:91.67px;stroke-linecap:round;"/>'
const ICO_VIEW_SPRINTS_BOX = "0 250 1650 1100"

function ViewIco({ d, viewBox = "0 0 24 24", fill = "none" }: { d: string; viewBox?: string; fill?: string }) {
  return (
    <svg width={14} height={14} viewBox={viewBox} fill={fill}
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const SEG_BTN = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-muted)',
  border: 'none',
  cursor: 'pointer',
  padding: '0 9px',
  height: 30,
  display: 'flex',
  alignItems: 'center',
  transition: 'background .15s, color .15s',
})

export function RoadmapPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const { userName, userRole } = useAuth()
  // Phase 2.5 (roadmap v1) — Stakeholder en lecture seule totale sur cette page (voir
  // utils/permissions.ts, `isReadOnlyForRole`) : le groupe de boutons d'action (Modifier
  // l'objectif, Activer/Clôturer/Rouvrir, Supprimer) est masqué en bloc, ainsi que "+ Sprint".
  const readOnly = isReadOnlyForRole(userRole)
  const { confirm, alert } = useDialog()
  const [groupBy, setGroupBy] = useState<'client' | 'group'>('client')
  const [editGoal, setEditGoal] = useState<RoadmapGoal | null>(null)
  const [form, setForm] = useState({ icon: '', name: '', goal: '', metrics: '', startDate: '', endDate: '' })

  const activeSprintId = getCurrentSprint(state)?.id ?? null

  function handleActivate(sprintId: string) {
    const updatedSprints = activateSprint(state.sprints, sprintId)
    updatedSprints.forEach(s => dispatch({ type: 'UPDATE_SPRINT', payload: s }))
    const sp = updatedSprints.find(s => s.id === sprintId)
    const historyEntry = sp ? sprintLifecycleHistoryEntry('activate', sp, userName) : null
    if (historyEntry) dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    const payload = { ...state, sprints: updatedSprints }
    saveToServer(historyEntry ? withHistoryEntry(payload, historyEntry) : payload)
    // Phase 5 (roadmap v1), Intégration Slack : alerte silencieuse, voir PlanningPage.tsx (même logique).
    if (sp) {
      const depNotif = buildDependencyBlockNotification({ ...state, sprints: updatedSprints }, sp)
      if (depNotif) api.notifySlackDependencyBlock(depNotif).catch(() => {})
    }
  }
  async function handleClose(sprintId: string) {
    const sp = state.sprints.find(s => s.id === sprintId); if (!sp) return
    // Chantier G (2026-07-23) : filet de sécurité — bloque la clôture si des items non terminés
    // n'ont pas encore de décision Sprint Review appliquée (Reporter/Annuler/Redimensionner).
    // Dans le fonctionnement normal la Sprint Review précède la clôture ; ce cas ne se présente
    // que si le sprint est clôturé sans y être passé, ou qu'un item y a été oublié.
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
    // Phase 5 (roadmap v1), Intégration Slack : alerte silencieuse, voir PlanningPage.tsx (même logique).
    api.notifySlackSprintClose(buildSprintCloseNotification(state, updated)).catch(() => {})
  }
  function handleReopen(sprintId: string) {
    const sp = state.sprints.find(s => s.id === sprintId); if (!sp) return
    const updatedSprints = reopenSprint(state.sprints, sprintId)
    const updated = updatedSprints.find(s => s.id === sprintId)!
    dispatch({ type: 'UPDATE_SPRINT', payload: updated })
    const historyEntry = sprintLifecycleHistoryEntry('reopen', updated, userName)
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry({ ...state, sprints: updatedSprints }, historyEntry))
  }
  async function handleDeleteSprint(sprintId: string) {
    const sp = state.sprints.find(s => s.id === sprintId); if (!sp) return
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
    cascade.hierarchyNodes.forEach(node => {
      const before = state.hierarchyNodes.find(n => n.id === node.id)
      if (before && before.sprintId !== node.sprintId) dispatch({ type: 'UPDATE_HIERARCHY_NODE', payload: node })
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
      hierarchyNodes: cascade.hierarchyNodes,
      roadmap: cascade.roadmap,
      retroSessions: cascade.retroSessions,
      sprintReviewSessions: cascade.sprintReviewSessions,
    }, historyEntry))
  }

  const roadmapMap = new Map((state.roadmap || []).map(g => [g.sprintId, g]))

  // Auto-create roadmap goals for sprints that don't have one yet
  useEffect(() => {
    const map = new Map((state.roadmap || []).map(g => [g.sprintId, g]))
    state.sprints.forEach((sprint, idx) => {
      if (!map.has(sprint.id)) {
        dispatch({
          type: 'ADD_ROADMAP_GOAL',
          payload: {
            id: 'g' + sprint.id,
            sprintId: sprint.id,
            icon: '🚀',
            color: COLORS[idx % COLORS.length],
            name: sprint.label || `Sprint ${sprint.number}`,
            goal: sprint.goal || 'Sprint Goal a definir',
            metrics: [],
          },
        })
      }
    })
  }, [state.sprints.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Display in sprint order — every sprint gets a card
  const cards = state.sprints.map((sprint, idx) => {
    const goal = roadmapMap.get(sprint.id)
    return {
      sprint,
      goal: goal ?? {
        id: 'tmp-' + sprint.id,
        sprintId: sprint.id,
        icon: '🚀',
        color: COLORS[idx % COLORS.length],
        name: sprint.label || `Sprint ${sprint.number}`,
        goal: sprint.goal || '',
        metrics: [],
      } as RoadmapGoal,
    }
  })

  const totalAssigned = state.items.filter(i => i.sprintId).length

  function openModal(g: RoadmapGoal) {
    const sprint = state.sprints.find(s => s.id === g.sprintId)
    setEditGoal(g)
    setForm({ icon: g.icon, name: g.name, goal: g.goal, metrics: g.metrics.join('\n'), startDate: sprint?.startDate ?? '', endDate: sprint?.endDate ?? '' })
  }

  function saveGoal() {
    if (!editGoal) return
    const updated: RoadmapGoal = {
      ...editGoal,
      icon: form.icon.trim() || editGoal.icon,
      name: form.name.trim(),   // vide autorisé — efface le thème du sprint
      goal: form.goal.trim(),
      metrics: form.metrics.split('\n').map(s => s.trim()).filter(Boolean),
    }
    const idx = state.sprints.findIndex(s => s.id === updated.sprintId)
    const weeks = state.settings.sprintDuration ?? 2
    let updatedSprints = state.sprints
    // label du sprint : thème saisi, sinon "Sprint N" (pas de tiret orphelin)
    const sprintLabel = updated.name || `Sprint ${state.sprints[idx]?.number ?? ''}`
    if (idx !== -1 && form.startDate && form.endDate) {
      updatedSprints = cascadeSprintDates(state.sprints, idx, form.startDate, form.endDate, weeks)
      updatedSprints[idx] = { ...updatedSprints[idx], label: sprintLabel }
    } else if (idx !== -1) {
      updatedSprints = state.sprints.map((s, i) => i === idx ? { ...s, label: sprintLabel } : s)
    }
    dispatch({ type: 'UPDATE_ROADMAP_GOAL', payload: updated })
    updatedSprints.forEach(s => dispatch({ type: 'UPDATE_SPRINT', payload: s }))
    saveToServer({
      ...state,
      roadmap: (state.roadmap || []).map(g => g.id === updated.id ? updated : g),
      sprints: updatedSprints,
    })
    setEditGoal(null)
  }

  function addSprint() {
    const maxNum = state.sprints.length > 0 ? Math.max(...state.sprints.map(s => s.number)) : 0
    const num = maxNum + 1
    const id = 's' + uid()
    dispatch({
      type: 'ADD_SPRINT', payload: {
        // Créé sans dates ici (voir doc Release Planning, problème de cycle de vie dupliqué) :
        // teamCapacity() renvoie donc 0 et on retombe sur la capacité par défaut des Réglages,
        // comme avant le Chantier L, jusqu'à ce que des dates soient renseignées.
        id, number: num, label: `Sprint ${num}`,
        startDate: '', endDate: '', capacity: teamCapacity(state.team, '', '') || state.settings.defaultCapacity,
        closed: false,
      }
    })
    dispatch({
      type: 'ADD_ROADMAP_GOAL', payload: {
        id: 'g' + uid(), sprintId: id, icon: '🚀',
        color: COLORS[(state.roadmap || []).length % COLORS.length],
        name: `Sprint ${num}`,
        goal: 'Sprint Goal a definir',
        metrics: [],
      }
    })
  }

  return (
    <>
    <Header title="Roadmap">
      <div className="hdr-sep" />
      <span className="hdr-ctx-stat">{cards.length} sprint{cards.length !== 1 ? 's' : ''}</span>
      <div className="hdr-sep" />
      <span className="hdr-ctx-stat">{totalAssigned} items</span>

      <div style={{ flex: 1 }} />

      {/* Toggle groupement : par client / par groupe de clients */}
      {(state.clientGroups ?? []).length > 0 && (
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button style={SEG_BTN(groupBy === 'client')} onClick={() => setGroupBy('client')}
            title="Grouper par client" data-testid="btn-groupby-client">
            <ViewIco d={ICO_USERS} />
          </button>
          <button style={{ ...SEG_BTN(groupBy === 'group'), borderLeft: '1px solid var(--border)' }}
            onClick={() => setGroupBy('group')}
            title="Grouper par groupe de clients" data-testid="btn-groupby-group">
            <ViewIco d={ICO_LAYERS} />
          </button>
        </div>
      )}

      {!readOnly && (
        <button data-testid="btn-add-sprint" className="hdr-btn primary" onClick={addSprint} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ViewIco d={ICO_PLUS} /> Sprint
        </button>
      )}
    </Header>
    <div className="page-content">
      <div className="roadmap-grid">
        {cards.map(({ sprint, goal }) => {
          const items = state.items.filter(i => i.sprintId === sprint.id)
          const totalSP = items.reduce((acc, i) => acc + i.sp, 0)
          const effCap   = effectiveCapacity(sprint, state.team, state.absences)
          const capLabel = sprint.capacity > 0 ? ` / ${effCap} SP` : ''
          // Détail de la perte de capacité (2026-07-28) : la Roadmap n'expliquait pas
          // pourquoi effCap < sprint.capacity (aucun texte, contrairement à Release
          // Planning qui affichait à tort "après fériés" même quand la cause était des
          // congés d'équipe) — un title au survol comble ce manque sans changer le
          // texte affiché par défaut. Voir docs/corrections.md.
          const capLoss = capacityLossBreakdown(sprint, state.team, state.absences)
          const capLossTitle = effCap < sprint.capacity
            ? `Capacité réduite de ${sprint.capacity - effCap} SP (après ${describeCapacityLoss(capLoss.spLostHolidays, capLoss.spLostAbsences)})`
            : undefined
          const dateLabel = sprintDateLabel(sprint.startDate, sprint.endDate)

          // ── Groupement par Epic ──────────────────────────────────────
          // Epic n'est plus un Item depuis Phase 1 (2026-07-28) — voir HierarchyNode,
          // types/index.ts. Un Epic est "de ce sprint" si son propre sprintId correspond
          // (même limite de conception qu'avant, non corrigée ici : un Epic dont les US
          // sont dans ce sprint mais dont le sprintId propre diffère n'apparaîtra pas ici).
          const epicItems = state.hierarchyNodes.filter(n => n.level === 'epic' && n.sprintId === sprint.id)
          // Regroupement épics-first (sous-chantier 2, utilitaire partagé utils/hierarchyScore.ts) :
          // inclut nativement un Epic sans aucune story (ex. FAX-034, non découpé). Items
          // orphelins : aucune story rattachée à un epic de ce sprint (les items ne sont plus
          // jamais eux-mêmes des Epics).
          const { groups: epicGroups, orphans: orphanItems } = attachItemsToEpics(epicItems, items)
          const storiesByEpicId = new Map(epicGroups.map(g => [g.epicId, g.items]))

          // Group orphans by client
          const byClient = new Map<string, typeof items>()
          orphanItems.forEach(item => {
            const list = byClient.get(item.clientId) ?? []
            byClient.set(item.clientId, [...list, item])
          })

          const isTmp    = goal.id.startsWith('tmp-')
          const isActive = sprint.id === activeSprintId

          return (
            <div key={sprint.id} className={`roadmap-goal${isActive && !sprint.closed ? ' roadmap-goal-active' : ''}`}>
              <div className="roadmap-goal-header" style={{ background: goal.color }}>
                <div className="roadmap-goal-icon">{goal.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="roadmap-goal-sprint" title={capLossTitle}>Sprint {sprint.number}  {totalSP}{capLabel} SP</div>
                  <div className="roadmap-goal-title">{goal.name}</div>
                  {dateLabel && <div className="roadmap-goal-date">{dateLabel}</div>}
                </div>
                {/* Boutons d'action — groupe d'icônes */}
                {!readOnly && (
                <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,.35)', borderRadius: 6,
                  overflow: 'hidden', flexShrink: 0, alignSelf: 'flex-start' }}>
                  {!isTmp && (
                    <>
                      <button onClick={e => { e.stopPropagation(); openModal(goal) }} title="Modifier l'objectif"
                        style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer',
                          padding: '0 8px', height: 26, display: 'flex', alignItems: 'center', color: '#fff' }}>
                        <ViewIco d={ICO_SQUARE_PEN} />
                      </button>
                      <div style={{ width: 1, background: 'rgba(255,255,255,.35)', flexShrink: 0 }} />
                    </>
                  )}
                  {sprint.closed ? (
                    <button onClick={e => { e.stopPropagation(); handleReopen(sprint.id) }} title="Rouvrir le sprint"
                      style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer',
                        padding: '0 8px', height: 26, display: 'flex', alignItems: 'center', color: '#fff' }}>
                      <ViewIco d={ICO_LOCK_OPEN} />
                    </button>
                  ) : isActive ? (
                    <button onClick={e => { e.stopPropagation(); handleClose(sprint.id) }} title="Clôturer le sprint"
                      style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer',
                        padding: '0 8px', height: 26, display: 'flex', alignItems: 'center', color: '#fff' }}>
                      <ViewIco d={ICO_LOCK} />
                    </button>
                  ) : (
                    <>
                      <button onClick={e => { e.stopPropagation(); handleActivate(sprint.id) }} title="Activer le sprint"
                        style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer',
                          padding: '0 8px', height: 26, display: 'flex', alignItems: 'center', color: '#fff' }}>
                        <ViewIco d={ICO_POWER} />
                      </button>
                      <div style={{ width: 1, background: 'rgba(255,255,255,.35)', flexShrink: 0 }} />
                      <button onClick={e => { e.stopPropagation(); handleDeleteSprint(sprint.id) }} title="Supprimer le sprint"
                        data-testid={`btn-delete-sprint-${sprint.id}`}
                        style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer',
                          padding: '0 8px', height: 26, display: 'flex', alignItems: 'center', color: '#fff' }}>
                        <ViewIco d={ICO_TRASH} />
                      </button>
                    </>
                  )}
                </div>
                )}
              </div>

              {/* Status bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', background: 'var(--surface2)',
                borderBottom: '1px solid var(--border)',
                fontSize: 10,
              }}>
                {sprint.closed ? (
                  <span style={{ color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ViewIco d={ICO_LOCK} /> Clôturé
                  </span>
                ) : isActive ? (
                  <span style={{ color: 'var(--primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ViewIco d={ICO_ZAP} /> Actif
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ViewIco d={ICO_CLOCK} /> À venir
                  </span>
                )}
              </div>

              <div className="roadmap-section">
                <div className="roadmap-section-label">Sprint Goal</div>
                <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text)', margin: 0 }}>
                  {goal.goal || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun objectif defini.</span>}
                </p>
              </div>

              {goal.metrics.length > 0 && (
                <div className="roadmap-section">
                  <div className="roadmap-section-label">Metriques de succes</div>
                  {goal.metrics.map((m, mi) => (
                    <div key={mi} className="roadmap-metric">{m}</div>
                  ))}
                </div>
              )}

              {/* ── Épics + items : par client (défaut, alpha) ou par groupe de clients (épics inclus) ── */}
              {groupBy === 'group' && (state.clientGroups ?? []).length > 0 ? (() => {
                const allGroups = state.clientGroups!
                const clientToGroup = new Map<string, typeof allGroups[0]>()
                allGroups.forEach(g => g.clientIds.forEach(cid => clientToGroup.set(cid, g)))

                type GrpSec = { group: typeof allGroups[0] | null; gEpics: typeof epicItems; gOrphans: typeof orphanItems }
                const byGid = new Map<string, GrpSec>()
                const ensure = (key: string, grp: typeof allGroups[0] | null): GrpSec => {
                  if (!byGid.has(key)) byGid.set(key, { group: grp, gEpics: [], gOrphans: [] })
                  return byGid.get(key)!
                }
                epicItems.forEach(epic => {
                  const g = clientToGroup.get(epic.clientId ?? '') ?? null
                  ensure(g?.id ?? '__none__', g).gEpics.push(epic)
                })
                orphanItems.forEach(item => {
                  const g = clientToGroup.get(item.clientId) ?? null
                  ensure(g?.id ?? '__none__', g).gOrphans.push(item)
                })

                const renderEpicRow = (epic: typeof epicItems[0]) => {
                  const stories = storiesByEpicId.get(epic.id) ?? []
                  const epicClient = state.clients.find(c => c.id === epic.clientId)
                  const eSP = getEpicSP(epic, stories)
                  return (
                    <React.Fragment key={epic.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 12px 3px 14px', fontSize: 11 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, background: epicClient?.color ?? '#6366f1', color: '#fff',
                          borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
                          EPIC · {epicClient?.prefix ?? '?'}
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{epic.desc}</span>
                        <strong style={{ flexShrink: 0, fontSize: 9 }}>{eSP} SP</strong>
                      </div>
                      {stories.map(story => (
                        <div key={story.id} className="roadmap-feature" style={{ paddingLeft: 22 }}>
                          <div className="roadmap-feature-dot" style={{ background: epicClient?.color ?? '#888' }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.desc}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 9, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>{story.sp} SP</span>
                        </div>
                      ))}
                    </React.Fragment>
                  )
                }

                const renderOrphanRows = (orphans: typeof orphanItems) => {
                  const byC = new Map<string, typeof orphanItems>()
                  orphans.forEach(item => { byC.set(item.clientId, [...(byC.get(item.clientId) ?? []), item]) })
                  return Array.from(byC.entries())
                    .sort(([a], [b]) => (state.clients.find(c => c.id === a)?.name ?? '').localeCompare(state.clients.find(c => c.id === b)?.name ?? ''))
                    .flatMap(([cid, cItems]) => {
                      const client = state.clients.find(c => c.id === cid)
                      return cItems.map(item => (
                        <div key={item.id} className="roadmap-feature">
                          <div className="roadmap-feature-dot" style={{ background: client?.color ?? '#888' }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 9, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>{item.sp} SP</span>
                        </div>
                      ))
                    })
                }

                const result: React.ReactElement[] = []

                allGroups.forEach(g => {
                  const sec = byGid.get(g.id)
                  if (!sec || (sec.gEpics.length === 0 && sec.gOrphans.length === 0)) return
                  const gc = g.color ?? '#6366f1'
                  const totalSP =
                    sec.gEpics.reduce((acc, epic) => acc + getEpicSP(epic, storiesByEpicId.get(epic.id) ?? []), 0) +
                    sec.gOrphans.reduce((acc, i) => acc + i.sp, 0)
                  result.push(
                    <div key={g.id} className="roadmap-section" data-testid={`roadmap-group-${g.id}`}>
                      <div className="roadmap-section-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: gc, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ color: gc, fontWeight: 700, flex: 1 }}>{g.name}</span>
                        <strong>{totalSP} SP</strong>
                      </div>
                      {sec.gEpics.map(renderEpicRow)}
                      {renderOrphanRows(sec.gOrphans)}
                    </div>
                  )
                })

                // Items sans groupe : épics plats puis orphelins par client (alpha)
                const none = byGid.get('__none__')
                if (none) {
                  none.gEpics.forEach(epic => {
                    const stories = storiesByEpicId.get(epic.id) ?? []
                    const epicClient = state.clients.find(c => c.id === epic.clientId)
                    const eSP = getEpicSP(epic, stories)
                    result.push(
                      <div key={epic.id} className="roadmap-section">
                        <div className="roadmap-section-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, background: epicClient?.color ?? '#6366f1', color: '#fff',
                            borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
                            EPIC · {epicClient?.prefix ?? '?'}
                          </span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{epic.desc}</span>
                          <strong style={{ flexShrink: 0 }}>{eSP} SP</strong>
                        </div>
                        {stories.map(story => (
                          <div key={story.id} className="roadmap-feature" style={{ paddingLeft: 10 }}>
                            <div className="roadmap-feature-dot" style={{ background: epicClient?.color ?? '#888' }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.desc}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 9, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>{story.sp} SP</span>
                          </div>
                        ))}
                      </div>
                    )
                  })
                  const byC = new Map<string, typeof orphanItems>()
                  none.gOrphans.forEach(item => { byC.set(item.clientId, [...(byC.get(item.clientId) ?? []), item]) })
                  Array.from(byC.entries())
                    .sort(([a], [b]) => (state.clients.find(c => c.id === a)?.name ?? '').localeCompare(state.clients.find(c => c.id === b)?.name ?? ''))
                    .forEach(([cid, cItems]) => {
                      const client = state.clients.find(c => c.id === cid)
                      const clientSP = cItems.reduce((acc, i) => acc + i.sp, 0)
                      result.push(
                        <div key={cid} className="roadmap-section">
                          <div className="roadmap-section-label">
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: client?.color ?? '#888', marginRight: 5, verticalAlign: 'middle' }} />
                            {client?.name ?? 'Client'} <strong>{clientSP} SP</strong>
                          </div>
                          {cItems.map(item => (
                            <div key={item.id} className="roadmap-feature">
                              <div className="roadmap-feature-dot" style={{ background: client?.color ?? '#888' }} />
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: 9, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>{item.sp} SP</span>
                            </div>
                          ))}
                        </div>
                      )
                    })
                }

                return result.length > 0 ? result : (
                  <div className="roadmap-section">
                    <div className="roadmap-section-label">Fonctionnalites cles</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Aucun item dans ce sprint.</p>
                  </div>
                )
              })() : (
                // ── Mode par client (défaut) : épics plats, orphelins triés alpha ──
                <>
                  {epicItems.map(epic => {
                    const stories = storiesByEpicId.get(epic.id) ?? []
                    const epicClient = state.clients.find(c => c.id === epic.clientId)
                    const groupSP = getEpicSP(epic, stories)
                    return (
                      <div key={epic.id} className="roadmap-section">
                        <div className="roadmap-section-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, flexShrink: 0,
                            background: epicClient?.color ?? '#6366f1', color: '#fff',
                            borderRadius: 3, padding: '1px 4px' }}>
                            EPIC · {epicClient?.prefix ?? '?'}
                          </span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{epic.desc}</span>
                          <strong style={{ flexShrink: 0 }}>{groupSP} SP</strong>
                        </div>
                        {stories.map(story => (
                          <div key={story.id} className="roadmap-feature" style={{ paddingLeft: 10 }}>
                            <div className="roadmap-feature-dot" style={{ background: epicClient?.color ?? '#888' }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.desc}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 9, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>{story.sp} SP</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {Array.from(byClient.entries())
                    .sort(([a], [b]) => (state.clients.find(c => c.id === a)?.name ?? '').localeCompare(state.clients.find(c => c.id === b)?.name ?? ''))
                    .map(([clientId, clientItems]) => {
                      const client = state.clients.find(c => c.id === clientId)
                      const clientSP = clientItems.reduce((acc, i) => acc + i.sp, 0)
                      return (
                        <div key={clientId} className="roadmap-section">
                          <div className="roadmap-section-label">
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: client?.color ?? '#888', marginRight: 5, verticalAlign: 'middle' }} />
                            {client?.name ?? 'Client'} <strong>{clientSP} SP</strong>
                          </div>
                          {clientItems.map(item => (
                            <div key={item.id} className="roadmap-feature">
                              <div className="roadmap-feature-dot" style={{ background: client?.color ?? '#888' }} />
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: 9, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>{item.sp} SP</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  {epicItems.length === 0 && byClient.size === 0 && (
                    <div className="roadmap-section">
                      <div className="roadmap-section-label">Fonctionnalites cles</div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Aucun item dans ce sprint.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

      </div>

      {editGoal && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setEditGoal(null) }}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">Modifier l objectif</span>
              <button className="modal-close" onClick={() => setEditGoal(null)}>X</button>
            </div>
            <div className="modal-body" style={{ padding: '16px 20px', gap: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: '0 0 70px' }}>
                  <label className="form-label">Icone</label>
                  <input className="form-input" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} style={{ textAlign: 'center' }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Nom du sprint theme</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Début du sprint</label>
                  <input type="date" className="form-input" value={form.startDate} onChange={e => {
                    const start = e.target.value
                    const end = start ? computeSprintEndDate(start, state.settings.sprintDuration ?? 2) : ''
                    setForm(f => ({ ...f, startDate: start, endDate: end }))
                  }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Fin du sprint</label>
                  <input type="date" className="form-input" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Sprint Goal</label>
                <textarea className="form-input" rows={3} value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Metriques de succes{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(une par ligne)</span>
                </label>
                <textarea className="form-input" rows={4} value={form.metrics} onChange={e => setForm(f => ({ ...f, metrics: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Les fonctionnalites sont derivees automatiquement des items assignes au sprint correspondant.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditGoal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveGoal}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
