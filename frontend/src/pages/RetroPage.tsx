import { useState, useMemo } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { RetroColumnCard } from '../components/retro/RetroColumnCard'
import { RetroActions } from '../components/retro/RetroActions'
import type { RetroSession, RetroItem, RetroAction, RetroFormat, RetroArchive } from '../types'
import { archiveAndReset } from '../utils/session'
import { getCurrentSprint } from '../utils/sprints'

// SVG icon paths — never inline in JSX, always via Ico component
const ICO = {
  play:           '<polygon points="5 3 19 12 5 21 5 3"/>',
  square:         '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
  stepForward:    '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  angry:          '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><path d="M7.5 8 10 9"/><path d="M16.5 8 14 9"/><path d="M9 10h0"/><path d="M15 10h0"/>',
  heartCrack:     '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 13 9 20l3-3 3 3-3-7"/>',
  smile:          '<circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  thumbsUp:       '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>',
  thumbsDown:     '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/>',
  graduationCap:  '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  annoyed:        '<circle cx="12" cy="12" r="10"/><path d="M8 15h8"/><path d="M8 9h2"/><path d="M14 9h2"/>',
  star:           '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  copy:           '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  archive:        '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  fileDown:       '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
  printer:        '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  trash:          '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  chevDown:       '<path d="m6 9 6 6 6-6"/>',
  chevRight:      '<path d="m9 18 6-6-6-6"/>',
  circleCheckBig: '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  checkmark:      '<polyline points="20 6 9 17 4 12"/>',
  circleEmpty:    '<circle cx="12" cy="12" r="10"/>',
}

type ColDef = { key: string; label: string; color: string; icon: string }

const FORMATS: Record<RetroFormat, ColDef[]> = {
  'start-stop-continue': [
    { key: 'start',    label: 'Start',    color: '#34c759', icon: ICO.play },
    { key: 'stop',     label: 'Stop',     color: '#ff3b30', icon: ICO.square },
    { key: 'continue', label: 'Continue', color: '#4f46e5', icon: ICO.stepForward },
  ],
  'mad-sad-glad': [
    { key: 'mad',  label: 'Mad',  color: '#ff3b30', icon: ICO.angry },
    { key: 'sad',  label: 'Sad',  color: '#ff9500', icon: ICO.heartCrack },
    { key: 'glad', label: 'Glad', color: '#34c759', icon: ICO.smile },
  ],
  '4ls': [
    { key: 'liked',   label: 'Liked',   color: '#34c759', icon: ICO.thumbsUp },
    { key: 'learned', label: 'Learned', color: '#4f46e5', icon: ICO.graduationCap },
    { key: 'lacked',  label: 'Lacked',  color: '#ff9500', icon: ICO.annoyed },
    { key: 'longed',  label: 'Longed',  color: '#af52de', icon: ICO.star },
  ],
}

const FORMAT_LABELS: Record<RetroFormat, string> = {
  'start-stop-continue': 'Start / Stop / Continue',
  'mad-sad-glad': 'Mad / Sad / Glad',
  '4ls': '4Ls',
}

function uid() { return crypto.randomUUID() }
const CURRENT_USER = 'm1'

function emptyColumns(format: RetroFormat): Record<string, RetroItem[]> {
  return Object.fromEntries(FORMATS[format].map(c => [c.key, []]))
}

function Ico({ d, size = 14, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  )
}

