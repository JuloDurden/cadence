import { useState, useRef, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useCadence } from '../../context/StateContext'

/* ── Tiny inline SVG helper ─────────────────────────────────────── */
function Svg({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const SVG = {
  search:   '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bell:     '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  undo:     '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo:     '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5a5.5 5.5 0 0 0 5.5 5.5H13"/>',
  moon:     '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  editUser: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  logout:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  close:    '<path d="M18 6 6 18M6 6l12 12"/>',
}

interface HeaderProps {
  title: string
  children?: ReactNode
  hideUndoRedo?: boolean
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onClose])
}

/* ── Search modal ───────────────────────────────────────────────── */
function SearchModal({ onClose }: { onClose: () => void }) {
  const { state } = useCadence()
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [])

  const q = query.trim().toLowerCase()
  const results = q
    ? state.items.filter(it => {
        const client = state.clients.find(c => c.id === it.clientId)
        const noteTexts = Array.isArray(it.notes) ? it.notes.map(n => n.text ?? '') : []
        return [it.key ?? '', it.desc ?? '', ...noteTexts, ...(it.tags ?? []), client?.name ?? '']
          .some(f => typeof f === 'string' && f.toLowerCase().includes(q))
      }).slice(0, 20)
    : []

  function hl(text: string) {
    if (!q) return text
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return text.replace(new RegExp(`(${esc})`, 'gi'), '<mark style="background:#fef08a;border-radius:2px;padding:0 1px">$1</mark>')
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { /* TODO: open item detail */ onClose() }
    else if (e.key === 'Escape') onClose()
  }

  return (
    <div className="search-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="search-modal">
        <div className="search-input-wrap">
          <Svg d={SVG.search} size={15} />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Rechercher un item, une cle, une US, une note..."
            value={query}
            onChange={e => { setQuery(e.target.value); setIdx(0) }}
            onKeyDown={handleKey}
          />
          <button className="search-close-btn" onClick={onClose}><Svg d={SVG.close} size={13} /></button>
        </div>
        <div className="search-results">
          {!q && (
            <div className="search-empty">Tapez pour rechercher parmi les items, cles et notes.</div>
          )}
          {q && results.length === 0 && (
            <div className="search-empty">Aucun resultat pour "{query}"</div>
          )}
          {results.map((it, i) => {
            const client = state.clients.find(c => c.id === it.clientId)
            const sprint = state.sprints.find(s => s.id === it.sprintId)
            const spLabel = sprint ? `Sprint ${sprint.number}` : 'Non assigne'
            return (
              <div
                key={it.id}
                className={`search-result-item${i === idx ? ' active' : ''}`}
                onMouseEnter={() => setIdx(i)}
                onClick={onClose}
              >
                <span className="search-result-key" style={{ color: client?.color ?? 'var(--primary)', background: (client?.color ?? '#4f46e5') + '18' }}>
                  {it.key}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="search-result-desc" dangerouslySetInnerHTML={{ __html: hl(it.desc ?? '') }} />
                  <div className="search-result-sub">{spLabel}</div>
                </div>
                <span className="search-result-sp">{it.sp} SP</span>
              </div>
            )
          })}
        </div>
        <div className="search-footer">
          <span>↑↓ naviguer</span><span>↵ ouvrir</span><span>Esc fermer</span>
        </div>
      </div>
    </div>
  )
}

