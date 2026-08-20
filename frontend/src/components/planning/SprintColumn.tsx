import { useState, useRef } from 'react'
import type { Item, Sprint, CadenceState } from '../../types'
import { PlanningCard } from './PlanningCard'
import { PlanningEpicGroup } from './PlanningEpicGroup'
import { effectiveCapacity, capacityLossBreakdown, describeCapacityLoss, holidaysInRange, computeSprintEndDate } from '../../utils/sprintCapacity'
import { fmtDateShort } from '../../utils/dates'
import { attachItemsToEpics, epicsWithPlaceholder, getHierarchyNodeSP } from '../../utils/hierarchyScore'
import { useHierCardTilt } from '../../hooks/useHierCardTilt'

interface Props {
  sprint: Sprint
  items: Item[]
  state: CadenceState
  isOver: boolean
  isActive: boolean
  highlightClient?: string
  highlightType?: string
  onDragStart: (id: string) => void
  onDragGroup: (ids: string[]) => void
  onDragOver: (sprintId: string) => void
  onDrop: (sprintId: string) => void
  onEdit: (item: Item) => void
  onUpdateDates: (sprintId: string, startDate: string, endDate: string) => void
  onActivate: (sprintId: string) => void
  onClose: (sprintId: string) => void
  onReopen: (sprintId: string) => void
  onDelete: (sprintId: string) => void
  onUpdateCapacity: (sprintId: string, capacity: number) => void
  // Phase 2.5 (roadmap v1) — Stakeholder en lecture seule sur Release Planning : masque le groupe
  // de boutons de cycle de vie (Activer/Clôturer/Rouvrir/Supprimer) et rend dates/capacité non
  // cliquables (simples valeurs affichées, plus d'édition inline). Les cartes restent consultables
  // (lecture seule, voir PlanningCard/PlanningEpicGroup) et le drag est désactivé.
  readOnly?: boolean
  // Restriction Dev (2026-08-19, décision Julien, voir utils/permissions.ts,
  // `canManageSprintLifecycle`) : Clôturer/Rouvrir masqués pour un Dev, contrairement à
  // Activer/Supprimer qui restent ouverts. Distinct de `readOnly` ci-dessus (Stakeholder, qui
  // masque tout le groupe), les deux gates se cumulent (`!readOnly && canManageLifecycle`).
  canManageLifecycle?: boolean
}

// ── Icônes Lucide inline ──────────────────────────────────────────────────
function Ico({ d, size = 12, style }: { d: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  )
}
const ICO_CALENDAR  = '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
const ICO_PENCIL    = '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>'
const ICO_UMBRELLA  = '<path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/>'
const ICO_TRASH =
  '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
  '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
  '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'

