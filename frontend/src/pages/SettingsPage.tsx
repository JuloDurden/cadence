import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { ColorPicker } from '../components/ui/ColorPicker'
import { STATUS_COLOR_PALETTE } from '../utils/kanbanStages'
import { visibleBaseTags } from '../data/baseTags'
import { cascadeSprintDates } from '../utils/dates'
import { computeSprintEndDate } from '../utils/sprintCapacity'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../hooks/useAuth'
import { useDialog } from '../context/DialogContext'
import { UsersSettingsSection } from '../components/settings/UsersSettingsSection'
import { PresentationLinkSection } from '../components/settings/PresentationLinkSection'
import { ApiTokensSection } from '../components/settings/ApiTokensSection'
import { PresentationPagesSection } from '../components/settings/PresentationPagesSection'
import { ResetAllDataModal } from '../components/settings/ResetAllDataModal'
import { ImportExcelMappingModal } from '../components/settings/ImportExcelMappingModal'
import type { SheetMapping } from '../components/settings/ImportExcelMappingModal'
import { hasRole } from '../utils/permissions'
import { buildBacklogWorkbookBuffer, readWorkbookSheets, applyMapping, applyBacklogExcelImport } from '../utils/excelBacklog'
import type { RawSheet } from '../utils/excelBacklog'
import type { KanbanCol, Settings, HistoryEntry, CadenceState } from '../types'

