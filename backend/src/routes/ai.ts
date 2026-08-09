import { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'
import {
  validateAnthropicKey, callWithTools, maskApiKey,
  CREATE_ITEM_TOOL, UPDATE_ITEM_TOOL_FULL, UPDATE_ITEM_TOOL_DEV, CREATE_HIERARCHY_NODE_TOOL, UPDATE_HIERARCHY_NODE_TOOL,
  LIST_ITEMS_TOOL, GET_ITEM_TOOL, LIST_HIERARCHY_TOOL, SEARCH_BACKLOG_TOOL,
  type AiConfigRow, type AnthropicMessage, type AnthropicTool, type AnthropicTextBlock, type AnthropicToolUseBlock, type AnthropicToolResultBlock,
} from '../lib/ai'
import {
  loadState, saveState, uid, nextKeyForPrefix, allKeys, normalize, getCurrentSprint,
  resolveClientId, resolveEpicId, resolveSprintId, resolveStatus, resolveType, resolvePriority, resolveLevel,
  resolveAssigneeIds, resolveDepKeys, linkedTeamMember,
  type CadenceState, type Item, type HierarchyNode,
} from '../lib/backlogWrite'
import { postSlackMessage, formatBlockedItemMessage } from '../lib/slack'

// Phase 6 (roadmap v1), Compagnon IA, sous-chantier 1 (aide a la redaction / creation d'items),
// 2026-08-08 : premier sous-chantier lance par Julien parmi les 4 vises a terme (redaction/creation
// d'items, estimation auto des SP, detection d'anomalies, planification de sprints par contraintes)
// - voir docs/roadmap-v1.md. Decisions actees avec Julien (AskUserQuestion) : fournisseur API
// Claude (Anthropic), panneau lateral pour commencer (a terme aussi une page dediee, pas construite
// dans cette 1re version).
//
// Architecture : /api/ai-chat est SANS ETAT cote serveur (l'historique de conversation est renvoye
// en entier par le frontend a chaque appel, ChatContext.tsx) - pas de persistance en base pour
// cette 1re version, coherent avec le principe "commencer simple" deja suivi ailleurs dans ce
// prototype. Boucle agentique classique (appel Claude -> tool_use ? execute et rebocule : termine)
// avec les MEMES fonctions d'ecriture que routes/items.ts / routes/hierarchyNodes.ts
// (backlogWrite.ts), appelees ICI EN PROCESS plutot que via un aller-retour HTTP interne - ce
// fichier duplique donc leur logique (creation de cle, resolution par nom, alerte Slack "bloque")
// plutot que de la reutiliser directement : ces routes exposent un contrat HTTP (body/schema
// Fastify) pense pour un appelant externe (MCP), pas des fonctions internes reutilisables telles
// quelles. Chaque outil execute persiste IMMEDIATEMENT (saveState) et met a jour une variable
// `state` locale enchainee d'un tool_use au suivant, pour qu'un Epic cree puis reference dans le
// meme tour de conversation soit deja visible a l'outil suivant.
const DEV_ALLOWED_FIELDS = new Set(['status', 'sp', 'dod', 'deps', 'assignSelf'])

function toPublicConfig(config: { model: string; apiKey: string; updatedAt: Date }) {
  return { model: config.model, tokenPreview: maskApiKey(config.apiKey), updatedAt: config.updatedAt }
}

type AiToolCall =
  | { kind: 'item_created'; item: Item; keyCounters: Record<string, number> }
  | { kind: 'item_updated'; item: Item }
  | { kind: 'node_created'; node: HierarchyNode; keyCounters: Record<string, number> }
  | { kind: 'node_updated'; node: HierarchyNode }

interface ToolExecResult { state: CadenceState; text: string; toolCall: AiToolCall }

interface CreateItemInput {
  title?: string; role?: string; need?: string; benefit?: string
  type?: string; priority?: string; status?: string
  clientName?: string; epicKey?: string; sprintLabel?: string
  sp?: number; tags?: string[]
  criteria?: { given: string; when: string; then: string }[]
}

async function executeCreateItem(fastify: FastifyInstance, state: CadenceState, input: CreateItemInput): Promise<ToolExecResult> {
  const title = input.title?.trim()
  if (!title) throw new Error('Titre requis pour creer un item')

  const clientId = resolveClientId(state, input.clientName, state.clients[0]?.id) ?? ''
  const epicId = resolveEpicId(state, input.epicKey, null) ?? null
  const sprintId = resolveSprintId(state, input.sprintLabel, null) ?? null
  const defaultStatus = state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id ?? 'todo'
  const status = resolveStatus(state, input.status, defaultStatus)
  const type = resolveType(input.type, 'story')
  const priority = resolvePriority(input.priority, 'medium')

  const client = state.clients.find(c => c.id === clientId)
  const prefix = client?.prefix ?? 'ITEM'
  const counters = state.itemKeyCounters ?? {}
  const { key, nextCounters } = nextKeyForPrefix(prefix, allKeys(state), counters)

  const item: Item = {
    id: uid(), key, desc: title, sp: input.sp ?? 0, status, clientId, sprintId, priority,
    assignees: [], tags: input.tags ?? [], type, epicId,
    role: input.role, need: input.need, benefit: input.benefit,
    criteria: input.criteria?.map(c => ({ id: uid(), ...c })),
    createdAt: new Date().toISOString(),
  }

  const nextState: CadenceState = { ...state, items: [...state.items, item], itemKeyCounters: nextCounters }
  await saveState(fastify, nextState)
  return { state: nextState, text: `Item cree : ${item.key} : ${item.desc}`, toolCall: { kind: 'item_created', item, keyCounters: nextCounters } }
}

interface UpdateItemInput {
  key?: string
  title?: string; role?: string; need?: string; benefit?: string
  type?: string; priority?: string; status?: string
  clientName?: string; epicKey?: string; sprintLabel?: string
  sp?: number; tags?: string[]
  dor?: { text: string; done: boolean }[]
  dod?: { text: string; done: boolean }[]
  deps?: string[]
  assignees?: string[]
  assignSelf?: boolean
}

async function executeUpdateItem(
  fastify: FastifyInstance, state: CadenceState, input: UpdateItemInput, role: string, userId: string
): Promise<ToolExecResult> {
  if (!input.key) throw new Error('Cle de l\'item requise')
  const existing = state.items.find(i => i.key.toLowerCase() === input.key!.toLowerCase())
  if (!existing) throw new Error(`Aucun item avec la cle "${input.key}"`)

  const { key: _key, ...fields } = input
  const isFullEditor = role === 'ADMIN' || role === 'PO'
  if (!isFullEditor) {
    const disallowed = Object.keys(fields).filter(k => (fields as Record<string, unknown>)[k] !== undefined && !DEV_ALLOWED_FIELDS.has(k))
    if (disallowed.length > 0) throw new Error(`Champ(s) reserve(s) a un PO ou Admin : ${disallowed.join(', ')}`)
  }

  let assignees = existing.assignees
  if (isFullEditor && input.assignees) {
    assignees = resolveAssigneeIds(state, input.assignees, existing.assignees)
  } else if (input.assignSelf !== undefined) {
    const member = linkedTeamMember(state, userId)
    if (!member) throw new Error('Aucune fiche equipe liee a ce compte : auto-assignation impossible')
    assignees = input.assignSelf
      ? [...new Set([...existing.assignees, member.id])]
      : existing.assignees.filter(id => id !== member.id)
  }

  const updated: Item = {
    ...existing,
    desc: input.title?.trim() || existing.desc,
    role: input.role ?? existing.role,
    need: input.need ?? existing.need,
    benefit: input.benefit ?? existing.benefit,
    type: resolveType(input.type, existing.type),
    priority: resolvePriority(input.priority, existing.priority),
    status: resolveStatus(state, input.status, existing.status),
    clientId: resolveClientId(state, input.clientName, existing.clientId) ?? existing.clientId,
    epicId: resolveEpicId(state, input.epicKey, existing.epicId ?? null),
    sprintId: resolveSprintId(state, input.sprintLabel, existing.sprintId),
    sp: input.sp ?? existing.sp,
    tags: input.tags ?? existing.tags,
    dor: input.dor ? input.dor.map(c => ({ id: uid(), ...c })) : existing.dor,
    dod: input.dod ? input.dod.map(c => ({ id: uid(), ...c })) : existing.dod,
    deps: resolveDepKeys(state, input.deps, existing.deps),
    assignees,
  }

  const items = state.items.map(i => i.id === existing.id ? updated : i)
  const nextState: CadenceState = { ...state, items }
  await saveState(fastify, nextState)

  // Alerte Slack "statut Bloque" (meme garde-fou que le PATCH /api/items/:key existant, voir
  // routes/items.ts) : ce tool_use est un chemin d'ecriture d'item de plus qui ne passe pas par
  // PUT /api/state, donc pas couvert par la detection par comparaison de routes/state.ts.
  if (existing.status !== 'blocked' && updated.status === 'blocked') {
    const slackConfig = await fastify.prisma.slackConfig.findFirst()
    if (slackConfig?.blockedEnabled && slackConfig.blockedChannelId) {
      postSlackMessage(slackConfig.botToken, slackConfig.blockedChannelId, formatBlockedItemMessage({ itemKey: updated.key, itemDesc: updated.desc }))
        .catch(() => {})
    }
  }

  return { state: nextState, text: `Item mis a jour : ${updated.key} : ${updated.desc}`, toolCall: { kind: 'item_updated', item: updated } }
}

interface CreateNodeInput { title?: string; level?: string; parentKey?: string; clientName?: string; sprintLabel?: string; sp?: number }

async function executeCreateHierarchyNode(fastify: FastifyInstance, state: CadenceState, input: CreateNodeInput): Promise<ToolExecResult> {
  const title = input.title?.trim()
  if (!title) throw new Error('Titre requis pour creer un Epic ou une Initiative')

  const level = resolveLevel(input.level, 'epic')
  const clientId = resolveClientId(state, input.clientName, undefined)
  const parentId = resolveEpicId(state, input.parentKey, null) ?? null
  const sprintId = resolveSprintId(state, input.sprintLabel, null) ?? null

  const client = clientId ? state.clients.find(c => c.id === clientId) : undefined
  const prefix = client?.prefix ?? 'ITEM'
  const counters = state.itemKeyCounters ?? {}
  const { key, nextCounters } = nextKeyForPrefix(prefix, allKeys(state), counters)

  const node: HierarchyNode = {
    id: uid(), key, level, parentId, desc: title,
    clientId, sprintId, sp: input.sp, createdAt: new Date().toISOString(),
  }

  const nextState: CadenceState = { ...state, hierarchyNodes: [...state.hierarchyNodes, node], itemKeyCounters: nextCounters }
  await saveState(fastify, nextState)
  return {
    state: nextState,
    text: `${node.level === 'initiative' ? 'Initiative creee' : 'Epic cree'} : ${node.key} : ${node.desc}`,
    toolCall: { kind: 'node_created', node, keyCounters: nextCounters },
  }
}

interface UpdateNodeInput { key?: string; title?: string; level?: string; parentKey?: string; clientName?: string; sprintLabel?: string; sp?: number }

async function executeUpdateHierarchyNode(fastify: FastifyInstance, state: CadenceState, input: UpdateNodeInput): Promise<ToolExecResult> {
  if (!input.key) throw new Error('Cle de l\'Epic/Initiative requise')
  const existing = state.hierarchyNodes.find(n => n.key.toLowerCase() === input.key!.toLowerCase())
  if (!existing) throw new Error(`Aucun Epic/Initiative avec la cle "${input.key}"`)

  const updated: HierarchyNode = {
    ...existing,
    desc: input.title?.trim() || existing.desc,
    level: resolveLevel(input.level, existing.level),
    parentId: resolveEpicId(state, input.parentKey, existing.parentId) ?? existing.parentId,
    clientId: resolveClientId(state, input.clientName, existing.clientId),
    sprintId: resolveSprintId(state, input.sprintLabel, existing.sprintId ?? null),
    sp: input.sp ?? existing.sp,
  }

  const hierarchyNodes = state.hierarchyNodes.map(n => n.id === existing.id ? updated : n)
  const nextState: CadenceState = { ...state, hierarchyNodes }
  await saveState(fastify, nextState)
  return {
    state: nextState,
    text: `${updated.level === 'initiative' ? 'Initiative mise a jour' : 'Epic mis a jour'} : ${updated.key} : ${updated.desc}`,
    toolCall: { kind: 'node_updated', node: updated },
  }
}

async function executeTool(
  fastify: FastifyInstance, state: CadenceState, name: string, input: Record<string, unknown>, role: string, userId: string
): Promise<ToolExecResult> {
  switch (name) {
    case 'create_item': return executeCreateItem(fastify, state, input as CreateItemInput)
    case 'update_item': return executeUpdateItem(fastify, state, input as UpdateItemInput, role, userId)
    case 'create_hierarchy_node': return executeCreateHierarchyNode(fastify, state, input as CreateNodeInput)
    case 'update_hierarchy_node': return executeUpdateHierarchyNode(fastify, state, input as UpdateNodeInput)
    default: throw new Error(`Outil inconnu : ${name}`)
  }
}

/* ── Outils de LECTURE ──────────────────────────────────────────────────────────────────────────
   Miroir texte de mcp/src/tools.ts (list_items/get_item/list_hierarchy/search_backlog), adapte au
   CadenceState/Item de backlogWrite.ts (memes champs, deps stocke des ID resolus via
   resolveDepKeys, pas des cles - meme convention que resultBlocks ci-dessus). Ne touchent jamais
   `state` ni `saveState` : READ_TOOL_NAMES ci-dessous les detourne de executeTool/toolCalls dans la
   boucle agentique. */
const READ_TOOL_NAMES = new Set(['list_items', 'get_item', 'list_hierarchy', 'search_backlog'])

function clientNameFor(state: CadenceState, clientId: string | undefined | null): string {
  return state.clients.find(c => c.id === clientId)?.name ?? '(sans client)'
}

function sprintLabelFor(state: CadenceState, sprintId: string | undefined | null): string {
  if (!sprintId) return '(hors sprint)'
  return state.sprints.find(s => s.id === sprintId)?.label ?? '(sprint inconnu)'
}

function epicKeyFor(state: CadenceState, epicId: string | undefined | null): string {
  if (!epicId) return '(sans Epic)'
  return state.hierarchyNodes.find(n => n.id === epicId)?.key ?? '(Epic inconnu)'
}

function statusLabelFor(state: CadenceState, status: string): string {
  return state.kanbanCols.find(c => c.id === status)?.label ?? status
}

function assigneeNamesFor(state: CadenceState, assignees: string[]): string {
  if (assignees.length === 0) return '(non assigne)'
  return assignees.map(id => state.team.find(m => m.id === id)?.name ?? id).join(', ')
}

function itemLineFor(state: CadenceState, item: Item): string {
  return `${item.key} [${statusLabelFor(state, item.status)}] ${item.desc}, ${item.sp} SP, priorite ${item.priority}, `
    + `client ${clientNameFor(state, item.clientId)}, sprint ${sprintLabelFor(state, item.sprintId)}, Epic ${epicKeyFor(state, item.epicId)}, `
    + `assigne(s) : ${assigneeNamesFor(state, item.assignees)}`
}

interface ListItemsInput {
  sprint?: string; status?: string; clientName?: string; epicKey?: string
  assignee?: string; tag?: string; type?: string; priority?: string; limit?: number
}

function executeListItems(state: CadenceState, input: ListItemsInput): string {
  const currentSprint = getCurrentSprint(state)
  const sprintId = input.sprint
    ? (normalize(input.sprint) === 'current' ? currentSprint?.id : state.sprints.find(s => normalize(s.label) === normalize(input.sprint!))?.id)
    : undefined
  if (input.sprint && !sprintId) return `Aucun sprint ne correspond a "${input.sprint}".`

  let items = state.items
  if (sprintId) items = items.filter(i => i.sprintId === sprintId)
  if (input.status) items = items.filter(i => normalize(statusLabelFor(state, i.status)) === normalize(input.status!))
  if (input.clientName) items = items.filter(i => normalize(clientNameFor(state, i.clientId)).includes(normalize(input.clientName!)))
  if (input.epicKey) items = items.filter(i => normalize(epicKeyFor(state, i.epicId)) === normalize(input.epicKey!))
  if (input.assignee) items = items.filter(i => i.assignees.some(id => normalize(state.team.find(m => m.id === id)?.name ?? '').includes(normalize(input.assignee!))))
  if (input.tag) items = items.filter(i => i.tags.some(t => normalize(t) === normalize(input.tag!)))
  if (input.type) items = items.filter(i => normalize(i.type ?? 'story') === normalize(input.type!))
  if (input.priority) items = items.filter(i => normalize(i.priority) === normalize(input.priority!))

  const max = Math.min(input.limit ?? 50, 200)
  const truncated = items.length > max
  const lines = items.slice(0, max).map(i => itemLineFor(state, i))
  const header = `${items.length} item(s) trouve(s)${truncated ? `, ${max} affiche(s)` : ''} :`
  return [header, ...lines].join('\n')
}

function executeGetItem(state: CadenceState, input: { key?: string }): string {
  if (!input.key) return 'Cle requise'
  const item = state.items.find(i => normalize(i.key) === normalize(input.key!))
  if (!item) return `Aucun item avec la cle "${input.key}".`

  const criteria = (item.criteria ?? []).map((c, idx) => `  ${idx + 1}. GIVEN ${c.given} WHEN ${c.when} THEN ${c.then}`).join('\n')
  const deps = (item.deps ?? []).map(id => state.items.find(i => i.id === id)?.key ?? id).join(', ')
  const lines = [
    `${item.key}, ${item.desc}`,
    `Statut : ${statusLabelFor(state, item.status)} - Type : ${item.type ?? 'story'} - Priorite : ${item.priority} - ${item.sp} SP`,
    `Client : ${clientNameFor(state, item.clientId)} - Sprint : ${sprintLabelFor(state, item.sprintId)} - Epic/Initiative : ${epicKeyFor(state, item.epicId)}`,
    `Assigne(s) : ${assigneeNamesFor(state, item.assignees)}`,
    item.tags.length > 0 ? `Tags : ${item.tags.join(', ')}` : undefined,
    item.role || item.need || item.benefit
      ? `User Story : en tant que ${item.role ?? '?'}, je souhaite ${item.need ?? '?'}, afin de ${item.benefit ?? '?'}`
      : undefined,
    criteria ? `Criteres d'acceptation :\n${criteria}` : undefined,
    deps ? `Depend de : ${deps}` : undefined,
  ].filter((l): l is string => Boolean(l))
  return lines.join('\n')
}

function executeListHierarchy(state: CadenceState, input: { level?: string; clientName?: string }): string {
  let nodes = state.hierarchyNodes
  if (input.level) nodes = nodes.filter(n => normalize(n.level) === normalize(input.level!))
  if (input.clientName) nodes = nodes.filter(n => normalize(clientNameFor(state, n.clientId)).includes(normalize(input.clientName!)))

  const lines = nodes.map(n => {
    const childCount = state.items.filter(i => i.epicId === n.id).length
    return `${n.key} [${n.level}] ${n.desc}, client ${clientNameFor(state, n.clientId)}, sprint ${sprintLabelFor(state, n.sprintId)}, `
      + `${n.sp ?? '?'} SP, ${childCount} item(s) rattache(s)${childCount === 0 ? ' [VIDE]' : ''}`
  })
  return lines.join('\n') || 'Aucun Epic/Initiative.'
}

function executeSearchBacklog(state: CadenceState, input: { query?: string; limit?: number }): string {
  if (!input.query) return 'Recherche requise'
  const q = normalize(input.query)
  const matches = state.items.filter(i =>
    normalize(i.desc).includes(q) || normalize(i.role ?? '').includes(q) || normalize(i.need ?? '').includes(q) || normalize(i.benefit ?? '').includes(q)
  )
  const max = Math.min(input.limit ?? 30, 200)
  const lines = matches.slice(0, max).map(i => itemLineFor(state, i))
  return [`${matches.length} resultat(s) pour "${input.query}" :`, ...lines].join('\n')
}

function executeReadTool(state: CadenceState, name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'list_items': return executeListItems(state, input as ListItemsInput)
    case 'get_item': return executeGetItem(state, input as { key?: string })
    case 'list_hierarchy': return executeListHierarchy(state, input as { level?: string; clientName?: string })
    case 'search_backlog': return executeSearchBacklog(state, input as { query?: string; limit?: number })
    default: throw new Error(`Outil de lecture inconnu : ${name}`)
  }
}

