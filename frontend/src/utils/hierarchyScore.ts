import type { HierarchyNode, Item, KanbanCol } from '../types'
import { isItemDone } from './status'

/**
 * SP affiché pour un nœud de regroupement (Epic ou Initiative) — généralisation
 * (2026-07-28, Phase 1) de l'ancien `getEpicSP()` (utils/epicScore.ts, supprimé), qui ne
 * savait calculer que pour un Epic dont les enfants étaient des `Item`. Même règle,
 * applicable récursivement à un niveau de plus : soit un score attribué arbitrairement
 * au nœud lui-même (champ `sp` propre), soit la somme des SP de ses enfants — jamais les
 * deux additionnés. Un score arbitraire (`sp > 0`) prime sur la somme quand il est
 * renseigné ; sinon, la somme des enfants sert de valeur.
 *
 * Pour un Epic, les enfants sont des `Item` (stories/bugs/tasks/spikes) ; pour une
 * Initiative, les enfants sont des `HierarchyNode` de niveau 'epic' — leur SP doit alors
 * déjà avoir été calculé récursivement via cette même fonction avant d'être sommé ici.
 *
 * Utilisé par PlanningEpicGroup.tsx (Release Planning, Swimlanes) et RoadmapPage.tsx.
 */
export function getHierarchyNodeSP(node: HierarchyNode | undefined, childrenSP: number[]): number {
  const sumChildren = childrenSP.reduce((acc, sp) => acc + sp, 0)
  const hasArbitraryScore = !!node && (node.sp ?? 0) > 0
  return hasArbitraryScore ? node!.sp! : sumChildren
}

/** Raccourci pour le cas le plus courant : un Epic dont les enfants sont des `Item`. */
export function getEpicSP(epic: HierarchyNode | undefined, stories: Item[]): number {
  return getHierarchyNodeSP(epic, stories.map(s => s.sp))
}

/**
 * SP total et SP terminés pour un sprint donné — widgets Dashboard (2026-08-06, retour Julien :
 * "les autres widgets... semblent prendre en compte seulement les items"). Un simple
 * `items.filter(i => i.sprintId === sprintId)` (VelocityChart.tsx, BurndownChart.tsx, et le calcul
 * de `currentDoneSP`/`currentTotalSP` dans DashboardPage.tsx avant ce correctif) ratait les Epics
 * assignés directement au sprint (`HierarchyNode.sprintId`, indépendant du sprint de leurs US) mais
 * pas encore découpés en US — même cas que celui corrigé dans ClientRAG.tsx (voir son commentaire
 * d'en-tête) et `cellEpics` dans SwimlanesView.tsx.
 *
 * Règle : chaque Epic assigné au sprint compte pour `getHierarchyNodeSP()` (son SP arbitraire s'il
 * est renseigné, sinon la somme de ses US dans ce sprint). Le "terminé" suit ses US s'il en a dans
 * ce sprint ; sinon son propre statut (`HierarchyNode.status`, résolu comme un Item via
 * `kanbanCols`) détermine s'il compte comme terminé. Les US qui ne sont rattachées à aucun Epic
 * assigné à ce sprint comptent individuellement (qu'elles aient ou non un `epicId` — Epic assigné à
 * un autre sprint, ou aucun). Les Initiatives n'ont pas de champ `sprintId` propre (couvrent
 * plusieurs sprints par nature, voir HierarchyNodeModal.tsx) : rien à leur niveau ici, leur travail
 * n'entre que via leurs Epics/US, déjà comptés.
 */
export interface SprintSP { total: number; done: number }

export function getSprintSP(
  sprintId: string,
  items: Item[],
  hierarchyNodes: HierarchyNode[],
  kanbanCols: KanbanCol[],
): SprintSP {
  const sprintItems = items.filter(i => i.sprintId === sprintId)
  const epicsInSprint = hierarchyNodes.filter(n => n.level === 'epic' && n.sprintId === sprintId)
  const epicIds = new Set(epicsInSprint.map(e => e.id))

  let total = 0
  let done = 0

  for (const epic of epicsInSprint) {
    const epicItems = sprintItems.filter(i => i.epicId === epic.id)
    const epicSP = getHierarchyNodeSP(epic, epicItems.map(i => i.sp))
    total += epicSP
    if (epicItems.length > 0) {
      done += epicItems.filter(i => isItemDone(i, kanbanCols)).reduce((s, i) => s + i.sp, 0)
    } else if (kanbanCols.some(c => c.isDone && c.id === epic.status)) {
      done += epicSP
    }
  }

  const directItems = sprintItems.filter(i => !i.epicId || !epicIds.has(i.epicId))
  total += directItems.reduce((s, i) => s + i.sp, 0)
  done += directItems.filter(i => isItemDone(i, kanbanCols)).reduce((s, i) => s + i.sp, 0)

  return { total, done }
}

