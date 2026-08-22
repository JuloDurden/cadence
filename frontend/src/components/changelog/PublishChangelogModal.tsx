import { useState } from 'react'
import type { ChangelogChange, ChangelogTag, ChangelogVersion } from '../../data/changelog'
import { api } from '../../services/api'

// Réforme du Changelog (2026-08-22, décision Julien : "on peut utiliser une modale comme on l'a
// fait précédemment pour les items ou les sprints") - même chrome que ClientModal.tsx/HierarchyNodeModal.tsx
// (.modal-overlay/.modal/.modal-header/.modal-body/.modal-footer), même principe de liste répétable
// avec ajout/suppression que les contacts de ClientModal.tsx, adapté aux changements d'une version.
// Réservée Admin (voir ChangelogPage.tsx, bouton "Publier une version" masqué pour les autres rôles ;
// la route backend revérifie aussi le rôle, voir routes/changelog.ts - jamais une garantie uniquement
// côté UI).
const TAGS: { value: ChangelogTag; label: string }[] = [
  { value: 'feat', label: 'Feat' },
  { value: 'fix', label: 'Fix' },
  { value: 'ux', label: 'UX' },
  { value: 'improve', label: 'Improve' },
  { value: 'refactor', label: 'Refactor' },
  { value: 'perf', label: 'Perf' },
  { value: 'test', label: 'Test' },
  { value: 'chore', label: 'Chore' },
  { value: 'info', label: 'Info' },
]

function uid() { return Math.random().toString(36).slice(2, 9) }

function todayFr(): { date: string; dateISO: string } {
  const d = new Date()
  return {
    date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    dateISO: d.toISOString().slice(0, 10),
  }
}

interface DraftChange extends ChangelogChange { id: string }

interface Props {
  onPublished: (entry: ChangelogVersion) => void
  onClose: () => void
}

export function PublishChangelogModal({ onPublished, onClose }: Props) {
  const [version, setVersion] = useState('')
  const [title, setTitle] = useState('')
  const [changes, setChanges] = useState<DraftChange[]>([{ id: uid(), tag: 'feat', text: '' }])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function addChange() {
    setChanges(cs => [...cs, { id: uid(), tag: 'feat', text: '' }])
  }
  function updateChange(id: string, field: 'tag' | 'text', value: string) {
    setChanges(cs => cs.map(c => c.id === id ? { ...c, [field]: value } : c))
  }
  function removeChange(id: string) {
    setChanges(cs => cs.filter(c => c.id !== id))
  }

  function handlePublish() {
    const cleanVersion = version.trim()
    const cleanTitle = title.trim()
    const cleanChanges = changes.map(c => ({ tag: c.tag, text: c.text.trim() })).filter(c => c.text)

    if (!cleanVersion) return setError('La version est requise (ex. v0.98.21)')
    if (!cleanTitle) return setError('Le titre est requis')
    if (cleanChanges.length === 0) return setError('Au moins un changement est requis')
    setError('')

    setSaving(true)
    const { date, dateISO } = todayFr()
    api.publishChangelog({ version: cleanVersion, date, dateISO, title: cleanTitle, changes: cleanChanges })
      .then(({ entry }) => onPublished(entry))
      .catch(e => setError(e instanceof Error ? e.message.replace(/^API \d+: /, '') : 'Échec de la publication'))
      .finally(() => setSaving(false))
  }

  return (
    <div className="modal-overlay" data-testid="publish-changelog-modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Publier une version</h2>
          <button className="btn-icon" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label>Version</label>
              <input data-testid="publish-version-input" value={version} onChange={e => setVersion(e.target.value)} placeholder="v0.98.21" />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Titre</label>
              <input data-testid="publish-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de la version" />
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ marginBottom: 0 }}>Changements</label>
              <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={addChange}>+ Changement</button>
            </div>
            {changes.map(c => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 6, marginBottom: 6 }}>
                <select value={c.tag} onChange={e => updateChange(c.id, 'tag', e.target.value)} style={{ fontSize: 12 }}>
                  {TAGS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input
                  data-testid="publish-change-text-input"
                  value={c.text} onChange={e => updateChange(c.id, 'text', e.target.value)}
                  placeholder="Description du changement..." style={{ fontSize: 12 }}
                />
                <button className="btn-icon danger" aria-label="Retirer ce changement" onClick={() => removeChange(c.id)} disabled={changes.length === 1}>✕</button>
              </div>
            ))}
          </div>

          {error && <div style={{ fontSize: 12, color: 'var(--danger, #dc2626)', marginTop: 4 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" data-testid="publish-submit-btn" disabled={saving} onClick={handlePublish}>
            {saving ? 'Publication…' : 'Publier'}
          </button>
        </div>
      </div>
    </div>
  )
}
