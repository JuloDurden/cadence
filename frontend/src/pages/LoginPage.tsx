import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../types'
import { CADENCE_MARK_VIEWBOX, CADENCE_MARK_TRANSFORM, CADENCE_MARK_PATH } from '../assets/cadenceMark'

// Phase 2.5 (roadmap v1), Onboarding : rôles ouverts à l'auto-inscription libre (décision Julien,
// 2026-08-01) : la personne choisit son rôle parmi ces 3, jamais Admin (compte superviseur) ni
// Stakeholder (réservé à l'invitation, voir le mode 'invite' ci-dessous). Même liste que
// SIGNUP_ROLES côté backend (routes/auth.ts), à garder synchronisée si elle change.
const SIGNUP_ROLES: { value: UserRole; label: string }[] = [
  { value: 'PO', label: 'Product Owner' },
  { value: 'SCRUM_MASTER', label: 'Scrum Master' },
  { value: 'DEV', label: 'Développeur' },
]

type Mode = 'login' | 'signup' | 'invite'

// Refonte de l'écran de connexion (Phase 6bis, roadmap v1, 2026-08-17) : maquette validée avec
// Julien (concept "plein écran épuré", proche d'un écran de verrouillage macOS/Windows 11) avant
// tout code. Tracé (fourni par Julien) et viewBox recadré centralisés dans assets/cadenceMark.ts,
// réutilisés ici et par le favicon dynamique (StateContext.tsx).
const MARK_ASPECT = 1502 / 1254

function CadenceMark({ color, size, testId }: { color: string; size: number; testId?: string }) {
  return (
    <svg viewBox={CADENCE_MARK_VIEWBOX} width={size} height={size / MARK_ASPECT} aria-hidden="true" data-testid={testId}>
      <path d={CADENCE_MARK_PATH} fill={color} transform={CADENCE_MARK_TRANSFORM} />
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  height: 38, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)',
  color: 'var(--text)', padding: '0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box',
}
const buttonStyle: React.CSSProperties = {
  height: 38, borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4,
}
const errorStyle: React.CSSProperties = { color: 'var(--danger)', margin: 0, fontSize: 12 }