/* ─── Regroupement par Epic (Phase 1, sous-chantier 2 — redone 2026-07-29) ──────────
 * Avant ce sous-chantier, chaque page reconstruisait sa propre Map<epicId, Item[]> à la
 * main (SprintColumn.tsx, SwimlanesView.tsx, PlanningPage.tsx, AutoPlanningPage.tsx,
 * RoadmapPage.tsx, BacklogPage.tsx), avec le même risque de divergence qui avait déjà causé
 * le bug de calcul de SP corrigé plus tôt dans le projet. Décision utilisateur (2026-07-28)
 * après une maquette comparative : on unifie uniquement la LOGIQUE de calcul ici, pas le
 * rendu visuel — chaque page garde son propre JSX (voir feedback_roadmap_no_unified_visual
 * en mémoire : la Roadmap reste volontairement compacte, différente du style carte de
 * Release Planning).
 *
 * Complément du 2026-07-29 (retour Julien après le premier essai de ce sous-chantier) : un
 * Epic sans aucun item mais avec un SP fixé et un sprint assigné doit quand même apparaître
 * comme une carte et compter dans la capacité du sprint en Release Planning — comme avant la
 * Phase 1, quand un Epic était un Item comme un autre. `attachItemsToEpics()` (épics-first,
 * scope fourni par l'appelant) gère nativement ce cas — voir sa JSDoc plus bas — et est donc
 * la fonction à utiliser partout où un Epic a un "scope" stable (un sprint, un client) plutôt
 * que `groupItemsByEpic()` (items-first), qui n'affiche jamais un Epic sans au moins un item.
 */

export interface EpicGroup<T> {
  epicId: string
  epic: HierarchyNode
  items: T[]
}

/**
 * Regroupe une liste d'items (scope déjà limité par l'appelant : un sprint, une cellule
 * Swimlanes, une sélection...) par leur `epicId`, à partir de la liste complète des
 * HierarchyNode. Un Epic n'apparaît que s'il a au moins un item correspondant dans la
 * liste fournie ; l'ordre des groupes suit l'ordre de première apparition dans `items`.
 * Les items sans epicId (ou dont l'Epic n'existe plus/a été supprimé) sont retournés à
 * part dans `orphans`, dans leur ordre d'origine.
 *
 * `getEpicId` est optionnel (par défaut : lit `item.epicId`) — nécessaire pour
 * AutoPlanningPage.tsx, qui mélange des `Item` et des `VirtualItem` (ce dernier n'a pas
 * de champ `epicId` du tout, jamais rattaché à un Epic) dans une même liste : passer un
 * extracteur explicite évite d'imposer un `epicId` optionnel à tous les types consommateurs.
 *
 * N'affiche jamais un Epic sans item (voir `attachItemsToEpics()` sinon) — adapté aux scopes
 * qui n'ont pas de notion stable d'"Epics qui devraient être là" (ex: un slot de scénario
 * what-if, généré algorithmiquement). Utilisé par AutoPlanningPage.tsx.
 */
export function groupItemsByEpic<T>(
  items: T[],
  hierarchyNodes: HierarchyNode[],
  getEpicId: (item: T) => string | null | undefined = (item) => (item as { epicId?: string | null }).epicId,
): { groups: EpicGroup<T>[]; orphans: T[] } {
  const epicById = new Map(hierarchyNodes.filter(n => n.level === 'epic').map(n => [n.id, n]))
  const byEpicId = new Map<string, T[]>()
  const order: string[] = []
  const orphans: T[] = []
  for (const item of items) {
    const eid = getEpicId(item)
    const epic = eid ? epicById.get(eid) : undefined
    if (!epic) { orphans.push(item); continue }
    if (!byEpicId.has(epic.id)) { byEpicId.set(epic.id, []); order.push(epic.id) }
    byEpicId.get(epic.id)!.push(item)
  }
  return { groups: order.map(id => ({ epicId: id, epic: epicById.get(id)!, items: byEpicId.get(id)! })), orphans }
}

/**
 * Sens inverse de `groupItemsByEpic()` : à partir d'un ensemble d'Epics déjà filtré par
 * l'appelant (ex. par `sprintId`, par client), retrouve les items qui leur sont rattachés
 * parmi `items` — un Epic peut apparaître ici même sans aucun item correspondant (ex. un
 * Epic assigné à un sprint mais pas encore découpé en US, ou dont toutes les US sont
 * ailleurs). C'est la fonction à utiliser partout où un Epic vide doit quand même s'afficher
 * et compter dans un total (SP d'un sprint, d'un client...). Les items dont l'epicId ne
 * correspond à aucun des Epics fournis sont retournés à part dans `orphans`.
 *
 * Utilisé par RoadmapPage.tsx (Epics scopés par sprint), BacklogPage.tsx (mode "Grouper par
 * Epic", tous les Epics), PlanningPage.tsx (panneau non-assigné, Epics sans sprint),
 * SprintColumn.tsx et SwimlanesView.tsx (Epics scopés par sprint, complément du 2026-07-29).
 */
