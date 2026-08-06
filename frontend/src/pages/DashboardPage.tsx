import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { VelocityChart } from '../components/dashboard/VelocityChart'
import { BurndownChart } from '../components/dashboard/BurndownChart'
import { ClientRAG } from '../components/dashboard/ClientRAG'
import { SprintProgressCard } from '../components/dashboard/SprintProgressCard'
import { RecentActivity } from '../components/dashboard/RecentActivity'
import { BlockersCard } from '../components/dashboard/BlockersCard'
import { DoneItemsCard } from '../components/dashboard/DoneItemsCard'
import { AvgVelocityCard } from '../components/dashboard/AvgVelocityCard'
import { TeamVelocityChart } from '../components/dashboard/TeamVelocityChart'
import { SprintHealthCard } from '../components/dashboard/SprintHealthCard'
import { SprintAbsencesCard } from '../components/dashboard/SprintAbsencesCard'
import { DashboardZoneSplit } from '../components/dashboard/DashboardZoneSplit'
import { AddWidgetModal } from '../components/dashboard/AddWidgetModal'
import { resolveDashboardLayout, widgetScope, placementScope, zoneRowSpan, DASHBOARD_WIDGET_CATALOG, DASHBOARD_ZONE_LABELS } from '../data/dashboardWidgets'
import type { DashboardWidgetPlacement, DashboardWidgetId, DashboardWidgetScope } from '../data/dashboardWidgets'
import { isItemDone } from '../utils/status'
import { getSprintSP } from '../utils/hierarchyScore'
import { getCurrentSprint } from '../utils/sprints'
import { localIso } from '../utils/dates'
import { useAuth } from '../hooks/useAuth'
import { hasRole } from '../utils/permissions'
import { useToast } from '../context/ToastContext'

