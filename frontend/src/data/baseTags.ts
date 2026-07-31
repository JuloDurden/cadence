/** Tags prédéfinis — suppression des suggestions réservée au rôle Admin (voir visibleBaseTags) */
export const BASE_TAGS: string[] = [
  'Sécurité', 'Performance', 'UX', 'API', 'Mobile', 'Backend', 'Frontend',
  'Base de données', 'Infrastructure', 'CI/CD', 'Tests', 'Documentation',
  'Accessibilité', 'Conformité', 'Refactoring', 'Migration', 'Intégration',
  'Notification', 'Export', 'Import',
]

// Phase 2 (roadmap v1), sous-chantier 2 : un Admin peut retirer un tag de base des suggestions
// (`state.removedBaseTags`) — ne supprime pas le tag des items qui l'ont déjà, même logique que
// la suppression d'un tag personnalisé (SET_CUSTOM_TAGS). Utiliser cette fonction partout où
// BASE_TAGS servait jusqu'ici de liste de suggestion (Réglages, ItemModal, TeamPage), plutôt que
// BASE_TAGS directement, pour que le retrait soit bien reflété partout.
export function visibleBaseTags(removedBaseTags?: string[]): string[] {
  if (!removedBaseTags || removedBaseTags.length === 0) return BASE_TAGS
  return BASE_TAGS.filter(tag => !removedBaseTags.includes(tag))
}
