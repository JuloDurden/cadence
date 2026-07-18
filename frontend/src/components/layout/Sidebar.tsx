import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'

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
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('sb-collapsed', collapsed)
    return () => { document.body.classList.remove('sb-collapsed') }
  }, [collapsed])

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-header">
        <div className="logo-icon">ACT</div>
        {!collapsed && (
          <div>
            <div className="logo-text">Cadence</div>
            <div className="logo-sub">Agile Planning</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav" aria-label="Navigation principale">
        {SECTIONS.map(section => (
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
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Etendre' : 'Reduire'}
          >
            <Icon id={collapsed ? 'expand' : 'collapse'} />
          </button>
        </div>
      </div>
    </aside>
  )
}
