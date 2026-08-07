import type { CadenceState, Item, Sprint, TeamMember } from '../../types'
import type { DashboardWidgetSize } from '../../data/dashboardWidgets'
import { computeMemberCapacity, isMemberFullyAbsent } from '../../utils/sprintCapacity'

interface Props {
  state: CadenceState
  currentSprint: Sprint | undefined
  size: DashboardWidgetSize
}

// Même palette/dérivation que TeamPage.tsx (`memberColor`/`initials`) — dupliquée ici plutôt que
// partagée, convention déjà suivie dans le projet pour ces petits helpers locaux (voir SprintAbsencesCard.tsx).
const MEMBER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
function memberColor(id: string) { return MEMBER_COLORS[id.charCodeAt(id.length - 1) % MEMBER_COLORS.length] }
function initials(name: string) { return name.split(' ').map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) }

/** SP affiché avec une décimale seulement si nécessaire (la répartition `sp / nb assignés` produit
 *  des valeurs comme 12,5) — virgule française, pas point. */
function formatSP(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

function Avatar({ member, size }: { member: TeamMember; size: number }) {
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

interface MemberLoad { member: TeamMember; usedSP: number; capacity: number; pct: number; over: boolean }

/** Charge d'un membre sur le sprint en cours — même calcul que le panneau membres du Gantt de Sprint
 *  Planning (GanttView.tsx) : SP réparti `sp / nb assignés` sur les items où le membre est assigné
 *  (attitré `assignees[0]` ou co-assigné), face à sa capacité individuelle (`computeMemberCapacity()`,
 *  utils/sprintCapacity.ts — spPerDay × jours ouvrés − fériés − absences). Un membre absent sur TOUTE
 *  la durée du sprint (`isMemberFullyAbsent()`) est exclu de la liste, même règle que le Gantt (pas de
 *  ligne à 0% qui n'a pas de sens pour quelqu'un qui n'est pas là). Triés par charge décroissante :
 *  les surcharges remontent en premier, c'est le signal le plus utile à voir sans défiler. */
function computeLoads(team: TeamMember[], items: Item[], sprint: Sprint, state: CadenceState): MemberLoad[] {
  const sprintItems = items.filter(i => i.sprintId === sprint.id)
  return team
    .filter(m => !isMemberFullyAbsent(m.id, sprint, state))
    .map(member => {
      const primary = sprintItems.filter(i => i.assignees[0] === member.id)
      const co = sprintItems.filter(i => i.assignees.length > 1 && i.assignees.slice(1).includes(member.id))
      const usedSP = [...primary, ...co].reduce((s, i) => s + i.sp / Math.max(1, i.assignees.length), 0)
      const capacity = computeMemberCapacity(member, sprint, state)
      const pct = capacity > 0 ? Math.min(100, (usedSP / capacity) * 100) : 0
      const over = capacity > 0 && usedSP > capacity
      return { member, usedSP, capacity, pct, over }
    })
    .sort((a, b) => b.pct - a.pct || b.usedSP - a.usedSP)
}

// Widget "Charge actuelle par membre" (2026-08-07, retour Julien) — 18e widget Dashboard, sans face
// cachée de réglages. Condense, par membre, la barre de charge déjà affichée dans le panneau membres
// du Gantt de Sprint Planning (mêmes seuils de couleur : rouge en dépassement, orange à partir de
// 85%) — pas une nouvelle règle de calcul, juste exposée sur le Dashboard.
//
// L/XLP : une ligne par membre profite de la hauteur, même famille que "Progression par
// Epic"/"Santé clients (RAG)".
export function MemberWorkloadCard({ state, currentSprint, size }: Props) {
  const loads = currentSprint ? computeLoads(state.team, state.items, currentSprint, state) : []

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '16px 18px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 12 }}>Charge actuelle par membre</div>
      {!currentSprint ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun sprint actif
        </div>
      ) : loads.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          Personne à afficher (équipe absente)
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: size === 'XLP' ? 12 : 11 }}>
          {loads.map(({ member, usedSP, capacity, pct, over }) => {
            const warn = !over && pct >= 85
            const barColor = over ? 'var(--danger)' : warn ? '#ff9500' : 'var(--primary)'
            const captionColor = over ? 'var(--danger)' : warn ? '#ff9500' : usedSP === 0 ? 'var(--text-faint)' : 'var(--text-muted)'
            return (
              <div key={member.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <Avatar member={member} size={18} />
                    <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: over ? 'var(--danger)' : 'var(--text-muted)', flexShrink: 0 }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor }} />
                </div>
                <div style={{ fontSize: 10, color: captionColor, marginTop: 2 }}>
                  {formatSP(usedSP)} / {capacity} SP{over ? ' · en surcharge' : usedSP === 0 ? ' · rien d\'assigné' : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
