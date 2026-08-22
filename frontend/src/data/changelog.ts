// Reforme du Changelog (2026-08-22, decision Julien) : l'historique (170 versions, 1400+ lignes)
// vivait jusqu'ici en dur dans ce fichier - editable uniquement en modifiant du code TypeScript et
// en redeployant, avec en plus une page qui devait tout charger d'un coup. Migre vers la table
// changelog_entries (backend/prisma/schema.prisma), servie par GET /api/changelog et alimentee par
// un nouvel outil de publication reserve Admin (POST /api/changelog, voir ChangelogPage.tsx) plutot
// que par ce fichier. L'ancien tableau CHANGELOG a ete fige dans backend/scripts/changelog-seed.json
// puis importe en base par backend/scripts/migrate-changelog.ts (voir docs/corrections.md) - ce
// fichier ne conserve plus que les types, partages entre l'appel API et le formulaire de publication.
export type ChangelogTag = 'feat' | 'fix' | 'ux' | 'refactor' | 'perf' | 'test' | 'info' | 'chore' | 'improve'

export interface ChangelogChange {
  tag: ChangelogTag
  text: string
}

export interface ChangelogVersion {
  version: string
  date: string
  dateISO?: string
  title: string
  current?: boolean
  changes: ChangelogChange[]
}
