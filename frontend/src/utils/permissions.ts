import type { UserRole, TeamMember } from '../types'

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

// Daily : remplir sa propre carte (Hier/Aujourd'hui/Blocages) réservé au Dev concerné — décision
// actée avec Julien le 2026-07-31 : seul le compte Dev lié à ce membre (TeamMember.linkedUserId,
// assigné par un Admin depuis la page Team) peut éditer SA carte ; les autres rôles (SM, PO,
// Stakeholder) restent en lecture seule sur toutes les cartes, en attendant d'éventuels champs
// dédiés SM/PO (idée future, pas encore construite). Admin passe toujours, comme partout ailleurs.
export function canEditDailyCard(
  role: UserRole | '' | undefined,
  userId: string | undefined,
  member: Pick<TeamMember, 'linkedUserId'>
): boolean {
  if (role === 'ADMIN') return true
  if (role !== 'DEV' || !userId) return false
  return !!member.linkedUserId && member.linkedUserId === userId
}

// Rétrospective : exporter une archive (Markdown/PDF) réservé au Scrum Master (+ Admin) — copier
// et archiver restent ouverts à tous.
export const canExportRetro = (role: UserRole | '' | undefined) => hasRole(role, 'SCRUM_MASTER')

// Rétrospective : activer/désactiver le mode "votes anonymes" (masque le highlight "vous avez
// déjà voté" pour tout le monde, réglage de session) réservé au Scrum Master (+ Admin) — décision
// actée avec Julien le 2026-07-31.
export const canToggleRetroAnonymous = (role: UserRole | '' | undefined) => hasRole(role, 'SCRUM_MASTER')

// Auto-planning/What-if : les scénarios (velocité, capacités, critères, items fictifs, overrides)
// sont un brouillon personnel en localStorage, jamais partagé entre utilisateurs — donc sans risque
// à laisser explorer à PO/Scrum Master/Dev (+ Admin). Seul le Stakeholder reste en lecture seule
// (voit l'État actuel et les scénarios existants, sans pouvoir en créer ni les modifier) — décision
// actée avec Julien le 2026-07-31 : l'outil aide à argumenter en sprint planning, donc ouvert par
// défaut plutôt que masqué.
export const canExploreWhatIf = (role: UserRole | '' | undefined) => hasRole(role, 'PO', 'SCRUM_MASTER', 'DEV')

// Auto-planning/What-if : "Appliquer" est la seule action qui écrit réellement dans le planning
// partagé (déplace des items dans des sprints réels) — réservé au PO (+ Admin), contrairement au
// reste de la page qui est un bac à sable local sans impact.
export const canApplyScenario = (role: UserRole | '' | undefined) => hasRole(role, 'PO')
