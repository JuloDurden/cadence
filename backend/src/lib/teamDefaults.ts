import type { Role } from '@prisma/client'

// Phase 2.5 (roadmap v1) — Onboarding. Duplique volontairement `posteHasNoVelocity`/
// `defaultPosteForRole` (frontend/src/utils/permissions.ts) côté backend : les routes
// signup/accept-invite (routes/auth.ts) créent la fiche Équipe liée directement dans
// `WorkspaceState.data.team`, côté serveur — `LoginPage.tsx` n'est pas monté sous `StateProvider`
// côté client (voir App.tsx), contrairement à `UsersSettingsSection.tsx` qui fait cette création
// côté client pour les comptes créés par un Admin (POST /api/users, inchangé). Pas de package
// partagé frontend/backend dans ce prototype — à garder manuellement synchronisé si l'une des
// deux règles change.
export function defaultPosteForRole(role: Role): string {
  switch (role) {
    case 'PO': return 'Product Owner'
    case 'SCRUM_MASTER': return 'Scrum Master'
    case 'DEV': return 'Dev Full-stack'
    default: return 'Autre'
  }
}

export function posteHasNoVelocity(poste: string): boolean {
  return poste === 'Product Owner' || poste === 'Scrum Master'
}
