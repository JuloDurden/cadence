import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { ColorPicker } from '../components/ui/ColorPicker'
import { STATUS_COLOR_PALETTE } from '../utils/kanbanStages'
import { BASE_TAGS } from '../data/baseTags'
import { cascadeSprintDates } from '../utils/dates'
import { computeSprintEndDate } from '../utils/sprintCapacity'
import type { KanbanCol, Settings } from '../types'

export function SettingsPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const navigate = useNavigate()
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
        alert('Import reussi !')
      } catch { alert('Fichier JSON invalide.') }
    }
    reader.readAsText(file)
    e.target.value = ''
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
            Les tags de base ne peuvent pas etre supprimes. Les tags personnalises peuvent etre supprimes par tous les utilisateurs.
          </p>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Tags de base</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {BASE_TAGS.map(tag => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)' }}>
                  <span style={{ fontSize: 10, opacity: .6 }}>🔒</span>
                  {tag}
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

        {/* Import / Export */}
        <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Import / Export</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Le fichier JSON contient tout l'etat du projet (sprints, items, equipe, clients, historique). Utilisez-le pour migrer ou faire une sauvegarde manuelle.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="hdr-ctx-btn" onClick={exportJSON}>Exporter JSON</button>
            <label className="hdr-ctx-btn" style={{ cursor: 'pointer' }}>
              Importer JSON
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={importJSON} />
            </label>
          </div>
        </section>

      </div>
    </>
  )
}