// Duplique depuis frontend/src/data/baseTags.ts (meme convention que le reste de ce fichier /
// backlogWrite.ts : deux runtimes distincts, jamais de partage de code frontend/backend dans ce
// prototype) - a tenir manuellement a jour si la liste change cote frontend. Ajoute 2026-08-09 (4e
// retour Julien) : le chat n'avait pas connaissance des tags predefinis des Reglages et en
// proposait sans se soucier des tags deja standardises par l'equipe.
const BASE_TAGS = [
  'Securite', 'Performance', 'UX', 'API', 'Mobile', 'Backend', 'Frontend',
  'Base de donnees', 'Infrastructure', 'CI/CD', 'Tests', 'Documentation',
  'Accessibilite', 'Conformite', 'Refactoring', 'Migration', 'Integration',
  'Notification', 'Export', 'Import',
]

/** Meme logique que visibleBaseTags (frontend/src/data/baseTags.ts) : tags de base moins ceux
 *  retires par un Admin, plus les tags personnalises deja utilises dans le Backlog. `state.
 *  removedBaseTags`/`state.customTags` transitent dans le reste du blob (CadenceState.[key]),
 *  jamais types precisement cote backend (voir backlogWrite.ts). */
function visibleTags(state: CadenceState): string[] {
  const removed = Array.isArray(state.removedBaseTags) ? state.removedBaseTags as string[] : []
  const custom = Array.isArray(state.customTags) ? state.customTags as string[] : []
  return [...BASE_TAGS.filter(t => !removed.includes(t)), ...custom]
}