export function attachItemsToEpics<T extends { epicId?: string | null }>(
  epics: HierarchyNode[],
  items: T[],
): { groups: EpicGroup<T>[]; orphans: T[] } {
  const epicIds = new Set(epics.map(e => e.id))
  const groups = epics.map(epic => ({ epicId: epic.id, epic, items: items.filter(i => i.epicId === epic.id) }))
  const orphans = items.filter(i => !i.epicId || !epicIds.has(i.epicId))
  return { groups, orphans }
}

/* ─── Niveau Initiative (Phase 1, sous-chantier 4 — redémarré 2026-07-29) ───────────────
 * `Item.epicId` (nom conservé) pointe vers n'importe quel HierarchyNode : un Epic comme
 * avant, ou directement une Initiative — "comme un regroupement par plusieurs Sprints"
 * (Julien). Une Initiative a donc deux types d'enfants : des Epics (via `Epic.parentId`)
 * et des items rattachés directement à elle (via `item.epicId === initiative.id`, sans
 * passer par un Epic).
 */

export interface InitiativeSection<T> {
  initiativeId: string | null   // null = section "Sans Initiative"
  initiative: HierarchyNode | null
  epics: EpicGroup<T>[]         // Epics rattachés (ou, pour null, Epics sans Initiative)
  directItems: T[]              // items rattachés directement à l'Initiative (jamais pour null)
}

/**
 * Construit les sections d'affichage du mode "Grouper par Initiative" : une section par
 * Initiative connue (ses Epics enfants via `attachItemsToEpics()`, ses items directs), plus
 * une section finale `initiativeId: null` ("Sans Initiative") regroupant les Epics sans
 * parent (ou parent supprimé) et les items vraiment orphelins (epicId absent, ou ne
 * correspondant à aucun Epic ni Initiative connu — jamais un item déjà compté dans une
 * section ci-dessus).
 */
export function buildInitiativeSections<T extends { epicId?: string | null }>(
  items: T[],
  hierarchyNodes: HierarchyNode[],
): InitiativeSection<T>[] {
  const initiatives = hierarchyNodes.filter(n => n.level === 'initiative')
  const allEpics = hierarchyNodes.filter(n => n.level === 'epic')
  const initiativeIds = new Set(initiatives.map(i => i.id))
  const allEpicIds = new Set(allEpics.map(e => e.id))

  const sections: InitiativeSection<T>[] = initiatives.map(initiative => {
    const epicsHere = allEpics.filter(e => e.parentId === initiative.id)
    const { groups: epics } = attachItemsToEpics(epicsHere, items)
    const directItems = items.filter(i => i.epicId === initiative.id)
    return { initiativeId: initiative.id, initiative, epics, directItems }
  })

  const epicsWithoutInitiative = allEpics.filter(e => !e.parentId || !initiativeIds.has(e.parentId))
  const { groups: noInitEpics } = attachItemsToEpics(epicsWithoutInitiative, items)
  const trueOrphans = items.filter(i => !i.epicId || (!allEpicIds.has(i.epicId) && !initiativeIds.has(i.epicId)))
  sections.push({ initiativeId: null, initiative: null, epics: noInitEpics, directItems: trueOrphans })

  return sections
}

/* ─── Regroupement items-first, tous niveaux (Phase 1, sous-chantier 5 — 2026-07-29) ────
 * `buildInitiativeSections()` ci-dessus est epics-first (voir `attachItemsToEpics()`) : elle
 * affiche toujours toutes les Initiatives et tous les Epics connus, même sans item, adapté au
 * Backlog qui liste la hiérarchie elle-même. La section "Incrément livré" de la Sprint Review
 * a le même besoin que `groupItemsByEpic()` (scope déjà limité par l'appelant, un sprint livré
 * ici) mais sur 2 niveaux : jamais de card Epic/Initiative vide, seuls les groupes ayant au
 * moins un item (direct ou via un Epic enfant) apparaissent. Pas de fonction équivalente pour
 * 2 niveaux avant ce sous-chantier — ajoutée ici plutôt que dans SprintReviewPage.tsx pour
 * rester cohérent avec la centralisation de la logique de calcul (voir plus haut).
 */

export interface ItemsFirstInitiativeSection<T> {
  initiative: HierarchyNode
  epics: EpicGroup<T>[]   // seulement les Epics de cette Initiative ayant au moins un item ici
  directItems: T[]        // items rattachés directement à l'Initiative (jamais via un Epic)
}