export function Header({ title, children, hideUndoRedo = false }: HeaderProps) {
  const { logout } = useAuth()
  const { state, dispatch, saveToServer, undo, redo, canUndo, canRedo } = useCadence()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useClickOutside(notifRef, () => setNotifOpen(false))
  useClickOutside(profileRef, () => setProfileOpen(false))

  const isDark = state.settings?.theme === 'dark'

  function toggleTheme() {
    const next = isDark ? 'light' : 'dark'
    dispatch({ type: 'UPDATE_SETTINGS', payload: { ...state.settings, theme: next } })
    saveToServer({ ...state, settings: { ...state.settings, theme: next } })
  }

  function handleLogout() {
    setProfileOpen(false)
    logout()
    navigate('/login')
  }

  const openSearch = useCallback(() => setSearchOpen(true), [])

  // Ctrl+K shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [openSearch])

  const recent = (state.history ?? []).slice(0, 8)

  // Titre d'onglet du navigateur : "Cadence - {titre de la page}", jamais juste
  // le nom du projet Vite par défaut. Toutes les pages sauf Login passent par ce
  // composant, donc un seul endroit à maintenir.
  useEffect(() => {
    document.title = `Cadence - ${title}`
  }, [title])

  return (
    <>
      <header className="app-header">
        <div className="hdr-page-title">{title}</div>
        <div className="hdr-ctx">{children}</div>

        {/* Search */}
        <button className="hdr-btn" title="Recherche (Ctrl+K)" aria-label="Recherche" onClick={openSearch}>
          <Svg d={SVG.search} />
        </button>

        {/* Notifications */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button className="hdr-btn" title="Notifications & Activite recente"
            onClick={() => { setNotifOpen(o => !o); setProfileOpen(false) }}>
            <Svg d={SVG.bell} />
          </button>
          {notifOpen && (
            <div className="hdr-dropdown hdr-notif-panel">
              <div className="hdr-dropdown-tabs">
                <button className="hdr-dropdown-tab active">Activite recente</button>
              </div>
              <div className="hdr-dropdown-body">
                {recent.length === 0
                  ? <div className="hdr-notif-empty">Aucune activite</div>
                  : recent.map(h => (
                    <div key={h.id} className="hdr-activity-item">
                      <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--primary)', marginRight: 4 }}>{h.itemKey}</span>
                      {h.detail ?? (h.from && h.to ? `${h.from} -> ${h.to}` : '')}
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>

        {/* Séparateur masqué si undo/redo masqué (évite double séparateur) */}
        {!hideUndoRedo && <div className="hdr-sep" />}

        {/* Undo / Redo — masqués sur la page NNL (gérés dans la toolbar NNL) */}
        {!hideUndoRedo && (
          <>
            <button className="hdr-btn hdr-btn-border" title={canUndo ? 'Annuler' : 'Rien à annuler'}
              disabled={!canUndo} onClick={undo} aria-label="Annuler">
              <Svg d={SVG.undo} />
            </button>
            <button className="hdr-btn hdr-btn-border" title={canRedo ? 'Rétablir' : 'Rien à rétablir'}
              disabled={!canRedo} onClick={redo} aria-label="Rétablir">
              <Svg d={SVG.redo} />
            </button>
          </>
        )}

        <div className="hdr-sep" />

        {/* Dark toggle */}
        <button className="hdr-btn" title={isDark ? 'Mode clair' : 'Mode sombre'}
          onClick={toggleTheme} aria-label="Basculer le mode sombre/clair">
          <Svg d={isDark ? SVG.sun : SVG.moon} />
        </button>

        {/* Settings shortcut */}
        <button className="hdr-btn" title="Reglages" onClick={() => navigate('/settings')}>
          <Svg d={SVG.settings} />
        </button>

        <div className="hdr-sep" />

        {/* Profile */}
        <div style={{ position: 'relative' }} ref={profileRef}>
          <button className="hdr-profile-btn" title="Mon profil"
            onClick={() => { setProfileOpen(o => !o); setNotifOpen(false) }}>
            A
          </button>
          {profileOpen && (
            <div className="hdr-dropdown hdr-profile-panel">
              <div className="hdr-profile-user">Admin</div>
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
              <button className="hdr-profile-action" onClick={() => { setProfileOpen(false); navigate('/team') }}>
                <Svg d={SVG.editUser} size={13} /> Editer le profil
              </button>
              <button className="hdr-profile-action" style={{ color: 'var(--text-muted)' }} onClick={handleLogout}>
                <Svg d={SVG.logout} size={13} /> Se deconnecter
              </button>
            </div>
          )}
        </div>
      </header>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </>
  )
}
