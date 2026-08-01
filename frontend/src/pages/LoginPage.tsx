import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../types'

// Phase 2.5 (roadmap v1), Onboarding — rôles ouverts à l'auto-inscription libre (décision Julien,
// 2026-08-01) : la personne choisit son rôle parmi ces 3, jamais Admin (compte superviseur) ni
// Stakeholder (réservé à l'invitation, voir le mode 'invite' ci-dessous). Même liste que
// SIGNUP_ROLES côté backend (routes/auth.ts) — à garder synchronisée si elle change.
const SIGNUP_ROLES: { value: UserRole; label: string }[] = [
  { value: 'PO', label: 'Product Owner' },
  { value: 'SCRUM_MASTER', label: 'Scrum Master' },
  { value: 'DEV', label: 'Développeur' },
]

type Mode = 'login' | 'signup' | 'invite'

export function LoginPage() {
  const [searchParams] = useSearchParams()
  // Un lien d'invitation (généré par un Admin, voir UsersSettingsSection.tsx) pointe vers
  // /login?invite=TOKEN : mode dédié, exclusif — pas d'onglets Se connecter/Créer un compte tant
  // que ce paramètre est présent, le rôle Stakeholder est imposé, jamais un choix affiché.
  const inviteToken = searchParams.get('invite')
  const [mode, setMode] = useState<Mode>(inviteToken ? 'invite' : 'login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('DEV')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  // Seule page sans <Header> (voir Header.tsx pour les autres) : le titre
  // d'onglet doit donc être posé ici explicitement.
  useEffect(() => {
    document.title = 'Cadence - Connexion'
  }, [])

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const { token, user } = await api.login(email, password)
      login(token, user)
      navigate('/')
    } catch {
      setError('Email ou mot de passe incorrect.')
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { token, user } = await api.signup({ email, password, name, role })
      login(token, user)
      navigate('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg.includes('409') ? 'Un compte existe déjà avec cet email.' : 'Impossible de créer ce compte.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAcceptInvite(e: FormEvent) {
    e.preventDefault()
    if (!inviteToken) return
    setError(null)
    setSubmitting(true)
    try {
      const { token, user } = await api.acceptInvite({ token: inviteToken, email, password, name })
      login(token, user)
      navigate('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(
        msg.includes('410') ? 'Ce lien d\'invitation n\'est plus valide.' :
        msg.includes('409') ? 'Un compte existe déjà avec cet email.' :
        'Impossible de finaliser l\'inscription.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 340 }}>
        <h1 style={{ margin: 0 }}>Cadence</h1>

        {mode === 'invite' ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted, #666)' }}>
              Vous avez été invité(e) à rejoindre Cadence en tant que <strong>Stakeholder</strong>.
              Complétez votre inscription ci-dessous.
            </p>
            <form data-testid="invite-form" onSubmit={handleAcceptInvite} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input data-testid="invite-name" type="text" placeholder="Nom" value={name} onChange={e => setName(e.target.value)} required />
              <input data-testid="invite-email" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
              <input data-testid="invite-password" type="password" placeholder="Mot de passe (8 caractères min.)" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
              {error && <p data-testid="login-error" style={{ color: 'red', margin: 0 }}>{error}</p>}
              <button data-testid="invite-submit" type="submit" disabled={submitting}>Rejoindre Cadence</button>
            </form>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #ddd' }}>
              <button type="button" data-testid="tab-login"
                onClick={() => switchMode('login')}
                style={{ flex: 1, padding: '8px 0', fontWeight: mode === 'login' ? 700 : 400, background: 'none', border: 'none', borderBottom: mode === 'login' ? '2px solid #165FCC' : 'none', cursor: 'pointer' }}>
                Se connecter
              </button>
              <button type="button" data-testid="tab-signup"
                onClick={() => switchMode('signup')}
                style={{ flex: 1, padding: '8px 0', fontWeight: mode === 'signup' ? 700 : 400, background: 'none', border: 'none', borderBottom: mode === 'signup' ? '2px solid #165FCC' : 'none', cursor: 'pointer' }}>
                Créer un compte
              </button>
            </div>

            {mode === 'login' ? (
              <form data-testid="login-form" onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input data-testid="login-email" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                <input data-testid="login-password" type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} required />
                {error && <p data-testid="login-error" style={{ color: 'red', margin: 0 }}>{error}</p>}
                <button data-testid="login-submit" type="submit">Se connecter</button>
              </form>
            ) : (
              <form data-testid="signup-form" onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input data-testid="signup-name" type="text" placeholder="Nom" value={name} onChange={e => setName(e.target.value)} required />
                <input data-testid="signup-email" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                <input data-testid="signup-password" type="password" placeholder="Mot de passe (8 caractères min.)" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
                <select data-testid="signup-role" value={role} onChange={e => setRole(e.target.value as UserRole)}>
                  {SIGNUP_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {error && <p data-testid="login-error" style={{ color: 'red', margin: 0 }}>{error}</p>}
                <button data-testid="signup-submit" type="submit" disabled={submitting}>Créer mon compte</button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