/** Contexte injecte dans le prompt systeme : listes courtes (noms/libelles) pour que Claude designe
 *  toujours un Client/Sprint/Statut/Epic par son NOM, jamais par un identifiant technique - memes
 *  fonctions resolveXxx que le reste de backlogWrite.ts en aval, qui matchent par nom normalise. Le
 *  Backlog complet n'est volontairement PAS injecte ici (une liste de 100+ items alourdirait chaque
 *  appel pour rien) : pour tout ce qui depasse ces listes courtes (contenu d'un item, Epics vides,
 *  items comparables...), Claude dispose des outils de LECTURE ci-dessus (list_items/get_item/
 *  list_hierarchy/search_backlog) et doit les appeler lui-meme plutot que demander l'info a
 *  l'utilisateur.
 *
 * Sous-chantier 2 (estimation automatique des SP), 2026-08-09 : d'abord construit comme un outil
 * dedie (POST /api/ai-estimate-sp) avec ses propres boutons dans ItemModal/BacklogPage, retire sur
 * retour de Julien apres 1er essai reel ("je ne veux pas multiplier les boutons sachant qu'on a le
 * chatbot") : la fonctionnalite est desormais uniquement ici, dans le chat, via l'outil update_item
 * deja existant (champ `sp`).
 *
 * Outils de lecture ajoutes 2026-08-09 (2e retour Julien) : sans eux, Claude n'avait acces qu'a ces
 * listes de noms et repondait "Reponse vide" ou demandait a l'utilisateur des infos qu'il aurait pu
 * recuperer lui-meme (contenu d'un item, Epics vides, SP d'un Epic...) - voir aussi le relevement du
 * plafond d'iterations ci-dessous dans la boucle agentique.
 */
