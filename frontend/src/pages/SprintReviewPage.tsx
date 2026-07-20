import { useState, useMemo, useRef, useEffect } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import type {
  SprintReviewSession, SprintReviewArchive,
  SRItemRecord, SRUnfinishedRecord, SRDecision, SRNote, SROtherParticipant,
  SRBadge, SRUnfinishedDecision,
  Item, Sprint, TeamMember, Client, Contact,
} from '../types'
import { archiveAndReset } from '../utils/session'

// ── SVG icon paths ─────────────────────────────────────────────────────────────
const ICO = {
  chevDown:    '<path d="m6 9 6 6 6-6"/>',
  chevRight:   '<path d="m9 18 6-6-6-6"/>',
  archive:     '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  trash:       '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  plus:        '<path d="M5 12h14"/><path d="M12 5v14"/>',
  check:       '<polyline points="20 6 9 17 4 12"/>',
  circleX:     '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  target:      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  clock:       '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  barChart:    '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
  listCheck:   '<path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="m19 10-4 4 2 2 4-6"/>',
  notes:       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/>',
  circleCheck: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  search:      '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  link:        '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  x:           '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
}

function Ico({ d, size = 14, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

function uid() { return crypto.randomUUID() }

// ── Styles ─────────────────────────────────────────────────────────────────────
const SECTION_WRAP: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12,
  background: 'var(--card-bg, var(--surface))',
}
const SECTION_HDR: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 16px', borderBottom: '1px solid var(--border)',
  background: 'var(--surface)', borderRadius: '8px 8px 0 0',
  cursor: 'pointer', userSelect: 'none',
}
const ICON_BTN: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
  borderRadius: 5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
}
const INPUT_STYLE: React.CSSProperties = {
  fontSize: 12, border: '1px solid var(--border)', borderRadius: 6,
  padding: '4px 8px', background: 'transparent', color: 'var(--text)',
}

// ── Badge helpers ──────────────────────────────────────────────────────────────
const BADGE_CYCLE: SRBadge[] = ['pending', 'accepted', 'refused']
const BADGE_LABEL: Record<SRBadge, string> = { pending: 'En attente', accepted: 'Accepté', refused: 'Refusé' }
const BADGE_COLOR: Record<SRBadge, string> = {
  pending: 'var(--text-muted)', accepted: 'var(--success)', refused: 'var(--danger)',
}
const BADGE_BG: Record<SRBadge, string> = {
  pending:  'var(--border)',
  accepted: 'color-mix(in srgb, var(--success) 15%, transparent)',
  refused:  'color-mix(in srgb, var(--danger) 15%, transparent)',
}

function nextBadge(b: SRBadge): SRBadge {
  return BADGE_CYCLE[(BADGE_CYCLE.indexOf(b) + 1) % BADGE_CYCLE.length]
}

