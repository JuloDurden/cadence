import { useMemo } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { DailyTimer } from '../components/daily/DailyTimer'
import { MemberCard } from '../components/daily/MemberCard'
import type { DailyEntry } from '../types'

function today() { return new Date().toISOString().slice(0, 10) }

export function DailyPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const date = today()

  const currentSprint = useMemo(() => state.sprints.find(s => !s.closed), [state.sprints])

  function getEntry(memberId: string): DailyEntry {
    return state.dailyEntries.find(e => e.memberId === memberId && e.date === date)
      ?? { memberId, date, yesterday: '', today: '', blockers: '' }
  }

  function handleChange(entry: DailyEntry) {
    dispatch({ type: 'UPSERT_DAILY_ENTRY', payload: entry })
    const entries = state.dailyEntries.filter(e => !(e.memberId === entry.memberId && e.date === entry.date))
    saveToServer({ ...state, dailyEntries: [...entries, entry] })
  }

  function exportSummary() {
    const lines = [
      `Daily Standup — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      currentSprint ? `Sprint ${currentSprint.number} : ${currentSprint.label}` : '',
      '',
    ]
    state.team.forEach(m => {
      const e = getEntry(m.id)
      lines.push(`👤 ${m.name} (${m.role})`)
      lines.push(`  ☀ Hier : ${e.yesterday || '—'}`)
      lines.push(`  🎯 Aujourd'hui : ${e.today || '—'}`)
      if (e.blockers) lines.push(`  ⚠ Blocages : ${e.blockers}`)
      lines.push('')
    })
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => alert('Résumé copié dans le presse-papiers'))
      .catch(() => alert('Impossible de copier'))
  }

  const blockers = state.team
    .map(m => ({ member: m, entry: getEntry(m.id) }))
    .filter(({ entry }) => entry.blockers.trim().length > 0)

  return (
    <>
      <Header title="Daily Standup">
        <div className="hdr-sep" />
        {currentSprint && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Sprint {currentSprint.number} — {currentSprint.label}
          </span>
        )}
        <div className="hdr-sep" />
        <DailyTimer />
        <div style={{ flex: 1 }} />
        <button className="hdr-btn" onClick={exportSummary} title="Copier le résumé">📋 Copier résumé</button>
      </Header>

      <div className="page-content">
        {/* Date */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>
          {blockers.length > 0 && (
            <span style={{ fontSize: 12, background: 'rgba(255,59,48,.1)', color: 'var(--danger)', padding: '3px 10px', borderRadius: 10, fontWeight: 600 }}>
              {blockers.length} blocage{blockers.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Cartes membres */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 28 }}>
          {state.team.map(member => (
            <MemberCard
              key={member.id}
              member={member}
              entry={getEntry(member.id)}
              onChange={handleChange}
            />
          ))}
        </div>

        {/* Blocker Board */}
        {blockers.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: 'rgba(255,59,48,.06)', borderBottom: '1px solid rgba(255,59,48,.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 14 }}>⚠ Blocker Board</span>
              <span style={{ fontSize: 11, color: 'var(--danger)', opacity: .7 }}>{blockers.length} blocage{blockers.length > 1 ? 's' : ''} à résoudre</span>
            </div>
            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {blockers.map(({ member, entry }) => (
                <div key={member.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--danger)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>
                    {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{member.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{entry.blockers}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
