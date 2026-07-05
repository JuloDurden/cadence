import { useState } from 'react'
import type { Item, Sprint, CadenceState } from '../../types'
import { PlanningCard } from './PlanningCard'
import { effectiveCapacity, holidaysInRange, computeSprintEndDate } from '../../utils/sprintCapacity'
import { fmtDateShort } from '../../utils/dates'

interface Props {
  sprint: Sprint
  items: Item[]
  state: CadenceState
  isOver: boolean
  isActive: boolean
  onDragStart: (id: string) => void
  onDragOver: (sprintId: string) => void
  onDrop: (sprintId: string) => void
  onEdit: (item: Item) => void
  onUpdateDates: (sprintId: string, startDate: string, endDate: string) => void
  onActivate: (sprintId: string) => void
  onClose: (sprintId: string) => void
  onReopen: (sprintId: string) => void
  onUpdateCapacity: (sprintId: string, capacity: number) => void
}

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

export function SprintColumn({
  sprint, items, state, isOver, isActive,
  onDragStart, onDragOver, onDrop, onEdit, onUpdateDates,
  onActivate, onClose, onReopen, onUpdateCapacity,
}: Props) {
  const [editDates, setEditDates] = useState(false)
  const [draftStart, setDraftStart] = useState(sprint.startDate)
  const [draftEnd,   setDraftEnd]   = useState(sprint.endDate)
  const [editCap,    setEditCap]    = useState(false)
  const [draftCap,   setDraftCap]   = useState(String(sprint.capacity))

  const usedSP = items.reduce((s, i) => s + i.sp, 0)
  const effCap = effectiveCapacity(sprint, state.team)
  const holidays = sprint.startDate && sprint.endDate ? holidaysInRange(sprint.startDate, sprint.endDate) : []
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

        {/* Row 2 — status badge + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
          {sprint.closed ? (
            <>
              <span style={{
                fontSize: 10, background: '#d1fae520', color: '#15803d',
                padding: '1px 7px', borderRadius: 8, fontWeight: 700,
                border: '1px solid #bbf7d0',
              }}>🔒 Clôturé</span>
              <button style={BTN} onClick={() => onReopen(sprint.id)}>Rouvrir</button>
            </>
          ) : isActive ? (
            <>
              <span style={{
                fontSize: 10, background: 'var(--primary-light)', color: 'var(--primary)',
                padding: '1px 7px', borderRadius: 8, fontWeight: 700,
                border: '1px solid var(--primary)',
              }}>★ Actif</span>
              <button style={BTN_DANGER} onClick={() => onClose(sprint.id)}>Clôturer</button>
            </>
          ) : (
            <button style={BTN_PRIMARY} onClick={() => onActivate(sprint.id)}>▶ Activer</button>
          )}
        </div>

        {/* Row 3 — dates */}
        {editDates ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
            <input type="date" value={draftStart} onChange={e => handleStartChange(e.target.value)}
              style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface)', color: 'var(--text)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
            <input type="date" value={draftEnd} onChange={e => setDraftEnd(e.target.value)}
              style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface)', color: 'var(--text)' }} />
            <button onClick={confirmDates} style={{ fontSize: 10, padding: '2px 7px', border: 'none', borderRadius: 4, background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>✓</button>
            <button onClick={() => setEditDates(false)} style={{ fontSize: 10, padding: '2px 7px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <span
            onClick={openEditDates}
            title="Cliquer pour modifier les dates"
            style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            📅 {sprint.startDate && sprint.endDate
              ? `${fmtDateShort(sprint.startDate)} — ${fmtDateShort(sprint.endDate)}`
              : <em>Dates non définies</em>}
            {holidays.length > 0 && (
              <span style={{ color: '#d97706', fontWeight: 600 }} title={holidays.map(h => h.name).join(', ')}>
                🏖 -{holidays.length}j
              </span>
            )}
            <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 1 }}>✎</span>
          </span>
        )}

        {/* Row 4 — capacity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Cap. max :</span>
          {editCap ? (
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
              onClick={() => { setDraftCap(String(sprint.capacity)); setEditCap(true) }}
              title="Cliquer pour modifier la capacité"
              style={{ fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '1px 4px', borderRadius: 4, border: '1px solid transparent' }}
            >
              {sprint.capacity}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>SP</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: over ? 'var(--danger)' : '#d97706', whiteSpace: 'nowrap' }}>
            {usedSP} / {effCap} SP
            {effCap < sprint.capacity && !over && (
              <span style={{ color: '#d97706', marginLeft: 2 }} title={`-${holidays.length}j fériés`}>(-{sprint.capacity - effCap} après fériés)</span>
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

        {/* Goal */}
        {sprint.goal && (
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.3 }}>🎯 {sprint.goal}</p>
        )}
      </div>

      {/* ── ITEMS ─────────────────────────────────────────────────────────── */}
      <div className="planning-items">
        {items.map(item => (
          <PlanningCard
            key={item.id}
            item={item}
            state={state}
            onEdit={onEdit}
            onDragStart={onDragStart}
          />
        ))}
        {items.length === 0 && !sprint.closed && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 11, border: '1.5px dashed var(--border)', borderRadius: 6 }}>
            Glisser des US ici
          </div>
        )}
      </div>
    </div>
  )
}
