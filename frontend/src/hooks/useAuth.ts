import { useState } from 'react'
import type { AuthUser, UserRole } from '../types'
import { useAuthOverride } from '../context/AuthOverrideContext'

const TOKEN_KEY     = 'cadence_token'
const USER_KEY       = 'cadence_user'
const USER_ID_KEY   = 'cadence_user_id'
const USER_ROLE_KEY = 'cadence_user_role'
// Démo publique v1 (2026-09-09) : voir backend/prisma/schema.prisma (`User.isDemo`).
const USER_IS_DEMO_KEY = 'cadence_user_is_demo'

export function useAuth() {
  const [token, setToken]       = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [userName, setUserName] = useState<string>(() => localStorage.getItem(USER_KEY) ?? 'Admin')
  // Id/role du compte réellement connecté (backend `User`, distinct d'un `TeamMember` de RH/Équipe —
  // voir Chantier J, docs/corrections.md). Déjà renvoyés par /api/auth/login mais jetés jusqu'ici.
  const [userId, setUserId]     = useState<string>(() => localStorage.getItem(USER_ID_KEY) ?? '')
  const [userRole, setUserRole] = useState<UserRole | ''>(() => (localStorage.getItem(USER_ROLE_KEY) as UserRole | null) ?? '')
  const [isDemo, setIsDemo]     = useState<boolean>(() => localStorage.getItem(USER_IS_DEMO_KEY) === 'true')

  // Phase 3 (roadmap v1), Mode présentation — un visiteur du lien public (PresentationPublicPage.tsx)
  // n'a pas de compte du tout : `AuthOverrideProvider` lui impose une identité "invité" en lecture
  // seule (voir AuthOverrideContext.tsx), consultée ici en priorité sur le localStorage réel. Les
  // hooks ci-dessus restent tous appelés dans le même ordre à chaque rendu (règle des Hooks) — seule
  // la valeur RENVOYÉE change selon la présence ou non d'une surcharge. `token: null` (pas un faux
  // token) : plusieurs endroits (ex. OnboardingContext.tsx) déclenchent des appels serveur dès que
  // `token` est vérité — un vrai `null` les désactive proprement plutôt que de déclencher des appels
  // voués à échouer (401) avec un jeton inventé.
  const override = useAuthOverride()
  if (override) {
    return {
      token: null, login: () => {}, logout: () => {},
      userName: override.userName, userId: '', userRole: override.userRole, isDemo: false,
    }
  }

  function login(jwt: string, user?: AuthUser) {
    localStorage.setItem(TOKEN_KEY, jwt)
    setToken(jwt)
    if (user) {
      localStorage.setItem(USER_KEY, user.name)
      localStorage.setItem(USER_ID_KEY, user.id)
      localStorage.setItem(USER_ROLE_KEY, user.role)
      localStorage.setItem(USER_IS_DEMO_KEY, user.isDemo ? 'true' : 'false')
      setUserName(user.name)
      setUserId(user.id)
      setUserRole(user.role)
      setIsDemo(!!user.isDemo)
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(USER_ID_KEY)
    localStorage.removeItem(USER_ROLE_KEY)
    localStorage.removeItem(USER_IS_DEMO_KEY)
    setToken(null)
    setUserName('Admin')
    setUserId('')
    setUserRole('')
    setIsDemo(false)
  }

  return { token, login, logout, userName, userId, userRole, isDemo }
}
