import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import type { KanbanCol, Settings } from '../types'

function uid() { return Math.random().toString(36).slice(2, 9) }

export function SettingsPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const navigate = useNavigate()
  const [settings, setSettings] = useState<Settings>({ ...state.settings })
  const [cols, setCols] = useState<KanbanCol[]>([...state.kanbanCols])
  const [saved, setSaved] = useState(false)
  const [newColLabel, setNewColLabel] = useState('')

  function save() {
    dispatch({ type: 'UPDATE_SETTINGS', payload: settings })
    dispatch({ type: 'UPDATE_KANBAN_COLS', payload: cols })
    saveToServer({ ...state, settings, kanbanCols: cols })
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

  function addCol() {
    if (!newColLabel.trim()) return
    setCols(c => [...c, { id: uid(), label: newColLabel.trim(), color: '#6366f1', isDone: false }])
    setNewColLabel('')
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
              <label className="form-label">Duree du sprint (semaines)</label>
              <input className="form-input" type="number" min={1} max={8} value={settings.sprintDuration}
                onChange={e => setSettings(s => ({ ...s, sprintDuration: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Capacite par defaut (SP/sprint)</label>
              <input className="form-input" type="number" min={1} max={500} value={settings.defaultCapacity}
                onChange={e => setSettings(s => ({ ...s, defaultCapacity: +e.target.value }))} />
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
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Colonnes Kanban</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {cols.map((col, i) => (
              <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="color" value={col.color} style={{ width: 28, height: 28, borderRadius: 4, cursor: 'pointer', border: 'none' }}
                  onChange={e => setCols(c => c.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} />
                <input className="form-input" style={{ flex: 1 }} value={col.label}
                  onChange={e => setCols(c => c.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input type="checkbox" checked={col.isDone}
                    onChange={e => setCols(c => c.map((x, j) => j === i ? { ...x, isDone: e.target.checked } : x))} />
                  Termine
                </label>
                <button className="btn-icon danger" onClick={() => setCols(c => c.filter((_, j) => j !== i))} disabled={cols.length <= 1}>X</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" style={{ flex: 1 }} value={newColLabel} placeholder="Nouvelle colonne..."
              onChange={e => setNewColLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCol()} />
            <button className="hdr-ctx-btn" onClick={addCol}>+ Ajouter</button>
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
