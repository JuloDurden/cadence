import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/backlog', label: 'Backlog', icon: '📋' },
  { to: '/planning', label: 'Planning', icon: '🗓' },
  { to: '/kanban', label: 'Kanban', icon: '📌' },
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/daily', label: 'Daily', icon: '☀️' },
  { to: '/retro', label: 'Rétrospective', icon: '🔄' },
  { to: '/clients', label: 'Clients', icon: '👥' },
  { to: '/settings', label: 'Réglages', icon: '⚙️' },
]

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">Cadence</div>
      <nav className="sidebar-nav">
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