function archiveDateLabel(date: string): string {
  const d = new Date(date + 'T12:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function buildRetroMd(archive: RetroArchive): string {
  const cols = FORMATS[archive.format] ?? []
  let md = '# Retrospective ' + archiveDateLabel(archive.date) + '\n'
  if (archive.sprintLabel) md += '**Sprint :** ' + archive.sprintLabel + '\n'
  md += '**Format :** ' + FORMAT_LABELS[archive.format] + '\n\n'
  for (const col of cols) {
    const items = archive.columns[col.key] ?? []
    md += '## ' + col.label + '\n'
    if (items.length === 0) { md += '_Aucun item_\n\n'; continue }
    for (const item of items) {
      md += '- ' + item.text + ' (+' + item.votes.length + ' / -' + (item.dislikes?.length ?? 0) + ')\n'
    }
    md += '\n'
  }
  if (archive.actions.length > 0) {
    md += "## Plan d'actions\n"
    for (const a of archive.actions) {
      md += '- [' + (a.done ? 'x' : ' ') + '] ' + a.text + '\n'
    }
  }
  return md
}

function exportMd(archive: RetroArchive) {
  const blob = new Blob([buildRetroMd(archive)], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'retro-' + archive.date + '.md'; a.click()
  URL.revokeObjectURL(url)
}

function exportPdf(archive: RetroArchive) {
  const cols = FORMATS[archive.format] ?? []
  const win = window.open('', '_blank')
  if (!win) return
  const rows = cols.map(col => {
    const items = archive.columns[col.key] ?? []
    const listHtml = items.length === 0
      ? '<li style="color:#999">Aucun item</li>'
      : items.map(i => '<li>' + i.text + ' <span style="color:#888;font-size:11px">(+' + i.votes.length + ' / -' + (i.dislikes?.length ?? 0) + ')</span></li>').join('')
    return '<div style="flex:1;min-width:160px;padding:10px;border:1px solid #ddd;border-radius:6px"><strong style="color:' + col.color + '">' + col.label + '</strong><ul style="padding-left:14px;margin-top:6px;font-size:12px">' + listHtml + '</ul></div>'
  }).join('')
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Retrospective ' + archive.date + '</title></head><body style="font-family:sans-serif;padding:20px;max-width:900px;margin:auto"><h2>Retrospective ' + archiveDateLabel(archive.date) + '</h2><p>' + (archive.sprintLabel ?? '') + ' — ' + FORMAT_LABELS[archive.format] + '</p><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px">' + rows + '</div></body></html>')
  win.document.close(); win.print()
}

function copyRetroText(session: RetroSession, sprintLabel: string, format: RetroFormat) {
  const cols = FORMATS[format] ?? []
  const lines: string[] = ['Retrospective ' + sprintLabel + ' — ' + FORMAT_LABELS[format]]
  for (const col of cols) {
    const items = session.columns[col.key] ?? []
    if (items.length === 0) continue
    lines.push('\n' + col.label.toUpperCase())
    items.forEach(i => lines.push('• ' + i.text))
  }
  if (session.actions.length > 0) {
    lines.push("\nPLAN D'ACTIONS")
    session.actions.forEach(a => lines.push((a.done ? '✓' : '○') + ' ' + a.text))
  }
  navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
}

const FORMAT_SELECT_STYLE: React.CSSProperties = {
  width: 170, height: 30, border: '1px solid var(--border)', borderRadius: 7,
  backgroundColor: 'transparent', color: 'var(--text)', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 500, padding: '0 28px 0 10px',
  cursor: 'pointer', outline: 'none', flexShrink: 0,
}

const ARCHIVE_BTN: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
  borderRadius: 5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
}

export function RetroPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [format, setFormat] = useState<RetroFormat>('start-stop-continue')
  const [showToday, setShowToday] = useState(true)
  const [showArchives, setShowArchives] = useState(true)
  const [expandedArchive, setExpandedArchive] = useState<string | null>(null)

  const sprint = useMemo(() => getCurrentSprint(state), [state])

  const session = useMemo((): RetroSession => {
    const existing = state.retroSessions.find(s => s.sprintId === sprint?.id && s.format === format)
    return existing ?? {
      id: uid(), sprintId: sprint?.id ?? '', format,
      columns: emptyColumns(format), actions: [],
      date: new Date().toISOString().slice(0, 10),
    }
  }, [state.retroSessions, sprint?.id, format])

  function save(updated: RetroSession) {
    dispatch({ type: 'UPSERT_RETRO_SESSION', payload: updated })
    saveToServer({ ...state, retroSessions: [...state.retroSessions.filter(s => s.id !== updated.id), updated] })
  }

  function handleAdd(colKey: string, text: string) {
    const item: RetroItem = { id: uid(), text, votes: [], dislikes: [], authorId: CURRENT_USER }
    save({ ...session, columns: { ...session.columns, [colKey]: [...(session.columns[colKey] ?? []), item] } })
  }

  function handleVote(colKey: string, itemId: string) {
    const items = session.columns[colKey].map(i => {
      if (i.id !== itemId) return i
      const liked = i.votes.includes(CURRENT_USER)
      return {
        ...i,
        votes: liked ? i.votes.filter(v => v !== CURRENT_USER) : [...i.votes, CURRENT_USER],
        dislikes: liked ? (i.dislikes ?? []) : (i.dislikes ?? []).filter(v => v !== CURRENT_USER),
      }
    })
    save({ ...session, columns: { ...session.columns, [colKey]: items } })
  }

  function handleDislike(colKey: string, itemId: string) {
    const items = session.columns[colKey].map(i => {
      if (i.id !== itemId) return i
      const disliked = (i.dislikes ?? []).includes(CURRENT_USER)
      return {
        ...i,
        dislikes: disliked ? (i.dislikes ?? []).filter(v => v !== CURRENT_USER) : [...(i.dislikes ?? []), CURRENT_USER],
        votes: disliked ? i.votes : i.votes.filter(v => v !== CURRENT_USER),
      }
    })
    save({ ...session, columns: { ...session.columns, [colKey]: items } })
  }

  function handleDelete(colKey: string, itemId: string) {
    save({ ...session, columns: { ...session.columns, [colKey]: session.columns[colKey].filter(i => i.id !== itemId) } })
  }

  function handleAddAction(action: RetroAction) {
    save({ ...session, actions: [...session.actions, action] })
  }
  function handleToggleAction(id: string) {
    save({ ...session, actions: session.actions.map(a => a.id === id ? { ...a, done: !a.done } : a) })
  }
  function handleDeleteAction(id: string) {
    save({ ...session, actions: session.actions.filter(a => a.id !== id) })
  }

  function handleArchive() {
    const arc: RetroArchive = {
      id: uid(), date: new Date().toISOString().slice(0, 10),
      sprintId: sprint?.id, sprintLabel: sprint?.label,
      format, columns: session.columns, actions: session.actions,
      createdAt: new Date().toISOString(),
    }
    dispatch({ type: 'ADD_RETRO_ARCHIVE', payload: arc })
    save(archiveAndReset(session, { columns: emptyColumns(format), actions: [] }))
  }

  function handleDeleteArchive(id: string) { dispatch({ type: 'DELETE_RETRO_ARCHIVE', payload: id }) }

  const cols = FORMATS[format]
  const totalItems = cols.reduce((s, c) => s + (session.columns[c.key]?.length ?? 0), 0)
  const doneActions = session.actions.filter(a => a.done).length
  const retroArchives = [...(state.retroArchives || [])].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <Header title="Retrospective">
        {sprint && (
          <span className="hdr-ctx-stat" style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            {sprint.label}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <select className="hdr-select" style={FORMAT_SELECT_STYLE} value={format} onChange={e => setFormat(e.target.value as RetroFormat)}>
          {(Object.keys(FORMAT_LABELS) as RetroFormat[]).map(f => (
            <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
          ))}
        </select>
        <div className="hdr-sep" />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {totalItems} items · {doneActions}/{session.actions.length} actions
        </span>
        <button className="hdr-btn" title="Copier le résumé" onClick={() => copyRetroText(session, sprint?.label ?? '', format)}>
          <Ico d={ICO.copy} />
        </button>
        <button className="hdr-btn" title="Archiver cette rétrospective" onClick={handleArchive}>
          <Ico d={ICO.archive} />
        </button>
        <div className="hdr-sep" />
      </Header>

      <div className="page-content">
        <button className="daily-section-btn" onClick={() => setShowToday(v => !v)}>
          <Ico d={showToday ? ICO.chevDown : ICO.chevRight} size={13} />
          Retrospective du jour
        </button>

        {showToday && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minHeight: 200, marginTop: 10 }}>
              {cols.map(col => (
                <RetroColumnCard
                  key={col.key} colKey={col.key} label={col.label} color={col.color} icon={col.icon}
                  items={session.columns[col.key] ?? []} team={state.team} currentUserId={CURRENT_USER}
                  onAdd={text => handleAdd(col.key, text)}
                  onVote={itemId => handleVote(col.key, itemId)}
                  onDislike={itemId => handleDislike(col.key, itemId)}
                  onDelete={itemId => handleDelete(col.key, itemId)}
                />
              ))}
            </div>
            <RetroActions
              actions={session.actions} team={state.team}
              onAdd={handleAddAction} onToggle={handleToggleAction} onDelete={handleDeleteAction}
            />
          </>
        )}

        <button className="daily-section-btn" style={{ marginTop: 24 }} onClick={() => setShowArchives(v => !v)}>
          <Ico d={showArchives ? ICO.chevDown : ICO.chevRight} size={13} />
          Archives ({retroArchives.length})
        </button>

        {showArchives && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {retroArchives.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>Aucune archive</p>
            )}
            {retroArchives.map(archive => (
              <RetroArchiveCard
                key={archive.id}
                archive={archive}
                isOpen={expandedArchive === archive.id}
                onToggle={() => setExpandedArchive(expandedArchive === archive.id ? null : archive.id)}
                onCopy={() => navigator.clipboard.writeText(buildRetroMd(archive))}
                onExportMd={() => exportMd(archive)}
                onExportPdf={() => exportPdf(archive)}
                onDelete={() => handleDeleteArchive(archive.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Sub-components — each in its own function to keep JSX nesting shallow
// ---------------------------------------------------------------------------

function RetroArchiveCard({
  archive, isOpen, onToggle, onCopy, onExportMd, onExportPdf, onDelete,
}: {
  archive: RetroArchive
  isOpen: boolean
  onToggle: () => void
  onCopy: () => void
  onExportMd: () => void
  onExportPdf: () => void
  onDelete: () => void
}) {
  const archiveCols = FORMATS[archive.format] ?? []
  const totalItems = archiveCols.reduce((s, c) => s + (archive.columns[c.key]?.length ?? 0), 0)

  return (
    <div className="archive-card">
      <div className="archive-card-hdr" onClick={onToggle}>
        <Ico d={isOpen ? ICO.chevDown : ICO.chevRight} size={12} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{archiveDateLabel(archive.date)}</span>
        {archive.sprintLabel && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {archive.sprintLabel}</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{FORMAT_LABELS[archive.format]}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {totalItems} items · {archive.actions.length} actions</span>
        <div style={{ flex: 1 }} />
        <button style={ARCHIVE_BTN} title="Copier" onClick={e => { e.stopPropagation(); onCopy() }}>
          <Ico d={ICO.copy} size={13} />
        </button>
        <button style={ARCHIVE_BTN} title="Exporter Markdown" onClick={e => { e.stopPropagation(); onExportMd() }}>
          <Ico d={ICO.fileDown} size={13} />
        </button>
        <button style={ARCHIVE_BTN} title="Exporter PDF" onClick={e => { e.stopPropagation(); onExportPdf() }}>
          <Ico d={ICO.printer} size={13} />
        </button>
        <button style={{ ...ARCHIVE_BTN, color: 'var(--danger)' }} title="Supprimer" onClick={e => { e.stopPropagation(); onDelete() }}>
          <Ico d={ICO.trash} size={13} />
        </button>
      </div>

      {isOpen && (
        <div className="archive-card-body">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            {archiveCols.map(col => (
              <RetroArchiveCol key={col.key} col={col} items={archive.columns[col.key] ?? []} />
            ))}
          </div>
          {archive.actions.length > 0 && (
            <RetroArchiveActions actions={archive.actions} />
          )}
        </div>
      )}
    </div>
  )
}

function RetroArchiveCol({ col, items }: { col: ColDef; items: RetroItem[] }) {
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: col.color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <Ico d={col.icon} size={12} stroke={col.color} />
        {col.label}
      </div>
      {items.length === 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Aucun item</span>
      )}
      {items.map(item => (
        <RetroArchiveItem key={item.id} item={item} />
      ))}
    </div>
  )
}

function RetroArchiveItem({ item }: { item: RetroItem }) {
  const dislikeCount = item.dislikes ? item.dislikes.length : 0
  return (
    <div style={{ fontSize: 12, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ flex: 1 }}>{item.text}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-muted)', flexShrink: 0 }}>
        <Ico d={ICO.thumbsUp} size={10} />
        <span style={{ fontSize: 10 }}>{item.votes.length}</span>
        <Ico d={ICO.thumbsDown} size={10} />
        <span style={{ fontSize: 10 }}>{dislikeCount}</span>
      </span>
    </div>
  )
}

function RetroArchiveActions({ actions }: { actions: RetroArchive['actions'] }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
        <Ico d={ICO.circleCheckBig} size={12} stroke="var(--primary)" />
        Plan d'actions
      </div>
      {actions.map(a => (
        <RetroArchiveActionRow key={a.id} action={a} />
      ))}
    </div>
  )
}

function RetroArchiveActionRow({ action }: { action: RetroArchive['actions'][number] }) {
  const doneStyle: React.CSSProperties = action.done
    ? { color: 'var(--text-muted)', textDecoration: 'line-through' }
    : { color: 'var(--text)' }
  return (
    <div style={{ fontSize: 12, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6, ...doneStyle }}>
      <Ico d={action.done ? ICO.checkmark : ICO.circleEmpty} size={11} stroke={action.done ? 'var(--success)' : 'var(--text-muted)'} />
      {action.text}
    </div>
  )
}
