import type { DailyEntry, TeamMember } from '../../types'

interface Props {
  dailyEntries: DailyEntry[]
  team: TeamMember[]
}

// Widget "Activité récente" — extrait de DashboardPage.tsx le 2026-08-04 (retour Julien : "nettoyer
// la page et faire du widget un component"), même logique de rendu que le reste des widgets
// Dashboard (StatCard, VelocityChart, BurndownChart, ClientRAG, SprintProgressCard). Flux des 8
// dernières entrées de Daily, plus récentes en premier.
export function RecentActivity({ dailyEntries, team }: Props) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', overflow: 'auto' }}>
      <div className="dash-widget-title" style={{ marginBottom: 16 }}>Activité récente</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dailyEntries.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aucune activité enregistrée.</p>
        )}
        {[...dailyEntries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 8)
          .map((entry, i) => {
            const member = team.find(m => m.id === entry.memberId)
            if (!member) return null
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>
                  {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{member.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(entry.date).toLocaleDateString('fr-FR')}</span>
                  </div>
                  {entry.today && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>🎯 {entry.today}</div>}
                  {entry.blockers && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 1 }}>⚠ {entry.blockers}</div>}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