const BTN: React.CSSProperties = {
  fontSize: 10, padding: '2px 8px', border: '1px solid var(--border)',
  borderRadius: 5, background: 'transparent', color: 'var(--text-muted)',
  cursor: 'pointer', fontWeight: 600, lineHeight: '18px', whiteSpace: 'nowrap',
}
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN, background: 'var(--primary)', color: '#fff', border: 'none',
}
const BTN_DANGER: React.CSSProperties = {
  ...BTN, color: '#b91c1c', borderColor: '#fca5a5',
}
const BTN_DANGER_ICON: React.CSSProperties = {
  ...BTN_DANGER, padding: '2px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export function SprintColumn({
  sprint, items, state, isOver, isActive, highlightClient, highlightType,
  onDragStart, onDragGroup, onDragOver, onDrop, onEdit, onUpdateDates,
  onActivate, onClose, onReopen, onDelete, onUpdateCapacity, readOnly = false,
  canManageLifecycle = true,
}: Props) {
  const [editDates, setEditDates] = useState(false)
  const [draftStart, setDraftStart] = useState(sprint.startDate)
  const [draftEnd,   setDraftEnd]   = useState(sprint.endDate)
  const [editCap,    setEditCap]    = useState(false)
  const [draftCap,   setDraftCap]   = useState(String(sprint.capacity))
  // Cartes hierarchiques (2026-08-20) : voir KanbanColumn.tsx (meme principe), un hook par colonne.
  const itemsAreaRef = useRef<HTMLDivElement>(null)
  useHierCardTilt(itemsAreaRef)

  // Epics assignés à ce sprint (via leur propre sprintId) : un Epic sans aucun item mais avec
  // un SP fixé doit quand même apparaître comme une carte et compter dans la capacité du sprint
  // (retour Julien, 2026-07-29 — comportement d'avant la Phase 1, quand un Epic était un Item).
  // `attachItemsToEpics()` inclut nativement les Epics sans item correspondant. `epicsWithPlaceholder()`
  // (2026-08-17) retire les Epics qui ont bien des US mais aucune ici (conteneur vide fantôme,
  // normalement déjà évité en amont par `detachOrphanedEpics()` lors du déplacement des US, ce
  // filtre n'est qu'un filet de sécurité pour les cas non couverts, ex. suppression d'item).
  const sprintEpics = epicsWithPlaceholder(
    state.hierarchyNodes.filter(n => n.level === 'epic' && n.sprintId === sprint.id),
    items,
    state.items,
  )
  const { groups: epicGroups, orphans: standalone } = attachItemsToEpics(sprintEpics, items)
  const emptyEpicsSP = epicGroups.filter(g => g.items.length === 0).reduce((s, g) => s + getHierarchyNodeSP(g.epic, []), 0)
  const usedSP = items.reduce((s, i) => s + i.sp, 0) + emptyEpicsSP
  const effCap = effectiveCapacity(sprint, state.team, state.absences)
  const holidays = sprint.startDate && sprint.endDate ? holidaysInRange(sprint.startDate, sprint.endDate) : []
  // Détail de la perte de capacité (2026-07-28) : fériés et absences sont deux causes
  // distinctes, agrégées par effectiveCapacity() dans un seul nombre — on recalcule
  // séparément ici pour ne plus afficher "après fériés" quand la perte vient en
  // réalité de congés d'équipe (aucun jour férié dans la période du sprint).
  const capLoss = capacityLossBreakdown(sprint, state.team, state.absences)
  const capLossLabel = describeCapacityLoss(capLoss.spLostHolidays, capLoss.spLostAbsences)
  const pct  = effCap > 0 ? Math.min(100, (usedSP / effCap) * 100) : 0
  const over = usedSP > effCap
  const remaining = effCap - usedSP

  // ── Date editing ──────────────────────────────────────────────────────────
  function openEditDates() {
    setDraftStart(sprint.startDate)
    setDraftEnd(sprint.endDate)
    setEditDates(true)
  }
  function handleStartChange(val: string) {
    setDraftStart(val)
    if (val) setDraftEnd(computeSprintEndDate(val, state.settings.sprintDuration ?? 2))
  }
  function confirmDates() {
    if (draftStart && draftEnd) onUpdateDates(sprint.id, draftStart, draftEnd)
    setEditDates(false)
  }

  // ── Capacity editing ──────────────────────────────────────────────────────
  function commitCap() {
    const val = parseInt(draftCap, 10)
    if (!isNaN(val) && val >= 0) onUpdateCapacity(sprint.id, val)
    setEditCap(false)
  }

  // ── Bar colour ────────────────────────────────────────────────────────────
  const barColor = over ? 'var(--danger)' : pct >= 90 ? '#d97706' : 'var(--primary)'

  // ── Indicateur de faisabilité ─────────────────────────────────────────────
  // state.sprints est trié à la source (StateContext) — pas besoin de re-trier ici
  const closedWithVelo = state.sprints
    .filter(s => s.closed && (s.velocitySnapshot ?? 0) > 0)
    .slice(-3)
  const avgVelo = closedWithVelo.length > 0
    ? Math.round(closedWithVelo.reduce((s, sp) => s + (sp.velocitySnapshot ?? 0), 0) / closedWithVelo.length)
    : null
  const feasibility = !avgVelo ? 'unknown'
    : usedSP <= avgVelo * 0.85 ? 'ok'
    : usedSP <= avgVelo * 1.1  ? 'tight'
    : 'overloaded'
  const FEAS = {
    ok:         { color: '#16a34a', bg: '#dcfce7', label: '✓ Vélocité OK' },
    tight:      { color: '#d97706', bg: '#fef3c7', label: '⚡ Charge limite' },
    overloaded: { color: '#dc2626', bg: '#fee2e2', label: '⚠ Surcharge' },
    unknown:    { color: 'var(--text-faint)', bg: 'var(--surface2)', label: 'Historique insuffisant' },
  }

  // ── Classes ───────────────────────────────────────────────────────────────
  const colClass = [
    'planning-col',
    isOver   ? 'planning-col-over'    : '',
    sprint.closed  ? 'planning-col-closed'  : '',
    isActive && !sprint.closed ? 'planning-col-active' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={colClass}
      onDragOver={e => { e.preventDefault(); onDragOver(sprint.id) }}
      onDrop={e => { e.preventDefault(); onDrop(sprint.id) }}
    >
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="planning-col-header">

        {/* Row 1 — sprint number + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Sprint {sprint.number}</span>
          {sprint.label && sprint.label !== `Sprint ${sprint.number}` && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              {sprint.label.replace(/^Sprint \d+\s*[-–—]?\s*/i, '')}
            </span>
          )}
        </div>

        {/* Row 2 — status badge + action buttons (boutons masqués en lecture seule) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
          {sprint.closed ? (
            <>
              <span style={{
                fontSize: 10, background: '#d1fae520', color: '#15803d',
                padding: '1px 7px', borderRadius: 8, fontWeight: 700,
                border: '1px solid #bbf7d0',
              }}>🔒 Clôturé</span>
              {!readOnly && canManageLifecycle && <button style={BTN} onClick={() => onReopen(sprint.id)}>Rouvrir</button>}
            </>
          ) : isActive ? (
            <>
              <span style={{
                fontSize: 10, background: 'var(--primary-light)', color: 'var(--primary)',
                padding: '1px 7px', borderRadius: 8, fontWeight: 700,
                border: '1px solid var(--primary)',
              }}>★ Actif</span>
              {!readOnly && canManageLifecycle && <button style={BTN_DANGER} onClick={() => onClose(sprint.id)}>Clôturer</button>}
            </>
          ) : (
            <>
              {!readOnly && <button style={BTN_PRIMARY} onClick={() => onActivate(sprint.id)}>▶ Activer</button>}
              {!readOnly && (
                <button style={BTN_DANGER_ICON} title="Supprimer le sprint" data-testid={`btn-delete-sprint-${sprint.id}`}
                  onClick={() => onDelete(sprint.id)}>
                  <Ico d={ICO_TRASH} size={11} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Row 3 — dates (non éditables en lecture seule) */}
        {editDates && !readOnly ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
            <input type="date" value={draftStart} onChange={e => handleStartChange(e.target.value)}
              style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface)', color: 'var(--text)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
            <input type="date" value={draftEnd} onChange={e => setDraftEnd(e.target.value)}
              style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface)', color: 'var(--text)' }} />
            <button onClick={confirmDates} style={{ fontSize: 10, padding: '2px 7px', border: 'none', borderRadius: 4, background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>✓</button>
            <button onClick={() => setEditDates(false)} style={{ fontSize: 10, padding: '2px 7px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>X</button>
          </div>
        ) : (
          <span
            onClick={readOnly ? undefined : openEditDates}
            title={readOnly ? undefined : 'Cliquer pour modifier les dates'}
            style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, cursor: readOnly ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Ico d={ICO_CALENDAR} size={11} style={{ color: 'var(--text-muted)' }} />
            {sprint.startDate && sprint.endDate
              ? `${fmtDateShort(sprint.startDate)} - ${fmtDateShort(sprint.endDate)}`
              : <em>Dates non définies</em>}
            {holidays.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#d97706', fontWeight: 600 }} title={holidays.map(h => h.name).join(', ')}>
                <Ico d={ICO_UMBRELLA} size={11} style={{ color: '#d97706' }} />
                -{holidays.length}j
              </span>
            )}
            {!readOnly && <Ico d={ICO_PENCIL} size={10} style={{ color: 'var(--text-faint)', marginLeft: 1 }} />}
          </span>
        )}

        {/* Row 4 — capacity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Cap. max :</span>
          {editCap && !readOnly ? (
            <input
              type="number" min={0} step={5}
              value={draftCap}
              onChange={e => setDraftCap(e.target.value)}
              onBlur={commitCap}
              onKeyDown={e => { if (e.key === 'Enter') commitCap(); if (e.key === 'Escape') setEditCap(false) }}
              autoFocus
              style={{
                width: 48, fontSize: 11, fontWeight: 700, textAlign: 'right',
                border: '1px solid var(--primary)', borderRadius: 4,
                padding: '1px 4px', background: 'var(--surface)', color: 'var(--text)',
              }}
            />
          ) : (
            <span
              onClick={readOnly ? undefined : () => { setDraftCap(String(sprint.capacity)); setEditCap(true) }}
              title={readOnly ? undefined : 'Cliquer pour modifier la capacité'}
              style={{ fontSize: 11, fontWeight: 700, cursor: readOnly ? 'default' : 'pointer', padding: '1px 4px', borderRadius: 4, border: '1px solid transparent' }}
            >
              {sprint.capacity}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>SP</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: over ? 'var(--danger)' : '#d97706', whiteSpace: 'nowrap' }}>
            {usedSP} / {effCap} SP
            {effCap < sprint.capacity && !over && capLossLabel && (
              <span style={{ color: '#d97706', marginLeft: 2 }}
                title={[
                  capLoss.spLostHolidays > 0 ? `${capLoss.holidaysCount}j fériés (-${capLoss.spLostHolidays} SP)` : '',
                  capLoss.spLostAbsences > 0 ? `absences d'équipe (-${capLoss.spLostAbsences} SP)` : '',
                ].filter(Boolean).join(' + ')}>
                (-{sprint.capacity - effCap} après {capLossLabel})
              </span>
            )}
          </span>
        </div>

        {/* Row 5 — progress bar */}
        <div style={{ marginTop: 5 }}>
          <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width .3s' }} />
          </div>
        </div>

        {/* Row 6 — SP stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{usedSP} SP utilisés</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: over ? 'var(--danger)' : 'var(--text-muted)' }}>
            {over
              ? `${usedSP - effCap} SP dépassement ⚠`
              : `${remaining} SP restants`}
          </span>
        </div>

        {/* Row 7 — Indicateur de faisabilité (masqué si pas d'historique de vélocité) */}
        {!sprint.closed && feasibility !== 'unknown' && (
          <div style={{ marginTop: 5 }}>
            <span
              style={{
                fontSize: 10, fontWeight: 600,
                color: FEAS[feasibility].color,
                background: FEAS[feasibility].bg,
                padding: '2px 7px', borderRadius: 8, display: 'inline-block',
              }}
              title={avgVelo ? `Vélocité moyenne (3 derniers sprints) : ${avgVelo} SP` : 'Aucun sprint clôturé pour calculer la vélocité'}
            >
              {FEAS[feasibility].label}{avgVelo ? ` - moy. ${avgVelo} SP` : ''}
            </span>
          </div>
        )}

        {/* Alertes deadlines dépassées — inclut les Epics du sprint depuis l'ajout du champ
            deadline sur HierarchyNode (retour Julien, 2026-07-29 : un Epic peut de nouveau
            porter sa propre deadline, comme avant la Phase 1). */}
        {(() => {
          const isLate = (dl?: { date: string; type: string }) =>
            !!dl && dl.type !== 'none' && !!sprint.endDate && dl.date < sprint.endDate
          const lateItems = items.filter(i => isLate(i.deadline))
          const lateEpics = sprintEpics.filter(e => isLate(e.deadline))
          const lateNodes: { key: string; deadline?: { date: string } }[] = [...lateItems, ...lateEpics]
          return lateNodes.length > 0 ? (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '2px 7px', borderRadius: 8 }}
                title={lateNodes.map(n => `${n.key} — deadline ${n.deadline?.date}`).join('\n')}>
                ⚑ {lateNodes.length} deadline{lateNodes.length > 1 ? 's' : ''} dépassée{lateNodes.length > 1 ? 's' : ''}
              </span>
            </div>
          ) : null
        })()}

        {/* Goal */}
        {sprint.goal && (
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.3 }}>🎯 {sprint.goal}</p>
        )}
      </div>

      {/* ── ITEMS ─────────────────────────────────────────────────────────── */}
      {(() => {
        const isEmpty = epicGroups.length === 0 && standalone.length === 0

        return (
          <div className="planning-items" ref={itemsAreaRef}>
            {epicGroups.map(({ epicId, epic, items: stories }) => (
              <PlanningEpicGroup
                key={epicId}
                epicId={epicId}
                epic={epic}
                stories={stories}
                state={state}
                highlightClient={highlightClient}
                highlightType={highlightType}
                compact
                sprintEndDate={sprint.endDate}
                onEdit={onEdit}
                onDragGroup={ids => onDragGroup(ids)}
                onDragItem={id  => onDragStart(id)}
                readOnly={readOnly}
              />
            ))}
            {standalone.map(item => (
              <PlanningCard
                key={item.id}
                item={item}
                state={state}
                highlightClient={highlightClient}
                highlightType={highlightType}
                sprintEndDate={sprint.endDate}
                onEdit={onEdit}
                onDragStart={onDragStart}
                readOnly={readOnly}
                standalone
              />
            ))}
            {isEmpty && !sprint.closed && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 11, border: '1.5px dashed var(--border)', borderRadius: 6 }}>
                Glisser des US ici
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
