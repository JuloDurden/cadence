import { ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

interface HeaderProps {
  title: string
  children?: ReactNode
}

export function Header({ title, children }: HeaderProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <header className="app-header">
      <span className="hdr-title">{title}</span>
      <div className="hdr-ctx">{children}</div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button className="hdr-btn" onClick={handleLogout} title="Se déconnecter">⎋ Déconnexion</button>
      </div>
    </header>
  )
}
