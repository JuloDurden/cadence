import type { CadenceState, HierarchyLevel, HierarchyNode, Item, ItemType, JiraIssueSummary, Priority } from '../types'

/**
 * Import Jira (Phase 5, roadmap v1, 2026-08-08), décisions actées avec Julien (AskUserQuestion) :
 * connexion API directe (pas d'export CSV) et import RÉPÉTABLE, mis à jour par clé Jira plutôt que
 * dupliqué à chaque réimport. Modélisé sur `applyBacklogExcelImport` (excelBacklog.ts) mais matche
 * par `jiraKey` plutôt que par `key` : contrairement à l'export/réimport Excel (qui round-trippe le
 * même fichier Cadence, donc la même `key`), une issue Jira est une entité étrangère qui n'a jamais
 * de `key` Cadence avant son tout premier import, voir `Item.jiraKey`/`HierarchyNode.jiraKey`,
 * types/index.ts.
 *
 * Les issues de type "Epic" (ou "Initiative", si le schéma Jira du client en définit un) sont
 * importées comme `HierarchyNode`, tout le reste comme `Item`, le rattachement enfant vers Epic se fait
 * via `parentKey` (voir JiraIssueSummary, déjà résolu côté serveur qu'il vienne de `fields.parent`
 * ou du champ personnalisé Epic Link, `epicLinkFieldId`). Fonction pure, aucun effet de bord :
 * c'est l'appelant (section Réglages) qui persiste `newState` via `saveToServer`.
 */

function uid() { return Math.random().toString(36).slice(2, 10) }

// Statuts/priorités/types par défaut du schéma Jira Cloud sont en anglais, les libellés Cadence
// (`kanbanCols`, `EXTRA_STAGES`) en français et personnalisables par l'utilisateur : une
// correspondance EXACTE de libellé (comme pour l'import Excel, qui round-trippe le même fichier)
// ne suffit pas ici. Reconnaissance par mots-clés, IDs Kanban STABLES (voir utils/kanbanStages.ts)
// plutôt que par libellé affiché, testés dans l'ordre (le plus spécifique d'abord, ex. "highest"
// avant "high").
const STATUS_KEYWORDS: [RegExp, string][] = [
  [/block|bloqu/i, 'blocked'],
  [/cancel|annul/i, 'cancelled'],
  [/done|closed|resolved|termin/i, 'done'],
  [/review|r[ée]vision/i, 'review'],
  [/test/i, 'testing'],
  [/valid/i, 'validation'],
  [/wait|attente/i, 'waiting'],
  [/defer|ajourn/i, 'deferred'],
  [/backlog/i, 'backlog'],
  [/progress|cours|doing/i, 'doing'],
  [/to ?do|todo|faire|open|nouveau|new/i, 'todo'],
]

const PRIORITY_KEYWORDS: [RegExp, Priority][] = [
  [/highest|critique|bloquant/i, 'critical'],
  [/high|[ée]lev[ée]|haute/i, 'high'],
  [/medium|moyen/i, 'medium'],
  [/low|faible|basse/i, 'low'],
]

const TYPE_KEYWORDS: [RegExp, ItemType][] = [
  [/bug|anomalie/i, 'bug'],
  [/spike/i, 'spike'],
  [/story|r[ée]cit|user story/i, 'story'],
  [/task|t[âa]che|sub-?task/i, 'task'],
]

const LEVEL_KEYWORDS: [RegExp, HierarchyLevel][] = [
  [/initiative/i, 'initiative'],
  [/epic/i, 'epic'],
]

function isEpicLike(jiraType: string): boolean {
  return LEVEL_KEYWORDS.some(([re]) => re.test(jiraType))
}

function resolveStatus(jiraStatus: string, existing: string | undefined): string {
  const match = STATUS_KEYWORDS.find(([re]) => re.test(jiraStatus))
  return match?.[1] ?? existing ?? 'todo'
}

function resolvePriority(jiraPriority: string, existing: Priority | undefined): Priority {
  const match = PRIORITY_KEYWORDS.find(([re]) => re.test(jiraPriority))
  return match?.[1] ?? existing ?? 'medium'
}

function resolveType(jiraType: string, existing: ItemType | undefined): ItemType {
  const match = TYPE_KEYWORDS.find(([re]) => re.test(jiraType))
  return match?.[1] ?? existing ?? 'story'
}

function resolveLevel(jiraType: string, existing: HierarchyLevel | undefined): HierarchyLevel {
  const match = LEVEL_KEYWORDS.find(([re]) => re.test(jiraType))
  return match?.[1] ?? existing ?? 'epic'
}

/** Même logique que `nextKeyForPrefix` (excelBacklog.ts), dupliquée ici à l'identique, voir le
 *  commentaire de cette fonction pour le pourquoi (espace de numérotation partagé Item/HierarchyNode
 *  via `state.itemKeyCounters`). */