export interface ItemsFirstHierarchy<T> {
  initiativeSections: ItemsFirstInitiativeSection<T>[]  // Initiatives avec au moins 1 item (direct ou via Epic), ordre de première apparition
  standaloneEpics: EpicGroup<T>[]                       // Epics sans Initiative (ou Initiative supprimée) ayant au moins 1 item, ordre de première apparition
  orphans: T[]                                          // items sans epicId, ou dont l'Epic/Initiative n'existe plus
}

/**
 * Version "2 niveaux" de `groupItemsByEpic()` : regroupe `items` (scope déjà limité par
 * l'appelant) par Epic puis Initiative, sans jamais afficher un groupe vide. Un item peut
 * être rattaché directement à une Initiative (`item.epicId === initiative.id`, sans Epic) —
 * voir `getItemInitiativeId()`. Premier usage : SprintReviewPage.tsx, section "Incrément
 * livré", regroupement par Epic/Initiative.
 */
export function buildItemsFirstHierarchy<T extends { epicId?: string | null }>(
  items: T[],
  hierarchyNodes: HierarchyNode[],
): ItemsFirstHierarchy<T> {
  const epicById = new Map(hierarchyNodes.filter(n => n.level === 'epic').map(n => [n.id, n]))
  const initiativeById = new Map(hierarchyNodes.filter(n => n.level === 'initiative').map(n => [n.id, n]))

  const itemsByEpicId = new Map<string, T[]>()
  const directItemsByInitiativeId = new Map<string, T[]>()
  const orphans: T[] = []

  for (const item of items) {
    const eid = item.epicId
    const epic = eid ? epicById.get(eid) : undefined
    const initiative = eid ? initiativeById.get(eid) : undefined
    if (epic) {
      if (!itemsByEpicId.has(epic.id)) itemsByEpicId.set(epic.id, [])
      itemsByEpicId.get(epic.id)!.push(item)
    } else if (initiative) {
      if (!directItemsByInitiativeId.has(initiative.id)) directItemsByInitiativeId.set(initiative.id, [])
      directItemsByInitiativeId.get(initiative.id)!.push(item)
    } else {
      orphans.push(item)
    }
  }

  // Ordre de première apparition (parcours de `items`), une seule fois par groupe.
  const initiativeOrder: string[] = []
  const standaloneEpicOrder: string[] = []
  const handledEpicIds = new Set<string>()
  for (const item of items) {
    const eid = item.epicId
    if (!eid) continue
    const epic = epicById.get(eid)
    if (epic) {
      const parentInitiative = epic.parentId ? initiativeById.get(epic.parentId) : undefined
      if (parentInitiative) {
        if (!initiativeOrder.includes(parentInitiative.id)) initiativeOrder.push(parentInitiative.id)
      } else if (!standaloneEpicOrder.includes(epic.id) && !handledEpicIds.has(epic.id)) {
        standaloneEpicOrder.push(epic.id)
      }
    } else if (initiativeById.has(eid) && !initiativeOrder.includes(eid)) {
      initiativeOrder.push(eid)
    }
  }

  const initiativeSections: ItemsFirstInitiativeSection<T>[] = initiativeOrder.map(initId => {
    const initiative = initiativeById.get(initId)!
    const epicsHere = [...epicById.values()]
      .filter(e => e.parentId === initId && itemsByEpicId.has(e.id))
    epicsHere.forEach(e => handledEpicIds.add(e.id))
    const epics = epicsHere.map(e => ({ epicId: e.id, epic: e, items: itemsByEpicId.get(e.id)! }))
    return { initiative, epics, directItems: directItemsByInitiativeId.get(initId) ?? [] }
  })

  const standaloneEpics: EpicGroup<T>[] = standaloneEpicOrder
    .filter(eid => !handledEpicIds.has(eid))
    .map(eid => ({ epicId: eid, epic: epicById.get(eid)!, items: itemsByEpicId.get(eid)! }))

  return { initiativeSections, standaloneEpics, orphans }
}

/**
 * Initiative effective d'un item : directe si `epicId` pointe vers une Initiative, transitive
 * via l'Epic parent sinon. `undefined` si l'item n'est rattaché à rien d'exploitable.
 * Utilisée par le filtre "Initiatives" du Backlog.
 */
export function getItemInitiativeId(
  item: { epicId?: string | null },
  hierarchyNodes: HierarchyNode[],
): string | undefined {
  if (!item.epicId) return undefined
  const node = hierarchyNodes.find(n => n.id === item.epicId)
  if (!node) return undefined
  if (node.level === 'initiative') return node.id
  if (node.level === 'epic' && node.parentId) return node.parentId
  return undefined
}