function buildSystemPrompt(state: CadenceState, role: string): string {
  const clients = state.clients.map(c => c.name).join(', ') || '(aucun)'
  const sprints = state.sprints.map(s => `${s.label}${s.closed ? '' : ' (ouvert)'}`).join(', ') || '(aucun)'
  const statuses = state.kanbanCols.map(c => c.label).join(', ') || '(aucun)'
  const epics = state.hierarchyNodes.slice(0, 40).map(n => `${n.key} (${n.desc})`).join(', ') || '(aucun)'
  const tags = visibleTags(state).join(', ') || '(aucun)'

  const lines = [
    "Tu es le Compagnon IA de Cadence, un outil de gestion de backlog agile (Scrum). Tu aides a la redaction et a la creation d'items du Backlog (User Stories, Bugs, Taches, Spikes) et d'Epics/Initiatives, et tu peux estimer leur charge de travail en Story Points. Reponds toujours en francais, dans un ton professionnel et concis.",
    `Clients existants : ${clients}`,
    `Sprints existants : ${sprints}`,
    `Statuts Kanban existants : ${statuses}`,
    `Epics/Initiatives existants (40 premiers) : ${epics}`,
    `Tags suggeres (Reglages) : ${tags}. Reutilise un tag existant de cette liste (memes accents/casse) quand il correspond, plutot que d'en creer un nouveau proche d'un existant (ex. "Perf" alors que "Performance" existe deja).`,
    "Avant de creer/modifier un item ou de repondre a une question sur le contenu du Backlog, utilise les outils de lecture (list_items, get_item, list_hierarchy, search_backlog) pour recuperer les informations dont tu as besoin, plutot que de les demander a l'utilisateur ou de les supposer. Pour une demande en masse (ex. \"tous les Epics vides\"), commence par list_hierarchy pour les identifier, puis traite-les un par un avec les outils d'ecriture.",
    "Quand une demande implique de creer ou modifier un item/Epic/Initiative, utilise les outils a ta disposition plutot que de te contenter de decrire le resultat en texte. Designe toujours un client, un sprint, un statut ou un Epic par son NOM ou LIBELLE exact tel que liste ci-dessus, jamais par un identifiant technique interne.",
    "Estimation en Story Points (suite de Fibonacci : 1, 2, 3, 5, 8, 13, 21) : commence par get_item pour connaitre le titre, la description et les dependances de l'item a estimer, puis si besoin search_backlog ou list_items (meme Epic, tags similaires) pour trouver des items deja estimes et estimer PAR COMPARAISON plutot que dans l'absolu. Applique le resultat via update_item (champ sp) plutot que de te contenter de l'annoncer en texte.",
  ]
  if (role === 'DEV') {
    lines.push("Ce compte a le role Dev : impossible de creer un item, ni de modifier son contenu produit (titre, description, priorite, client, Epic...). Seuls le statut, les SP, la Definition of Done, les dependances et l'auto-assignation sont modifiables. Pour toute autre demande de creation/modification, explique que seul un Product Owner (ou Admin) peut le faire.")
  } else if (role === 'SCRUM_MASTER' || role === 'STAKEHOLDER') {
    lines.push("Ce compte n'a pas de droits d'ecriture sur le Backlog : aide uniquement a la reflexion et a la redaction en texte (par exemple un brouillon de User Story a copier), sans jamais creer ou modifier quoi que ce soit toi-meme. Precise-le si on te demande de creer un item.")
  }
  return lines.join('\n')
}