function nextKeyForPrefix(prefix: string, existingKeys: string[], counters: Record<string, number>): { key: string; nextCounters: Record<string, number> } {
  const usedNums = existingKeys
    .filter(k => k?.startsWith(`${prefix}-`))
    .map(k => parseInt(k.slice(prefix.length + 1), 10))
    .filter(n => !isNaN(n))
  const liveMax = usedNums.length > 0 ? Math.max(...usedNums) : 0
  const persisted = counters[prefix] ?? 0
  const nextNum = Math.max(liveMax, persisted) + 1
  return { key: `${prefix}-${String(nextNum).padStart(3, '0')}`, nextCounters: { ...counters, [prefix]: nextNum } }
}

export interface JiraImportResult {
  newState: CadenceState
  itemsAdded: number; itemsUpdated: number
  epicsAdded: number; epicsUpdated: number
}

/** Applique les issues Jira normalisées (déjà récupérées via POST /api/jira-config/import) au
 *  Backlog. `cadenceClientId` : Client Cadence auquel rattacher tout nouvel item/Epic (voir
 *  JiraConfig.cadenceClientId, obligatoire côté config depuis une question de Julien, 2026-08-08 :
 *  un import sans Client forcé rattachait silencieusement au 1er Client de la liste plutôt qu'à un
 *  vrai état "non rattaché"), n'écrase jamais le `clientId` d'un item déjà existant lors d'une mise
 *  à jour. Les Epics sont traités AVANT les items pour que `parentKey` résolve un Epic tout juste
 *  créé par le même import. */
export function applyJiraImport(state: CadenceState, issues: JiraIssueSummary[], cadenceClientId: string): JiraImportResult {
  let items = [...state.items]
  let nodes = [...state.hierarchyNodes]
  let counters = { ...(state.itemKeyCounters ?? {}) }
  let epicsAdded = 0, epicsUpdated = 0
  let itemsAdded = 0, itemsUpdated = 0

  const allKeys = () => [...items.map(i => i.key), ...nodes.map(n => n.key)]
  const client = state.clients.find(c => c.id === cadenceClientId)
  const prefix = client?.prefix ?? 'ITEM'

  const epicIssues = issues.filter(iss => isEpicLike(iss.type))
  const itemIssues = issues.filter(iss => !isEpicLike(iss.type))

  // ── Epics & Initiatives ────────────────────────────────────────────────
  for (const issue of epicIssues) {
    const existing = nodes.find(n => n.jiraKey === issue.key)
    const level = resolveLevel(issue.type, existing?.level)
    const status = resolveStatus(issue.status, existing?.status)

    if (existing) {
      nodes = nodes.map(n => n.id === existing.id ? { ...n, desc: issue.title, level, status, sp: issue.storyPoints ?? n.sp } : n)
      epicsUpdated++
    } else {
      const { key, nextCounters } = nextKeyForPrefix(prefix, allKeys(), counters)
      counters = nextCounters
      const newNode: HierarchyNode = {
        id: uid(), key, level, parentId: null, desc: issue.title,
        clientId: cadenceClientId, status, sp: issue.storyPoints ?? undefined,
        jiraKey: issue.key, createdAt: new Date().toISOString(),
      }
      nodes = [...nodes, newNode]
      epicsAdded++
    }
  }

  // ── Items ──────────────────────────────────────────────────────────────
  for (const issue of itemIssues) {
    const existing = items.find(i => i.jiraKey === issue.key)
    const type = resolveType(issue.type, existing?.type)
    const priority = resolvePriority(issue.priority, existing?.priority)
    const status = resolveStatus(issue.status, existing?.status)
    const epicMatch = issue.parentKey ? nodes.find(n => n.jiraKey === issue.parentKey) : undefined
    const epicId = epicMatch?.id ?? existing?.epicId ?? null
    const sp = issue.storyPoints ?? existing?.sp ?? 0
    const clientId = existing?.clientId ?? cadenceClientId

    if (existing) {
      items = items.map(i => i.id === existing.id ? { ...i, desc: issue.title, type, priority, status, epicId, sp } : i)
      itemsUpdated++
    } else {
      const { key, nextCounters } = nextKeyForPrefix(prefix, allKeys(), counters)
      counters = nextCounters
      const newItem: Item = {
        id: uid(), key, desc: issue.title, sp, status, clientId, sprintId: null, priority,
        assignees: [], tags: [], type, epicId, jiraKey: issue.key, createdAt: new Date().toISOString(),
      }
      items = [...items, newItem]
      itemsAdded++
    }
  }

  const newState: CadenceState = { ...state, items, hierarchyNodes: nodes, itemKeyCounters: counters }
  return { newState, itemsAdded, itemsUpdated, epicsAdded, epicsUpdated }
}