export function LoginPage() {
  const [searchParams] = useSearchParams()
  // Un lien d'invitation (généré par un Admin, voir UsersSettingsSection.tsx) pointe vers
  // /login?invite=TOKEN : mode dédié, exclusif, pas d'onglets Se connecter/Créer un compte tant
  // que ce paramètre est présent, le rôle Stakeholder est imposé, jamais un choix affiché.
  const inviteToken = searchParams.get('invite')
  const [mode, setMode] = useState<Mode>(inviteToken ? 'invite' : 'login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('DEV')
  // `poste`/`phone` (2026-08-01, retour Julien) : demandés à l'acceptation d'une invitation
  // Stakeholder. `poste` remplit `Contact.role` côté client (backend), `phone` est facultatif.
  const [poste, setPoste] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Vérification amont de la validité du lien (2026-08-01, retour Julien : un lien révoqué
  // restait affiché/remplissable, l'erreur n'apparaissait qu'à la soumission). Fail-open par
  // défaut (`false`) : ne masque le formulaire que sur une réponse explicite `{valid:false}`,
  // jamais sur une erreur réseau ou un backend non mocké (voir tests/signup-invite.spec.js, qui
  // ne mockent pas systématiquement cette route), pas de faux négatif qui bloquerait une vraie
  // invitation valide.
  const [inviteInvalid, setInviteInvalid] = useState(false)
  // Logo d'équipe (refonte du login, 2026-08-17) : repli sur `null` tant que la réponse n'est pas
  // arrivée ou si aucun logo n'a été chargé en Réglages, CadenceMark blanc affiché à la place
  // dans l'avatar, même logique de repli que la Sidebar (state.settings?.logoDataUrl). Cette page
  // est rendue hors StateProvider (voir App.tsx), d'où l'appel dédié à une route publique plutôt
  // qu'une lecture de `state.settings`.
  const [teamLogo, setTeamLogo] = useState<string | null>(null)
  const { login } = useAuth()
  const navigate = useNavigate()

  // Seule page sans <Header> (voir Header.tsx pour les autres) : le titre
  // d'onglet doit donc être posé ici explicitement.
  useEffect(() => {
    document.title = 'Cadence - Connexion'
  }, [])

  useEffect(() => {
    let cancelled = false
    api.getPublicBranding()
      .then(res => { if (!cancelled) setTeamLogo(res.logoDataUrl) })
      .catch(() => { /* pas grave, repli sur le logo Cadence dans l'avatar */ })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!inviteToken) return
    let cancelled = false
    api.checkInvite(inviteToken)
      .then(res => { if (!cancelled && res?.valid === false) setInviteInvalid(true) })
      .catch(() => { /* fail-open : réseau indisponible, on laisse le formulaire visible */ })
    return () => { cancelled = true }
  }, [inviteToken])

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
      const { token, user } = await api.acceptInvite({ token: inviteToken, email, password, name, poste, phone: phone || undefined })
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 300 }}>

        <div data-testid="login-avatar" style={{
          width: 72, height: 72, borderRadius: '50%', background: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 14,
        }}>
          {teamLogo
            ? <img data-testid="login-avatar-logo" src={teamLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <CadenceMark testId="login-avatar-mark" color="#fff" size={52} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
          {teamLogo && <CadenceMark testId="login-brand-mark" color="var(--primary)" size={16} />}
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Cadence</span>
        </div>

        {mode === 'invite' ? (
          inviteInvalid ? (
            <p data-testid="invite-invalid" style={{ ...errorStyle, marginTop: 16, textAlign: 'center' }}>
              Ce lien d'invitation n'est plus valide. Demandez à votre Admin de vous en renvoyer un.
            </p>
          ) : (
            <>
              <p style={{ margin: '4px 0 18px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                Vous avez été invité(e) à rejoindre Cadence en tant que <strong>Stakeholder</strong>.
                Complétez votre inscription ci-dessous.
              </p>
              <form data-testid="invite-form" onSubmit={handleAcceptInvite} style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
                <input data-testid="invite-name" style={inputStyle} type="text" placeholder="Nom" value={name} onChange={e => setName(e.target.value)} required />
                <input data-testid="invite-email" style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                <input data-testid="invite-poste" style={inputStyle} type="text" placeholder="Poste dans l'entreprise" value={poste} onChange={e => setPoste(e.target.value)} required />
                <input data-testid="invite-phone" style={inputStyle} type="tel" placeholder="Téléphone (facultatif)" value={phone} onChange={e => setPhone(e.target.value)} />
                <input data-testid="invite-password" style={inputStyle} type="password" placeholder="Mot de passe (8 caractères min.)" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
                {error && <p data-testid="login-error" style={errorStyle}>{error}</p>}
                <button data-testid="invite-submit" style={buttonStyle} type="submit" disabled={submitting}>Rejoindre Cadence</button>
              </form>
            </>
          )
        ) : (
          <>
            <p style={{ margin: '4px 0 18px', fontSize: 12, color: 'var(--text-muted)' }}>
              {mode === 'login' ? 'Connectez-vous à Cadence' : 'Créez votre compte'}
            </p>

            {mode === 'login' ? (
              <form data-testid="login-form" onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
                <input data-testid="login-email" style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                <input data-testid="login-password" style={inputStyle} type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} required />
                {error && <p data-testid="login-error" style={errorStyle}>{error}</p>}
                <button data-testid="login-submit" style={buttonStyle} type="submit">Se connecter</button>
              </form>
            ) : (
              <form data-testid="signup-form" onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
                <input data-testid="signup-name" style={inputStyle} type="text" placeholder="Nom" value={name} onChange={e => setName(e.target.value)} required />
                <input data-testid="signup-email" style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                <input data-testid="signup-password" style={inputStyle} type="password" placeholder="Mot de passe (8 caractères min.)" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
                <select data-testid="signup-role" style={inputStyle} value={role} onChange={e => setRole(e.target.value as UserRole)}>
                  {SIGNUP_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {error && <p data-testid="login-error" style={errorStyle}>{error}</p>}
                <button data-testid="signup-submit" style={buttonStyle} type="submit" disabled={submitting}>Créer mon compte</button>
              </form>
            )}

            <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {mode === 'login' ? (
                <>Pas de compte ? <button type="button" data-testid="tab-signup" onClick={() => switchMode('signup')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Créer un compte</button></>
              ) : (
                <>Déjà un compte ? <button type="button" data-testid="tab-login" onClick={() => switchMode('login')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Se connecter</button></>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