export function SettingsPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { confirm } = useDialog()
  const { userRole, userName } = useAuth()
  // Phase 2 (roadmap v1), sous-chantier 2 : gate sur le vrai role backend, pas sur userName
  // (voir docs/corrections.md, Chantier M — c'etait explicitement l'erreur a ne pas refaire).
  const isAdmin = userRole === 'ADMIN'
  // Phase 3 (roadmap v1), Mode présentation — génération/révocation du lien réservées Admin + PO
  // (décision Julien, AskUserQuestion 2026-08-01 : le PO est souvent celui qui présente en externe).
  const canManagePresentation = hasRole(userRole, 'PO')
  const [settings, setSettings] = useState<Settings>({ ...state.settings })
  const [cols, setCols] = useState<KanbanCol[]>([...state.kanbanCols])
  const [saved, setSaved] = useState(false)
  const [sprint1Start, setSprint1Start] = useState(state.sprints[0]?.startDate ?? '')

  function save() {
    let updatedSprints = state.sprints
    const durationChanged = settings.sprintDuration !== state.settings.sprintDuration
    const startChanged = sprint1Start !== '' && sprint1Start !== (state.sprints[0]?.startDate ?? '')

    if ((startChanged || durationChanged) && state.sprints.length > 0) {
      const newStart = startChanged ? sprint1Start : (state.sprints[0]?.startDate ?? sprint1Start)
      const weeks = settings.sprintDuration ?? 2
      const newEnd = computeSprintEndDate(newStart, weeks)
      updatedSprints = cascadeSprintDates(state.sprints, 0, newStart, newEnd, weeks)
      updatedSprints.forEach(s => dispatch({ type: 'UPDATE_SPRINT', payload: s }))
    }

    dispatch({ type: 'UPDATE_SETTINGS', payload: settings })
    dispatch({ type: 'UPDATE_KANBAN_COLS', payload: cols })
    saveToServer({ ...state, settings, kanbanCols: cols, sprints: updatedSprints })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `cadence-export-${new Date().toISOString().split('T')[0]}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        dispatch({ type: 'SET_STATE', payload: data })
        saveToServer(data)
        setSettings({ ...data.settings })
        setCols([...data.kanbanCols])
        showToast('Import réussi !')
      } catch { showToast('Fichier JSON invalide.', 'error') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Export/Import Excel du Backlog (Phase 5, roadmap v1, 2026-08-07, retour Julien : "ça peut être
  // clairement intéressant comme pour le JSON"), voir `utils/excelBacklog.ts` pour le détail des
  // colonnes et de la résolution Client/Epic/Sprint/Statut. Scopé au Backlog (items + Epics/
  // Initiatives) seulement, contrairement à l'export/import JSON ci-dessus qui couvre tout le
  // workspace. Revu (même soir, retour Julien après un 1er essai trop rapide) : User Story
  // complète (rôle/besoin/bénéfice), critères d'acceptation, et une 2e feuille Epics/Initiatives,
  // voir le détail dans excelBacklog.ts.
  async function exportExcel() {
    const buffer = await buildBacklogWorkbookBuffer(state)
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `cadence-backlog-${new Date().toISOString().split('T')[0]}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }

  // Mapping de colonnes explicite avant import (2026-08-07, retour Julien : "une fenêtre pourrait
  // proposer l'en-tête que l'on souhaite rattacher à la colonne"), le fichier est d'abord lu SANS
  // aucune correspondance en-tête↔champ (`readWorkbookSheets`), puis `ImportExcelMappingModal`
  // affiche une suggestion par feuille/colonne à confirmer ou ajuster ; l'import réel
  // (`applyBacklogExcelImport`) n'a lieu qu'au clic sur "Importer" de cette modal.
  const [importSheets, setImportSheets] = useState<RawSheet[] | null>(null)

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      const sheets = await readWorkbookSheets(buffer)
      if (sheets.length === 0) { showToast('Fichier Excel vide.', 'error') }
      else setImportSheets(sheets)
    } catch { showToast('Fichier Excel invalide.', 'error') }
    e.target.value = ''
  }

  function confirmExcelImport(sheetMappings: SheetMapping[]) {
    if (!importSheets) return
    const itemRows = sheetMappings
      .map((sm, i) => sm.target === 'items' ? applyMapping(importSheets[i].rows, sm.mapping) : [])
      .flat()
    const epicRows = sheetMappings
      .map((sm, i) => sm.target === 'epics' ? applyMapping(importSheets[i].rows, sm.mapping) : [])
      .flat()
    const { newState, itemsAdded, itemsUpdated, itemsSkipped, epicsAdded, epicsUpdated, epicsSkipped } =
      applyBacklogExcelImport(state, itemRows, epicRows)
    dispatch({ type: 'SET_STATE', payload: newState })
    saveToServer(newState)
    setImportSheets(null)
    const skipped = itemsSkipped + epicsSkipped
    const skippedText = skipped > 0 ? `, ${skipped} ligne(s) ignorée(s) (sans titre)` : ''
    showToast(
      `Import Excel : ${itemsAdded} item(s) ajouté(s), ${itemsUpdated} mis à jour, `
      + `${epicsAdded} Epic(s)/Initiative(s) ajouté(s), ${epicsUpdated} mis à jour${skippedText}.`
    )
  }

  // Préparation d'un fichier de démo "carré" (retour Julien, 2026-08-07) : avant de repartir sur un
  // nouveau jeu de données propre pour clients/sprints/US/Epics/Initiatives, ajout d'options de
  // réinitialisation ciblées. Réservé au rôle Admin (même logique que UsersSettingsSection) : action
  // destructrice à l'échelle du workspace, pas une simple préférence d'affichage.
  const itemCount = state.items.length
  const hierarchyCount = state.hierarchyNodes.length
  const backlogEmpty = itemCount === 0 && hierarchyCount === 0

  // Reset "profond" : items + Epics/Initiatives, et tout ce qui les référence directement
  // (historique, sessions/archives Sprint Review, post-its/cadres NNL liés). Les sprints
  // (dates/capacité/objectif) et les clients ne sont volontairement pas touchés ici : un Epic peut
  // être "affiché sous" un sprint mais un Sprint existe indépendamment de son contenu.
  async function resetBacklog() {
    if (backlogEmpty) { showToast('Le Product Backlog est déjà vide.'); return }
    const ok = await confirm(
      `Supprime définitivement ${itemCount} item(s) et ${hierarchyCount} Epic(s)/Initiative(s), ainsi que l'historique, les enregistrements Sprint Review et les post-its/cadres NNL qui leur sont liés. Les sprints et les clients ne sont pas affectés. Cette action est irréversible.`,
      { title: 'Réinitialiser le Product Backlog ?', confirmLabel: 'Réinitialiser', danger: true }
    )
    if (!ok) return

    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'other',
      timestamp: new Date().toISOString(),
      author: userName,
      detail: `Product Backlog réinitialisé (${itemCount} item(s), ${hierarchyCount} Epic(s)/Initiative(s) supprimés)`,
    }
    const cleanSR = <T extends { itemRecords: unknown[]; unfinishedRecords: unknown[]; notes?: { linkedItemId?: string }[] }>(s: T): T => ({
      ...s,
      itemRecords: [],
      unfinishedRecords: [],
      notes: (s.notes ?? []).filter(n => !n.linkedItemId),
    })

    const newState: CadenceState = {
      ...state,
      items: [],
      hierarchyNodes: [],
      itemKeyCounters: {},
      // itemKey présent = référence à un item ou un Epic/Initiative supprimé (voir types/index.ts,
      // HistoryEntry) ; les entrées sans itemKey (sprint_*, daily_archive, retro_archive...) restent.
      history: [historyEntry, ...state.history.filter(h => !h.itemKey)].slice(0, 200),
      sprintReviewSessions: (state.sprintReviewSessions ?? []).map(cleanSR),
      sprintReviewArchives: (state.sprintReviewArchives ?? []).map(cleanSR),
      nnlItems: (state.nnlItems ?? []).filter(n => !n.linkedItemId),
      nnlFrames: [], // tout cadre référence forcément un hierarchyNode, désormais tous supprimés
    }
    dispatch({ type: 'SET_STATE', payload: newState })
    saveToServer(newState)
    showToast('Product Backlog réinitialisé.')
  }

  // Bloqué tant que le Backlog n'est pas vide (retour Julien, 2026-08-07) : items et Epics/Initiatives
  // référencent clientId, et la convention du projet est de détacher plutôt que de laisser une
  // référence morte (voir utils/cascadeDelete.ts), donc on impose l'ordre Backlog → Clients plutôt
  // que de vider clientId partout automatiquement.
  async function resetClients() {
    if (!backlogEmpty) return
    const clientCount = state.clients.length
    if (clientCount === 0) { showToast('La liste des clients est déjà vide.'); return }
    const ok = await confirm(
      `Supprime définitivement ${clientCount} client(s) et leurs groupes de clients. Cette action est irréversible.`,
      { title: 'Réinitialiser les clients ?', confirmLabel: 'Réinitialiser', danger: true }
    )
    if (!ok) return

    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'other',
      timestamp: new Date().toISOString(),
      author: userName,
      detail: `Clients réinitialisés (${clientCount} client(s) supprimés)`,
    }
    const newState: CadenceState = {
      ...state,
      clients: [],
      clientGroups: [],
      history: [historyEntry, ...state.history].slice(0, 200),
    }
    dispatch({ type: 'SET_STATE', payload: newState })
    saveToServer(newState)
    showToast('Clients réinitialisés.')
  }

  // Reset total (2026-08-07, retour Julien : "un bouton pour supprimer tout sauf les comptes
  // utilisateurs"). Réservé Admin + PO (décision Julien, AskUserQuestion) — contrairement aux 2
  // resets ciblés ci-dessus, restés Admin uniquement, périmètre inchangé de leur propre chantier.
  // Vide toutes les DONNÉES MÉTIER (items, Epics/Initiatives, sprints, équipe, clients, absences,
  // Dailies, Rétrospectives, Sprint Review, Now/Next/Later) en un seul passage — pas de dépendance
  // d'ordre à gérer comme resetBacklog/resetClients puisque tout part simultanément. Préserve
  // explicitement `settings`, `kanbanCols`, `customTags`, `removedBaseTags` (réglages personnalisés,
  // décision Julien : "données métier uniquement", les réglages restent inchangés) et ne touche
  // jamais aux comptes `User` (table Prisma séparée, hors de ce blob JSON) : vider `state.team`
  // suffit à faire disparaître les fiches Équipe sans supprimer les comptes liés (`linkedUserId`),
  // même comportement déjà en place pour "Supprimer un membre" (TeamPage.tsx) — vérifié avant de
  // construire ce bouton, voir docs/corrections.md. Confirmation renforcée par mot-clé, voir
  // ResetAllDataModal.tsx.
  const [resetAllOpen, setResetAllOpen] = useState(false)
  const resetAllCounts = {
    items: itemCount,
    hierarchyNodes: hierarchyCount,
    sprints: state.sprints.length,
    team: state.team.length,
    clients: state.clients.length,
  }

  function resetAllData() {
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'other',
      timestamp: new Date().toISOString(),
      author: userName,
      detail: 'Toutes les données ont été réinitialisées (comptes utilisateurs et réglages conservés)',
    }
    const newState: CadenceState = {
      ...state,
      sprints: [],
      items: [],
      hierarchyNodes: [],
      itemKeyCounters: {},
      team: [],
      clients: [],
      clientGroups: [],
      dailyEntries: [],
      dailyArchives: [],
      retroSessions: [],
      retroArchives: [],
      sprintReviewSessions: [],
      sprintReviewArchives: [],
      roadmap: [],
      absences: [],
      visionBoard: { productName: '', vision: '', targetGroup: '', needs: '', product: '', businessGoals: '' },
      nnlItems: [],
      nnlShapes: [],
      nnlTexts: [],
      nnlStrokes: [],
      nnlLayers: [],
      nnlFrames: [],
      history: [historyEntry],
    }
    dispatch({ type: 'SET_STATE', payload: newState })
    saveToServer(newState)
    setResetAllOpen(false)
    showToast('Toutes les données ont été réinitialisées.')
  }

  return (
    <>
      <Header title="Reglages">
        <button className="hdr-ctx-btn" onClick={() => navigate('/changelog')}>Changelog</button>
        <div style={{ flex: 1 }} />
        {saved && <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✓ Enregistre</span>}
        <button className="hdr-btn primary" onClick={save}>Enregistrer</button>
      </Header>

      <div className="page-content" style={{ maxWidth: 700 }}>

        {/* Sprint settings */}
        <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>Configuration des sprints</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Durée du sprint (semaines)</label>
              <input className="form-input" type="number" min={1} max={8} value={settings.sprintDuration}
                onChange={e => setSettings(s => ({ ...s, sprintDuration: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Capacite par defaut (SP/sprint)</label>
              <input className="form-input" type="number" min={1} max={500} value={settings.defaultCapacity}
                onChange={e => setSettings(s => ({ ...s, defaultCapacity: +e.target.value }))} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Date de debut du Sprint 1</label>
              <input type="date" className="form-input" value={sprint1Start}
                onChange={e => setSprint1Start(e.target.value)} />
              {(sprint1Start !== (state.sprints[0]?.startDate ?? '') || settings.sprintDuration !== state.settings.sprintDuration) && sprint1Start && (
                <span style={{ fontSize: 10, color: 'var(--warning, #f59e0b)', marginTop: 4, display: 'block' }}>
                  Les dates de tous les sprints seront recalculees a l'enregistrement.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Theme */}
        <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Apparence</h3>
          <div className="form-group">
            <label className="form-label">Theme</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['light', 'dark'] as const).map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: settings.theme === t ? 700 : 400 }}>
                  <input type="radio" name="theme" checked={settings.theme === t} onChange={() => {
                    setSettings(s => ({ ...s, theme: t }))
                    document.documentElement.setAttribute('data-theme', t)
                  }} />
                  {t === 'light' ? 'Clair' : 'Sombre'}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Kanban columns */}
        <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Colonnes Kanban</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Couleur et statut "Terminé" des colonnes existantes. L'ajout, la suppression et le réordonnancement des colonnes se font depuis la page Kanban.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cols.map((col, i) => (
              <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ColorPicker value={col.color} palette={STATUS_COLOR_PALETTE}
                  onChange={color => setCols(c => c.map((x, j) => j === i ? { ...x, color } : x))} />
                <span style={{ flex: 1, fontSize: 13 }}>{col.label}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input type="checkbox" checked={col.isDone}
                    onChange={e => setCols(c => c.map((x, j) => j === i ? { ...x, isDone: e.target.checked } : x))} />
                  Termine
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* Tags */}
        <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Tags</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            {isAdmin
              ? 'Les tags de base ne peuvent être retirés des suggestions que par le rôle Admin (un tag déjà utilisé sur un item n\'est pas affecté). Les tags personnalisés peuvent être supprimés par tous les utilisateurs.'
              : 'Les tags de base ne peuvent être retirés des suggestions que par le rôle Admin. Les tags personnalisés peuvent être supprimés par tous les utilisateurs.'}
          </p>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Tags de base</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {visibleBaseTags(state.removedBaseTags).map(tag => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)' }}>
                  {!isAdmin && <span style={{ fontSize: 10, opacity: .6 }}>🔒</span>}
                  {tag}
                  {isAdmin && (
                    <span
                      data-testid={`remove-base-tag-${tag}`}
                      title="Retirer ce tag des suggestions (rôle Admin)"
                      style={{ cursor: 'pointer', opacity: .6, marginLeft: 2, fontSize: 13, lineHeight: 1 }}
                      onClick={() => {
                        dispatch({ type: 'SET_REMOVED_BASE_TAGS', payload: [...(state.removedBaseTags ?? []), tag] })
                      }}
                    >×</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Tags personnalises</div>
            {(!state.customTags || state.customTags.length === 0) ? (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun tag personnalise pour l'instant. Ils apparaissent automatiquement quand vous en créez dans la modal d'item.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {state.customTags.map(tag => (
                  <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: 'var(--surface-alt)', color: 'var(--text)', border: '1px solid var(--border-strong)' }}>
                    {tag}
                    <span
                      title="Supprimer ce tag"
                      style={{ cursor: 'pointer', opacity: .6, marginLeft: 2, fontSize: 13, lineHeight: 1 }}
                      onClick={() => {
                        dispatch({ type: 'SET_CUSTOM_TAGS', payload: (state.customTags ?? []).filter(t => t !== tag) })
                      }}
                    >×</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Utilisateurs (Phase 2, sous-chantier 1) — reserve au role Admin */}
        {isAdmin && <UsersSettingsSection />}

        {/* Mode présentation (Phase 3) — réservé Admin + PO. Pages/ordre (chantier 2026-08-02)
            affichées avant le lien, pour lire la config avant de la partager. */}
        {canManagePresentation && <PresentationPagesSection />}
        {canManagePresentation && <PresentationLinkSection />}
        <ApiTokensSection />

        {/* Réinitialisation (préparation d'un jeu de démo propre, 2026-08-07, réservé Admin pour les
            2 resets ciblés). Section élargie à Admin + PO (2026-08-07, suite) pour accueillir le
            reset total ci-dessous, réservé PO en plus d'Admin (décision Julien) — les 2 resets
            ciblés restent chacun gatés `isAdmin` individuellement, périmètre inchangé. */}
        {(isAdmin || canManagePresentation) && (
          <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16, border: '1px solid var(--danger)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--danger)' }}>Réinitialisation</h3>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
              Actions destructrices et irréversibles, à utiliser pour repartir sur un jeu de données propre. Les sprints (dates, capacité, objectifs) ne sont jamais supprimés directement, seul leur contenu (items, Epics/Initiatives) l'est via la réinitialisation du Product Backlog.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {isAdmin && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button data-testid="btn-reset-backlog" className="hdr-ctx-btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={resetBacklog}>
                      Réinitialiser le Product Backlog
                    </button>
                    <span data-testid="reset-backlog-count" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {itemCount} item(s), {hierarchyCount} Epic(s)/Initiative(s)
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button data-testid="btn-reset-clients" className="hdr-ctx-btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', opacity: backlogEmpty ? 1 : .5, cursor: backlogEmpty ? 'pointer' : 'not-allowed' }}
                      disabled={!backlogEmpty} onClick={resetClients} title={backlogEmpty ? undefined : 'Réinitialisez d\'abord le Product Backlog : les items/Epics en cours référencent encore des clients.'}>
                      Réinitialiser les clients
                    </button>
                    <span data-testid="reset-clients-count" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {backlogEmpty
                        ? `${state.clients.length} client(s)`
                        : 'Disponible une fois le Product Backlog vide'}
                    </span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button data-testid="btn-reset-all" className="hdr-ctx-btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontWeight: 700 }}
                  onClick={() => setResetAllOpen(true)}>
                  Réinitialiser toutes les données
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Comptes utilisateurs et réglages conservés
                </span>
              </div>
            </div>
          </section>
        )}

        <ResetAllDataModal
          open={resetAllOpen}
          counts={resetAllCounts}
          onCancel={() => setResetAllOpen(false)}
          onConfirm={resetAllData}
        />

        {/* Import / Export */}
        <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Import / Export</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Le fichier JSON contient tout l'etat du projet (sprints, items, equipe, clients, historique). Utilisez-le pour migrer ou faire une sauvegarde manuelle.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="hdr-ctx-btn" onClick={exportJSON}>Exporter JSON</button>
            <label className="hdr-ctx-btn" style={{ cursor: 'pointer' }}>
              Importer JSON
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={importJSON} />
            </label>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '16px 0' }}>
            L'export/import Excel couvre le Product Backlog (items) et les Epics/Initiatives, sur deux feuilles distinctes, lisibles et modifiables dans un tableur : le fichier exporté sert lui-même de modèle pour le réimport. Une ligne dont la Clé correspond à un élément existant le met à jour, sinon un nouvel élément est créé. À l'import, une fenêtre permet de faire correspondre les colonnes du fichier aux champs Cadence avant validation.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="hdr-ctx-btn" data-testid="btn-export-excel" onClick={exportExcel}>Exporter Excel (Backlog)</button>
            <label className="hdr-ctx-btn" style={{ cursor: 'pointer' }}>
              Importer Excel (Backlog)
              <input type="file" accept=".xlsx" data-testid="input-import-excel" style={{ display: 'none' }} onChange={importExcel} />
            </label>
          </div>
        </section>

        {importSheets && (
          <ImportExcelMappingModal
            sheets={importSheets}
            onCancel={() => setImportSheets(null)}
            onConfirm={confirmExcelImport}
          />
        )}

      </div>
    </>
  )
}
