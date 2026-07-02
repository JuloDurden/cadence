import { useState, useMemo } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { RetroColumnCard } from '../components/retro/RetroColumnCard'
import { RetroActions } from '../components/retro/RetroActions'
import type { RetroSession, RetroItem, RetroAction, RetroFormat } from '../types'

const FORMATS: Record<RetroFormat, { key: string; label: string; color: string }[]> = {
  'start-stop-continue': [
    { key: 'start',    label: '🟢 Start',    color: '#34c759' },
    { key: 'stop',     label: '🔴 Stop',     color: '#ff3b30' },
    { key: 'continue', label: '🔵 Continue', color: '#4f46e5' },
  ],
  'mad-sad-glad': [
    { key: 'mad',  label: '😤 Mad',  color: '#ff3b30' },
    { key: 'sad',  label: '😢 Sad',  color: '#ff9500' },
    { key: 'glad', label: '😊 Glad', color: '#34c759' },
  ],
  '4ls': [
    { key: 'liked',   label: '👍 Liked',   color: '#34c759' },
    { key: 'learned', label: '📚 Learned', color: '#4f46e5' },
    { key: 'lacked',  label: '😕 Lacked',  color: '#ff9500' },
    { key: 'longed',  label: '💭 Longed',  color: '#af52de' },
  ],
}

const FORMAT_LABELS: Record<RetroFormat, string> = {
  'start-stop-continue': 'Start / Stop / Continue',
  'mad-sad-glad': 'Mad / Sad / Glad',
  '4ls': '4Ls',
}

function uid() { return Math.random().toString(36).slice(2, 9) }
const CURRENT_USER = 'm1' // TODO: brancher sur l'utilisateur connecté

function emptyColumns(format: RetroFormat): Record<string, RetroItem[]> {
  return Object.fromEntries(FORMATS[format].map(c => [c.key, []]))
}

export function RetroPage() {
  const { state, dispatch, saveToServer } = useCadence()

  const [sprintIdx, setSprintIdx] = useState(() => {
    const idx = state.sprints.findIndex(s => !s.closed)
    return idx >= 0 ? idx : state.sprints.length - 1
  })
  const [format, setFormat] = useState<RetroFormat>('start-stop-continue')

  const sprint = state.sprints[sprintIdx]

  const session = useMemo((): RetroSession => {
    const existing = state.retroSessions.find(s => s.sprintId === sprint?.id && s.format === format)
    return existing ?? {
      id: uid(),
      sprintId: sprint?.id ?? '',
      format,
      columns: emptyColumns(format),
      actions: [],
      date: new Date().toISOString().slice(0, 10),
    }
  }, [state.retroSessions, sprint?.id, format])

  function save(updated: RetroSession) {
    dispatch({ type: 'UPSERT_RETRO_SESSION', payload: updated })
    saveToServer({ ...state, retroSessions: [...state.retroSessions.filter(s => s.id !== updated.id), updated] })
  }

  function handleAdd(colKey: string, text: string) {
    const item: RetroItem = { id: uid(), text, votes: [], authorId: CURRENT_USER }
    const updated = { ...session, columns: { ...session.columns, [colKey]: [...(session.columns[colKey] ?? []), item] } }
    save(updated)
  }

  function handleVote(colKey: string, itemId: string) {
    const items = session.columns[colKey].map(i => {
      if (i.id !== itemId) return i
      const voted = i.votes.includes(CURRENT_USER)
      return { ...i, votes: voted ? i.votes.filter(v => v !== CURRENT_USER) : [...i.votes, CURRENT_USER] }
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

  const cols = FORMATS[format]
  const totalItems = cols.reduce((s, c) => s + (session.columns[c.key]?.length ?? 0), 0)
  const doneActions = session.actions.filter(a => a.done).length

  return (
    <>
      <Header title="Rétrospective">
        <div className="hdr-sep" />
        <select className="hdr-select" value={sprintIdx} onChange={e => setSprintIdx(Number(e.target.value))}>
          {state.sprints.map((s, i) => <option key={s.id} value={i}>Sprint {s.number}</option>)}
        </select>
        {sprint && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sprint.label}
          </span>
        )}
        <div className="hdr-sep" />
        <select className="hdr-select" value={format} onChange={e => setFormat(e.target.value as RetroFormat)}>
          {(Object.keys(FORMAT_LABELS) as RetroFormat[]).map(f => (
            <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
          ))}
        </select>
        <div className="hdr-sep" />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalItems} items · {doneActions}/{session.actions.length} actions</span>
      </Header>

      <div className="page-content">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minHeight: 'calc(100vh - 160px)' }}>
          {cols.map(col => (
            <RetroColumnCard
              key={col.key}
              colKey={col.key}
              label={col.label}
              color={col.color}
              items={session.columns[col.key] ?? []}
              team={state.team}
              currentUserId={CURRENT_USER}
              onAdd={text => handleAdd(col.key, text)}
              onVote={itemId => handleVote(col.key, itemId)}
              onDelete={itemId => handleDelete(col.key, itemId)}
            />
          ))}
        </div>

        <RetroActions
          actions={session.actions}
          team={state.team}
          onAdd={handleAddAction}
          onToggle={handleToggleAction}
          onDelete={handleDeleteAction}
        />
      </div>
    </>
  )
}
