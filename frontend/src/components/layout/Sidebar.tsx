import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useCadence } from '../../context/StateContext'
import { canAccessRoute } from '../../utils/permissions'
import { CadenceMark } from '../ui/CadenceMark'

/* ── SVG icons (Lucide, stroke="currentColor") ── */
const ICONS: Record<string, string> = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  historique: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  backlog: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  planning: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  auto: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  kanban: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/>',
  'sprint-planning': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  daily: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  retro: '<path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>',
  'sprint-review': '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect width="6" height="4" x="9" y="3" rx="1"/><path d="m9 14 2 2 4-4"/>',
  clients: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  roadmap: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>',
  vision: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  collapse: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  expand: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>',
}

function Icon({ id, size = 16 }: { id: string; size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="nav-icon"
      dangerouslySetInnerHTML={{ __html: ICONS[id] ?? '' }}
    />
  )
}

const SECTIONS = [
  {
    label: "Vue d'ensemble",
    items: [
      { to: '/dashboard',  icon: 'dashboard',  label: 'Dashboard' },
      { to: '/historique', icon: 'historique', label: 'Historique' },
    ],
  },
  {
    label: 'Backlog & Vision',
    items: [
      { to: '/vision',   icon: 'vision',   label: 'Vision' },
      { to: '/backlog',  icon: 'backlog',  label: 'Product Backlog' },
      { to: '/roadmap',  icon: 'roadmap',  label: 'Roadmap' },
    ],
  },
  {
    label: 'Planification',
    items: [
      { to: '/planning', icon: 'planning', label: 'Release Planning' },
      { to: '/auto',     icon: 'auto',     label: 'Auto-planning' },
    ],
  },
  {
    label: 'Sprint en cours',
    items: [
      { to: '/sprint-planning', icon: 'sprint-planning', label: 'Sprint Planning' },
      { to: '/kanban', icon: 'kanban', label: 'Kanban' },
      { to: '/daily',  icon: 'daily',  label: 'Daily Standup' },
    ],
  },
  {
    label: 'Fin de Sprint',
    items: [
      { to: '/sprint-review', icon: 'sprint-review', label: 'Sprint Review' },
      { to: '/retro',         icon: 'retro',         label: 'Retrospective' },
    ],
  },
  {
    label: 'Referentiel',
    items: [
      { to: '/clients', icon: 'clients', label: 'Clients' },
      { to: '/team',    icon: 'team',    label: 'RH / Equipe' },
    ],
  },
]

export function Sidebar() {
  // Persisté en localStorage, pas `state.settings` (2026-08-07, bug remonté par Julien : la
  // sidebar repart dépliée à chaque refresh) — préférence d'écran propre à l'utilisateur/l'appareil,
  // pas un réglage de workspace partagé, même convention que le mode d'affichage de la modale
  // d'item (`modal-view`, ItemModal.tsx) ou l'orientation de la toolbar NNL (NNLToolbar.tsx).
  // `settings.sidebarCollapsedDefault` (Phase 6bis, sous-chantier 4, 2026-08-13) ne sert qu'à
  // amorcer ce localStorage : une fois une préférence explicite enregistrée (n'importe quel clic
  // sur le bouton replier/déplier), elle prend le dessus et le réglage de Workspace n'est plus
  // consulté, même logique que ci-dessus.
  const { state } = useCadence()
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    return stored !== null ? stored === 'true' : !!state.settings?.sidebarCollapsedDefault
  })
  const { userRole } = useAuth()

  // Reflète un changement en direct du réglage de Workspace (Réglages) tant qu'aucune préférence
  // personnelle explicite n'existe encore (retour Julien, 2026-08-14 : "je n'ai pas l'impression
  // que cela s'applique dans l'outil"), sans ça le réglage ne se voyait qu'au tout premier
  // montage de ce composant, jamais pendant une session de test en cours.
  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') !== null) return
    setCollapsed(!!state.settings?.sidebarCollapsedDefault)
  }, [state.settings?.sidebarCollapsedDefault])

  useEffect(() => {
    document.body.classList.toggle('sb-collapsed', collapsed)
    return () => { document.body.classList.remove('sb-collapsed') }
  }, [collapsed])

  // Écrire la préférence explicite seulement au clic (pas ici en effet keyé sur `collapsed`,
  // qui s'exécute aussi au tout premier montage) : sinon localStorage['sidebar-collapsed']
  // recevait une valeur dès le chargement de la page, avant même un clic utilisateur, ce qui
  // faisait passer l'effet de synchronisation ci-dessus en mode "préférence déjà explicite" et
  // bloquait le reflet en direct du réglage Workspace (bug constaté par Julien, 2026-08-16).
  // `next` calculé depuis la fermeture (pas dans le callback de `setCollapsed`) : même précaution
  // StrictMode qu'ailleurs dans ce projet (voir StateContext.tsx, SettingsPage.tsx).
  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  // Phase 2.5 (roadmap v1) — reflet de `canAccessRoute` (utils/permissions.ts) : masque les liens
  // vers les pages interdites au rôle courant (Stakeholder), plutôt que de laisser une entrée de
  // menu qui mènerait de toute façon à une redirection immédiate. Sections qui se retrouvent
  // vides une fois filtrées (aucune ici pour l'instant) ne sont pas rendues.
  const visibleSections = SECTIONS
    .map(section => ({ ...section, items: section.items.filter(item => canAccessRoute(userRole, item.to)) }))
    .filter(section => section.items.length > 0)

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Logo (Phase 6bis, sous-chantier 4, 2026-08-13 ; repli mis à jour le 2026-08-17, retour
          Julien : "le logo-icon, si aucun logo n'est chargé, soit le CadenceMark avec la couleur
          principale, juste le CadenceMark, pas de cadre ni de médaille") : logo d'équipe uploadé
          (Réglages) si présent, repli sur le CadenceMark seul (sans le cadre carré coloré de
          `.logo-icon`, neutralisé par `.logo-icon-mark`) sinon - remplace l'ancien repli sur les
          initiales "ACT". */}
      <div className="sidebar-header">
        <div className={`logo-icon${state.settings?.logoDataUrl ? '' : ' logo-icon-mark'}`}>
          {state.settings?.logoDataUrl
            ? <img src={state.settings.logoDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <CadenceMark color="var(--primary)" size={20} testId="sidebar-logo-mark" />}
        </div>
        {!collapsed && (
          <div>
            <div className="logo-text">Cadence</div>
            <div className="logo-sub">Agile Planning</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav" aria-label="Navigation principale">
        {visibleSections.map(section => (
          <div key={section.label}>
            {!collapsed && (
              <div className="sidebar-section-label">{section.label}</div>
            )}
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon id={item.icon} />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="sidebar-collapse-btn"
            data-testid="sidebar-collapse-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? 'Etendre' : 'Reduire'}
          >
            <Icon id={collapsed ? 'expand' : 'collapse'} />
          </button>
        </div>
      </div>
    </aside>
  )
}