export async function aiRoutes(fastify: FastifyInstance) {
  const adminOnly = [authenticate, requireRole('ADMIN')]

  fastify.get('/api/ai-config', { preHandler: adminOnly }, async () => {
    const config = await fastify.prisma.aiConfig.findFirst()
    return { config: config ? toPublicConfig(config) : null }
  })

  // PUT (re)configure l'assistant. `apiKey` optionnel a la mise a jour (garde la cle existante si
  // omise, pour changer de modele sans avoir a ressaisir une cle deja enregistree), verifiee
  // aupres d'Anthropic AVANT d'ecrire quoi que ce soit, meme logique que githubRoutes.
  fastify.put<{ Body: { apiKey?: string; model?: string } }>(
    '/api/ai-config',
    { schema: { body: { type: 'object', properties: { apiKey: { type: 'string' }, model: { type: 'string' } } } }, preHandler: adminOnly },
    async (req, reply) => {
      const existing = await fastify.prisma.aiConfig.findFirst()
      const apiKey = req.body.apiKey?.trim() || existing?.apiKey
      if (!apiKey) return reply.code(400).send({ error: 'Cle API requise pour une premiere connexion' })
      const model = req.body.model?.trim() || existing?.model || 'claude-sonnet-5'

      try {
        await validateAnthropicKey({ apiKey, model })
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : 'Connexion a Anthropic impossible' })
      }

      const saved = existing
        ? await fastify.prisma.aiConfig.update({ where: { id: existing.id }, data: { apiKey, model } })
        : await fastify.prisma.aiConfig.create({ data: { apiKey, model } })
      return { config: toPublicConfig(saved) }
    }
  )

  fastify.delete('/api/ai-config', { preHandler: adminOnly }, async (_req, reply) => {
    await fastify.prisma.aiConfig.deleteMany({})
    return reply.code(204).send()
  })

  // POST /api/ai-chat : ouvert a tout compte connecte (le panneau de chat est visible de tous les
  // roles, voir ChatPanel.tsx) - c'est l'EXECUTION des outils qui est filtree par role ci-dessous,
  // pas l'acces a la conversation elle-meme (un Stakeholder peut discuter/faire rediger du texte,
  // simplement sans pouvoir rien creer). Sans etat cote serveur : `messages` porte tout
  // l'historique de la conversation a chaque appel (ChatContext.tsx le maintient cote frontend).
  fastify.post<{ Body: { messages: { role: 'user' | 'assistant'; content: string }[] } }>(
    '/api/ai-chat',
    { preHandler: authenticate },
    async (req, reply) => {
      const aiConfig: AiConfigRow | null = await fastify.prisma.aiConfig.findFirst()
      if (!aiConfig) return reply.code(400).send({ error: "Aucun assistant IA configure. Un Admin doit d'abord renseigner une cle API Anthropic en Reglages." })

      let state = await loadState(fastify)
      if (!state) return reply.code(404).send({ error: 'Aucun etat trouve' })

      const role = req.user.role
      const isFullEditor = role === 'ADMIN' || role === 'PO'
      // Outils de lecture : tous les roles y ont acces (lecture seule, memes donnees que les pages
      // Backlog/Dashboard deja visibles). Outils d'ecriture : filtres par role comme avant.
      const writeTools: AnthropicTool[] = isFullEditor
        ? [CREATE_ITEM_TOOL, UPDATE_ITEM_TOOL_FULL, CREATE_HIERARCHY_NODE_TOOL, UPDATE_HIERARCHY_NODE_TOOL]
        : role === 'DEV' ? [UPDATE_ITEM_TOOL_DEV] : []
      const tools: AnthropicTool[] = [LIST_ITEMS_TOOL, GET_ITEM_TOOL, LIST_HIERARCHY_TOOL, SEARCH_BACKLOG_TOOL, ...writeTools]

      const system = buildSystemPrompt(state, role)
      const messages: AnthropicMessage[] = (req.body.messages ?? []).map(m => ({ role: m.role, content: m.content }))
      if (messages.length === 0) return reply.code(400).send({ error: 'Message vide' })

      const toolCalls: AiToolCall[] = []
      let finalText = ''

      // Boucle agentique : un tour peut enchainer de nombreux appels d'outils (ex. "peuple tous les
      // Epics vides" peut demander un list_hierarchy puis plusieurs create_item/update_item par
      // Epic) avant de revenir a du texte pur. Plafond releve de 6 a 25 le 2026-08-09 (2e retour
      // Julien) : 6 etait systematiquement atteint sur une demande en masse, produisant une
      // "Reponse vide" cote frontend (voir le filet de securite ci-dessous) sans que l'utilisateur
      // sache que le plafond, et non une erreur, en etait la cause.
      const MAX_ITERATIONS = 25
      let exhausted = true
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        let response
        try {
          response = await callWithTools(aiConfig, system, messages, tools)
        } catch (e) {
          return reply.code(502).send({ error: e instanceof Error ? e.message : 'Erreur Anthropic' })
        }

        messages.push({ role: 'assistant', content: response.content })
        finalText = response.content
          .filter((b): b is AnthropicTextBlock => b.type === 'text')
          .map(b => b.text)
          .join('\n')

        const toolUses = response.content.filter((b): b is AnthropicToolUseBlock => b.type === 'tool_use')
        if (toolUses.length === 0) {
          // stop_reason "max_tokens" : la reponse a ete tronquee en cours de generation (souvent en
          // plein milieu d'un tool_use trop volumineux, ex. plusieurs items "avec tous leurs
          // details") - content peut alors ne contenir ni texte ni outil exploitable. Ce n'est PAS
          // une fin de conversation normale : `exhausted` reste a true pour redonner la main via le
          // message "dis continue" plutot que le silence ou un "reformule" trompeur.
          exhausted = response.stop_reason === 'max_tokens'
          break
        }

        const resultBlocks: AnthropicToolResultBlock[] = []
        for (const call of toolUses) {
          try {
            if (READ_TOOL_NAMES.has(call.name)) {
              resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: executeReadTool(state, call.name, call.input) })
              continue
            }
            const result = await executeTool(fastify, state, call.name, call.input, role, req.user.id)
            state = result.state
            toolCalls.push(result.toolCall)
            resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: result.text })
          } catch (e) {
            resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: e instanceof Error ? e.message : 'Erreur', is_error: true })
          }
        }
        messages.push({ role: 'user', content: resultBlocks })
      }

      // Filet de securite : ChatContext.tsx (frontend) affiche "(Reponse vide.)" si `reply` est une
      // chaine vide - on ne renvoie donc plus jamais une chaine vide telle quelle, ni un plafond
      // atteint en silence.
      if (exhausted) {
        const suffix = 'Cette demande necessite plus d\'etapes que ce qu\'un seul echange ne permet : dis "continue" pour que je poursuive (je relirai le Backlog a jour pour reprendre ou j\'en etais).'
        finalText = finalText.trim()
          ? `${finalText}\n\n${suffix}`
          : toolCalls.length > 0 ? `${toolCalls.length} action(s) effectuee(s) jusqu'ici. ${suffix}` : suffix
      } else if (!finalText.trim()) {
        finalText = toolCalls.length > 0
          ? `${toolCalls.length} action(s) effectuee(s), sans texte a ajouter.`
          : "Je n'ai pas de reponse a formuler pour cette demande, peux-tu reformuler ?"
      }

      return { reply: finalText, toolCalls }
    }
  )
}