/* ── Tiny inline SVG helper (même convention que Header.tsx/KanbanPage.tsx) ──────────── */
function Svg({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}
const ICO_GRIP = '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>'
const ICO_PLUS = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'

// Convention locale reprise telle quelle du reste du projet (ClientModal.tsx, TeamPage.tsx...).
function uid() { return Math.random().toString(36).slice(2, 9) }

// Bouton "Réorganiser" (2026-08-06) — repris tel quel du bouton du même nom sur KanbanPage.tsx
// (reorgBtnStyle) plutôt que le style `.hdr-btn`/`.hdr-btn.primary` utilisé jusqu'ici : contour
// permanent (pas juste icône), fond/texte/contour qui passent à `--primary`/`--primary-light` en
// mode actif, jamais un remplissage plein comme `.hdr-btn.primary`.
const REORG_BTN_BASE = {
  height: 30, border: '1px solid var(--border)', borderRadius: 7,
  backgroundColor: 'transparent', color: 'var(--text)', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none', flexShrink: 0,
  display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
} as const

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
  const { showToast } = useToast()
  // Même gating que les autres réglages "partagés" (Mode présentation, tags de base) : la
  // disposition du Dashboard est un réglage de workspace (comme le reste de `state.settings`),
  // pas une préférence par utilisateur — pas d'infrastructure de préférences individuelles dans ce
  // prototype, cohérent avec le thème clair/sombre déjà partagé par tous.
  const canCustomize = hasRole(userRole, 'PO')
  const [editing, setEditing] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)

  const currentSprint = useMemo(() => getCurrentSprint(state), [state])
  const closedSprints = useMemo(() => state.sprints.filter(s => s.closed), [state.sprints])

  const doneItems = useMemo(() => state.items.filter(i => isItemDone(i, state.kanbanCols)), [state.items, state.kanbanCols])

  // Étendu (2026-08-06) pour le réglage "fenêtre" d'AvgVelocityCard.tsx : moyenne sur tous les
  // sprints clôturés (comportement historique) et moyenne sur les 3 derniers (tendance récente),
  // calculées ici une bonne fois pour toutes plutôt que dans le composant — celui-ci ne fait que
  // choisir laquelle afficher selon le réglage.
  //
  // `velOf()` utilise `getSprintSP()` (2026-08-06, retour Julien : "les autres widgets... semblent
  // prendre en compte seulement les items") plutôt qu'un filtre `items.filter(sprintId===s.id)` en
  // repli quand `velocitySnapshot` est absent — un Epic assigné au sprint mais pas encore découpé
  // en US comptait pour 0 SP avant ce correctif (voir hierarchyScore.ts).
  const { avgVelocityAll, avgVelocityLast3, closedSprintsLast3 } = useMemo(() => {
    const sorted = [...closedSprints].sort((a, b) => a.number - b.number)
    const last3 = sorted.slice(-3)
    const velOf = (s: typeof sorted[number]) => s.velocitySnapshot ?? getSprintSP(s.id, state.items, state.hierarchyNodes, state.kanbanCols).done
    const avgOf = (sprints: typeof sorted) => {
      const vels = sprints.map(velOf)
      return vels.length ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length) : 0
    }
    return { avgVelocityAll: avgOf(sorted), avgVelocityLast3: avgOf(last3), closedSprintsLast3: last3 }
  }, [closedSprints, state.items, state.hierarchyNodes, state.kanbanCols])

  const today = localIso(new Date())

  const layout = resolveDashboardLayout(state.settings.dashboardWidgets)
  const zoneOrientation = state.settings.dashboardZoneOrientation ?? 'horizontal'
  const zoneSplit = state.settings.dashboardZoneSplit ?? 50
  const zonesSwapped = state.settings.dashboardZonesSwapped ?? false

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

  function persistZonesSwapped(next: boolean) {
    const nextSettings = { ...state.settings, dashboardZonesSwapped: next }
    dispatch({ type: 'UPDATE_SETTINGS', payload: nextSettings })
    saveToServer({ ...state, settings: nextSettings })
  }

  // Ajout d'un widget depuis la modal (2026-08-06, retour Julien, voir AddWidgetModal.tsx) — posé
  // en bas de la zone choisie (`zoneRowSpan`, même heuristique que l'ancien `addWidget` dans
  // DashboardWidgetGrid.tsx avant sa suppression), avec une nouvelle `key` générée (doublons
  // autorisés, voir dashboardWidgets.ts). `scopeOverride` seulement si la zone choisie diffère du
  // `scope` par défaut du widget dans le catalogue — pas la peine de le persister sinon.
  // Toast de confirmation (2026-08-06, retour Julien) — seul signal une fois la carte de la modal
  // repliée, la modal elle-même restant ouverte pour enchaîner d'autres ajouts (voir
  // AddWidgetModal.tsx).
  function addWidgetToZone(id: DashboardWidgetId, zone: DashboardWidgetScope) {
    const def = DASHBOARD_WIDGET_CATALOG.find(w => w.id === id)
    if (!def) return
    const zonePlacements = layout.filter(p => placementScope(p) === zone)
    const placement: DashboardWidgetPlacement = {
      key: `${id}-${uid()}`,
      id,
      x: 0,
      y: zoneRowSpan(zonePlacements),
      size: def.allowedSizes[0],
      scopeOverride: zone === widgetScope(id) ? undefined : zone,
    }
    persistLayout([...layout, placement])
    showToast(`"${def.label}" ajouté (${DASHBOARD_ZONE_LABELS[zone]})`)
  }

  // Réglages par widget, face cachée (2026-08-04, retour Julien, voir FlipCard.tsx) — patch un seul
  // placement dans `layout` et persiste comme le reste (taille, position). Générique par clé, pas
  // seulement pour kpi-current-sprint : à réutiliser tel quel pour les prochains widgets flippables.
  //
  // Keyé par `key` plutôt que `id` (2026-08-06, doublons de widgets autorisés, voir
  // dashboardWidgets.ts) — `id` est le TYPE de widget, partagé par toutes ses instances ; `key`
  // identifie LE placement précis dont on change un réglage, sans quoi 2 instances du même widget
  // recevraient toujours le même patch.
  function updateWidgetSetting(key: string, patch: Partial<DashboardWidgetPlacement>) {
    persistLayout(layout.map(p => p.key === key ? { ...p, ...patch } : p))
  }

  // `renderWidget` reçoit désormais le PLACEMENT complet, pas juste son `id` (2026-08-06, même
  // raison que `updateWidgetSetting` ci-dessus) — chaque case lit ses réglages directement sur
  // `placement.xxx` (persistés dessus) au lieu de `layout.find(p => p.id === '...')`, qui n'aurait
  // plus été fiable dès qu'un widget existe en plusieurs exemplaires.
  function renderWidget(placement: DashboardWidgetPlacement): ReactNode {
    const { key, id } = placement
    switch (id) {
      case 'kpi-done':
        return (
          <DoneItemsCard
            doneCount={doneItems.length}
            totalCount={state.items.length}
            editable={canCustomize && editing}
            instanceKey={key}
            display={placement.doneItemsDisplay ?? 'count'}
            onChangeDisplay={next => updateWidgetSetting(key, { doneItemsDisplay: next })}
          />
        )
      case 'kpi-velocity':
        return (
          <AvgVelocityCard
            avgAll={avgVelocityAll}
            avgLast3={avgVelocityLast3}
            countAll={closedSprints.length}
            countLast3={closedSprintsLast3.length}
            editable={canCustomize && editing}
            instanceKey={key}
            windowMode={placement.velocityWindow ?? 'all'}
            onChangeWindow={next => updateWidgetSetting(key, { velocityWindow: next })}
          />
        )
      case 'kpi-current-sprint':
        return (
          <SprintProgressCard
            sprint={currentSprint}
            items={state.items}
            hierarchyNodes={state.hierarchyNodes}
            kanbanCols={state.kanbanCols}
            editable={canCustomize && editing}
            instanceKey={key}
            emphasis={placement.emphasis ?? 'sp'}
            onChangeEmphasis={next => updateWidgetSetting(key, { emphasis: next })}
          />
        )
      case 'kpi-blockers':
        return (
          <BlockersCard
            dailyEntries={state.dailyEntries}
            currentSprint={currentSprint}
            today={today}
            editable={canCustomize && editing}
            instanceKey={key}
            scope={placement.blockersScope ?? 'today'}
            onChangeScope={next => updateWidgetSetting(key, { blockersScope: next })}
          />
        )
      case 'velocity-chart':
        return (
          <VelocityChart
            sprints={state.sprints}
            items={state.items}
            hierarchyNodes={state.hierarchyNodes}
            kanbanCols={state.kanbanCols}
            editable={canCustomize && editing}
            instanceKey={key}
            showPlanned={placement.velocityShowPlanned ?? true}
            onChangeShowPlanned={next => updateWidgetSetting(key, { velocityShowPlanned: next })}
            showTrend={placement.velocityShowTrend ?? false}
            onChangeShowTrend={next => updateWidgetSetting(key, { velocityShowTrend: next })}
            size={placement.size}
          />
        )
      case 'burndown-chart':
        return currentSprint
          ? (
            <BurndownChart
              sprint={currentSprint}
              items={state.items}
              hierarchyNodes={state.hierarchyNodes}
              kanbanCols={state.kanbanCols}
              editable={canCustomize && editing}
              instanceKey={key}
              mode={placement.burndownMode ?? 'remaining'}
              onChangeMode={next => updateWidgetSetting(key, { burndownMode: next })}
              showToday={placement.burndownShowToday ?? false}
              onChangeShowToday={next => updateWidgetSetting(key, { burndownShowToday: next })}
            />
          )
          : <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Aucun sprint actif
            </div>
      case 'client-rag':
        return (
          <ClientRAG
            clients={state.clients}
            items={state.items}
            hierarchyNodes={state.hierarchyNodes}
            kanbanCols={state.kanbanCols}
            currentSprint={currentSprint}
            editable={canCustomize && editing}
            instanceKey={key}
            size={placement.size}
            indicator={placement.clientRagIndicator ?? 'gauge'}
            onChangeIndicator={next => updateWidgetSetting(key, { clientRagIndicator: next })}
            scope={placement.clientRagScope ?? 'product'}
            // Zone du widget alignée automatiquement sur son périmètre (2026-08-06, retour Julien :
            // "je voyais le changement de zone automatique dès qu'on changeait le périmètre du
            // widget via ses réglages" — pas de bouton dédié, voir DashboardZoneSplit.tsx). Le
            // périmètre de ClientRAG partage déjà les valeurs 'product'/'sprint' avec les zones du
            // Dashboard, contrairement aux réglages des autres widgets (ex. `blockersScope`
            // 'today'/'sprint' n'a pas cette correspondance) — comportement propre à ce widget pour
            // l'instant.
            onChangeScope={next => updateWidgetSetting(key, { clientRagScope: next, scopeOverride: next })}
          />
        )
      case 'recent-activity':
        return (
          <RecentActivity
            dailyEntries={state.dailyEntries}
            team={state.team}
            currentSprint={currentSprint}
            today={today}
            editable={canCustomize && editing}
            instanceKey={key}
            windowMode={placement.recentActivityWindow ?? 'today'}
            onChangeWindow={next => updateWidgetSetting(key, { recentActivityWindow: next })}
          />
        )
      case 'team-velocity':
        return (
          <TeamVelocityChart
            sprints={state.sprints}
            team={state.team}
            items={state.items}
            kanbanCols={state.kanbanCols}
            editable={canCustomize && editing}
            instanceKey={key}
            metric={placement.teamVelocityMetric ?? 'sp'}
            onChangeMetric={next => updateWidgetSetting(key, { teamVelocityMetric: next })}
            size={placement.size}
          />
        )
      case 'sprint-health':
        return (
          <SprintHealthCard
            sprint={currentSprint}
            items={state.items}
            hierarchyNodes={state.hierarchyNodes}
            kanbanCols={state.kanbanCols}
            team={state.team}
            absences={state.absences}
            today={today}
            editable={canCustomize && editing}
            instanceKey={key}
            metric={placement.sprintHealthMetric ?? 'sp'}
            onChangeMetric={next => updateWidgetSetting(key, { sprintHealthMetric: next })}
          />
        )
      case 'sprint-absences':
        return (
          <SprintAbsencesCard
            absences={state.absences}
            team={state.team}
            sprint={currentSprint}
            today={today}
            size={placement.size}
          />
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
            {editing && (
              <button
                style={REORG_BTN_BASE}
                data-testid="dashboard-add-widget-btn"
                onClick={() => setAddModalOpen(true)}
              >
                <Svg d={ICO_PLUS} />
                Ajouter un widget
              </button>
            )}
            <button
              style={editing ? { ...REORG_BTN_BASE, backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderColor: 'var(--primary)' } : REORG_BTN_BASE}
              data-testid="dashboard-customize-toggle"
              onClick={() => setEditing(e => !e)}
            >
              <Svg d={ICO_GRIP} />
              Réorganiser
            </button>
            <div className="hdr-sep" />
          </>
        )}
      </Header>

      {addModalOpen && (
        <AddWidgetModal
          onAdd={(id, zone) => addWidgetToZone(id, zone)}
          onClose={() => setAddModalOpen(false)}
        />
      )}

      <div className="page-content">
        {/* Signal visuel du mode édition (2026-08-06) — même traitement que le mode "Réorganiser"
            du Kanban (voir .kanban-board-wrap dans index.css) : cadre pointillé teinté autour de la
            zone de widgets, bandeau explicatif à l'intérieur. */}
        <div className={`dash-edit-wrap${editing ? ' active' : ''}`}>
          {editing && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--primary-light)', borderLeft: '3px solid var(--primary)',
              borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12,
              color: 'var(--text-muted)',
            }}>
              <span style={{ color: 'var(--primary)', display: 'flex' }}><Svg d={ICO_GRIP} size={14} /></span>
              <span>
                <strong style={{ color: 'var(--primary)' }}>Mode réorganisation</strong>
                {' '}— glissez les widgets pour les repositionner, changez leur taille ou retirez-en un. Ouvrez Réglages sur un widget pour personnaliser son affichage, ou "Ajouter un widget" pour en poser un nouveau.
              </span>
            </div>
          )}
          <DashboardZoneSplit
            placements={layout}
            orientation={zoneOrientation}
            splitPercent={zoneSplit}
            zonesSwapped={zonesSwapped}
            editable={canCustomize && editing}
            renderWidget={renderWidget}
            onChangePlacements={persistLayout}
            onChangeOrientation={persistOrientation}
            onChangeSplit={persistSplit}
            onChangeZonesSwapped={persistZonesSwapped}
          />
        </div>
      </div>
    </>
  )
}
