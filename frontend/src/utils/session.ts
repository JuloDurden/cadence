/**
 * Archive puis réinitialise une session "courante" (Retrospective, Sprint Review) en
 * conservant systématiquement son id — ne jamais le régénérer lors du reset.
 *
 * Ces pages retrouvent leur session courante via `.find(s => s.sprintId === X)` et la
 * remplacent par un upsert basé sur l'id (`sessions.filter(s => s.id !== updated.id)`
 * puis ajout). Régénérer l'id au moment du reset casse ce remplacement : l'ancienne
 * session n'est jamais filtrée, elle reste dans le tableau en double avec la nouvelle
 * session vierge — c'est exactement le bug historique constaté sur la Sprint Review
 * (voir docs/corrections.md, Chantier F). `resetFields` exclut volontairement `id` au
 * niveau des types pour rendre cette erreur impossible à reproduire ailleurs.
 */
export function archiveAndReset<T extends { id: string }>(
  session: T,
  resetFields: Omit<Partial<T>, 'id'>,
): T {
  return { ...session, ...resetFields } as T
}
