import { useState, useEffect } from 'react'
import type { TeamMember, DailyEntry, Absence } from '../../types'

interface Props {
  member: TeamMember
  entry: DailyEntry
  onChange: (entry: DailyEntry) => void
  absence?: Absence
}

const MEMBER_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
function memberColor(id: string) { return MEMBER_COLORS[id.charCodeAt(id.length - 1) % MEMBER_COLORS.length] }

export function MemberCard({ member, entry, onChange, absence }: Props) {
  const [local, setLocal] = useState(entry)
  const hasBlocker = local.blockers.trim().length > 0
  const isAbsent = !!absence

  useEffect(() => { setLocal(entry) }, [entry])

  function update(field: keyof DailyEntry, value: string) {
    const updated = { ...local, [field]: value }
    setLocal(updated)
    onChange(updated)
  }

  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  const color = memberColor(member.id)

  const headerBg = isAbsent
    ? 'rgba(251,146,60,.08)'
    : hasBlocker ? 'rgba(255,59,48,.04)' : 'var(--surface2)'
  const borderColor = isAbsent
    ? 'rgba(251,146,60,.35)'
    : hasBlocker ? 'rgba(255,59,48,.3)' : 'var(--border)'

  return (
    <div data-testid="daily-member-card" style={{
      background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
      border: (isAbsent || hasBlocker) ? `2px solid ${borderColor}` : '1px solid var(--border)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      opacity: isAbsent ? .75 : 1,
    }}>
      {/* En-tête membre */}
      <div style={{ padding: '12px 16px', background: headerBg, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0, position: 'relative' }}>
          {member.photo
            ? <img src={member.photo} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
            : initials
          }
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{member.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{member.role}</div>
        </div>
        {isAbsent && (
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(251,146,60,.15)', color: '#ea580c', padding: '2px 8px', borderRadius: 10 }}>
            🏖 {absence.title}
          </span>
        )}
        {hasBlocker && !isAbsent && (
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,59,48,.12)', color: 'var(--danger)', padding: '2px 8px', borderRadius: 10 }}>⚠ Bloqué</span>
        )}
      </div>

      {/* Sections */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isAbsent && (
          <div style={{ fontSize: 12, color: '#ea580c', fontStyle: 'italic', padding: '6px 10px', background: 'rgba(251,146,60,.08)', borderRadius: 6 }}>
            Absent(e) · {absence.type}
          </div>
        )}
        <Section label="☀ Hier" color="#34c759" value={local.yesterday} onChange={v => update('yesterday', v)} />
        <Section label="🎯 Aujourd'hui" color="var(--primary)" value={local.today} onChange={v => update('today', v)} />
        <Section label="⚠ Blocages" color="var(--danger)" value={local.blockers} onChange={v => update('blockers', v)} placeholder="Aucun blocage..." />
      </div>
    </div>
  )
}

function Section({ label, color, value, onChange, placeholder }: {
  label: string; color: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>{label}</div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Saisir...'}
        rows={2}
        style={{ width: '100%', resize: 'vertical', fontSize: 12, minHeight: 52 }}
      />
    </div>
  )
}
