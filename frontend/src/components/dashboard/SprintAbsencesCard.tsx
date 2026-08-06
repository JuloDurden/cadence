import type { Absence, Sprint, TeamMember } from '../../types'
import type { DashboardWidgetSize } from '../../data/dashboardWidgets'
import { fmtDateShort } from '../../utils/dates'

interface Props {
  absences: Absence[]
  team: TeamMember[]
  sprint: Sprint | undefined
  today: string
  size: DashboardWidgetSize
}

// Même palette/dérivation que TeamPage.tsx (`memberColor`/`initials`) — dupliquée ici plutôt que
// partagée, convention déjà suivie dans le projet pour ces petits helpers locaux (voir `uid()`
// répété dans une quinzaine de fichiers, `memberColor()` déjà redupliqué dans
// TeamVelocityChart.tsx).
const MEMBER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
function memberColor(id: string) { return MEMBER_COLORS[id.charCodeAt(id.length - 1) % MEMBER_COLORS.length] }
function initials(name: string) { return name.split(' ').map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) }

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a + 'T00:00:00')
  const d2 = new Date(b + 'T00:00:00')
  return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

function Avatar({ member, size }: { member: TeamMember | undefined; size: number }) {
  if (!member) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
    )
  }
  const color = memberColor(member.id)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: member.photo ? 'transparent' : color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {member.photo
        ? <img src={member.photo} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: '#fff', fontSize: size * 0.38, fontWeight: 800 }}>{initials(member.name)}</span>
      }
    </div>
  )
}

interface AbsenceRow { absence: Absence; member: TeamMember | undefined; active: boolean; daysLeft: number }

// Widget "Absences du sprint" (2026-08-06, retour Julien, maquette validée avant développement) —
// 11e widget Dashboard, pas de face cachée de réglages (FlipCard.tsx) : rien à basculer, contenu
// unique demandé (photo, nom, période, jours restants avant retour).
//
// Absences retenues : toute absence qui CHEVAUCHE le sprint en cours (`a.start <= sprint.endDate &&
// a.end >= sprint.startDate`), pas seulement celles actives aujourd'hui — une absence à venir plus
// tard dans le sprint doit apparaître aussi, seul le badge "jours restants" est réservé aux absences
// en cours (`a.start <= today && a.end >= today`), conformément à la demande ("si la personne est
// actuellement absente"). Triées absences en cours d'abord (les plus urgentes), puis par date de
// début croissante.
//
// Taille S : pas de place pour la période/le compte à rebours par personne (maquette) — résumé
// avatars empilés (3 premiers + "+N") et total, même esprit que les autres KPI en S (héros/légende).
// Taille M : liste complète, une ligne par absence, défilement interne au-delà de la hauteur
// disponible (même principe que Santé clients (RAG)/Activité récente).
export function SprintAbsencesCard({ absences, team, sprint, today, size }: Props) {
  const rows: AbsenceRow[] = !sprint ? [] : absences
    .filter(a => a.start <= sprint.endDate && a.end >= sprint.startDate)
    .map(a => {
      const active = a.start <= today && a.end >= today
      return { absence: a, member: team.find(m => m.id === a.memberId), active, daysLeft: Math.max(0, daysBetween(today, a.end)) }
    })
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      return a.absence.start < b.absence.start ? -1 : a.absence.start > b.absence.start ? 1 : 0
    })

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: size === 'S' ? '10px 12px' : '14px 16px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: size === 'S' ? 4 : 8 }}>Absences du sprint</div>
      {!sprint ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
          Aucun sprint actif
        </div>
      ) : rows.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
          Aucune absence sur ce sprint
        </div>
      ) : size === 'S' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <div style={{ display: 'flex' }}>
            {rows.slice(0, 3).map((r, i) => (
              <div key={r.absence.id} style={{ marginLeft: i > 0 ? -8 : 0, border: '2px solid var(--surface)', borderRadius: '50%' }}>
                <Avatar member={r.member} size={26} />
              </div>
            ))}
            {rows.length > 3 && (
              <div style={{ marginLeft: -8, width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--surface)', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                +{rows.length - 3}
              </div>
            )}
          </div>
          <span style={{ fontFamily: 'var(--font-hero)', fontSize: 26, fontWeight: 800, color: 'var(--primary)', lineHeight: .8 }}>{rows.length}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{rows.length > 1 ? 'absences ce sprint' : 'absence ce sprint'}</span>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => (
            <div key={r.absence.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar member={r.member} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.member?.name ?? 'Membre supprimé'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {fmtDateShort(r.absence.start)} - {fmtDateShort(r.absence.end)}
                </div>
              </div>
              {r.active && (
                <span style={{ fontSize: 10, fontWeight: 600, color: '#ff3b30', background: 'rgba(255,59,48,.12)', padding: '2px 7px', borderRadius: 10, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {r.daysLeft > 1 ? `${r.daysLeft}j restants` : r.daysLeft === 1 ? '1j restant' : 'dernier jour'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
