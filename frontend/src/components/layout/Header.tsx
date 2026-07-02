import { useState, useRef, useEffect } from 'react'
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
}

interface HeaderProps {
  title: string
  children?: ReactNode
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

export function Header({ title, children }: HeaderProps) {
  const { logout } = useAuth()
  const { state, dispatch, saveToServer } = useCadence()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
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

  /* Recent history for notif dropdown */
  const recent = (state.history ?? []).slice(0, 8)

  return (
    <header className="app-header">
      {/* Page title */}
      <div className="hdr-page-title">{title}</div>

      {/* Contextual zone */}
      <div className="hdr-ctx">{children}</div>

      {/* Search */}
      <button className="hdr-btn" title="Recherche (Ctrl+K)" aria-label="Recherche">
        <Svg d={SVG.search} />
      </button>

      {/* Notifications */}
      <div style={{ position: 'relative' }} ref={notifRef}>
        <button className="hdr-btn" title="Notifications & Activité récente"
          onClick={() => { setNotifOpen(o => !o); setProfileOpen(false) }}>
          <Svg d={SVG.bell} />
        </button>
        {notifOpen && (
          <div className="hdr-dropdown hdr-notif-panel">
            <div className="hdr-dropdown-tabs">
              <button className="hdr-dropdown-tab active">Activité récente</button>
            </div>
            <div className="hdr-dropdown-body">
              {recent.length === 0
                ? <div className="hdr-notif-empty">Aucune activité</div>
                : recent.map(h => (
                  <div key={h.id} className="hdr-activity-item">
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--primary)', marginRight: 4 }}>{h.itemKey}</span>
                    {h.detail ?? (h.from && h.to ? `${h.from} → ${h.to}` : '')}
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>

      <div className="hdr-sep" />

      {/* Undo / Redo (disabled) */}
      <button className="hdr-btn hdr-btn-border" title="Rien à annuler" disabled aria-label="Annuler">
        <Svg d={SVG.undo} />
      </button>
      <button className="hdr-btn hdr-btn-border" title="Rien à rétablir" disabled aria-label="Rétablir">
        <Svg d={SVG.redo} />
      </button>

      <div className="hdr-sep" />

      {/* Dark toggle */}
      <button className="hdr-btn" title={isDark ? 'Mode clair' : 'Mode sombre'}
        onClick={toggleTheme} aria-label="Basculer le mode sombre/clair">
        <Svg d={isDark ? SVG.sun : SVG.moon} />
      </button>

      {/* Settings shortcut */}
      <button className="hdr-btn" title="Réglages" onClick={() => navigate('/settings')}>
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
              <Svg d={SVG.editUser} size={13} /> Éditer le profil
            </button>
            <button className="hdr-profile-action" style={{ color: 'var(--text-muted)' }} onClick={handleLogout}>
              <Svg d={SVG.logout} size={13} /> Se déconnecter
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
