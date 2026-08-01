import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { UserRole } from '../types'

// Phase 3 (roadmap v1), Mode présentation — `useAuth()` (hooks/useAuth.ts) est un simple hook
// adossé à `localStorage`, pas un Context : impossible à surcharger pour un sous-arbre précis sans
// toucher chaque page qui l'appelle directement (Roadmap, Vision/NNL, Sprint Review...). Plutôt que
// de convertir tout `useAuth()` en Context (refactor large, risqué pour la suite de tests existante),
// ce petit contexte optionnel permet à un seul point (`PresentationPublicPage.tsx`) d'imposer une
// identité "invité" à tout ce qu'il englobe, que `useAuth()` consulte en plus du localStorage — voir
// hooks/useAuth.ts. Absent partout ailleurs dans l'app (aucun changement de comportement en dehors
// de la page de présentation publique).
interface AuthOverride {
  userRole: UserRole
  userName: string
}

const AuthOverrideContext = createContext<AuthOverride | null>(null)

export function AuthOverrideProvider({ value, children }: { value: AuthOverride; children: ReactNode }) {
  return <AuthOverrideContext.Provider value={value}>{children}</AuthOverrideContext.Provider>
}

export function useAuthOverride() {
  return useContext(AuthOverrideContext)
}
