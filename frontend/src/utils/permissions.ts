import type { UserRole } from '../types'

// Phase 2 (roadmap v1), sous-chantier 3 : permissions fines par page (Daily, Rétrospective,
// Auto-planning/What-if, Backlog — voir docs/roadmap-v1.md pour la matrice complète). Chaque
// permission passe par `hasRole()` plutôt qu'une comparaison directe à `userRole`, pour que la
// règle "Admin passe toujours" (actée avec Julien le 2026-07-31, avant de commencer ce
// sous-chantier) reste à un seul endroit — jamais réécrite page par page.
export function hasRole(userRole: UserRole | '' | undefined, ...allowed: UserRole[]): boolean {
  if (!userRole) return false
  if (userRole === 'ADMIN') return true
  return allowed.includes(userRole)
}

// Daily : archivage (créer une archive, en supprimer une) réservé au Scrum Master (+ Admin).
export const canArchiveDaily = (role: UserRole | '' | undefined) => hasRole(role, 'SCRUM_MASTER')
