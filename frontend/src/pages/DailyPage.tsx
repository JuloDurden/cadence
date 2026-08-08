import { useState, useMemo } from 'react'
import { useCadence } from '../context/StateContext'
import { useTimer } from '../context/TimerContext'
import { Header } from '../components/layout/Header'
import { MemberCard } from '../components/daily/MemberCard'
import type { DailyEntry, DailyArchive, TeamMember, HistoryEntry } from '../types'
import { getCurrentSprint } from '../utils/sprints'
import { useAuth } from '../hooks/useAuth'
import { withHistoryEntry } from '../utils/history'
import { useToast } from '../context/ToastContext'
import { useDialog } from '../context/DialogContext'
import { canArchiveDaily, canEditDailyCard } from '../utils/permissions'
import { api } from '../services/api'

const DURATIONS = [5, 10, 15, 20, 30]

const MEMBER_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
function memberColor(id: string) { return MEMBER_COLORS[id.charCodeAt(id.length - 1) % MEMBER_COLORS.length] }

function Svg({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const ICO = {
  play:      '<polygon points="5 3 19 12 5 21 5 3"/>',
  pause:     '<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>',
  reset:     '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  copy:      '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  archive:   '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  chevDown:  '<path d="m6 9 6 6 6-6"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
  alert:     '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  umbrella:  '<path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/>',
  trash:     '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  fileDown:  '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
  printer:   '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  send:      '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
}

function Avatar({ member, size = 28 }: { member: TeamMember; size?: number }) {
  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  const color = memberColor(member.id)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: Math.round(size * 0.36), flexShrink: 0,
      overflow: 'hidden', position: 'relative',
    }}>
      {member.photo
        ? <img src={member.photo} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        : initials}
    </div>
  )
}

function today() { return new Date().toISOString().slice(0, 10) }

