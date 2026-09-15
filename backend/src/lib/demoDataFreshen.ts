// Démo publique v1 (2026-09-15, retour Julien : "il me le faut maintenant") - le seed statique
// (demo-seed-data.json) fige les dates de sprint et ne contient aucune Daily depuis sa création
// (sous-chantier 2/5, 2026-09-09) : un sprint pensé "en cours" au moment de la capture finit, avec
// le temps, par apparaître comme clos depuis des mois (aucun sprint n'a `active: true` dans le
// seed, et `getCurrentSprint()`, frontend/src/utils/sprints.ts, retombe alors sur le premier
// `closed: false` par ordre de numéro, indépendamment de ses dates réelles), et le widget "Activité
// récente" reste vide en permanence (`dailyEntries` toujours à []). Ce module recalcule les deux À
// L'APPLICATION du seed (seedDemo.ts, resetDemoWorkspace dans demoReset.ts) plutôt qu'une fois pour
// toutes dans le JSON statique - le compte démo reste donc réaliste tant que le reset périodique
// tourne (toutes les 2h, voir SESSION_DURATION_MS dans demoReset.ts), sans qu'il faille revenir
// mettre à jour ce fichier à la main dans quelques semaines.
//
// Hypothèses propres à CE jeu de données (à revoir si son contenu change un jour - voir le retour
// Julien du 2026-09-11 sur une refonte plus large du dataset démo, pas traitée ici) : exactement 4
// sprints (s1..s4, 14 jours chacun, consécutifs), s1 toujours clos, s2 toujours le sprint "en
// cours" (celui qui porte la charge de travail assignée dans le seed, voir CURRENT_SPRINT_ENTRIES
// ci-dessous), s3/s4 toujours à venir.
//
// Frontière `any` volontaire ici (JSON importé + champ Prisma `Json`, tous deux non typés au sens
// strict) : seuls `sprints` et `dailyEntries`, les 2 champs réellement manipulés, sont typés
// localement ci-dessous.

interface DemoSprint {
  id: string
  number: number
  startDate: string
  endDate: string
  closed: boolean
  active?: boolean
  [key: string]: unknown
}

// Même forme que `DailyEntry` (frontend/src/types/index.ts) - dupliqué ici plutôt qu'importé : ce
// backend n'a pas accès au dossier frontend à l'exécution (même raison que demo-seed-data.json,
// voir seedDemo.ts).
interface DemoDailyEntry {
  memberId: string
  date: string
  yesterday: string
  today: string
  blockers: string
}

const SPRINT_LENGTH_DAYS = 14
// "Aujourd'hui" tombe au 6e jour du sprint en cours (ni tout juste commencé, ni sur le point de
// finir) - repère arbitraire choisi pour un rendu naturel, sans signification fonctionnelle propre.
const CURRENT_SPRINT_DAY_OFFSET = 5
const CURRENT_SPRINT_NUMBER = 2

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return toIsoDate(d)
}

/** Recalcule les 4 dates de sprint autour d'aujourd'hui, en conservant leur enchaînement (14 jours
 *  consécutifs chacun) et en posant `active`/`closed` cohérents avec `getCurrentSprint()`
 *  (`active` prioritaire sur le premier `closed: false`, voir utils/sprints.ts). */
function freshenSprints(sprints: DemoSprint[], todayIso: string): DemoSprint[] {
  const currentStart = addDays(todayIso, -CURRENT_SPRINT_DAY_OFFSET)
  return sprints
    .slice()
    .sort((a, b) => a.number - b.number)
    .map(s => {
      const startDate = addDays(currentStart, (s.number - CURRENT_SPRINT_NUMBER) * SPRINT_LENGTH_DAYS)
      const endDate = addDays(startDate, SPRINT_LENGTH_DAYS - 1)
      return {
        ...s,
        startDate,
        endDate,
        closed: s.number < CURRENT_SPRINT_NUMBER,
        active: s.number === CURRENT_SPRINT_NUMBER,
      }
    })
}

// Dailies "d'aujourd'hui" pour les 6 membres affectés au sprint en cours dans le seed (items i6,
// i10, i11, i24, i25 - voir demo-seed-data.json). Suffisant pour peupler les 4 fenêtres de
// "Activité récente" (2h/aujourd'hui/semaine/sprint, RecentActivityWindow) puisque toutes incluent
// le jour même, et pour que "Blocages actifs" (BlockersCard.tsx) remonte un vrai chiffre plutôt que
// 0 en permanence (voir l'entrée de m5 ci-dessous). Contenu narratif minimal et générique plutôt
// qu'un historique multi-jours fabriqué de toutes pièces - une vraie refonte du contenu du dataset
// reste un chantier séparé (retour Julien, 2026-09-11), pas traitée ici.
const CURRENT_SPRINT_ENTRIES: Omit<DemoDailyEntry, 'date'>[] = [
  { memberId: 'm1', yesterday: 'Avancé sur l\'intégration du modèle de prédiction dans le dashboard (FAX-024).', today: 'Finalise les tests d\'intégration et corrige les cas limites remontés en review.', blockers: '' },
  { memberId: 'm2', yesterday: 'Repris l\'analyse du lot 1 de bugs moyennement urgents (BUG-006) avec Henry.', today: 'Démarre le correctif du premier bug du lot, priorisé avec le PO.', blockers: '' },
  { memberId: 'm5', yesterday: 'Aidé au diagnostic des bugs du lot 1 (BUG-006), côté API.', today: 'Prépare le correctif du bug lié à la synchronisation des données socle.', blockers: 'En attente d\'un retour du client Socle pour confirmer un comportement attendu avant de corriger BUG-006.' },
  { memberId: 'm7', yesterday: 'Corrigé le bug non bloquant sur le module e-commerce (PME-011).', today: 'Attaque le bug important remonté sur le site PME, en lien avec Selina.', blockers: '' },
  { memberId: 'm9', yesterday: 'Testé l\'évolution mobile prévue dans le lot PME (PME-011).', today: 'Poursuit les corrections du lot PME avec June.', blockers: '' },
  { memberId: 'm10', yesterday: 'Finalisé les 3 correctifs urgents socle et réglementaire (SOC-010).', today: 'Passe l\'item en recette avec le PO avant clôture.', blockers: '' },
]

function freshenDailyEntries(todayIso: string): DemoDailyEntry[] {
  return CURRENT_SPRINT_ENTRIES.map(e => ({ ...e, date: todayIso }))
}

export function freshenDemoState(raw: any): any {
  const todayIso = toIsoDate(new Date())
  return {
    ...raw,
    sprints: freshenSprints(raw.sprints, todayIso),
    dailyEntries: freshenDailyEntries(todayIso),
  }
}
