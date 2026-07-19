import { useMemo } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { StatCard } from '../components/dashboard/StatCard'
import { VelocityChart } from '../components/dashboard/VelocityChart'
import { BurndownChart } from '../components/dashboard/BurndownChart'
import { ClientRAG } from '../components/dashboard/ClientRAG'
import { isItemDone } from '../utils/status'

export function DashboardPage() {
  const { state } = useCadence()

  const currentSprint = useMemo(() => state.sprints.find(s => !s.closed), [state.sprints])
  const closedSprints = useMemo(() => state.sprints.filter(s => s.closed), [state.sprints])

  const doneItems = useMemo(() => state.items.filter(i => isItemDone(i, state.kanbanCols)), [state.items, state.kanbanCols])

  const avgVelocity = useMemo(() => {
    const vels = closedSprints.map(s => s.velocitySnapshot ?? state.items.filter(i => i.sprintId === s.id && isItemDone(i, state.kanbanCols)).reduce((sum, i) => sum + i.sp, 0))
    return vels.length ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length) : 0
  }, [closedSprints, state.items, state.kanbanCols])

  const currentItems = currentSprint ? state.items.filter(i => i.sprintId === currentSprint.id) : []
  const currentDoneSP = currentItems.filter(i => isItemDone(i, state.kanbanCols)).reduce((s, i) => s + i.sp, 0)
  const currentTotalSP = currentItems.reduce((s, i) => s + i.sp, 0)

  const blockers = state.dailyEntries.filter(e => e.blockers.trim().length > 0)

  return (
    <>
      <Header title="Dashboard">
        {currentSprint && (
          <>
            <div className="hdr-sep" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sprint {currentSprint.number} en cours</span>
          </>
        )}
      </Header>

      <div className="page-content">
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard label="US terminées" value={doneItems.length} sub={`sur ${state.items.length} total`} icon="✅" />
          <StatCard label="Vélocité moy." value={avgVelocity > 0 ? `${avgVelocity} SP` : '—'} sub={`sur ${closedSprints.length} sprint${closedSprints.length > 1 ? 's' : ''}`} icon="⚡" color="#ff9500" />
          <StatCard
            label="Sprint actuel"
            value={currentSprint ? `${currentDoneSP}/${currentTotalSP} SP` : '—'}
            sub={currentSprint ? `${Math.round((currentDoneSP / Math.max(1, currentTotalSP)) * 100)}% complété` : 'Aucun sprint actif'}
            icon="🏃"
            color="var(--primary)"
          />
          <StatCard label="Blocages actifs" value={blockers.length} sub="aujourd'hui" icon="⚠" color={blockers.length > 0 ? 'var(--danger)' : '#34c759'} />
        </div>

        {/* Charts ligne 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <VelocityChart sprints={state.sprints} items={state.items} kanbanCols={state.kanbanCols} />
          {currentSprint
            ? <BurndownChart sprint={currentSprint} items={state.items} kanbanCols={state.kanbanCols} />
            : <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Aucun sprint actif
              </div>
          }
        </div>

        {/* Ligne 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
          <ClientRAG clients={state.clients} items={state.items} kanbanCols={state.kanbanCols} />

          {/* Activité récente */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '18px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>🕐 Activité récente</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {state.dailyEntries.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aucune activité enregistrée.</p>
              )}
              {[...state.dailyEntries]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 8)
                .map((entry, i) => {
                  const member = state.team.find(m => m.id === entry.memberId)
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
        </div>
      </div>
    </>
  )
}