export function DailyPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const { userName, userRole, userId } = useAuth()
  const { showToast } = useToast()
  const { confirm } = useDialog()
  // Phase 2 (roadmap v1), sous-chantier 3 : archivage (créer/supprimer une archive) réservé au
  // Scrum Master (+ Admin, convention actée avec Julien) — copier/exporter reste ouvert à tous,
  // ce n'est pas une action d'archivage à proprement parler.
  const canArchive = canArchiveDaily(userRole)
  const { duration, seconds, running, done, setDuration, toggle, reset } = useTimer()
  const date = useMemo(() => today(), [])
  const [todayOpen, setTodayOpen] = useState(true)
  const [archivesOpen, setArchivesOpen] = useState(true)
  const [expandedArchive, setExpandedArchive] = useState<string | null>(null)
  const [sendingSlack, setSendingSlack] = useState(false)

  const currentSprint = useMemo(() => getCurrentSprint(state), [state])
  const archives = useMemo(
    () => [...(state.dailyArchives ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [state.dailyArchives]
  )

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const pct = (seconds / (duration * 60)) * 100
  const timerColor = done ? 'var(--danger)' : seconds < 60 ? '#ff9500' : 'var(--primary)'

  const absentMembers  = state.team.filter(m => (state.absences ?? []).some(a => a.memberId === m.id && a.start <= date && a.end >= date))
  const presentMembers = state.team.filter(m => !absentMembers.find(x => x.id === m.id))

  function getEntry(memberId: string): DailyEntry {
    return state.dailyEntries.find(e => e.memberId === memberId && e.date === date)
      ?? { memberId, date, yesterday: '', today: '', blockers: '' }
  }

  const blockers = presentMembers
    .map(m => ({ member: m, entry: getEntry(m.id) }))
    .filter(({ entry }) => entry.blockers.trim().length > 0)

  function handleChange(entry: DailyEntry) {
    dispatch({ type: 'UPSERT_DAILY_ENTRY', payload: entry })
    const entries = state.dailyEntries.filter(e => !(e.memberId === entry.memberId && e.date === entry.date))
    saveToServer({ ...state, dailyEntries: [...entries, entry] })
  }

  function copyResume() {
    const lines = [
      `Daily Standup — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      currentSprint ? `Sprint ${currentSprint.number} : ${currentSprint.label}` : '',
      '',
    ]
    state.team.forEach(m => {
      const e = getEntry(m.id)
      lines.push(`${m.name} (${m.role})`)
      lines.push(`  Hier : ${e.yesterday || '—'}`)
      lines.push(`  Aujourd'hui : ${e.today || '—'}`)
      if (e.blockers) lines.push(`  Blocages : ${e.blockers}`)
      lines.push('')
    })
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => showToast('Résumé copié'))
      .catch(() => showToast('Impossible de copier', 'error'))
  }

  // Phase 5 (roadmap v1), Intégration Slack, 2026-08-08 : bouton explicite (décision Julien,
  // AskUserQuestion) plutôt qu'un envoi automatique à chaque saisie individuelle (spam), réservé
  // au(x) même(s) rôle(s) que l'archivage (`canArchive`) : diffuser le résumé sur Slack est plus
  // proche d'une action de publication que de la copie personnelle (ouverte à tous, copyResume
  // ci-dessus). Seuls les membres présents (comme le calcul de `blockers` plus haut), pas toute
  // l'équipe : un membre absent n'a rien à résumer.
  function sendDailySummaryToSlack() {
    const entries = presentMembers.map(m => {
      const e = getEntry(m.id)
      return { memberName: m.name, yesterday: e.yesterday, today: e.today, blockers: e.blockers }
    })
    setSendingSlack(true)
    api.notifySlackDailySummary({ date, entries })
      .then(({ sent, error }) => {
        if (sent) showToast('Résumé envoyé sur Slack.')
        else showToast(error ?? 'Intégration Slack non configurée pour le résumé Daily.', error ? 'error' : 'info')
      })
      .catch(() => showToast("Impossible d'envoyer le résumé sur Slack.", 'error'))
      .finally(() => setSendingSlack(false))
  }

  // Archiver et vider les saisies du jour en une seule action atomique — auparavant deux
  // boutons séparés et non liés ("Archiver" / "Effacer"), qui pouvaient être utilisés
  // indépendamment l'un de l'autre : oublier "Effacer" laissait les saisies s'accumuler
  // en double avec l'archive, oublier "Archiver" perdait les saisies sans trace.
  async function archiveDaily() {
    const todayEntries = state.dailyEntries.filter(e => e.date === date)
    if (todayEntries.length === 0) { showToast("Aucune saisie à archiver aujourd'hui.", 'info'); return }
    if (!await confirm('Les saisies du jour seront vidées après archivage.', { title: 'Archiver ce daily ?', confirmLabel: 'Archiver' })) return
    const archive: DailyArchive = {
      id: crypto.randomUUID(),
      date,
      sprintId: currentSprint?.id,
      sprintLabel: currentSprint ? `Sprint ${currentSprint.number} - ${currentSprint.label}` : undefined,
      entries: todayEntries,
      createdAt: new Date().toISOString(),
    }
    dispatch({ type: 'ADD_DAILY_ARCHIVE', payload: archive })
    dispatch({ type: 'CLEAR_DAILY_ENTRIES_DATE', payload: date })
    // Chantier B (tranche Daily) : une entrée résumé par archivage, type dédié
    // (Daily n'a pas de session à id comme Retro/Sprint Review, donc pas de sprintId
    // toujours pertinent — on le renseigne quand même s'il existe).
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'daily_archive',
      timestamp: new Date().toISOString(),
      sprintId: currentSprint?.id,
      detail: `Daily archivé (${date}) : ${todayEntries.length} saisie(s)`,
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    // withHistoryEntry (utils/history.ts) : corrige un bug de persistance découvert lors
    // de la tranche Retrospective — sans ça, cette entrée ne serait pas garantie d'être
    // envoyée au serveur avant qu'une autre action ne le fasse (voir docs/corrections.md).
    saveToServer(withHistoryEntry({
      ...state,
      dailyArchives: [...(state.dailyArchives ?? []), archive],
      dailyEntries: state.dailyEntries.filter(e => e.date !== date),
    }, historyEntry))
    showToast('Daily archivé.')
  }

  async function deleteArchive(id: string) {
    if (!await confirm('Cette action est irréversible.', { title: 'Supprimer cette archive ?', confirmLabel: 'Supprimer', danger: true })) return
    const archive = state.dailyArchives?.find(a => a.id === id)
    dispatch({ type: 'DELETE_DAILY_ARCHIVE', payload: id })
    // Réutilise le type `daily_archive` (même concept que l'archivage, juste l'inverse)
    // plutôt qu'un nouveau type dédié pour une simple suppression.
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'daily_archive',
      timestamp: new Date().toISOString(),
      sprintId: archive?.sprintId,
      detail: archive ? `Archive supprimée (${archive.date})` : 'Archive supprimée',
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    saveToServer(withHistoryEntry({ ...state, dailyArchives: (state.dailyArchives ?? []).filter(a => a.id !== id) }, historyEntry))
  }

  function copyArchiveResume(archive: DailyArchive) {
    const dateStr = archiveDateLabel(archive.date)
    const lines = [`Daily Standup — ${dateStr}`, archive.sprintLabel ?? '', '']
    archive.entries.forEach(e => {
      const m = state.team.find(t => t.id === e.memberId)
      lines.push(`${m?.name ?? e.memberId} (${m?.role ?? ''})`)
      lines.push(`  Hier : ${e.yesterday || '—'}`)
      lines.push(`  Aujourd'hui : ${e.today || '—'}`)
      if (e.blockers) lines.push(`  Blocages : ${e.blockers}`)
      lines.push('')
    })
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => showToast('Résumé copié'))
      .catch(() => showToast('Impossible de copier', 'error'))
  }

  function exportMarkdown(archive: DailyArchive) {
    const dateStr = archiveDateLabel(archive.date)
    const lines = [`# Daily Standup — ${dateStr}`, archive.sprintLabel ? `**${archive.sprintLabel}**` : '', '']
    archive.entries.forEach(e => {
      const m = state.team.find(t => t.id === e.memberId)
      lines.push(`## ${m?.name ?? e.memberId}`)
      lines.push(`**Hier :** ${e.yesterday || '—'}`)
      lines.push(`**Aujourd'hui :** ${e.today || '—'}`)
      if (e.blockers) lines.push(`**Blocages :** ${e.blockers}`)
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `daily-${archive.date}.md` }).click()
    URL.revokeObjectURL(url)
  }

  function exportPDF(archive: DailyArchive) {
    const dateStr = archiveDateLabel(archive.date)
    const entriesHtml = archive.entries.map(e => {
      const m = state.team.find(t => t.id === e.memberId)
      return `<div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:6px">
        <strong>${m?.name ?? e.memberId}</strong><span style="color:#6b7280;font-size:12px;margin-left:8px">${m?.role ?? ''}</span>
        <div style="margin-top:8px;font-size:13px"><span style="color:#6b7280;font-weight:600;text-transform:uppercase;font-size:10px;display:block;margin-bottom:2px">Hier</span>${e.yesterday || '—'}</div>
        <div style="margin-top:8px;font-size:13px"><span style="color:#6b7280;font-weight:600;text-transform:uppercase;font-size:10px;display:block;margin-bottom:2px">Aujourd'hui</span>${e.today || '—'}</div>
        ${e.blockers ? `<div style="margin-top:8px;font-size:13px;color:#ef4444"><span style="font-weight:600;text-transform:uppercase;font-size:10px;display:block;margin-bottom:2px">Blocages</span>${e.blockers}</div>` : ''}
      </div>`
    }).join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Daily ${archive.date}</title>
      <style>body{font-family:-apple-system,sans-serif;padding:32px;max-width:680px;margin:0 auto}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#6b7280;margin-bottom:24px;font-weight:400}@media print{body{padding:16px}}</style>
    </head><body>
      <h1>Daily Standup</h1>
      <h2>${dateStr}${archive.sprintLabel ? ' · ' + archive.sprintLabel : ''}</h2>
      ${entriesHtml}
    </body></html>`)
    win.document.close()
    win.print()
  }

  return (
    <>
      <Header title="Daily Standup">
        {currentSprint && (
          <span className="hdr-ctx-stat" style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            {currentSprint.label}
          </span>
        )}
        <div style={{ flex: 1 }} />

        {/* ── Timer ──────────────────────────────── */}
        <div className="timer-bar-wrap">
          <div className="timer-bar-fill" style={{ width: `${pct}%`, background: timerColor }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 13, color: timerColor, minWidth: 38, fontVariantNumeric: 'tabular-nums' }}>
          {mm}:{ss}
        </span>
        <button className="hdr-btn" onClick={toggle}
          title={running ? 'Pause' : done ? 'Réinitialiser' : 'Démarrer'}
          style={done ? { background: 'var(--danger)', color: '#fff' } : {}}>
          <Svg d={running ? ICO.pause : ICO.play} size={13} />
        </button>
        <button className="hdr-btn" onClick={reset} title="Réinitialiser"
          disabled={!running && seconds === duration * 60 && !done}>
          <Svg d={ICO.reset} size={13} />
        </button>
        <select className="hdr-select" value={duration}
          onChange={e => setDuration(Number(e.target.value))} disabled={running}
          style={{ width: 80, height: 30, border: '1px solid var(--border)', borderRadius: 7, backgroundColor: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, padding: '0 28px 0 10px', cursor: 'pointer', outline: 'none', flexShrink: 0 }}>
          {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
        </select>

        <div className="hdr-sep" />

        {/* ── Actions icônes ─────────────────────── */}
        <button className="hdr-btn" onClick={copyResume} title="Copier le résumé du jour">
          <Svg d={ICO.copy} size={14} />
        </button>
        {canArchive && (
          <button className="hdr-btn" data-testid="btn-send-daily-slack" onClick={sendDailySummaryToSlack} disabled={sendingSlack} title="Envoyer le résumé du jour sur Slack">
            <Svg d={ICO.send} size={14} />
          </button>
        )}
        {canArchive && (
          <button className="hdr-btn" data-testid="btn-archive-daily" onClick={archiveDaily} title="Archiver ce daily (et vider les saisies du jour)">
            <Svg d={ICO.archive} size={14} />
          </button>
        )}

        <div className="hdr-sep" />
      </Header>

      <div className="page-content">

        {/* ── Section : Aujourd'hui ─────────────── */}
        <div style={{ marginBottom: 28 }}>
          <button className="daily-section-btn" onClick={() => setTodayOpen(o => !o)}>
            <Svg d={todayOpen ? ICO.chevDown : ICO.chevRight} size={16} />
            Aujourd'hui
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
              — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            {blockers.length > 0 && (
              <span style={{ fontSize: 11, background: 'rgba(255,59,48,.1)', color: 'var(--danger)', padding: '2px 8px', borderRadius: 10, fontWeight: 600, marginLeft: 4 }}>
                {blockers.length} blocage{blockers.length > 1 ? 's' : ''}
              </span>
            )}
          </button>

          {todayOpen && (
            <>
              {/* Encadré absents */}
              {absentMembers.length > 0 && (
                <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(251,146,60,.08)', border: '1px solid rgba(251,146,60,.3)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#ea580c', flexShrink: 0 }}>
                    <Svg d={ICO.umbrella} size={13} />
                    Absents aujourd'hui :
                  </span>
                  {absentMembers.map(m => {
                    const absence = (state.absences ?? []).find(a => a.memberId === m.id && a.start <= date && a.end >= date)
                    return (
                      <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: 'rgba(251,146,60,.15)', color: '#ea580c' }}>
                        {m.name}
                        {absence && <span style={{ opacity: .7, fontWeight: 400 }}>· {absence.title}</span>}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Cartes membres présents */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
                {presentMembers.map(member => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    entry={getEntry(member.id)}
                    onChange={handleChange}
                    canEdit={canEditDailyCard(userRole, userId, member)}
                  />
                ))}
              </div>

              {/* Blocker Board */}
              {blockers.length > 0 && (
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 20px', background: 'rgba(255,59,48,.06)', borderBottom: '1px solid rgba(255,59,48,.15)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)' }}>
                    <Svg d={ICO.alert} size={14} />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Blocker Board</span>
                    <span style={{ fontSize: 11, color: 'var(--danger)', opacity: .7 }}>
                      {blockers.length} blocage{blockers.length > 1 ? 's' : ''} à résoudre
                    </span>
                  </div>
                  <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {blockers.map(({ member, entry }) => (
                      <div key={member.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <Avatar member={member} size={28} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{member.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{entry.blockers}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Section : Archives ────────────────── */}
        <div>
          <button className="daily-section-btn" onClick={() => setArchivesOpen(o => !o)}>
            <Svg d={archivesOpen ? ICO.chevDown : ICO.chevRight} size={16} />
            Archives
            {archives.length > 0 && (
              <span style={{ fontSize: 11, background: 'var(--surface2)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 10, fontWeight: 600, border: '1px solid var(--border)' }}>
                {archives.length}
              </span>
            )}
          </button>

          {archivesOpen && (
            <div>
              {archives.length === 0
                ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    Aucune archive — utilisez le bouton "Archiver ce daily" pour créer une archive.
                  </div>
                )
                : archives.map(archive => {
                    const isExpanded = expandedArchive === archive.id
                    const dateStr = archiveDateLabel(archive.date)
                    return (
                      <div key={archive.id} className="archive-card">
                        {/* Archive card header */}
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <button className="archive-card-hdr" style={{ flex: 1 }}
                            onClick={() => setExpandedArchive(isExpanded ? null : archive.id)}>
                            <Svg d={isExpanded ? ICO.chevDown : ICO.chevRight} size={13} />
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{dateStr}</span>
                            {archive.sprintLabel && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
                                · {archive.sprintLabel}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', marginRight: 8 }}>
                              {archive.entries.length} membre{archive.entries.length !== 1 ? 's' : ''}
                            </span>
                          </button>
                          {/* Icon-only action buttons */}
                          <div style={{ display: 'flex', gap: 2, padding: '0 8px', flexShrink: 0 }}>
                            <button className="hdr-btn" onClick={() => copyArchiveResume(archive)} title="Copier le résumé">
                              <Svg d={ICO.copy} size={13} />
                            </button>
                            <button className="hdr-btn" onClick={() => exportMarkdown(archive)} title="Exporter en Markdown">
                              <Svg d={ICO.fileDown} size={13} />
                            </button>
                            <button className="hdr-btn" onClick={() => exportPDF(archive)} title="Exporter en PDF">
                              <Svg d={ICO.printer} size={13} />
                            </button>
                            {canArchive && (
                              <button className="hdr-btn" data-testid={`btn-delete-archive-${archive.id}`} onClick={() => deleteArchive(archive.id)} title="Supprimer l'archive"
                                style={{ color: 'var(--danger)' }}>
                                <Svg d={ICO.trash} size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Archive card body */}
                        {isExpanded && (
                          <div className="archive-card-body">
                            {archive.entries.map(e => {
                              const m = state.team.find(t => t.id === e.memberId)
                              if (!m) return null
                              return (
                                <div key={e.memberId} className="archive-entry">
                                  <div className="archive-entry-name">
                                    <Avatar member={m} size={24} />
                                    {m.name}
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{m.role}</span>
                                  </div>
                                  <div className="archive-entry-line">
                                    <span className="archive-entry-label">Hier</span>
                                    <span>{e.yesterday || '—'}</span>
                                  </div>
                                  <div className="archive-entry-line">
                                    <span className="archive-entry-label">Aujourd'hui</span>
                                    <span>{e.today || '—'}</span>
                                  </div>
                                  {e.blockers && (
                                    <div className="archive-entry-line" style={{ color: 'var(--danger)' }}>
                                      <span className="archive-entry-label" style={{ color: 'var(--danger)' }}>Blocages</span>
                                      <span>{e.blockers}</span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })
              }
            </div>
          )}
        </div>

      </div>
    </>
  )
}

function archiveDateLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}
