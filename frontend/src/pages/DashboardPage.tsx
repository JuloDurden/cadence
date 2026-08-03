import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { StatCard } from '../components/dashboard/StatCard'
import { VelocityChart } from '../components/dashboard/VelocityChart'
import { BurndownChart } from '../components/dashboard/BurndownChart'
import { ClientRAG } from '../components/dashboard/ClientRAG'
import { DashboardZoneSplit } from '../components/dashboard/DashboardZoneSplit'
import { resolveDashboardLayout } from '../data/dashboardWidgets'
import type { DashboardWidgetId, DashboardWidgetPlacement } from '../data/dashboardWidgets'
import { isItemDone } from '../utils/status'
import { getCurrentSprint } from '../utils/sprints'
import { localIso } from '../utils/dates'
import { useAuth } from '../hooks/useAuth'
import { hasRole } from '../utils/permissions'

// Phase 4 (roadmap v1), Dashboard widgets (2026-08-03, retour Julien) — les blocs du Dashboard
// (KPIs, graphiques, RAG clients, activité récente) étaient jusqu'ici un layout figé en JSX. Ils
// sont désormais posés sur une grille libre façon iOS Springboard (voir DashboardWidgetGrid.tsx,
// data/dashboardWidgets.ts) : un Admin/PO peut les déplacer, changer leur taille (3 tailles
// prédéfinies), les retirer ou en rajouter — persisté dans `state.settings.dashboardWidgets`. Cette
// page ne garde que le calcul des données ; le placement/la mécanique de grille vivent dans
// DashboardWidgetGrid.tsx (générique, ne connaît rien du Dashboard en particulier).
//
// Suite (2026-08-03, retour Julien après le 1er essai) : les widgets sont désormais répartis en 2
// zones séparées (Sprint en cours / Vue produit, voir dashboardWidgets.ts `scope` et
// DashboardZoneSplit.tsx), avec orientation et partage d'espace réglables, persistés dans
// `state.settings.dashboardZoneOrientation` / `dashboardZoneSplit`.
export function DashboardPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const { userRole } = useAuth()
  // Même gating que les autres réglages "partagés" (Mode présentation, tags de base) : la
  // disposition du Dashboard est un réglage de workspace (comme le reste de `state.settings`),
  // pas une préférence par utilisateur — pas d'infrastructure de préférences individuelles dans ce
  // prototype, cohérent avec le thème clair/sombre déjà partagé par tous.
  const canCustomize = hasRole(userRole, 'PO')
  const [editing, setEditing] = useState(false)

  const currentSprint = useMemo(() => getCurrentSprint(state), [state])
  const closedSprints = useMemo(() => state.sprints.filter(s => s.closed), [state.sprints])

  const doneItems = useMemo(() => state.items.filter(i => isItemDone(i, state.kanbanCols)), [state.items, state.kanbanCols])

  const avgVelocity = useMemo(() => {
    const vels = closedSprints.map(s => s.velocitySnapshot ?? state.items.filter(i => i.sprintId === s.id && isItemDone(i, state.kanbanCols)).reduce((sum, i) => sum + i.sp, 0))
    return vels.length ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length) : 0
  }, [closedSprints, state.items, state.kanbanCols])

  const currentItems = currentSprint ? state.items.filter(i => i.sprintId === currentSprint.id) : []
  const currentDoneSP = currentItems.filter(i => isItemDone(i, state.kanbanCols)).reduce((s, i) => s + i.sp, 0)
  const currentTotalSP = currentItems.reduce((s, i) => s + i.sp, 0)

  // Corrigé (2026-08-03, retour Julien "Oui, corriger") : "Blocages actifs" portait mal son nom,
  // il comptait tout l'historique des dailies au lieu du jour même — scopé à aujourd'hui.
  const today = localIso(new Date())
  const blockers = state.dailyEntries.filter(e => e.date === today && e.blockers.trim().length > 0)

  const layout = resolveDashboardLayout(state.settings.dashboardWidgets)
  const zoneOrientation = state.settings.dashboardZoneOrientation ?? 'horizontal'
  const zoneSplit = state.settings.dashboardZoneSplit ?? 50

  function persistLayout(next: DashboardWidgetPlacement[]) {
    const nextSettings = { ...state.settings, dashboardWidgets: next }
    dispatch({ type: 'UPDATE_SETTINGS', payload: nextSettings })
    saveToServer({ ...state, settings: nextSettings })
  }

  function persistOrientation(next: 'horizontal' | 'vertical') {
    const nextSettings = { ...state.settings, dashboardZoneOrientation: next }
    dispatch({ type: 'UPDATE_SETTINGS', payload: nextSettings })
    saveToServer({ ...state, settings: nextSettings })
  }

  function persistSplit(next: number) {
    const nextSettings = { ...state.settings, dashboardZoneSplit: next }
    dispatch({ type: 'UPDATE_SETTINGS', payload: nextSettings })
    saveToServer({ ...state, settings: nextSettings })
  }

  function renderWidget(id: DashboardWidgetId): ReactNode {
    switch (id) {
      case 'kpi-done':
        return <StatCard label="US terminées" value={doneItems.length} sub={`sur ${state.items.length} total`} icon="✅" />
      case 'kpi-velocity':
        return <StatCard label="Vélocité moy." value={avgVelocity > 0 ? `${avgVelocity} SP` : '—'} sub={`sur ${closedSprints.length} sprint${closedSprints.length > 1 ? 's' : ''}`} icon="⚡" color="#ff9500" />
      case 'kpi-current-sprint':
        return (
          <StatCard
            label="Sprint actuel"
            value={currentSprint ? `${currentDoneSP}/${currentTotalSP} SP` : '—'}
            sub={currentSprint ? `${Math.round((currentDoneSP / Math.max(1, currentTotalSP)) * 100)}% complété` : 'Aucun sprint actif'}
            icon="🏃"
            color="var(--primary)"
          />
        )
      case 'kpi-blockers':
        return <StatCard label="Blocages actifs" value={blockers.length} sub="aujourd'hui" icon="⚠" color={blockers.length > 0 ? 'var(--danger)' : '#34c759'} />
      case 'velocity-chart':
        return <VelocityChart sprints={state.sprints} items={state.items} kanbanCols={state.kanbanCols} />
      case 'burndown-chart':
        return currentSprint
          ? <BurndownChart sprint={currentSprint} items={state.items} kanbanCols={state.kanbanCols} />
          : <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Aucun sprint actif
            </div>
      case 'client-rag':
        return <ClientRAG clients={state.clients} items={state.items} kanbanCols={state.kanbanCols} />
      case 'recent-activity':
        return (
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', overflow: 'auto' }}>
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
        )
    }
  }

  return (
    <>
      <Header title="Dashboard">
        {currentSprint && (
          <>
            <div className="hdr-sep" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sprint {currentSprint.number} en cours</span>
          </>
        )}
        {canCustomize && (
          <>
            <div style={{ flex: 1 }} />
            <button
              className={`hdr-btn${editing ? ' primary' : ''}`}
              data-testid="dashboard-customize-toggle"
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => setEditing(e => !e)}
            >
              {editing ? 'Terminer' : 'Personnaliser'}
            </button>
          </>
        )}
      </Header>

      <div className="page-content">
        <DashboardZoneSplit
          placements={layout}
          orientation={zoneOrientation}
          splitPercent={zoneSplit}
          editable={canCustomize && editing}
          renderWidget={renderWidget}
          onChangePlacements={persistLayout}
          onChangeOrientation={persistOrientation}
          onChangeSplit={persistSplit}
        />
      </div>
    </>
  )
}
