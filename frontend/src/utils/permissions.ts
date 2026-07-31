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

// Backlog : le PO (+ Admin) a un accès complet — création/suppression d'items, Epics et
// Initiatives, et tous les champs de la fiche (contenu produit : description, User Story,
// critères, priorité/scoring, epic/client, tags, DoR...). Le Scrum Master reste en lecture
// seule sur cette page — la matrice de rôles d'origine (BACKLOG_FEATURES.md) ne mentionne que
// PO et Dev en écriture, confirmé avec Julien le 2026-07-31 (même statut que Stakeholder ici).
export const canManageBacklog = (role: UserRole | '' | undefined) => hasRole(role, 'PO')

// Backlog : sous-ensemble opérationnel ouvert au Dev (+ PO/Admin, qui l'ont de toute façon via
// canManageBacklog ci-dessus) — statut, SP, notes/commentaires, DoD, dépendances. Ce sont les
// champs qu'un Dev renseigne en travaillant l'item, sans toucher au contenu produit qui reste
// la responsabilité du PO. Choix acté avec Julien le 2026-07-31 (DoR exclu : c'est une
// préparation en amont, pas un champ qu'un Dev remplit pendant le développement).
export const canEditBacklogOperational = (role: UserRole | '' | undefined) => hasRole(role, 'PO', 'DEV')

// Backlog : auto-assignation — un Dev peut s'ajouter/se retirer lui-même des assignés d'un item
// (le compte Dev lié à ce membre, TeamMember.linkedUserId — même mécanisme que
// canEditDailyCard), mais ne peut pas gérer les assignations des autres membres. PO/Admin
// gèrent tous les assignés sans restriction.
export function canToggleBacklogAssignee(
  role: UserRole | '' | undefined,
  userId: string | undefined,
  member: Pick<TeamMember, 'linkedUserId'>
): boolean {
  if (role === 'ADMIN' || role === 'PO') return true
  if (role !== 'DEV' || !userId) return false
  return !!member.linkedUserId && member.linkedUserId === userId
}
