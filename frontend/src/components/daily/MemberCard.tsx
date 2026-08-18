import { memo, useState, useEffect } from 'react'
import type { TeamMember, DailyEntry, Absence } from '../../types'

interface Props {
  member: TeamMember
  entry: DailyEntry
  // Synchronisation temps réel Daily Standup (2026-08-18) : le champ modifié est transmis en plus
  // de l'entrée fusionnée, pour que DailyPage.tsx puisse diffuser uniquement ce champ sur le canal
  // WebSocket dédié, sans devoir re-diffuser toute l'entrée (voir hooks/useDailyRealtime.ts).
  onChange: (entry: DailyEntry, field: 'yesterday' | 'today' | 'blockers') => void
  absence?: Absence
  // Phase 2 (roadmap v1), sous-chantier 3 : seul le Dev lié à ce membre (+ Admin) peut remplir sa
  // carte — voir utils/permissions.ts, canEditDailyCard(). Par défaut `false` (fail-closed) :
  // un futur appelant qui oublierait de passer cette prop obtient le comportement restrictif,
  // pas l'inverse.
  canEdit?: boolean
}

const MEMBER_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
function memberColor(id: string) { return MEMBER_COLORS[id.charCodeAt(id.length - 1) % MEMBER_COLORS.length] }

function Ico({ d, size = 11 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const ICO = {
  sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  target:   '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  alert:    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  umbrella: '<path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/>',
}

// React.memo (2026-08-18, retour Julien : la vue Admin "ne suit pas le rythme" d'une frappe
// rapide côté Dev) : chaque message WebSocket reçu (voir hooks/useDailyRealtime.ts) déclenche un
// dispatch qui re-rend DailyPage, donc par défaut TOUTES les cartes de l'équipe, alors qu'une
// seule est concernée. `entry` garde une référence stable pour les membres non touchés (le
// reducer ne recrée pas les objets filtrés, voir context/StateContext.tsx) et `onChange` est
// désormais stabilisé par useCallback (DailyPage.tsx) : la comparaison superficielle par défaut
// de React.memo suffit donc à ignorer le re-rendu des cartes non concernées.
export const MemberCard = memo(function MemberCard({ member, entry, onChange, absence, canEdit = false }: Props) {
  const [local, setLocal] = useState(entry)
  const hasBlocker = local.blockers.trim().length > 0
  const isAbsent = !!absence

  useEffect(() => { setLocal(entry) }, [entry])

  function update(field: 'yesterday' | 'today' | 'blockers', value: string) {
    const updated = { ...local, [field]: value }
    setLocal(updated)
    onChange(updated, field)
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, background: 'rgba(251,146,60,.15)', color: '#ea580c', padding: '2px 8px', borderRadius: 10 }}>
            <Ico d={ICO.umbrella} size={10} />
            {absence.title}
          </span>
        )}
        {hasBlocker && !isAbsent && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, background: 'rgba(255,59,48,.12)', color: 'var(--danger)', padding: '2px 8px', borderRadius: 10 }}>
            <Ico d={ICO.alert} size={10} />
            Bloqué
          </span>
        )}
      </div>

      {/* Sections */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isAbsent && (
          <div style={{ fontSize: 12, color: '#ea580c', fontStyle: 'italic', padding: '6px 10px', background: 'rgba(251,146,60,.08)', borderRadius: 6 }}>
            Absent(e) · {absence.type}
          </div>
        )}
        <Section icon={ICO.sun}    label="Hier"         value={local.yesterday} onChange={v => update('yesterday', v)} readOnly={!canEdit} testId={`daily-field-yesterday-${member.id}`} />
        <Section icon={ICO.target} label="Aujourd'hui"  value={local.today}     onChange={v => update('today', v)} readOnly={!canEdit} testId={`daily-field-today-${member.id}`} />
        <Section icon={ICO.alert}  label="Blocages"     value={local.blockers}  onChange={v => update('blockers', v)} placeholder="Aucun blocage..." readOnly={!canEdit} testId={`daily-field-blockers-${member.id}`} />
      </div>
    </div>
  )
})

function Section({ icon, label, value, onChange, placeholder, readOnly, testId }: {
  icon: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; readOnly?: boolean; testId?: string
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: icon }} />
        {label}
      </div>
      <textarea
        data-testid={testId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={readOnly ? '' : (placeholder ?? 'Saisir...')}
        rows={2}
        readOnly={readOnly}
        title={readOnly ? 'Réservé au membre concerné (ou à un Admin)' : undefined}
        style={{ width: '100%', resize: 'vertical', fontSize: 12, minHeight: 52, opacity: readOnly ? .65 : 1, cursor: readOnly ? 'default' : 'text', background: readOnly ? 'var(--surface2)' : undefined }}
      />
    </div>
  )
}