function sprintWeeks(sprint: Sprint): number {
  const ms = new Date(sprint.endDate).getTime() - new Date(sprint.startDate).getTime()
  return Math.max(1, Math.round(ms / (7 * 24 * 3600 * 1000)))
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function archiveDateLabel(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

/** SP effectif : pour un Epic avec sp=0, somme les enfants */
function effectiveSP(item: Item, allItems: Item[]): number {
  if (item.type === 'epic' && (!item.sp || item.sp === 0)) {
    const children = allItems.filter(i => i.epicId === item.id)
    if (children.length > 0) return children.reduce((s, i) => s + (i.sp ?? 0), 0)
  }
  return item.sp ?? 0
}

/** SP livré pour un sprint clôturé : snapshot ou calcul depuis les items */
function sprintDeliveredSP(sprint: Sprint, items: Item[], doneCols: string[]): number {
  if (sprint.velocitySnapshot !== undefined) return sprint.velocitySnapshot
  return items
    .filter(i => i.sprintId === sprint.id && doneCols.includes(i.status))
    .reduce((sum, i) => sum + (i.sp ?? 0), 0)
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function SprintReviewPage() {
  const { state, dispatch, saveToServer } = useCadence()

  const [selectedSprintId, setSelectedSprintId] = useState<string>(() => {
    const active = state.sprints.find(s => !s.closed) ?? state.sprints[state.sprints.length - 1]
    return active?.id ?? ''
  })

  const [showDelivered, setShowDelivered]   = useState(true)
  const [showUnfinished, setShowUnfinished] = useState(true)
  const [showVelocity, setShowVelocity]     = useState(true)
  const [showDecisions, setShowDecisions]   = useState(true)
  const [showNotes, setShowNotes]           = useState(true)
  const [showArchives, setShowArchives]     = useState(true)
  const [expandedArchive, setExpandedArchive] = useState<string | null>(null)
  const [showDecisionForm, setShowDecisionForm] = useState(false)
  const [filterToDemo, setFilterToDemo]     = useState(false)

  const sprint = useMemo(
    () => state.sprints.find(s => s.id === selectedSprintId),
    [state.sprints, selectedSprintId]
  )

  const session = useMemo((): SprintReviewSession => {
    const existing = (state.sprintReviewSessions ?? []).find(s => s.sprintId === selectedSprintId)
    return existing ?? {
      id: uid(), sprintId: selectedSprintId,
      date: new Date().toISOString().slice(0, 10),
      participantIds: [], participantContactIds: [], participantsOther: [],
      notes: [], itemRecords: [], unfinishedRecords: [], decisions: [],
    }
  }, [state.sprintReviewSessions, selectedSprintId])

  const doneCols = useMemo(
    () => state.kanbanCols.filter(c => c.isDone).map(c => c.id),
    [state.kanbanCols]
  )
  const sprintItems = useMemo(
    () => state.items.filter(i => i.sprintId === selectedSprintId),
    [state.items, selectedSprintId]
  )
  const deliveredItems = useMemo(
    () => sprintItems.filter(i => doneCols.includes(i.status)),
    [sprintItems, doneCols]
  )
  const unfinishedItems = useMemo(
    () => sprintItems.filter(i => !doneCols.includes(i.status)),
    [sprintItems, doneCols]
  )

  const plannedSP   = sprintItems.reduce((s, i) => s + effectiveSP(i, state.items), 0)
  const deliveredSP = deliveredItems.reduce((s, i) => s + effectiveSP(i, state.items), 0)
  const completionPct = plannedSP > 0 ? Math.round((deliveredSP / plannedSP) * 100) : 0

  // Velocity history — closed sprints + past-endDate sprints (up to 5)
  const pastSprints = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return [...state.sprints]
      .filter(s => s.closed || s.endDate < today)
      .slice(-5)
  }, [state.sprints])

  const maxVel = Math.max(
    1,
    ...pastSprints.map(s => Math.max(
      sprintDeliveredSP(s, state.items, doneCols),
      s.capacity ?? 0
    ))
  )

  const timebox = sprint ? sprintWeeks(sprint) * 60 : 0
  const timeboxLabel = timebox >= 60
    ? `${Math.floor(timebox / 60)}h${timebox % 60 > 0 ? timebox % 60 + 'min' : ''}`
    : timebox + 'min'

  function save(updated: SprintReviewSession) {
    dispatch({ type: 'UPSERT_SR_SESSION', payload: updated })
    saveToServer({ ...state, sprintReviewSessions: [...(state.sprintReviewSessions ?? []).filter(s => s.id !== updated.id), updated] })
  }

  function getRecord(itemId: string): SRItemRecord {
    return session.itemRecords.find(r => r.itemId === itemId)
      ?? { itemId, badge: 'pending', toDemo: false, note: '' }
  }
  function getUnfinished(itemId: string): SRUnfinishedRecord {
    return session.unfinishedRecords.find(r => r.itemId === itemId)
      ?? { itemId, reason: '', decision: 'report' }
  }

  function updateItemRecord(patch: Partial<SRItemRecord> & { itemId: string }) {
    const updated = { ...getRecord(patch.itemId), ...patch }
    save({ ...session, itemRecords: [...session.itemRecords.filter(r => r.itemId !== patch.itemId), updated] })
  }
  function updateUnfinished(patch: Partial<SRUnfinishedRecord> & { itemId: string }) {
    const updated = { ...getUnfinished(patch.itemId), ...patch }
    save({ ...session, unfinishedRecords: [...session.unfinishedRecords.filter(r => r.itemId !== patch.itemId), updated] })
  }

  function addDecision(d: SRDecision) { save({ ...session, decisions: [...session.decisions, d] }) }
  function removeDecision(id: string) { save({ ...session, decisions: session.decisions.filter(d => d.id !== id) }) }

  function applyNewItem(decision: SRDecision) {
    const item: Item = {
      id: uid(),
      key: 'SR-' + Date.now().toString(36).toUpperCase(),
      desc: decision.desc,
      sp: decision.sp ?? 1,
      status: state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id ?? 'todo',
      clientId: '', sprintId: null, priority: 'medium',
      assignees: [], tags: [], type: 'story',
      createdAt: new Date().toISOString(),
    }
    dispatch({ type: 'ADD_ITEM', payload: item })
    const decisions = session.decisions.map(d => d.id === decision.id ? { ...d, applied: true } : d)
    save({ ...session, decisions })
    saveToServer({ ...state, items: [...state.items, item] })
  }

  function addNote() {
    const note: SRNote = { id: uid(), text: '', createdAt: new Date().toISOString() }
    save({ ...session, notes: [...(session.notes ?? []), note] })
  }
  function updateNote(id: string, patch: Partial<SRNote>) {
    save({ ...session, notes: (session.notes ?? []).map(n => n.id === id ? { ...n, ...patch } : n) })
  }
  function deleteNote(id: string) {
    save({ ...session, notes: (session.notes ?? []).filter(n => n.id !== id) })
  }

  function handleArchive() {
    const arc: SprintReviewArchive = {
      id: uid(), date: new Date().toISOString().slice(0, 10),
      sprintId: sprint?.id, sprintLabel: sprint?.label,
      participantIds: session.participantIds ?? [],
      participantContactIds: session.participantContactIds ?? [],
      participantsOther: session.participantsOther ?? [],
      notes: session.notes ?? [],
      itemRecords: session.itemRecords,
      unfinishedRecords: session.unfinishedRecords,
      decisions: session.decisions,
      createdAt: new Date().toISOString(),
    }
    dispatch({ type: 'ADD_SR_ARCHIVE', payload: arc })
    save(archiveAndReset(session, {
      participantIds: [], participantContactIds: [], participantsOther: [],
      notes: [], itemRecords: [], unfinishedRecords: [], decisions: [],
    }))
  }

  function handleDeleteArchive(id: string) {
    dispatch({ type: 'DELETE_SR_ARCHIVE', payload: id })
  }

  const srArchives = [...(state.sprintReviewArchives ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  const displayedDelivered = filterToDemo ? deliveredItems.filter(i => getRecord(i.id).toDemo) : deliveredItems

  return (
    <>
      <Header title="Sprint Review">
        <select
          className="hdr-select"
          style={{ height: 30, fontSize: 12, border: '1px solid var(--border)', borderRadius: 7, background: 'transparent', color: 'var(--text)', padding: '0 8px', cursor: 'pointer', maxWidth: 220 }}
          value={selectedSprintId}
          onChange={e => setSelectedSprintId(e.target.value)}
        >
          {state.sprints.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        {sprint?.goal && (
          <span className="hdr-ctx-stat" style={{ color: 'var(--text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}
            title={sprint.goal}>
            {sprint.goal}
          </span>
        )}

        {sprint && (
          <span className="hdr-ctx-stat" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
            {sprintWeeks(sprint)} sem.
          </span>
        )}

        <div style={{ flex: 1 }} />

        {timebox > 0 && (
          <span className="hdr-ctx-stat" style={{ whiteSpace: 'nowrap', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Ico d={ICO.clock} size={12} />
            {timeboxLabel}
          </span>
        )}

        {sprint && (
          <span className="hdr-ctx-stat" style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600 }}>
            {deliveredSP}/{plannedSP} SP · {completionPct}%
          </span>
        )}

        <button className="hdr-btn" title="Archiver cette Sprint Review" onClick={handleArchive}>
          <Ico d={ICO.archive} />
        </button>
      </Header>

      <div className="page-content">

        {/* ── Review card ── */}
        <div style={{ ...SECTION_WRAP, padding: '14px 16px', marginBottom: 14, borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Date + timebox */}
            <div style={{ minWidth: 150 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date de revue</div>
              <input
                type="date"
                style={{ ...INPUT_STYLE, fontSize: 13 }}
                value={session.date}
                onChange={e => save({ ...session, date: e.target.value })}
              />
              {timebox > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Ico d={ICO.clock} size={11} />
                  Time-box recommandée : <strong style={{ color: 'var(--text)' }}>{timeboxLabel}</strong>
                </div>
              )}
            </div>

            {/* Séparateur */}
            <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', flexShrink: 0 }} />

            {/* Participants */}
            <ParticipantsPanel
              session={session}
              team={state.team}
              clients={state.clients}
              onSave={save}
            />
          </div>
        </div>

        {/* ── Section 1 — Incrément livré ── */}
        <div style={SECTION_WRAP}>
          <div style={SECTION_HDR} onClick={() => setShowDelivered(v => !v)}>
            <Ico d={showDelivered ? ICO.chevDown : ICO.chevRight} size={13} />
            <Ico d={ICO.circleCheck} size={14} stroke="var(--success)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Incrément livré</span>
            <CountBadge n={deliveredItems.length} />
            <div style={{ flex: 1 }} />
            <label
              style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, cursor: 'pointer' }}
              onClick={e => e.stopPropagation()}
            >
              <input type="checkbox" checked={filterToDemo} onChange={e => setFilterToDemo(e.target.checked)} />
              Filtrer "À démontrer"
            </label>
          </div>
          {showDelivered && (
            <div>
              {displayedDelivered.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 16px', margin: 0 }}>
                  {filterToDemo ? 'Aucun item marqué "À démontrer"' : 'Aucun item livré pour ce sprint.'}
                </p>
              )}
              {displayedDelivered.map(item => {
                const rec = getRecord(item.id)
                return (
                  <DeliveredItemRow
                    key={item.id}
                    item={item}
                    allItems={state.items}
                    record={rec}
                    onToggleBadge={() => updateItemRecord({ itemId: item.id, badge: nextBadge(rec.badge) })}
                    onToggleDemo={() => updateItemRecord({ itemId: item.id, toDemo: !rec.toDemo })}
                    onNoteChange={note => updateItemRecord({ itemId: item.id, note })}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* ── Section 2 — Non terminé ── */}
        <div style={SECTION_WRAP}>
          <div style={SECTION_HDR} onClick={() => setShowUnfinished(v => !v)}>
            <Ico d={showUnfinished ? ICO.chevDown : ICO.chevRight} size={13} />
            <Ico d={ICO.circleX} size={14} stroke="var(--danger)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Non terminé</span>
            <CountBadge n={unfinishedItems.length} />
          </div>
          {showUnfinished && (
            <div>
              {unfinishedItems.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 16px', margin: 0 }}>Tous les items du sprint sont livrés 🎉</p>
              )}
              {unfinishedItems.map(item => {
                const rec = getUnfinished(item.id)
                return (
                  <UnfinishedItemRow
                    key={item.id}
                    item={item}
                    allItems={state.items}
                    record={rec}
                    onReasonChange={reason => updateUnfinished({ itemId: item.id, reason })}
                    onDecisionChange={decision => updateUnfinished({ itemId: item.id, decision })}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* ── Section 3 — Vélocité ── */}
        <div style={SECTION_WRAP}>
          <div style={SECTION_HDR} onClick={() => setShowVelocity(v => !v)}>
            <Ico d={showVelocity ? ICO.chevDown : ICO.chevRight} size={13} />
            <Ico d={ICO.barChart} size={14} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Vélocité</span>
          </div>
          {showVelocity && (
            <div style={{ padding: '14px 16px' }}>
              {/* Stat chips row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatChip label="SP planifiés" value={plannedSP} />
                <StatChip
                  label="SP livrés" value={deliveredSP}
                  color={deliveredSP >= plannedSP * 0.8 ? 'var(--success)' : 'var(--warning, #f59e0b)'}
                />
                <StatChip
                  label="Complétion" value={completionPct + ' %'}
                  color={completionPct >= 80 ? 'var(--success)' : 'var(--warning, #f59e0b)'}
                />
              </div>

              {/* Bar chart — full width */}
              {pastSprints.length > 0 && (
                <VelocityChart
                  sprints={pastSprints}
                  items={state.items}
                  doneCols={doneCols}
                  maxVel={maxVel}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Section 4 — Décisions backlog ── */}
        <div style={SECTION_WRAP}>
          <div style={{ ...SECTION_HDR, cursor: 'default' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }}
              onClick={() => setShowDecisions(v => !v)}
            >
              <Ico d={showDecisions ? ICO.chevDown : ICO.chevRight} size={13} />
              <Ico d={ICO.listCheck} size={14} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Décisions backlog</span>
              <CountBadge n={session.decisions.length} />
            </div>
            {/* Bouton "Ajouter" dans le header */}
            {!showDecisionForm && (
              <button
                style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={e => { e.stopPropagation(); setShowDecisionForm(true); setShowDecisions(true) }}
              >
                <Ico d={ICO.plus} size={12} stroke="var(--primary)" />
                Ajouter une décision
              </button>
            )}
          </div>

          {showDecisions && (
            <div>
              {session.decisions.length === 0 && !showDecisionForm && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 16px', margin: 0 }}>
                  Aucune décision backlog pour cette revue.
                </p>
              )}
              {session.decisions.map(d => (
                <DecisionRow
                  key={d.id}
                  decision={d}
                  onApplyNew={() => applyNewItem(d)}
                  onDelete={() => removeDecision(d.id)}
                />
              ))}

              {showDecisionForm && (
                <DecisionForm
                  items={state.items}
                  doneCols={doneCols}
                  sprintId={selectedSprintId}
                  onAdd={d => { addDecision(d); setShowDecisionForm(false) }}
                  onCancel={() => setShowDecisionForm(false)}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Section 5 — Notes globales ── */}
        <div style={SECTION_WRAP}>
          <div style={{ ...SECTION_HDR, cursor: 'default' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }}
              onClick={() => setShowNotes(v => !v)}
            >
              <Ico d={showNotes ? ICO.chevDown : ICO.chevRight} size={13} />
              <Ico d={ICO.notes} size={14} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Notes globales</span>
              {(session.notes ?? []).length > 0 && <CountBadge n={(session.notes ?? []).length} />}
            </div>
            <button
              style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}
              onClick={e => { e.stopPropagation(); addNote(); setShowNotes(true) }}
            >
              <Ico d={ICO.plus} size={12} />
              Ajouter une note
            </button>
          </div>
          {showNotes && (
            <div style={{ padding: '8px 0' }}>
              {(session.notes ?? []).length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 16px', margin: 0 }}>
                  Aucune note — retours stakeholders, points d'attention, décisions prises en séance…
                </p>
              )}
              {(session.notes ?? []).map(note => (
                <NoteRow
                  key={note.id}
                  note={note}
                  items={state.items}
                  onChange={patch => updateNote(note.id, patch)}
                  onDelete={() => deleteNote(note.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Section 6 — Archives ── */}
        <button
          className="daily-section-btn"
          style={{ marginTop: 8 }}
          onClick={() => setShowArchives(v => !v)}
        >
          <Ico d={showArchives ? ICO.chevDown : ICO.chevRight} size={13} />
          Archives ({srArchives.length})
        </button>

        {showArchives && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {srArchives.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0', margin: 0 }}>Aucune archive</p>
            )}
            {srArchives.map(archive => (
              <SRArchiveCard
                key={archive.id}
                archive={archive}
                isOpen={expandedArchive === archive.id}
                onToggle={() => setExpandedArchive(expandedArchive === archive.id ? null : archive.id)}
                onDelete={() => handleDeleteArchive(archive.id)}
                items={state.items}
                team={state.team}
                clients={state.clients}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

// ── ParticipantsPanel ─────────────────────────────────────────────────────────

function ParticipantsPanel({ session, team, clients, onSave }: {
  session: SprintReviewSession
  team: TeamMember[]
  clients: Client[]
  onSave: (s: SprintReviewSession) => void
}) {
  const [search, setSearch]         = useState('')
  const [showDrop, setShowDrop]     = useState(false)
  const [inputFocused, setFocused]  = useState(false)
  const dropRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedTeamIds    = session.participantIds ?? []
  const selectedContactIds = session.participantContactIds ?? []
  const others             = session.participantsOther ?? []

  // ── Dropdown data ────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim()

  const matchedTeam = team.filter(m =>
    !q || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
  )

  type FlatContact = { client: Client; contact: Contact }
  const allContacts: FlatContact[] = clients.flatMap(c =>
    (c.contacts ?? []).map(contact => ({ client: c, contact }))
  )
  const matchedContacts = allContacts.filter(({ client, contact }) =>
    !q ||
    contact.name.toLowerCase().includes(q) ||
    contact.role.toLowerCase().includes(q) ||
    client.name.toLowerCase().includes(q)
  )

  type DropGroup = { client: Client; contacts: (Contact & { alreadySel: boolean })[] }
  const dropGroups: DropGroup[] = []
  for (const { client, contact } of matchedContacts) {
    let g = dropGroups.find(g => g.client.id === client.id)
    if (!g) { g = { client, contacts: [] }; dropGroups.push(g) }
    g.contacts.push({ ...contact, alreadySel: selectedContactIds.includes(contact.id) })
  }

  const hasDropResults = matchedTeam.length > 0 || dropGroups.length > 0

  // ── Selected display data ────────────────────────────────────────────────────
  const selectedTeam = team.filter(m => selectedTeamIds.includes(m.id))

  type SelGroup = { client: Client; contacts: Contact[] }
  const selGroups: SelGroup[] = []
  for (const c of clients) {
    const contacts = (c.contacts ?? []).filter(ct => selectedContactIds.includes(ct.id))
    if (contacts.length > 0) selGroups.push({ client: c, contacts })
  }

  const hasSelected = selectedTeam.length > 0 || selGroups.length > 0 || others.length > 0

  // ── Actions ──────────────────────────────────────────────────────────────────
  function focus() { setTimeout(() => inputRef.current?.focus(), 0) }

  function selectTeam(id: string) {
    if (!selectedTeamIds.includes(id))
      onSave({ ...session, participantIds: [...selectedTeamIds, id] })
    setSearch(''); setShowDrop(false); focus()
  }
  function removeTeam(id: string) {
    onSave({ ...session, participantIds: selectedTeamIds.filter(x => x !== id) })
  }
  function selectContact(id: string) {
    if (!selectedContactIds.includes(id))
      onSave({ ...session, participantContactIds: [...selectedContactIds, id] })
    setSearch(''); setShowDrop(false); focus()
  }
  function removeContact(id: string) {
    onSave({ ...session, participantContactIds: selectedContactIds.filter(x => x !== id) })
  }
  function addOther(text: string) {
    if (!text.trim()) return
    const entry: SROtherParticipant = { id: uid(), text: text.trim() }
    onSave({ ...session, participantsOther: [...others, entry] })
    setSearch(''); setShowDrop(false); focus()
  }
  function removeOther(id: string) {
    onSave({ ...session, participantsOther: others.filter(o => o.id !== id) })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && search.trim()) { addOther(search) }
    if (e.key === 'Escape') { setShowDrop(false); setSearch('') }
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const COL_LBL: React.CSSProperties = {
    fontSize: 10, color: 'var(--text-muted)', fontWeight: 700,
    textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6,
  }

  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Participants
      </div>

      {/* ── Single search input ── */}
      <div ref={dropRef} style={{ position: 'relative', marginBottom: hasSelected ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${inputFocused ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 6, background: 'var(--surface)', boxShadow: inputFocused ? '0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent)' : 'none', transition: 'border-color 0.15s, box-shadow 0.15s' }}>
          <span style={{ padding: '0 8px', color: inputFocused ? 'var(--primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'color 0.15s' }}>
            <Ico d={ICO.search} size={12} />
          </span>
          <input
            ref={inputRef}
            className="unibody-search-input"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12, padding: '6px 8px 6px 0', color: 'var(--text)', outline: 'none', boxShadow: 'none' }}
            placeholder="Membre d'équipe, contact client, ou Entrée pour ajouter…"
            value={search}
            onChange={e => { setSearch(e.target.value); setShowDrop(true) }}
            onFocus={() => { setShowDrop(true); setFocused(true) }}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
          />
          {search && (
            <button style={{ ...ICON_BTN, padding: '0 8px' }} onClick={() => { setSearch(''); focus() }}>
              <Ico d={ICO.x} size={11} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDrop && (hasDropResults || q) && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.14)', maxHeight: 300, overflow: 'auto', marginTop: 3 }}>

            {/* Équipe */}
            {matchedTeam.length > 0 && (
              <>
                <div style={{ padding: '5px 12px 3px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)' }}>Équipe</div>
                {matchedTeam.map(member => {
                  const sel = selectedTeamIds.includes(member.id)
                  return (
                    <button key={member.id} disabled={sel}
                      onMouseDown={e => { e.preventDefault(); if (!sel) selectTeam(member.id) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '7px 12px', background: 'none', border: 'none', cursor: sel ? 'default' : 'pointer', borderBottom: '1px solid var(--border)', color: 'var(--text)', opacity: sel ? 0.45 : 1 }}
                    >
                      <div style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--primary) 15%, var(--surface))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--primary)', flexShrink: 0, overflow: 'hidden' }}>
                        {member.photo ? <img src={member.photo} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(member.name)}
                      </div>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{member.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({member.role})</span>
                      {sel && <Ico d={ICO.check} size={12} stroke="var(--success)" />}
                    </button>
                  )
                })}
              </>
            )}

            {/* Contacts clients */}
            {dropGroups.length > 0 && (
              <>
                <div style={{ padding: '5px 12px 3px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)' }}>Contacts clients</div>
                {dropGroups.map(({ client, contacts: cc }) => (
                  <div key={client.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'color-mix(in srgb, var(--border) 50%, transparent)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: client.color ?? 'var(--primary)', color: '#fff', flexShrink: 0 }}>{client.prefix}</span>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{client.name}</span>
                    </div>
                    {cc.map(contact => (
                      <button key={contact.id} disabled={contact.alreadySel}
                        onMouseDown={e => { e.preventDefault(); if (!contact.alreadySel) selectContact(contact.id) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 12px 6px 28px', background: 'none', border: 'none', cursor: contact.alreadySel ? 'default' : 'pointer', borderBottom: '1px solid var(--border)', color: 'var(--text)', opacity: contact.alreadySel ? 0.45 : 1 }}
                      >
                        <span style={{ flex: 1, fontSize: 12 }}>{contact.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({contact.role})</span>
                        {contact.alreadySel && <Ico d={ICO.check} size={12} stroke="var(--success)" />}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}

            {/* Aucun résultat → hint Entrée */}
            {!hasDropResults && q && (
              <div
                onMouseDown={e => { e.preventDefault(); addOther(search) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
              >
                <Ico d={ICO.plus} size={12} stroke="var(--primary)" />
                <span>Ajouter <strong style={{ color: 'var(--text)' }}>«&nbsp;{search}&nbsp;»</strong> comme participant externe</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, background: 'var(--border)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>↵</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 3 colonnes : Équipe | Contacts | Autres ── */}
      {hasSelected && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

          {/* Colonne 1 — Équipe (badges) */}
          {selectedTeam.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={COL_LBL}>Équipe</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxWidth: 150 }}>
                {selectedTeam.map(member => (
                  <div key={member.id} style={{ position: 'relative' }} title={`${member.name} · ${member.role}`}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', border: '2px solid var(--primary)', background: 'color-mix(in srgb, var(--primary) 15%, var(--surface))', color: 'var(--primary)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {member.photo ? <img src={member.photo} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(member.name)}
                    </div>
                    <button onClick={() => removeTeam(member.id)} title={`Retirer ${member.name}`}
                      style={{ position: 'absolute', top: -3, right: -3, width: 15, height: 15, borderRadius: '50%', background: 'var(--danger)', border: '1px solid var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <Ico d={ICO.x} size={8} stroke="#fff" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Séparateur */}
          {selectedTeam.length > 0 && (selGroups.length > 0 || others.length > 0) && (
            <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', flexShrink: 0, marginTop: 16 }} />
          )}

          {/* Colonne 2 — Contacts clients */}
          {selGroups.length > 0 && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={COL_LBL}>Contacts</div>
              {selGroups.map(({ client, contacts }) => (
                <div key={client.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: client.color ?? 'var(--primary)', color: '#fff', flexShrink: 0 }}>{client.prefix}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{client.name}</span>
                  </div>
                  {contacts.map(contact => (
                    <div key={contact.id} style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 14, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</span>
                      {contact.role && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{contact.role}</span>}
                      <button style={{ ...ICON_BTN, padding: '1px 3px', flexShrink: 0 }} onClick={() => removeContact(contact.id)} title="Retirer">
                        <Ico d={ICO.x} size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Séparateur */}
          {selGroups.length > 0 && others.length > 0 && (
            <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', flexShrink: 0, marginTop: 16 }} />
          )}

          {/* Colonne 3 — Autres participants */}
          {others.length > 0 && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={COL_LBL}>Autres</div>
              {others.map(other => {
                const m = other.text.match(/^(.+?)\s*\((.+)\)\s*$/)
                const name = m ? m[1].trim() : other.text
                const role = m ? m[2].trim() : undefined
                return (
                  <div key={other.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    {role && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{role}</span>}
                    <button style={{ ...ICON_BTN, padding: '1px 3px', flexShrink: 0 }} onClick={() => removeOther(other.id)} title="Retirer">
                      <Ico d={ICO.x} size={10} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CountBadge({ n }: { n: number }) {
  return (
    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, background: 'var(--border)', borderRadius: 20, padding: '1px 8px' }}>
      {n}
    </span>
  )
}

function StatChip({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1 }}>{value}</span>
    </div>
  )
}

function VelocityChart({ sprints, items, doneCols, maxVel }: {
  sprints: Sprint[]
  items: Item[]
  doneCols: string[]
  maxVel: number
}) {
  const BAR_H = 72
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
        Historique vélocité — {sprints.length} sprint{sprints.length > 1 ? 's' : ''} passé{sprints.length > 1 ? 's' : ''}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: BAR_H + 32 }}>
        {sprints.map(s => {
          const delivered = sprintDeliveredSP(s, items, doneCols)
          const capacity  = s.capacity ?? 0
          const hDel = maxVel > 0 ? Math.max(4, Math.round((delivered / maxVel) * BAR_H)) : 4
          const hCap = maxVel > 0 ? Math.max(4, Math.round((capacity  / maxVel) * BAR_H)) : 4
          const pct  = capacity > 0 ? Math.round((delivered / capacity) * 100) : 0
          return (
            <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
              {/* value labels */}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {delivered}/{capacity}
              </div>
              {/* bars side by side */}
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: BAR_H }}>
                <div
                  style={{ width: 18, height: hCap, background: 'var(--border)', borderRadius: '3px 3px 0 0' }}
                  title={`Capacité planifiée : ${capacity} SP`}
                />
                <div
                  style={{ width: 18, height: hDel, background: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning, #f59e0b)' : 'var(--danger)', borderRadius: '3px 3px 0 0', opacity: 0.85 }}
                  title={`Livré : ${delivered} SP (${pct}%)`}
                />
              </div>
              {/* sprint label */}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                S{s.number}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.8 }}>{pct}%</div>
            </div>
          )
        })}
        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, paddingBottom: 28, marginLeft: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, background: 'var(--border)', borderRadius: 2 }} /> Planifié
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, background: 'var(--success)', borderRadius: 2, opacity: 0.85 }} /> Livré
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemMetaBadges({ item, allItems }: { item: Item; allItems: Item[] }) {
  const sp = effectiveSP(item, allItems)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <span style={{ fontSize: 11, background: 'var(--border)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap', fontWeight: 600 }}>
        {sp} SP
      </span>
      {item.type && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
          {item.type}
        </span>
      )}
      {item.key && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {item.key}
        </span>
      )}
    </span>
  )
}

function DeliveredItemRow({ item, allItems, record, onToggleBadge, onToggleDemo, onNoteChange }: {
  item: Item
  allItems: Item[]
  record: SRItemRecord
  onToggleBadge: () => void
  onToggleDemo: () => void
  onNoteChange: (note: string) => void
}) {
  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
      {/* Row 1: title + meta + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 120 }}>{item.desc}</span>
        <ItemMetaBadges item={item} allItems={allItems} />
        <button
          style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            background: record.toDemo ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--border)',
            color: record.toDemo ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: record.toDemo ? 600 : 400 }}
          onClick={onToggleDemo}
        >À démontrer</button>
        <button
          style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            background: BADGE_BG[record.badge], color: BADGE_COLOR[record.badge], fontWeight: 500 }}
          onClick={onToggleBadge}
        >{BADGE_LABEL[record.badge]}</button>
      </div>
      {/* Row 2: Note PO */}
      <input
        style={{ ...INPUT_STYLE, marginTop: 6, width: '100%', boxSizing: 'border-box' }}
        placeholder="Note PO…"
        value={record.note}
        onChange={e => onNoteChange(e.target.value)}
      />
    </div>
  )
}

function UnfinishedItemRow({ item, allItems, record, onReasonChange, onDecisionChange }: {
  item: Item
  allItems: Item[]
  record: SRUnfinishedRecord
  onReasonChange: (r: string) => void
  onDecisionChange: (d: SRUnfinishedDecision) => void
}) {
  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
      {/* Row 1: title + meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 120 }}>{item.desc}</span>
        <ItemMetaBadges item={item} allItems={allItems} />
      </div>
      {/* Row 2: raison + décision */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          style={{ ...INPUT_STYLE, flex: 1, minWidth: 0 }}
          placeholder="Raison du non-achèvement…"
          value={record.reason}
          onChange={e => onReasonChange(e.target.value)}
        />
        <select
          style={{ ...INPUT_STYLE, flexShrink: 0, cursor: 'pointer' }}
          value={record.decision}
          onChange={e => onDecisionChange(e.target.value as SRUnfinishedDecision)}
        >
          <option value="report">Reporter</option>
          <option value="cancel">Annuler</option>
          <option value="resize">Redimensionner</option>
        </select>
      </div>
    </div>
  )
}

const TYPE_LABEL: Record<string, string> = { 'new-item': 'Nouvel item', reprioritize: 'Reprioriser' }
const TYPE_COLOR: Record<string, string> = {
  'new-item':   'color-mix(in srgb, var(--primary) 15%, transparent)',
  reprioritize: 'color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent)',
}
const TYPE_TEXT: Record<string, string> = {
  'new-item':   'var(--primary)',
  reprioritize: 'var(--warning, #b45309)',
}

function DecisionRow({ decision, onApplyNew, onDelete }: {
  decision: SRDecision
  onApplyNew: () => void
  onDelete: () => void
}) {
  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: TYPE_COLOR[decision.type], color: TYPE_TEXT[decision.type], flexShrink: 0, fontWeight: 500, whiteSpace: 'nowrap' }}>
        {TYPE_LABEL[decision.type]}
      </span>
      <span style={{ flex: 1, fontSize: 13, minWidth: 0 }}>{decision.desc}</span>
      {decision.sp != null && decision.sp > 0 && (
        <span style={{ fontSize: 11, background: 'var(--border)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
          {decision.sp} SP
        </span>
      )}
      {!decision.applied && decision.type === 'new-item' && (
        <button
          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
          onClick={onApplyNew}
        >→ Backlog</button>
      )}
      {decision.applied && (
        <span style={{ fontSize: 11, color: 'var(--success)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Ico d={ICO.check} size={12} stroke="var(--success)" /> Créé
        </span>
      )}
      <button style={{ ...ICON_BTN, color: 'var(--danger)' }} onClick={onDelete} title="Supprimer">
        <Ico d={ICO.trash} size={13} />
      </button>
    </div>
  )
}

function DecisionForm({ items, doneCols, sprintId, onAdd, onCancel }: {
  items: Item[]
  doneCols: string[]
  sprintId: string
  onAdd: (d: SRDecision) => void
  onCancel: () => void
}) {
  const [type, setType]     = useState<'new-item' | 'reprioritize'>('new-item')
  const [desc, setDesc]     = useState('')
  const [sp, setSp]         = useState(1)
  const [search, setSearch] = useState('')
  const [linkedId, setLinkedId] = useState<string | null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // Items non terminés — sprint actif en premier, puis product backlog
  const searchableItems = useMemo(() => {
    const unfinished = items.filter(i => !doneCols.includes(i.status))
    const sprintFirst = unfinished.filter(i => i.sprintId === sprintId)
    const rest = unfinished.filter(i => i.sprintId !== sprintId)
    return [...sprintFirst, ...rest]
  }, [items, doneCols, sprintId])

  const filtered = useMemo(() => {
    if (!search.trim()) return searchableItems.slice(0, 8)
    const q = search.toLowerCase()
    return searchableItems.filter(i =>
      i.desc.toLowerCase().includes(q) || (i.key ?? '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [searchableItems, search])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const linkedItem = linkedId ? items.find(i => i.id === linkedId) : null

  function handleAdd() {
    const finalDesc = type === 'reprioritize' && linkedItem ? linkedItem.desc : desc.trim()
    if (!finalDesc) return
    onAdd({
      id: uid(),
      type,
      desc: finalDesc,
      sp: type === 'new-item' ? sp : undefined,
      itemId: type === 'reprioritize' ? (linkedId ?? undefined) : undefined,
    })
    setDesc(''); setSp(1); setSearch(''); setLinkedId(null)
  }

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'color-mix(in srgb, var(--primary) 4%, transparent)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Type */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Type</div>
          <select
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            value={type}
            onChange={e => { setType(e.target.value as 'new-item' | 'reprioritize'); setLinkedId(null); setSearch(''); setDesc('') }}
          >
            <option value="new-item">Nouvel item</option>
            <option value="reprioritize">Reprioriser</option>
          </select>
        </div>

        {/* Description ou recherche item */}
        <div style={{ flex: 1, minWidth: 180 }}>
          {type === 'new-item' ? (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Description</div>
              <input
                autoFocus
                style={{ ...INPUT_STYLE, width: '100%', boxSizing: 'border-box' }}
                placeholder="Décrire l'item à créer…"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              />
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                Item à reprioriser
              </div>
              {linkedItem ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: 'var(--surface)' }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text)' }}>{linkedItem.desc}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{linkedItem.key}</span>
                  <button style={{ ...ICON_BTN, padding: '1px 3px' }} onClick={() => { setLinkedId(null); setSearch('') }}>
                    <Ico d={ICO.x} size={12} />
                  </button>
                </div>
              ) : (
                <div ref={dropRef} style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', overflow: 'hidden' }}>
                    <span style={{ padding: '0 6px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                      <Ico d={ICO.search} size={12} />
                    </span>
                    <input
                      autoFocus
                      style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12, padding: '4px 8px 4px 0', color: 'var(--text)', outline: 'none' }}
                      placeholder="Rechercher un item (sprint actif ou backlog)…"
                      value={search}
                      onChange={e => { setSearch(e.target.value); setShowDrop(true) }}
                      onFocus={() => setShowDrop(true)}
                    />
                  </div>
                  {showDrop && filtered.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 220, overflow: 'auto', marginTop: 2 }}>
                      {filtered.map(i => (
                        <button
                          key={i.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}
                          onMouseDown={e => { e.preventDefault(); setLinkedId(i.id); setSearch(''); setShowDrop(false) }}
                        >
                          <span style={{ flex: 1, fontSize: 12 }}>{i.desc}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{i.key}</span>
                          {i.sprintId === sprintId && (
                            <span style={{ fontSize: 10, color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 12%, transparent)', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>sprint</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* SP — seulement pour new-item */}
        {type === 'new-item' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>SP</div>
            <input
              type="number" min={0} max={99}
              style={{ ...INPUT_STYLE, width: 56 }}
              value={sp}
              onChange={e => setSp(Number(e.target.value))}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <button className="btn-sm btn-primary" onClick={handleAdd}>Ajouter</button>
          <button className="btn-sm" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

function NoteRow({ note, items, onChange, onDelete }: {
  note: SRNote
  items: Item[]
  onChange: (patch: Partial<SRNote>) => void
  onDelete: () => void
}) {
  const [showLink, setShowLink] = useState(false)
  const [search, setSearch]     = useState('')
  const dropRef = useRef<HTMLDivElement>(null)
  const linkedItem = note.linkedItemId ? items.find(i => i.id === note.linkedItemId) : null

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(i =>
      i.desc.toLowerCase().includes(q) || (i.key ?? '').toLowerCase().includes(q)
    ).slice(0, 6)
  }, [items, search])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowLink(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
      <textarea
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical', minHeight: 64 }}
        placeholder="Retours stakeholders, points d'attention, décisions prises en séance…"
        value={note.text}
        onChange={e => onChange({ text: e.target.value })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        {/* Linked item badge */}
        {linkedItem ? (
          <span style={{ fontSize: 11, background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', borderRadius: 4, padding: '1px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Ico d={ICO.link} size={10} stroke="var(--primary)" />
            {linkedItem.key} · {linkedItem.desc.slice(0, 40)}{linkedItem.desc.length > 40 ? '…' : ''}
            <button style={{ ...ICON_BTN, padding: '0 2px', color: 'var(--primary)' }} onClick={() => onChange({ linkedItemId: undefined })}>
              <Ico d={ICO.x} size={10} />
            </button>
          </span>
        ) : (
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button
              style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setShowLink(v => !v)}
            >
              <Ico d={ICO.link} size={10} />
              Lier à un item
            </button>
            {showLink && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', width: 280, marginBottom: 4 }}>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                  <input
                    autoFocus
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', background: 'transparent', color: 'var(--text)' }}
                    placeholder="Rechercher un item…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div style={{ maxHeight: 160, overflow: 'auto' }}>
                  {filtered.map(i => (
                    <button
                      key={i.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '5px 10px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }}
                      onMouseDown={e => { e.preventDefault(); onChange({ linkedItemId: i.id }); setShowLink(false); setSearch('') }}
                    >
                      <span style={{ flex: 1 }}>{i.desc.slice(0, 45)}{i.desc.length > 45 ? '…' : ''}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i.key}</span>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <p style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Aucun item trouvé</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button style={{ ...ICON_BTN, color: 'var(--danger)' }} onClick={onDelete} title="Supprimer">
          <Ico d={ICO.trash} size={13} />
        </button>
      </div>
    </div>
  )
}

function SRArchiveCard({ archive, isOpen, onToggle, onDelete, items, team, clients }: {
  archive: SprintReviewArchive
  isOpen: boolean
  onToggle: () => void
  onDelete: () => void
  items: Item[]
  team: TeamMember[]
  clients: Client[]
}) {
  const accepted = archive.itemRecords.filter(r => r.badge === 'accepted').length
  const refused  = archive.itemRecords.filter(r => r.badge === 'refused').length

  function findContact(contactId: string): { contact: Contact; client: Client } | null {
    for (const c of clients) {
      const contact = (c.contacts ?? []).find(ct => ct.id === contactId)
      if (contact) return { contact, client: c }
    }
    return null
  }

  const participantNames = [
    ...(archive.participantIds ?? []).map(id => team.find(m => m.id === id)?.name).filter(Boolean) as string[],
    ...(archive.participantContactIds ?? []).map(cid => {
      const found = findContact(cid)
      return found ? `${found.contact.name} (${found.client.name})` : null
    }).filter(Boolean) as string[],
    ...(archive.participantsOther ?? []).map(o => o.text),
  ].join(', ')

  return (
    <div className="archive-card">
      <div className="archive-card-hdr" onClick={onToggle}>
        <Ico d={isOpen ? ICO.chevDown : ICO.chevRight} size={12} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{archiveDateLabel(archive.date)}</span>
        {archive.sprintLabel && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {archive.sprintLabel}</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          · {accepted} accepté{accepted !== 1 ? 's' : ''}, {refused} refusé{refused !== 1 ? 's' : ''}
          · {archive.decisions.length} décision{archive.decisions.length !== 1 ? 's' : ''}
        </span>
        <div style={{ flex: 1 }} />
        <button style={{ ...ICON_BTN, color: 'var(--danger)' }} title="Supprimer" onClick={e => { e.stopPropagation(); onDelete() }}>
          <Ico d={ICO.trash} size={13} />
        </button>
      </div>

      {isOpen && (
        <div className="archive-card-body">
          {participantNames && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              <strong>Participants :</strong> {participantNames}
            </p>
          )}

          {archive.itemRecords.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Items livrés</div>
              {archive.itemRecords.map(rec => {
                const item = items.find(i => i.id === rec.itemId)
                return (
                  <div key={rec.itemId} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 20, background: BADGE_BG[rec.badge], color: BADGE_COLOR[rec.badge] }}>
                      {BADGE_LABEL[rec.badge]}
                    </span>
                    <span style={{ flex: 1 }}>{item?.desc ?? rec.itemId}</span>
                    {rec.note && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{rec.note}</span>}
                  </div>
                )
              })}
            </div>
          )}

          {archive.decisions.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Décisions backlog</div>
              {archive.decisions.map(d => (
                <div key={d.id} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: d.type === 'new-item' ? 'var(--primary)' : 'var(--warning, #b45309)' }}>
                    {TYPE_LABEL[d.type]}
                  </span>
                  <span>{d.desc}</span>
                  {d.applied && <Ico d={ICO.check} size={11} stroke="var(--success)" />}
                </div>
              ))}
            </div>
          )}

          {(archive.notes ?? []).length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Notes</div>
              {(archive.notes ?? []).map(n => (
                <div key={n.id} style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', margin: 0 }}>{n.text}</p>
                  {n.linkedItemId && (() => {
                    const linked = items.find(i => i.id === n.linkedItemId)
                    return linked ? (
                      <span style={{ fontSize: 11, color: 'var(--primary)' }}>→ {linked.key} {linked.desc.slice(0, 40)}</span>
                    ) : null
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
