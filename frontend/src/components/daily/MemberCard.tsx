import { useState, useEffect } from 'react'
import type { TeamMember, DailyEntry } from '../../types'

interface Props {
  member: TeamMember
  entry: DailyEntry
  onChange: (entry: DailyEntry) => void
}

export function MemberCard({ member, entry, onChange }: Props) {
  const [local, setLocal] = useState(entry)
  const hasBlocker = local.blockers.trim().length > 0

  useEffect(() => { setLocal(entry) }, [entry])

  function update(field: keyof DailyEntry, value: string) {
    const updated = { ...local, [field]: value }
    setLocal(updated)
    onChange(updated)
  }

  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2)

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
      border: hasBlocker ? '2px solid rgba(255,59,48,.3)' : '1px solid var(--border)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* En-tête membre */}
      <div style={{ padding: '12px 16px', background: hasBlocker ? 'rgba(255,59,48,.04)' : 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{member.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{member.role}</div>
        </div>
        {hasBlocker && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, background: 'rgba(255,59,48,.12)', color: 'var(--danger)', padding: '2px 8px', borderRadius: 10 }}>⚠ Bloqué</span>}
      </div>

      {/* Sections */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
