import { FastifyInstance } from 'fastify'
import { authenticate, requireRole, forbidDemo } from '../middleware/auth'
import {
  validateAnthropicKey, callWithTools, maskApiKey, generateRoadmapGoals,
  CREATE_ITEM_TOOL, UPDATE_ITEM_TOOL_FULL, UPDATE_ITEM_TOOL_DEV, CREATE_HIERARCHY_NODE_TOOL, UPDATE_HIERARCHY_NODE_TOOL,
  LIST_ITEMS_TOOL, GET_ITEM_TOOL, LIST_HIERARCHY_TOOL, SEARCH_BACKLOG_TOOL,
  SIMULATE_SPRINT_PLAN_TOOL, SET_ROADMAP_GOAL_TOOL,
  type AiConfigRow, type AnthropicMessage, type AnthropicTool, type AnthropicTextBlock, type AnthropicToolUseBlock, type AnthropicToolResultBlock,
  type RoadmapGoalSprintComposition, type GeneratedRoadmapGoal,
} from '../lib/ai'
import {
  loadState, saveState, uid, nextKeyForPrefix, allKeys, normalize, getCurrentSprint,
  resolveClientId, resolveEpicId, resolveSprintId, resolveStatus, resolveType, resolvePriority, resolveLevel,
  resolveAssigneeIds, resolveDepKeys, linkedTeamMember,
  type CadenceState, type Item, type HierarchyNode, type Sprint, type RoadmapGoal,
} from '../lib/backlogWrite'
import {
  computeSprintPlan, applySprintPlan, getItemInitiativeId, CRIT_IDS,
  type CritId, type PlanParams, type PlanResult, type PlanPlacedItem, type PlanCapacityOverride, type PlanVirtualItem, type PlanItemOverride,
} from '../lib/sprintPlanner'
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
  // Phase 6, sous-chantier 4 etape 2/2 (2026-08-12) : contrairement aux 4 kinds ci-dessus (un seul
  // item/node a la fois), apply_sprint_plan peut toucher des dizaines d'items et creer plusieurs
  // sprints en une seule action - `changedItems`/`newItems`/`newSprints` plutot qu'un objet unique,
  // pour que ChatContext.tsx (frontend) puisse resynchroniser tout d'un coup sans recharger la page.
  // `roadmapGoals` ajoute 2026-08-20, generation automatique depuis le 2026-08-21 (voir
  // generateRoadmapGoals, lib/ai.ts) : theme/Sprint Goal/metriques ecrits atomiquement avec le plan
  // pour chaque sprint concerne, `created` distingue creation/mise a jour par entree comme
  // roadmap_goal_created/updated plus bas, pour le meme dispatch cote frontend.
  | { kind: 'sprint_plan_applied'; changedItems: Item[]; newItems: Item[]; newSprints: Sprint[]; keyCounters: Record<string, number>; roadmapGoals: { goal: RoadmapGoal; created: boolean }[] }
  // sprint_plan_simulated ajoute a l'Addendum 12 (2026-08-22, docs/corrections.md) : ne mute rien
  // (simulate_sprint_plan reste un outil de LECTURE), pousse uniquement pour PO/Admin - transporte le
  // plan ET les themes DEJA GENERES par cette simulation (figes), pour que le frontend puisse a la
  // fois afficher le bouton "Appliquer ce plan" et renvoyer ces memes donnees telles quelles a
  // POST /api/ai-chat/apply-plan au clic, sans jamais regenerer les themes une 2e fois. `planInput`
  // reste `Record<string, unknown>` (pas RawPlanInput, prive a ce fichier) - le frontend n'en a besoin
  // que pour le reexpedier tel quel, jamais pour l'interpreter lui-meme.
  | { kind: 'sprint_plan_simulated'; planInput: Record<string, unknown>; roadmapGoals: GeneratedRoadmapGoal[] }
  // Compagnon IA, pre-remplissage modal Sprint (2026-08-20) : 2 kinds distincts (comme node_created/
  // node_updated) plutot qu'un seul, pour que ChatContext.tsx sache directement quelle action
  // dispatcher (ADD_ROADMAP_GOAL/UPDATE_ROADMAP_GOAL) sans avoir a re-verifier l'existence prealable
  // cote frontend - le backend le sait deja au moment de l'ecriture.
  | { kind: 'roadmap_goal_created'; goal: RoadmapGoal }
  | { kind: 'roadmap_goal_updated'; goal: RoadmapGoal }

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

/* ── Planification de sprints (Phase 6, sous-chantier 4, etape 2/2, 2026-08-12) ────────────────────
   simulate_sprint_plan / apply_sprint_plan partagent le meme schema d'entree brut (voir
   SPRINT_PLAN_PARAMS, lib/ai.ts) et la meme resolution nom -> id (resolvePlanParams) : apply
   recalcule TOUJOURS le plan a partir des memes parametres bruts plutot que de referencer un plan
   simule precedemment (le chat est sans etat cote serveur), pour garantir que ce qui est ecrit est
   exactement ce qui a ete montre a l'utilisateur juste avant. */

interface RawCapacityOverride { sprintLabel?: string; capacity?: number; note?: string }
interface RawVirtualItem { tempKey?: string; desc?: string; sp?: number; priority?: string; clientName?: string; type?: string; deps?: string[] }
interface RawItemOverride { key?: string; status?: string; priority?: string; sp?: number; deps?: string[] }
// Compagnon IA, pre-remplissage modal Sprint (2026-08-20, reecrit 2026-08-21) : usage desormais
// uniquement autonome (set_roadmap_goal) - le theme/Sprint Goal/metriques ne transitent plus par les
// parametres de simulate_sprint_plan/apply_sprint_plan, generes automatiquement par le serveur (voir
// generateRoadmapGoals, lib/ai.ts, et executeApplySprintPlan/executeSimulateSprintPlan plus bas).
interface RawRoadmapGoalInput { sprintLabel?: string; name?: string; goal?: string; metrics?: string[] }
// roadmapGoalOverrides ajoute le 2026-08-22 (Addendum 13, 12e retour Julien, usage reel) : voir le
// commentaire complet sur applyRoadmapGoalOverrides plus bas - permet de modifier UNIQUEMENT le
// theme/Sprint Goal/metriques proposes d'un plan deja simule (composition des sprints inchangee),
// sans passer par une confirmation textuelle qui ne peut ensuite alimenter aucun bouton a jour.
interface RawPlanInput {
  criteria?: string[]; clientOrder?: string[]; velocityFactor?: number
  capacityOverrides?: RawCapacityOverride[]; virtualItems?: RawVirtualItem[]; itemOverrides?: RawItemOverride[]
  fromSprintLabel?: string
  roadmapGoalOverrides?: RawRoadmapGoalInput[]
}

/* ── Confirmation avant application d'un plan de sprints : historique (docs/corrections.md) ───────
   10 tentatives successives (Addendums 4 a 10) ont essaye de garantir techniquement une confirmation
   PORTEE PAR LE MODELE (comparaison de parametres entre 2 appels d'outils, detection d'un message de
   confirmation par mots-cles...) - toutes neutralisees en conditions reelles par une NOUVELLE facon
   dont le modele deraillait a chaque fois (re-simulation "de verification", aucun appel d'outil du
   tout, derive du texte genere entre 2 appels...). Les fonctions `verifyApplyIsConfirmed`/
   `planIdentityKey`/`looksLikeConfirmation` qui portaient ces mecanismes ont ete retirees a l'Addendum
   12 (2026-08-22) : la confirmation ne depend plus JAMAIS d'une interpretation de texte ou d'un appel
   d'outil - un vrai bouton "Appliquer ce plan" (ChatPanel.tsx) declenche une route dediee et
   deterministe (POST /api/ai-chat/apply-plan, voir plus bas), qui ne consulte jamais le modele. Cette
   classe de bug entiere (comportement du modele imprevisible d'un tour a l'autre) devient sans objet
   pour ce mecanisme. Si une confirmation textuelle devait un jour redevenir necessaire, l'historique
   complet (ce qui a ete tente et pourquoi chaque tentative a echoue) reste dans docs/corrections.md -
   a lire avant de reprendre cette piste plutot que de repartir de zero. */

/* ── Confirmation avant ecriture pour set_roadmap_goal (2026-08-20, meme principe que ci-dessus) ──
   Pas de "simulation" prealable ici (la proposition est simplement le texte que le modele redige en
   reponse, il n'y a pas d'outil dedie a montrer un resultat avant ecriture) - la garantie technique
   se limite donc a la partie generale du principe ci-dessus : un VRAI message utilisateur (content
   en simple chaine, jamais un tool_result synthetique) doit avoir ete envoye depuis le dernier appel
   a set_roadmap_goal, pour empecher une reapplication silencieuse sans nouvel accord.

   Correctif 2026-08-20 (meme jour, retour Julien) : l'ancre incluait initialement aussi le dernier
   apply_sprint_plan, pour empecher tout enchainement dans le MEME tour qu'une application tout juste
   executee. Julien a signale que c'etait au contraire le comportement voulu quand l'utilisateur
   demande explicitement les DEUX dans un seul message ("applique le plan, tu renseigneras en meme
   temps les themes...") - imposer un 2e aller-retour dans ce cas est une contrainte technique
   artificielle, pas une vraie protection : la confirmation reelle a deja eu lieu (celle qui a
   autorise apply_sprint_plan lui-meme, verifiee separement par verifyApplyIsConfirmed), il n'y a pas
   de raison de l'exiger une seconde fois pour la meme demande. L'ancre ne porte donc plus que sur
   set_roadmap_goal : un enchainement apply_sprint_plan -> set_roadmap_goal dans le meme tour reste
   permis (le premier a deja sa propre garantie), seule une REAPPLICATION de set_roadmap_goal sans
   nouveau message reste bloquee. */
export function verifyRoadmapGoalConfirmed(
  messages: AnthropicMessage[], beforeIndex: number
): { ok: true } | { ok: false; reason: string } {
  let anchorIdx = -1
  for (let i = 0; i < beforeIndex; i++) {
    const m = messages[i]
    if (m.role !== 'assistant' || typeof m.content === 'string') continue
    for (const block of m.content) {
      if (block.type === 'tool_use' && block.name === 'set_roadmap_goal') {
        anchorIdx = i
      }
    }
  }
  const hasRealUserMessageSince = messages
    .slice(anchorIdx + 1, beforeIndex)
    .some(m => m.role === 'user' && typeof m.content === 'string')
  if (!hasRealUserMessageSince) {
    return {
      ok: false,
      reason: "Ce theme/Sprint Goal/metriques a deja ete ecrit : attends un nouveau message explicite de l'utilisateur avant de le reecrire.",
    }
  }
  return { ok: true }
}

function resolvePlanParams(state: CadenceState, input: RawPlanInput): { params: PlanParams; virtualItems: PlanVirtualItem[] } {
  const criteriaRaw = (input.criteria ?? ['priority']).filter((c): c is CritId => (CRIT_IDS as string[]).includes(c))
  const criteria = criteriaRaw.length > 0 ? criteriaRaw : (['priority'] as CritId[])

  const clientOrderIds = (input.clientOrder ?? [])
    .map(name => state.clients.find(c => normalize(c.name) === normalize(name))?.id)
    .filter((id): id is string => !!id)

  const capacityOverrides: PlanCapacityOverride[] = (input.capacityOverrides ?? [])
    .map((o): PlanCapacityOverride | null => {
      const sprintId = resolveSprintId(state, o.sprintLabel, null)
      return sprintId && o.capacity !== undefined ? { sprintId, capacity: o.capacity, note: o.note } : null
    })
    .filter((o): o is PlanCapacityOverride => !!o)

  const virtualItemsRaw = input.virtualItems ?? []
  const virtualItems: PlanVirtualItem[] = virtualItemsRaw.map((v, idx) => ({
    id: 'virt-' + (v.tempKey ?? `v${idx}`),
    tempKey: v.tempKey ?? `v${idx}`,
    desc: v.desc?.trim() || '(sans titre)',
    sp: v.sp ?? 0,
    priority: resolvePriority(v.priority, 'medium'),
    clientId: resolveClientId(state, v.clientName, state.clients[0]?.id) ?? '',
    type: resolveType(v.type, 'story') ?? 'story',
    deps: [],
  }))
  const tempKeyToId = new Map(virtualItems.map(v => [v.tempKey, v.id]))
  virtualItemsRaw.forEach((v, idx) => {
    virtualItems[idx].deps = (v.deps ?? [])
      .map(depRef => tempKeyToId.get(depRef) ?? state.items.find(i => normalize(i.key) === normalize(depRef))?.id)
      .filter((id): id is string => !!id)
  })

  const itemOverrides: PlanItemOverride[] = (input.itemOverrides ?? [])
    .map((o): PlanItemOverride | null => {
      const item = o.key ? state.items.find(i => normalize(i.key) === normalize(o.key!)) : undefined
      if (!item) return null
      return {
        itemId: item.id,
        status: o.status ? resolveStatus(state, o.status, item.status) : undefined,
        priority: o.priority ? resolvePriority(o.priority, item.priority) : undefined,
        sp: o.sp,
        deps: o.deps ? resolveDepKeys(state, o.deps, undefined) : undefined,
      }
    })
    .filter((o): o is PlanItemOverride => !!o)

  const fromSprintId = resolveSprintId(state, input.fromSprintLabel, null) ?? undefined

  return {
    params: { criteria, clientOrderIds, velocityFactor: input.velocityFactor, capacityOverrides, virtualItems, itemOverrides, fromSprintId },
    virtualItems,
  }
}

// Regroupement Epic/Initiative dans le texte (retour Julien, 2026-08-12) : la sortie de
// simulate_sprint_plan/apply_sprint_plan listait les items d'un sprint a plat, sans distinguer les
// Epics et Initiatives auxquels ils appartiennent - moins lisible que ProposalPanel
// (AutoPlanningPage.tsx), qui applique deja ce regroupement "items-first" a 2 niveaux (voir
// buildItemsFirstHierarchy, utils/hierarchyScore.ts). Portage simplifie ici (texte brut, pas de UI a
// entretenir) plutot qu'une reutilisation du code frontend - deux runtimes distincts, aucun code
// partage dans ce projet (voir convention en tete de lib/backlogWrite.ts).
function formatSlotAssigned(items: PlanPlacedItem[], hierarchyNodes: HierarchyNode[]): string[] {
  const epicById = new Map(hierarchyNodes.filter(n => n.level === 'epic').map(n => [n.id, n]))
  const initiativeById = new Map(hierarchyNodes.filter(n => n.level === 'initiative').map(n => [n.id, n]))

  const itemsByEpicId = new Map<string, PlanPlacedItem[]>()
  const directItemsByInitiativeId = new Map<string, PlanPlacedItem[]>()
  const orphans: PlanPlacedItem[] = []
  const initiativeOrder: string[] = []
  const standaloneEpicOrder: string[] = []

  for (const item of items) {
    const epic = item.epicId ? epicById.get(item.epicId) : undefined
    const initId = getItemInitiativeId(item, hierarchyNodes)
    if (epic) {
      if (!itemsByEpicId.has(epic.id)) itemsByEpicId.set(epic.id, [])
      itemsByEpicId.get(epic.id)!.push(item)
      if (initId && initiativeById.has(initId)) {
        if (!initiativeOrder.includes(initId)) initiativeOrder.push(initId)
      } else if (!standaloneEpicOrder.includes(epic.id)) {
        standaloneEpicOrder.push(epic.id)
      }
    } else if (initId && initiativeById.has(initId)) {
      if (!directItemsByInitiativeId.has(initId)) directItemsByInitiativeId.set(initId, [])
      directItemsByInitiativeId.get(initId)!.push(item)
      if (!initiativeOrder.includes(initId)) initiativeOrder.push(initId)
    } else {
      orphans.push(item)
    }
  }

  const line = (it: PlanPlacedItem, indent: string) => `${indent}- ${it.key} : ${it.desc}, ${it.sp} SP${it.isVirtual ? ' [item fictif]' : ''}`
  const lines: string[] = []

  for (const it of orphans) lines.push(line(it, '  '))

  for (const epicId of standaloneEpicOrder) {
    const epic = epicById.get(epicId)!
    lines.push(`  * ${epic.key} (Epic) ${epic.desc}`)
    for (const it of itemsByEpicId.get(epicId) ?? []) lines.push(line(it, '    '))
  }

  for (const initId of initiativeOrder) {
    const initiative = initiativeById.get(initId)!
    lines.push(`  * ${initiative.key} (Initiative) ${initiative.desc}`)
    for (const it of directItemsByInitiativeId.get(initId) ?? []) lines.push(line(it, '    '))
    const childEpics = [...epicById.values()].filter(e => e.parentId === initId && itemsByEpicId.has(e.id))
    for (const epic of childEpics) {
      lines.push(`    * ${epic.key} (Epic) ${epic.desc}`)
      for (const it of itemsByEpicId.get(epic.id) ?? []) lines.push(line(it, '      '))
    }
  }

  return lines
}

function formatPlanResult(state: CadenceState, plan: PlanResult, applied: boolean): string {
  const lines: string[] = [applied ? 'Plan applique :' : 'Simulation (rien n\'a ete ecrit dans le Backlog) :']
  for (const slot of plan.slots) {
    const used = slot.used + slot.assigned.reduce((s, it) => s + it.sp, 0)
    lines.push(`\n${slot.label}${slot.isNew ? ' [nouveau sprint]' : ''} - ${used}/${slot.cap} SP :`)
    if (slot.assigned.length === 0) lines.push('  (rien a placer ici)')
    else lines.push(...formatSlotAssigned(slot.assigned, state.hierarchyNodes))
  }
  if (plan.newSprintsCount > 0) lines.push(`\n${plan.newSprintsCount} nouveau(x) sprint(s) necessaire(s) pour tout placer.`)
  if (plan.violations.length > 0) {
    lines.push('\nAlertes :')
    for (const v of plan.violations) lines.push(`  - ${v.key} (${v.desc}) : ${v.type === 'deadline' ? 'deadline' : 'Epic/Initiative scinde'}, ${v.detail}`)
  } else {
    lines.push('\nAucune alerte (deadline ou Epic/Initiative scinde).')
  }
  return lines.join('\n')
}

/* ── Generation automatique du theme/Sprint Goal/metriques (2026-08-21, reecriture complete) ───────
   Reecrit de A a Z a la demande de Julien apres 4 correctifs infructueux (Addendums 4 a 7,
   docs/corrections.md) qui tentaient tous de fiabiliser une orchestration a plusieurs etapes confiee
   au modele conversationnel (calculer les themes, les faire transiter dans le bon parametre, les
   ecrire au bon moment) - la boucle de reconfirmation revenait a chaque fois sous une forme
   legerement differente. Plutot que de rapiecer une nouvelle fois cette orchestration, le theme/
   Sprint Goal/metriques ne sont PLUS une decision du modele : simulate_sprint_plan et
   apply_sprint_plan les GENERENT eux-memes, automatiquement, a chaque execution - un simple effet de
   bord deterministe du calcul du plan, exactement comme le calcul des SP/capacites lui-meme. */

/** Composition (items reels/fictifs) de chaque sprint reellement affecte par le plan (slots vides
 *  exclus : rien a proposer comme theme pour un sprint que le plan ne touche pas). */
// Meme libelles que ceux affiches au modele dans buildSystemPrompt (description des 5 criteres) -
// dupliques ici plutot que factorises : la description du prompt est une phrase complete par
// critere (avec ses nuances, "necessite clientOrder" etc.), pas juste un libelle court utilisable
// tel quel dans un theme de sprint.
const CRIT_LABELS: Record<CritId, string> = {
  priority: 'Priorite', client: 'Importance client', socle: 'Socle commun', debt: 'Dette technique', epic: 'Cohesion Epic/Initiative',
}

function sprintCompositionsForPlan(state: CadenceState, plan: PlanResult, criteria?: CritId[]): RoadmapGoalSprintComposition[] {
  const epicById = new Map(state.hierarchyNodes.map(n => [n.id, n]))
  const planCriteria = criteria && criteria.length > 0 ? criteria.map(c => CRIT_LABELS[c]) : undefined
  return plan.slots
    .filter(slot => slot.assigned.length > 0)
    .map(slot => ({
      sprintLabel: slot.label,
      items: slot.assigned.map(it => ({ title: it.desc, epicTitle: it.epicId ? epicById.get(it.epicId)?.desc : undefined })),
      planCriteria,
    }))
}

/** Repli deterministe (aucun appel API) si generateRoadmapGoals echoue - jamais bloquant pour le
 *  plan lui-meme, seulement moins riche qu'une generation reussie. Theme = mot-cle de l'Epic le plus
 *  represente dans le sprint (ou "SPRINT" a defaut d'Epic identifiable), Sprint Goal et metriques
 *  generiques mais bases sur la composition reelle (nombre d'items, Epic dominant). */
function heuristicRoadmapGoal(composition: RoadmapGoalSprintComposition): GeneratedRoadmapGoal {
  const epicCounts = new Map<string, number>()
  for (const it of composition.items) {
    if (it.epicTitle) epicCounts.set(it.epicTitle, (epicCounts.get(it.epicTitle) ?? 0) + 1)
  }
  let topEpic: string | null = null
  let topCount = 0
  for (const [epic, count] of epicCounts) {
    if (count > topCount) { topEpic = epic; topCount = count }
  }
  // A defaut d'Epic dominant, retombe sur le 1er critere de planification actif plutot que le
  // generique "SPRINT" (2026-08-21, meme retour Julien que sur `planCriteria` plus haut) - ce repli
  // heuristique concerne justement les cas SANS Epic dominant clair (comme le sprint majoritairement
  // compose de bugs qui a motive ce correctif), ou le critere de plan est le signal le plus pertinent
  // disponible.
  const fallbackName = composition.planCriteria && composition.planCriteria.length > 0
    ? composition.planCriteria[0].split(/\s+/).slice(0, 2).join(' ').toUpperCase()
    : 'SPRINT'
  const name = topEpic ? topEpic.split(/\s+/).slice(0, 2).join(' ').toUpperCase() : fallbackName
  const goal = topEpic
    ? `Avancer sur ${topEpic} et livrer les ${composition.items.length} item(s) prevu(s) de ce sprint.`
    : `Livrer les ${composition.items.length} item(s) prevu(s) de ce sprint.`
  return { sprintLabel: composition.sprintLabel, name, goal, metrics: [`${composition.items.length} item(s) livre(s)`] }
}

/** Point d'entree unique utilise par simulate_sprint_plan ET apply_sprint_plan : tente la generation
 *  via l'API (generateRoadmapGoals, lib/ai.ts), comble tout sprint manquant de la reponse (partielle
 *  ou malformee) par le repli heuristique plutot que de perdre silencieusement son theme, et retombe
 *  entierement sur le repli heuristique si l'appel echoue completement (cle invalide, quota, reseau -
 *  jamais une raison de faire echouer la simulation/application du plan lui-meme). */
async function resolveRoadmapGoals(
  aiConfig: AiConfigRow, compositions: RoadmapGoalSprintComposition[]
): Promise<GeneratedRoadmapGoal[]> {
  if (compositions.length === 0) return []
  try {
    const generated = await generateRoadmapGoals(aiConfig, compositions)
    const bySprintLabel = new Map(generated.map(g => [g.sprintLabel, g]))
    return compositions.map(c => bySprintLabel.get(c.sprintLabel) ?? heuristicRoadmapGoal(c))
  } catch {
    return compositions.map(heuristicRoadmapGoal)
  }
}

/* ── Addendum 13 (2026-08-22, 12e retour Julien, usage reel) : modifier UNIQUEMENT le theme/Sprint
   Goal/metriques d'un plan deja simule ───────────────────────────────────────────────────────────
   Bug observe en conditions reelles avec l'Addendum 12 : apres avoir simule un plan (bouton "Appliquer
   ce plan" affiche, roadmapGoals generes automatiquement), Julien a demande de renommer les themes
   proposes ("renomme les themes du Sprint 4/5/6..."), SANS rien changer a la composition (quels items
   dans quel sprint). Le modele n'avait alors aucun moyen de refleter ce changement dans un bouton :
   rappeler simulate_sprint_plan sans modifier `criteria` etc. aurait REGENERE les themes via l'API
   (nouvel appel non deterministe, aucune garantie de reprendre les noms exacts demandes), et il
   n'existait aucun parametre pour transmettre une reecriture precise. Le modele a donc fait ce que ses
   instructions ne couvraient pas explicitement : proposer les nouveaux themes en TEXTE LIBRE et
   demander une confirmation ("Confirmes-tu que je procede a l'ecriture ?"), exactement le pattern de
   confirmation textuelle abandonne a l'Addendum 12 pour l'application elle-meme. Consequence concrete :
   le SEUL bouton actionnable restait celui de la simulation D'ORIGINE (roadmapGoals figes AVANT la
   demande de renommage) - cliquer dessus appliquait donc le plan avec les ANCIENS themes, pas les
   nouveaux, malgre la "confirmation" texte donnee entre-temps.
   Correctif : `roadmapGoalOverrides` (RawPlanInput) permet au modele de rappeler simulate_sprint_plan
   avec les MEMES parametres de composition qu'avant (aucun recalcul de placement necessaire) plus ce
   tableau, qui ECRASE le nom/goal/metriques generes pour les sprints concernes par EXACTEMENT le texte
   fourni ici (le meme texte qu'il aurait propose en langage libre) - jamais une nouvelle generation
   via l'API, donc aucune derive possible entre ce qui est propose et ce qui finira dans le bouton.
   Cela produit un NOUVEAU toolCall sprint_plan_simulated (nouveau bouton, avec les themes a jour) dans
   la reponse - voir buildSystemPrompt plus bas pour l'instruction correspondante : toute demande de
   modification, y compris une simple reecriture de theme, doit TOUJOURS se terminer par un appel a cet
   outil pour rafraichir le bouton, jamais par une confirmation en texte seul. */
function applyRoadmapGoalOverrides(goals: GeneratedRoadmapGoal[], overrides?: RawRoadmapGoalInput[]): GeneratedRoadmapGoal[] {
  if (!overrides || overrides.length === 0) return goals
  const bySprintLabel = new Map(
    overrides.filter(o => o.sprintLabel).map(o => [normalize(o.sprintLabel!), o])
  )
  return goals.map(g => {
    const override = bySprintLabel.get(normalize(g.sprintLabel))
    if (!override) return g
    const metrics = (override.metrics ?? []).map(m => m.trim()).filter(Boolean)
    return {
      sprintLabel: g.sprintLabel,
      name: override.name?.trim() || g.name,
      goal: override.goal?.trim() || g.goal,
      metrics: metrics.length > 0 ? metrics : g.metrics,
    }
  })
}

function formatRoadmapGoalsText(goals: GeneratedRoadmapGoal[], applied = false): string {
  if (goals.length === 0) return ''
  const lines: string[] = [applied ? '\nThemes/Sprint Goal/metriques appliques :' : '\nThemes/Sprint Goal/metriques proposes :']
  for (const g of goals) {
    lines.push(`\n${g.sprintLabel} - theme "${g.name}"`)
    lines.push(`  Sprint Goal : ${g.goal}`)
    if (g.metrics.length > 0) lines.push(`  Metriques : ${g.metrics.join(' | ')}`)
  }
  return lines.join('\n')
}

// Retourne aussi `goals` (pas seulement le texte formate) depuis l'Addendum 12 (2026-08-22) : le
// traitement de simulate_sprint_plan dans la boucle agentique en a besoin pour les figer dans le
// toolCall sprint_plan_simulated, reutilise tel quel par le bouton "Appliquer ce plan" au clic (voir
// commentaire plus haut) - jamais regeneres a l'application.
async function executeSimulateSprintPlan(aiConfig: AiConfigRow, state: CadenceState, input: RawPlanInput): Promise<{ text: string; goals: GeneratedRoadmapGoal[] }> {
  const { params } = resolvePlanParams(state, input)
  const plan = computeSprintPlan(state, params)
  const generated = await resolveRoadmapGoals(aiConfig, sprintCompositionsForPlan(state, plan, params.criteria))
  // Addendum 13 : applique EN DERNIER, apres generation - `roadmapGoalOverrides` remplace le texte
  // genere par celui explicitement fourni, jamais l'inverse (voir applyRoadmapGoalOverrides plus haut).
  const goals = applyRoadmapGoalOverrides(generated, input.roadmapGoalOverrides)
  return { text: formatPlanResult(state, plan, false) + formatRoadmapGoalsText(goals), goals }
}

// Meme palette que RoadmapPage.tsx (COLORS) - dupliquee ici comme le reste des types/constantes
// partagees (voir commentaire en tete de backlogWrite.ts) : necessaire pour qu'un RoadmapGoal cree
// depuis le chat (sprint sans carte Roadmap encore ouverte cote frontend) porte une couleur coherente
// avec celle que la page lui aurait donnee elle-meme, plutot qu'une couleur fixe ou absente.
const ROADMAP_GOAL_COLORS = [
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#4f46e5,#4338ca)',
  'linear-gradient(135deg,#059669,#047857)',
  'linear-gradient(135deg,#7c3aed,#6d28d9)',
  'linear-gradient(135deg,#b45309,#92400e)',
  'linear-gradient(135deg,#be185d,#9d174d)',
]

/** Calcule le RoadmapGoal mis a jour (ou cree) pour un sprint, SANS rien ecrire - factorise entre
 *  executeApplySprintPlan (roadmapGoals, plusieurs entrees d'un coup) et executeSetRoadmapGoal
 *  (usage autonome, une seule entree). `null` si le sprint est introuvable ou si name/goal
 *  manquent - a l'appelant de decider quoi en faire (executeSetRoadmapGoal leve une erreur explicite,
 *  executeApplySprintPlan ignore silencieusement une entree malformee plutot que de faire echouer
 *  tout le reste du plan pour elle). */
function computeRoadmapGoalUpdate(state: CadenceState, input: RawRoadmapGoalInput): { updated: RoadmapGoal; created: boolean } | null {
  const sprintId = resolveSprintId(state, input.sprintLabel, null)
  if (!sprintId) return null
  const name = input.name?.trim()
  const goal = input.goal?.trim()
  if (!name || !goal) return null
  const metrics = (input.metrics ?? []).map(m => m.trim()).filter(Boolean)

  const roadmap = state.roadmap ?? []
  const existing = roadmap.find(g => g.sprintId === sprintId)
  const sprintIdx = Math.max(0, state.sprints.findIndex(s => s.id === sprintId))
  const updated: RoadmapGoal = existing
    ? { ...existing, name, goal, metrics }
    : { id: 'g' + sprintId, sprintId, icon: '🚀', color: ROADMAP_GOAL_COLORS[sprintIdx % ROADMAP_GOAL_COLORS.length], name, goal, metrics }
  return { updated, created: !existing }
}

// Signature revue a l'Addendum 12 (2026-08-22, 12e retour Julien, docs/corrections.md) : n'accepte
// plus `aiConfig` ni ne regenere le theme/Sprint Goal/metriques via resolveRoadmapGoals - recoit
// desormais `roadmapGoals` DEJA GENERES (figes au moment de la simulation, voir sprint_plan_simulated
// et executeSimulateSprintPlan plus haut) et les ecrit tels quels. 2 consequences volontaires : (1) ce
// que l'utilisateur voit dans le chat avant de cliquer "Appliquer ce plan" est EXACTEMENT ce qui
// s'ecrit, plus aucun risque de derive entre 2 appels Anthropic distincts a des moments differents
// (2) cette fonction, et donc POST /api/ai-chat/apply-plan qui l'appelle, n'a plus besoin d'appeler
// Anthropic du tout - application instantanee, deterministe, sans cout ni latence d'API.
async function executeApplySprintPlan(
  fastify: FastifyInstance, state: CadenceState, input: RawPlanInput, roadmapGoals: GeneratedRoadmapGoal[], role: string
): Promise<ToolExecResult> {
  if (role !== 'ADMIN' && role !== 'PO') throw new Error('Reserve aux comptes PO ou Admin (comme le bouton "Appliquer" d\'Auto-planning)')
  const { params, virtualItems } = resolvePlanParams(state, input)
  const plan = computeSprintPlan(state, params)
  const result = applySprintPlan(state, plan, virtualItems, state.itemKeyCounters ?? {}, uid, nextKeyForPrefix)

  let nextState = result.nextState
  const roadmapGoalResults: { goal: RoadmapGoal; created: boolean }[] = []
  for (const g of roadmapGoals) {
    const applied = computeRoadmapGoalUpdate(nextState, { sprintLabel: g.sprintLabel, name: g.name, goal: g.goal, metrics: g.metrics })
    if (!applied) continue
    nextState = { ...nextState, roadmap: [...(nextState.roadmap ?? []).filter(gl => gl.sprintId !== applied.updated.sprintId), applied.updated] }
    roadmapGoalResults.push({ goal: applied.updated, created: applied.created })
  }

  await saveState(fastify, nextState)

  const changedItems = nextState.items.filter(ni => {
    const before = state.items.find(i => i.id === ni.id)
    return !!before && (before.sprintId !== ni.sprintId || before.status !== ni.status)
  })
  const newItems = nextState.items.filter(ni => !state.items.some(i => i.id === ni.id))
  const newSprints = nextState.sprints.filter(ns => !state.sprints.some(s => s.id === ns.id))

  const summaryParts = [`${result.newSprintsCount} sprint(s) cree(s)`, `${result.reassignedCount} item(s) reaffecte(s)`]
  if (result.createdCount > 0) summaryParts.push(`${result.createdCount} item(s) fictif(s) cree(s)`)
  if (roadmapGoalResults.length > 0) summaryParts.push(`${roadmapGoalResults.length} theme(s)/Sprint Goal(s) renseigne(s)`)
  const text = `Plan applique : ${summaryParts.join(', ')}.\n\n${formatPlanResult(state, plan, true)}${formatRoadmapGoalsText(roadmapGoals, true)}`

  return {
    state: nextState, text,
    toolCall: { kind: 'sprint_plan_applied', changedItems, newItems, newSprints, keyCounters: nextState.itemKeyCounters ?? {}, roadmapGoals: roadmapGoalResults },
  }
}

async function executeSetRoadmapGoal(fastify: FastifyInstance, state: CadenceState, input: RawRoadmapGoalInput, role: string): Promise<ToolExecResult> {
  if (role !== 'ADMIN' && role !== 'PO') throw new Error('Reserve aux comptes PO ou Admin (comme la modal Sprint de la page Roadmap)')
  const applied = computeRoadmapGoalUpdate(state, input)
  if (!applied) {
    if (!resolveSprintId(state, input.sprintLabel, null)) throw new Error(`Sprint introuvable : "${input.sprintLabel ?? ''}"`)
    throw new Error('Le theme et le Sprint Goal sont requis')
  }
  const { updated, created } = applied
  const nextState: CadenceState = { ...state, roadmap: [...(state.roadmap ?? []).filter(g => g.sprintId !== updated.sprintId), updated] }
  await saveState(fastify, nextState)

  const sprintLabel = state.sprints.find(s => s.id === updated.sprintId)?.label ?? input.sprintLabel ?? ''
  return {
    state: nextState,
    text: `Theme/Sprint Goal/metriques mis a jour pour ${sprintLabel} : "${updated.name}" - ${updated.goal}${updated.metrics.length > 0 ? ` (${updated.metrics.length} metrique(s))` : ''}`,
    toolCall: { kind: created ? 'roadmap_goal_created' : 'roadmap_goal_updated', goal: updated },
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
    // apply_sprint_plan retire (Addendum 12, 2026-08-22) : n'est plus un outil appelable par le
    // modele du tout - executeApplySprintPlan n'est plus declenchee que par POST /api/ai-chat/apply-plan
    // (bouton "Appliquer ce plan"), jamais via la boucle agentique.
    case 'set_roadmap_goal': return executeSetRoadmapGoal(fastify, state, input as RawRoadmapGoalInput, role)
    default: throw new Error(`Outil inconnu : ${name}`)
  }
}

/* ── Outils de LECTURE ──────────────────────────────────────────────────────────────────────────
   Miroir texte de mcp/src/tools.ts (list_items/get_item/list_hierarchy/search_backlog), adapte au
   CadenceState/Item de backlogWrite.ts (memes champs, deps stocke des ID resolus via
   resolveDepKeys, pas des cles - meme convention que resultBlocks ci-dessus). Ne touchent jamais
   `state` ni `saveState` : READ_TOOL_NAMES ci-dessous les detourne de executeTool/toolCalls dans la
   boucle agentique. */
const READ_TOOL_NAMES = new Set(['list_items', 'get_item', 'list_hierarchy', 'search_backlog', 'simulate_sprint_plan'])

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

/** Un statut Kanban "termine" est celui marque isDone en Reglages, jamais devine sur son libelle
 *  (personnalisable) - ajoute 2026-08-10 suite a un retour Julien : le chat confondait items
 *  "non termines" et items simplement non assignes faute de ce signal. */
function isDoneStatus(state: CadenceState, statusId: string): boolean {
  return state.kanbanCols.find(c => c.id === statusId)?.isDone === true
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Formate Item.deadline/HierarchyNode.deadline ({date, type}) - ajoute 2026-08-10 suite a un
 *  retour Julien : ce champ (affiche dans ItemModal sous "DATE DE LIVRAISON") n'etait porte par
 *  aucun type ni outil cote backend, le chat niait categoriquement son existence meme quand
 *  Julien lui demandait le detail d'un item qui en avait une (ex. AGA-030). Voir backlogWrite.ts. */
function deadlineFor(entity: { deadline?: { date: string; type: string } }): string | undefined {
  if (!entity.deadline?.date) return undefined
  const typeLabel = entity.deadline.type === 'imposed' ? 'imposee' : entity.deadline.type === 'negotiable' ? 'negociable' : undefined
  return `${entity.deadline.date}${typeLabel ? ` (${typeLabel})` : ''}`
}

/** Checklist (DoR/DoD) "complete" : au moins une entree ET toutes cochees - une checklist vide ou
 *  jamais renseignee compte comme incomplete, pas comme "rien a faire" (ajoute 2026-08-10, prep.
 *  sous-chantier 3 "detection d'anomalies", retour Julien). */
function checklistComplete(checklist: { done: boolean }[] | undefined): boolean {
  return !!checklist && checklist.length > 0 && checklist.every(c => c.done)
}

function hasStoryContent(item: Item): boolean {
  return Boolean(item.role?.trim() || item.need?.trim() || item.benefit?.trim())
}

/** Deadline dans les 7 prochains jours (bornes incluses) et item pas encore termine - meme fenetre
 *  que celle demandee par Julien pour "/deadline" ("dans les 7 prochains jours"), volontairement
 *  fixe plutot que parametrable (coherent avec overdueOnly, deja fixe sur "aujourd'hui"). */
function isDueSoon(state: CadenceState, item: Item): boolean {
  if (!item.deadline?.date || isDoneStatus(state, item.status)) return false
  const today = new Date(todayISO())
  const due = new Date(item.deadline.date)
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
  return diffDays >= 0 && diffDays <= 7
}

/** Au moins une dependance de l'item pointe vers un item deja termine - potentiellement une
 *  dependance obsolete, plus besoin de bloquer sur un travail deja livre. */
function hasStaleDependency(state: CadenceState, item: Item): boolean {
  return (item.deps ?? []).some(id => {
    const dep = state.items.find(i => i.id === id)
    return dep !== undefined && isDoneStatus(state, dep.status)
  })
}

function itemLineFor(state: CadenceState, item: Item): string {
  const deadline = deadlineFor(item)
  const depsCount = item.deps?.length ?? 0
  return `${item.key} [${statusLabelFor(state, item.status)}${isDoneStatus(state, item.status) ? ', termine' : ''}] ${item.desc}, ${item.sp} SP, priorite ${item.priority}, `
    + `client ${clientNameFor(state, item.clientId)}, sprint ${sprintLabelFor(state, item.sprintId)}, Epic ${epicKeyFor(state, item.epicId)}, `
    + `assigne(s) : ${assigneeNamesFor(state, item.assignees)}`
    + (deadline ? `, date de livraison : ${deadline}` : '')
    + (depsCount > 0 ? `, ${depsCount} dependance(s)` : '')
}

interface ListItemsInput {
  sprint?: string; status?: string; clientName?: string; epicKey?: string
  assignee?: string; tag?: string; type?: string; priority?: string
  unassigned?: boolean; hasDeps?: boolean; hasDeadline?: boolean; overdueOnly?: boolean; dueSoon?: boolean
  done?: boolean; blocked?: boolean
  hasSp?: boolean; hasStory?: boolean; hasAcceptance?: boolean; dorComplete?: boolean; dodComplete?: boolean
  depOnDone?: boolean
  limit?: number
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
  if (input.unassigned) items = items.filter(i => i.assignees.length === 0)
  if (input.hasDeps !== undefined) items = items.filter(i => ((i.deps?.length ?? 0) > 0) === input.hasDeps)
  if (input.hasDeadline !== undefined) items = items.filter(i => Boolean(i.deadline?.date) === input.hasDeadline)
  if (input.overdueOnly) {
    const today = todayISO()
    items = items.filter(i => Boolean(i.deadline?.date) && i.deadline!.date < today && !isDoneStatus(state, i.status))
  }
  if (input.dueSoon) items = items.filter(i => isDueSoon(state, i))
  if (input.done !== undefined) items = items.filter(i => isDoneStatus(state, i.status) === input.done)
  if (input.blocked) items = items.filter(i => i.status === 'blocked')
  if (input.hasSp !== undefined) items = items.filter(i => (i.sp > 0) === input.hasSp)
  if (input.hasStory !== undefined) items = items.filter(i => hasStoryContent(i) === input.hasStory)
  if (input.hasAcceptance !== undefined) items = items.filter(i => ((i.criteria?.length ?? 0) > 0) === input.hasAcceptance)
  if (input.dorComplete !== undefined) items = items.filter(i => checklistComplete(i.dor) === input.dorComplete)
  if (input.dodComplete !== undefined) items = items.filter(i => checklistComplete(i.dod) === input.dodComplete)
  if (input.depOnDone) items = items.filter(i => hasStaleDependency(state, i))

  const max = Math.min(input.limit ?? 50, 1000)
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
  const deadline = deadlineFor(item)
  const lines = [
    `${item.key}, ${item.desc}`,
    `Statut : ${statusLabelFor(state, item.status)}${isDoneStatus(state, item.status) ? ' (termine)' : ''} - Type : ${item.type ?? 'story'} - Priorite : ${item.priority} - ${item.sp} SP`,
    `Client : ${clientNameFor(state, item.clientId)} - Sprint : ${sprintLabelFor(state, item.sprintId)} - Epic/Initiative : ${epicKeyFor(state, item.epicId)}`,
    `Assigne(s) : ${assigneeNamesFor(state, item.assignees)}`,
    item.severity ? `Severite : ${item.severity}` : undefined,
    // Ligne explicite meme en l'absence de deadline (au lieu d'omettre la ligne) : evite au chat
    // de conclure a tort que le champ n'existe pas ou n'est jamais renseigne dans l'application.
    `Date de livraison : ${deadline ?? '(non renseignee)'}`,
    item.tags.length > 0 ? `Tags : ${item.tags.join(', ')}` : undefined,
    item.role || item.need || item.benefit
      ? `User Story : en tant que ${item.role ?? '?'}, je souhaite ${item.need ?? '?'}, afin de ${item.benefit ?? '?'}`
      : undefined,
    criteria ? `Criteres d'acceptation :\n${criteria}` : undefined,
    // Meme logique que la deadline ci-dessus : ligne toujours presente, jamais omise.
    `Depend de : ${deps || '(aucune dependance)'}`,
    item.dor?.length ? `Definition of Ready : ${item.dor.map(c => `${c.done ? '[fait]' : '[a faire]'} ${c.text}`).join(' ; ')}` : undefined,
    item.dod?.length ? `Definition of Done : ${item.dod.map(c => `${c.done ? '[fait]' : '[a faire]'} ${c.text}`).join(' ; ')}` : undefined,
  ].filter((l): l is string => Boolean(l))
  return lines.join('\n')
}

function executeListHierarchy(state: CadenceState, input: { level?: string; clientName?: string }): string {
  let nodes = state.hierarchyNodes
  if (input.level) nodes = nodes.filter(n => normalize(n.level) === normalize(input.level!))
  if (input.clientName) nodes = nodes.filter(n => normalize(clientNameFor(state, n.clientId)).includes(normalize(input.clientName!)))

  const lines = nodes.map(n => {
    const children = state.items.filter(i => i.epicId === n.id)
    const childrenSp = children.reduce((sum, i) => sum + i.sp, 0)
    const deadline = deadlineFor(n)
    // Ecart de SP (2026-08-10, prep. sous-chantier 3) : signale seulement si l'Epic a un SP propre
    // renseigne ET qu'il differe de la somme de ses items - un Epic sans SP propre (n.sp undefined)
    // n'est pas une anomalie, juste jamais chiffre au niveau Epic (cas courant, pas signale).
    const spGap = n.sp !== undefined && n.sp !== childrenSp ? ` [ECART SP : ${n.sp} vs ${childrenSp} SP somme des items]` : ''
    return `${n.key} [${n.level}] ${n.desc}, client ${clientNameFor(state, n.clientId)}, sprint ${sprintLabelFor(state, n.sprintId)}, `
      + `${n.sp ?? '?'} SP, ${children.length} item(s) rattache(s)${children.length === 0 ? ' [VIDE]' : ''}`
      + (deadline ? `, date de livraison : ${deadline}` : '')
      + spGap
  })
  return lines.join('\n') || 'Aucun Epic/Initiative.'
}

function executeSearchBacklog(state: CadenceState, input: { query?: string; limit?: number }): string {
  if (!input.query) return 'Recherche requise'
  const q = normalize(input.query)
  const matches = state.items.filter(i =>
    normalize(i.desc).includes(q) || normalize(i.role ?? '').includes(q) || normalize(i.need ?? '').includes(q) || normalize(i.benefit ?? '').includes(q)
  )
  const max = Math.min(input.limit ?? 30, 1000)
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
 *
 * Date du jour et statuts "termine" ajoutes 2026-08-10 (retour Julien, pre-travail du sous-chantier
 * 3 "detection d'anomalies") : sans la date du jour, impossible de raisonner sur une deadline
 * depassee ou proche (Claude n'a par defaut aucun acces a l'horloge systeme) ; sans la liste des
 * statuts marques "termine" (KanbanCol.isDone, personnalisable en Reglages), le chat confondait
 * "non termine" et "non assigne" en devinant sur le libelle du statut plutot qu'en s'appuyant sur ce
 * flag. Les deux alimentent aussi les nouveaux filtres de list_items (done/overdueOnly).
 */
function buildSystemPrompt(state: CadenceState, role: string): string {
  const clients = state.clients.map(c => c.name).join(', ') || '(aucun)'
  // Numero systematiquement inclus (2026-08-12, retour Julien) : un sprint a souvent un libelle
  // personnalise (ex. "INTELLIGENCE") qui masquait completement son numero jusqu'ici - designer un
  // sprint par "Sprint 3" (convention affichee partout dans l'UI) etait donc impossible a resoudre
  // de facon fiable. Voir resolveSprintId() (backlogWrite.ts), qui matche desormais aussi par numero.
  const sprints = state.sprints.map(s => `Sprint ${s.number}${s.label ? ` - ${s.label}` : ''}${s.closed ? '' : ' (ouvert)'}`).join(', ') || '(aucun)'
  const statuses = state.kanbanCols.map(c => c.label).join(', ') || '(aucun)'
  const doneStatuses = state.kanbanCols.filter(c => c.isDone).map(c => c.label).join(', ') || '(aucun statut marque "termine")'
  const epics = state.hierarchyNodes.slice(0, 40).map(n => `${n.key} (${n.desc})`).join(', ') || '(aucun)'
  const tags = visibleTags(state).join(', ') || '(aucun)'

  const lines = [
    "Tu es le Compagnon IA de Cadence, un outil de gestion de backlog agile (Scrum). Tu aides a la redaction et a la creation d'items du Backlog (User Stories, Bugs, Taches, Spikes) et d'Epics/Initiatives, et tu peux estimer leur charge de travail en Story Points. Reponds toujours en francais, dans un ton professionnel et concis.",
    `Date du jour : ${todayISO()} (format AAAA-MM-JJ, comme les dates de livraison).`,
    `Clients existants : ${clients}`,
    `Sprints existants : ${sprints}`,
    `Statuts Kanban existants : ${statuses}. Parmi eux, statut(s) marque(s) "termine" : ${doneStatuses} - pour toute question de type "termine"/"non termine", base-toi sur cette liste (ou le filtre \`done\` de list_items), jamais sur une supposition a partir du libelle.`,
    `Epics/Initiatives existants (40 premiers) : ${epics}`,
    `Tags suggeres (Reglages) : ${tags}. Reutilise un tag existant de cette liste (memes accents/casse) quand il correspond, plutot que d'en creer un nouveau proche d'un existant (ex. "Perf" alors que "Performance" existe deja).`,
    "Avant de creer/modifier un item ou de repondre a une question sur le contenu du Backlog, utilise les outils de lecture (list_items, get_item, list_hierarchy, search_backlog) pour recuperer les informations dont tu as besoin, plutot que de les demander a l'utilisateur ou de les supposer. Pour une demande en masse (ex. \"tous les Epics vides\"), commence par list_hierarchy pour les identifier, puis traite-les un par un avec les outils d'ecriture.",
    "list_items accepte des filtres dedies pour les questions courantes plutot que de tout lister et compter a la main : `unassigned` (sans assigne), `hasDeps`/`hasDeadline` (avec ou sans dependance/date de livraison), `overdueOnly` (date de livraison depassee et pas termine), `dueSoon` (date de livraison dans les 7 prochains jours et pas termine), `done` (termine ou non, voir statuts ci-dessus), `blocked` (statut Bloque), `hasSp` (avec ou sans Story Points), `hasStory` (role/besoin/benefice renseignes), `hasAcceptance` (au moins un critere d'acceptation), `dorComplete`/`dodComplete` (Definition of Ready/Done entierement cochee), `depOnDone` (au moins une dependance vers un item deja termine, potentiellement obsolete). Pour un balayage complet du Backlog (audit, detection d'anomalies), passe `limit: 1000` explicitement (defaut 50). get_item detaille toujours la date de livraison et les dependances d'un item, meme absentes (jamais silencieusement omises). list_hierarchy signale un ecart entre le SP propre d'un Epic/Initiative et la somme des SP de ses items.",
    "Quand une demande implique de creer ou modifier un item/Epic/Initiative, utilise les outils a ta disposition plutot que de te contenter de decrire le resultat en texte. Designe toujours un client, un sprint, un statut ou un Epic par son NOM ou LIBELLE exact tel que liste ci-dessus, jamais par un identifiant technique interne.",
    "Estimation en Story Points (suite de Fibonacci : 1, 2, 3, 5, 8, 13, 21) : commence par get_item pour connaitre le titre, la description et les dependances de l'item a estimer, puis si besoin search_backlog ou list_items (meme Epic, tags similaires) pour trouver des items deja estimes et estimer PAR COMPARAISON plutot que dans l'absolu. Applique le resultat via update_item (champ sp) plutot que de te contenter de l'annoncer en texte.",
    // Phase 6, sous-chantier 4 etape 2/2 (2026-08-12) : le Compagnon IA reproduit desormais
    // Auto-planning de facon conversationnelle - meme algorithme (lib/sprintPlanner.ts), jamais un
    // calcul improvise. Auto-planning lui-meme n'est PAS remplace, il reste utilisable normalement.
    // Instructions eclatees en plusieurs lignes courtes (plutot qu'un seul paragraphe) suite a des
    // ecarts constates en test reel (Julien, 2026-08-12) : le modele avait reformule/retranscrit le
    // resultat de l'outil dans un tableau markdown fait main plutot que le relayer fidelement, ce
    // qui a introduit des totaux incoherents, et avait applique un plan sans attendre de confirmation.
    "5 criteres possibles dans `criteria` (liste ORDONNEE, l'ordre = ordre de priorite entre eux) : \"priority\" (Priorite), \"client\" (Importance client, necessite `clientOrder`), \"socle\" (Socle commun en tete), \"debt\" (Dette technique), \"epic\" (Cohesion Epic/Initiative - un Epic ou une Initiative reste groupe dans un seul sprint autant que possible, place en bloc). Par defaut, seule la priorite est active - comme un nouveau scenario cree depuis la page Auto-planning. Designe toujours un sprint par \"Sprint N\" (son numero, tel que liste ci-dessus) plutot que par son seul nom personnalise, qui peut ne pas exister.",
    "IMPORTANT - fidelite du resultat : ne recalcule JAMAIS toi-meme les totaux, ne reformule ni ne resume les chiffres renvoyes par simulate_sprint_plan dans un tableau reconstruit de memoire - recopie les totaux et cles d'items exactement tels que l'outil les a donnes. Si tu veux presenter les choses plus lisiblement (tableau markdown par exemple), recopie chaque valeur depuis le texte de l'outil, ne les recalcule pas et ne les \"corrige\" pas de toi-meme meme si un total te semble bizarre - dis-le a l'utilisateur plutot que de l'ajuster silencieusement.",
    // Reecrit le 2026-08-22 (12e retour Julien, Addendum 12, docs/corrections.md) : les Addendums 4
    // a 10 tentaient tous de fiabiliser un cycle simulation -> confirmation -> application PORTE PAR
    // LE MODELE (texte, appel d'outil, ou une combinaison) - tous neutralises par une nouvelle facon
    // dont le modele derapait. L'Addendum 11 avait ensuite retire la confirmation entierement (fusion
    // simulate+apply). Julien a demande de cadrer une vraie reintroduction avant de recoder : "je veux
    // que le chatbot propose le plan + les infos du sprint et attende ma confirmation pour appliquer,
    // comme Auto-planning le fait." La confirmation revient donc, mais plus JAMAIS sous une forme que
    // le modele doit lui-meme interpreter ou declencher : simulate_sprint_plan reste un pur outil de
    // LECTURE (ne mute plus rien, y compris pour PO/Admin), l'interface affiche un vrai bouton
    // "Appliquer ce plan" sous le resultat (ChatPanel.tsx), et un clic dessus appelle une route
    // dediee (POST /api/ai-chat/apply-plan) qui applique SANS jamais repasser par toi. Tu n'as donc
    // plus AUCUN moyen d'appliquer un plan toi-meme (l'outil apply_sprint_plan n'existe plus) : ton
    // seul role est de simuler, presenter, et adapter sur demande - jamais d'ecrire.
    "Planification : pour TOUTE demande de planification (\"/plan\", \"planifie le prochain sprint\", une phrase decrivant un critere, ou les deux), appelle simulate_sprint_plan, jamais d'estimation improvisee. Le resultat inclut AUTOMATIQUEMENT un theme/Sprint Goal/metriques proposes pour chaque sprint concerne (genere par le serveur, rien a calculer toi-meme) - relaie fidelement TOUT le texte renvoye, plan et themes ensemble, en une seule reponse. N'ecrit rien : l'interface affiche elle-meme un bouton \"Appliquer ce plan\" sous ta reponse, c'est le SEUL moyen d'appliquer. Si l'utilisateur ecrit \"oui\"/\"applique\"/\"vas-y\" ou toute autre confirmation en texte, NE FAIS RIEN toi-meme (pas de nouvel appel a simulate_sprint_plan, jamais d'autre outil) : reponds simplement en renvoyant vers le bouton juste au-dessus (\"Clique sur Appliquer ce plan pour valider.\"), en une phrase courte.",
    "Modification d'un plan deja simule (composition) : si l'utilisateur demande un changement de COMPOSITION (\"utilise plutot le critere client\", \"ajoute aussi la dette technique\", \"enleve la cohesion Epic\"...), interprete la formulation pour savoir si elle REMPLACE les criteres actifs (\"plutot\", \"a la place\", \"non finalement\") ou les CUMULE (\"aussi\", \"en plus\", \"et aussi\") - dans le doute, prefere remplacer plutot que cumuler silencieusement des criteres que l'utilisateur ne voulait peut-etre plus. Rappelle simulate_sprint_plan avec les criteres resultants.",
    // Addendum 13 (2026-08-22, 12e retour Julien, usage reel, docs/corrections.md) : cause reelle
    // observee d'un plan applique avec les MAUVAIS themes - une demande de renommage traitee comme la
    // planification elle-meme ("Confirmes-tu que je procede a l'ecriture ?"), alors que le SEUL bouton
    // existant restait celui, perime, de la simulation d'origine (anciens themes). Cette ligne couvre
    // explicitement le cas ou la demande porte UNIQUEMENT sur le theme/Sprint Goal/metriques, pour ne
    // plus jamais retomber sur ce pattern de confirmation textuelle qui a cause le bug.
    "Modification d'un plan deja simule (theme/Sprint Goal/metriques uniquement, composition inchangee) : si l'utilisateur demande de changer UNIQUEMENT le theme/Sprint Goal/metriques deja proposes (\"renomme le theme du Sprint 4 en X\", \"le Sprint Goal du Sprint 5 devrait plutot dire...\"), NE PROPOSE JAMAIS ce changement en texte libre suivi d'une demande de confirmation - rappelle IMMEDIATEMENT simulate_sprint_plan avec les MEMES autres parametres que ton dernier appel (composition inchangee) et `roadmapGoalOverrides` contenant, pour chaque sprint concerne, le texte exact demande (sprintLabel + name/goal/metrics). Dans TOUS les cas de modification (composition ou themes seuls), un nouveau resultat et un nouveau bouton remplacent la proposition precedente dans ta reponse - la conversation peut continuer ainsi plusieurs fois avant que l'utilisateur ne clique, mais chaque etape doit produire un bouton a jour, jamais seulement du texte a confirmer.",
    "Les items fictifs (`virtualItems`) affiches par simulate_sprint_plan portent une cle PROVISOIRE (leur `tempKey`, ex. \"V1\") - ils ne deviennent de vrais items avec une cle definitive (prefixe du client, ex. \"JIR-004\") qu'apres le clic sur \"Appliquer ce plan\". Precise-le si l'utilisateur s'interroge sur cette cle provisoire.",
    "set_roadmap_goal reste disponible, mais UNIQUEMENT a la demande explicite de l'utilisateur EN DEHORS de toute planification en cours (\"remplis le theme du Sprint 5\", \"regenere le Sprint Goal du sprint en cours\"), y compris pour remplacer un theme/Sprint Goal deja genere/personnalise. Si un plan vient d'etre simule dans la conversation, N'UTILISE PAS cet outil : le theme est deja genere et sera ecrit automatiquement avec le reste au clic sur le bouton, rien a faire de plus.",
  ]
  if (role === 'DEV') {
    lines.push("Ce compte a le role Dev : impossible de creer un item, ni de modifier son contenu produit (titre, description, priorite, client, Epic...). Seuls le statut, les SP, la Definition of Done, les dependances et l'auto-assignation sont modifiables. Pour toute autre demande de creation/modification, explique que seul un Product Owner (ou Admin) peut le faire. Tu peux simuler un plan de sprints (simulate_sprint_plan), mais pour ce role il reste une simulation en LECTURE SEULE, sans aucun bouton d'application (set_roadmap_goal est reserve PO/Admin).")
  } else if (role === 'SCRUM_MASTER') {
    lines.push("Ce compte n'a pas de droits d'ecriture sur le contenu du Backlog : aide uniquement a la reflexion et a la redaction en texte (par exemple un brouillon de User Story a copier), sans jamais creer ou modifier un item toi-meme. Tu peux en revanche simuler un plan de sprints (simulate_sprint_plan), mais pour ce role il reste une simulation en LECTURE SEULE, sans aucun bouton d'application (set_roadmap_goal est reserve PO/Admin).")
  } else if (role === 'STAKEHOLDER') {
    lines.push("Ce compte n'a aucun droit d'ecriture sur le Backlog et pas acces a la simulation de plan de sprints : aide uniquement a la reflexion et a la redaction en texte, sans jamais creer/modifier un item ni simuler de planification toi-meme. Precise-le si on te le demande.")
  }
  return lines.join('\n')
}

export async function aiRoutes(fastify: FastifyInstance) {
  const adminOnly = [authenticate, requireRole('ADMIN')]
  // Démo publique v1 (2026-09-09) : le Compagnon IA appelle une vraie clé Anthropic partagée par
  // toute l'instance (AiConfig, une seule ligne) - coûte réellement, contrairement au reste de
  // l'app. Seule fonctionnalité bloquée côté backend pour le compte démo (voir middleware/auth.ts).
  const demoBlockedAdminOnly = [authenticate, requireRole('ADMIN'), forbidDemo]
  const demoBlocked = [authenticate, forbidDemo]

  fastify.get('/api/ai-config', { preHandler: demoBlockedAdminOnly }, async () => {
    const config = await fastify.prisma.aiConfig.findFirst()
    return { config: config ? toPublicConfig(config) : null }
  })

  // PUT (re)configure l'assistant. `apiKey` optionnel a la mise a jour (garde la cle existante si
  // omise, pour changer de modele sans avoir a ressaisir une cle deja enregistree), verifiee
  // aupres d'Anthropic AVANT d'ecrire quoi que ce soit, meme logique que githubRoutes.
  fastify.put<{ Body: { apiKey?: string; model?: string } }>(
    '/api/ai-config',
    { schema: { body: { type: 'object', properties: { apiKey: { type: 'string' }, model: { type: 'string' } } } }, preHandler: demoBlockedAdminOnly },
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

  fastify.delete('/api/ai-config', { preHandler: demoBlockedAdminOnly }, async (_req, reply) => {
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
    { preHandler: demoBlocked },
    async (req, reply) => {
      const aiConfig: AiConfigRow | null = await fastify.prisma.aiConfig.findFirst()
      if (!aiConfig) return reply.code(400).send({ error: "Aucun assistant IA configure. Un Admin doit d'abord renseigner une cle API Anthropic en Reglages." })

      let state = await loadState(fastify)
      if (!state) return reply.code(404).send({ error: 'Aucun etat trouve' })

      const role = req.user.role
      const isFullEditor = role === 'ADMIN' || role === 'PO'
      // Outils de lecture : tous les roles y ont acces (lecture seule, memes donnees que les pages
      // Backlog/Dashboard deja visibles). Outils d'ecriture : filtres par role comme avant.
      // APPLY_SPRINT_PLAN_TOOL n'est plus expose au modele, ni meme defini (retire a l'Addendum 12,
      // voir plus bas) : l'application d'un plan simule ne passe plus JAMAIS par un outil ni par le
      // modele - un bouton "Appliquer ce plan" (ChatPanel.tsx) declenche POST /api/ai-chat/apply-plan,
      // qui reutilise directement les parametres et le theme/Sprint Goal/metriques figes au moment de
      // simulate_sprint_plan (voir sprint_plan_simulated plus bas), sans nouvel appel Anthropic.
      const writeTools: AnthropicTool[] = isFullEditor
        ? [CREATE_ITEM_TOOL, UPDATE_ITEM_TOOL_FULL, CREATE_HIERARCHY_NODE_TOOL, UPDATE_HIERARCHY_NODE_TOOL, SET_ROADMAP_GOAL_TOOL]
        : role === 'DEV' ? [UPDATE_ITEM_TOOL_DEV] : []
      // simulate_sprint_plan exclu du seul role Stakeholder (contrairement aux 4 outils de lecture
      // ci-dessus, ouverts a tous) : meme perimetre que canExploreWhatIf (utils/permissions.ts cote
      // frontend) sur la page Auto-planning elle-meme - simuler un plan est deja plus qu'une simple
      // lecture du Backlog existant, coherent avec la restriction deja en place sur cette page.
      const sprintPlanTools: AnthropicTool[] = role !== 'STAKEHOLDER' ? [SIMULATE_SPRINT_PLAN_TOOL] : []
      const tools: AnthropicTool[] = [LIST_ITEMS_TOOL, GET_ITEM_TOOL, LIST_HIERARCHY_TOOL, SEARCH_BACKLOG_TOOL, ...sprintPlanTools, ...writeTools]

      const system = buildSystemPrompt(state, role)
      const messages: AnthropicMessage[] = (req.body.messages ?? []).map(m => ({ role: m.role, content: m.content }))
      if (messages.length === 0) return reply.code(400).send({ error: 'Message vide' })

      // Addendum 12 (2026-08-22, 12e retour Julien) : l'Addendum 11 avait retire TOUTE confirmation
      // (simulate_sprint_plan appliquait directement pour PO/Admin), volontairement, le temps de
      // stabiliser l'application elle-meme (voir docs/corrections.md, Addendums 4 a 11 pour
      // l'historique complet des tentatives echouees de fiabiliser une confirmation PORTEE PAR LE
      // MODELE). Une fois l'application confirmee fiable par Julien en conditions reelles,
      // reintroduction cadree d'une confirmation - mais plus JAMAIS via le modele : simulate_sprint_plan
      // redevient une lecture seule pour tous les roles (voir plus bas), et un vrai bouton "Appliquer
      // ce plan" (ChatPanel.tsx) est le SEUL chemin d'application, via POST /api/ai-chat/apply-plan
      // (deterministe, sans appel Anthropic). Cette classe de bug (comportement du modele imprevisible
      // d'un tour a l'autre) devient sans objet pour la confirmation elle-meme.

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
          // Le filet de confirmation ("le modele redemande sans rappeler d'outil") vit desormais
          // AVANT la boucle (voir plus haut, Addendum 10) : plus besoin de le repeter ici a chaque
          // iteration, il a deja eu l'occasion de se declencher avant le tout premier appel modele.
          // stop_reason "max_tokens" : la reponse a ete tronquee en cours de generation (souvent en
          // plein milieu d'un tool_use trop volumineux, ex. plusieurs items "avec tous leurs
          // details") - content peut alors ne contenir ni texte ni outil exploitable. Ce n'est PAS
          // une fin de conversation normale : `exhausted` reste a true pour redonner la main via le
          // message "dis continue" plutot que le silence ou un "reformule" trompeur.
          exhausted = response.stop_reason === 'max_tokens'
          break
        }

        const assistantMsgIndex = messages.length - 1
        const resultBlocks: AnthropicToolResultBlock[] = []
        for (const call of toolUses) {
          try {
            if (READ_TOOL_NAMES.has(call.name)) {
              // simulate_sprint_plan sort du lot des 4 vrais outils de LECTURE ci-dessous : genere un
              // contenu (theme/Sprint Goal/metriques, voir generateRoadmapGoals) qui demande un appel
              // Anthropic et donc `aiConfig` - traite a part plutot que dans executeReadTool (qui
              // reste synchrone pour les 4 autres).
              // Addendum 12 (2026-08-22, 12e retour Julien, docs/corrections.md) : redevient un pur
              // outil de LECTURE pour tous les roles, y compris PO/Admin - la fusion simulate+apply de
              // l'Addendum 11 est defaite. L'application ne passe plus JAMAIS par le modele (ni par un
              // texte de confirmation, ni par un appel d'outil automatique) : un bouton "Appliquer ce
              // plan" affiche cote frontend (voir sprint_plan_simulated ci-dessous) declenche une
              // application deterministe via POST /api/ai-chat/apply-plan, hors de toute boucle
              // agentique. Pour un compte PO/Admin, le toolCall sprint_plan_simulated pousse ci-dessous
              // transporte le plan ET les themes DEJA GENERES (figes) : le bouton les reutilise tels
              // quels au clic, sans regenerer - ce que l'utilisateur voit avant de cliquer est
              // EXACTEMENT ce qui s'ecrit, contrairement au risque de derive qui existait entre 2
              // appels Anthropic distincts (voir Addendum 10).
              if (call.name === 'simulate_sprint_plan') {
                const { text, goals } = await executeSimulateSprintPlan(aiConfig, state, call.input as RawPlanInput)
                if (role === 'ADMIN' || role === 'PO') {
                  toolCalls.push({ kind: 'sprint_plan_simulated', planInput: call.input as Record<string, unknown>, roadmapGoals: goals })
                }
                resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: text })
                continue
              }
              resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: executeReadTool(state, call.name, call.input) })
              continue
            }
            const toolInput = call.input
            if (call.name === 'set_roadmap_goal') {
              const guard = verifyRoadmapGoalConfirmed(messages, assistantMsgIndex)
              if (!guard.ok) {
                resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: guard.reason, is_error: true })
                continue
              }
            }
            const result = await executeTool(fastify, state, call.name, toolInput, role, req.user.id)
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

  // Addendum 12 (2026-08-22, 12e retour Julien, docs/corrections.md) : route dediee au bouton
  // "Appliquer ce plan" (ChatPanel.tsx), qui remplace definitivement la confirmation textuelle
  // (jamais fiabilisee malgre 11 tentatives successives, voir l'historique complet du chantier).
  // Deterministe et INDEPENDANTE de la boucle agentique : ne consulte JAMAIS le modele, n'a donc pas
  // besoin de `aiConfig` ni de l'historique de conversation - `planInput`/`roadmapGoals` recus ici
  // sont exactement ceux du toolCall sprint_plan_simulated qui a affiche le bouton (le frontend les
  // reexpedie tels quels, sans les reconstruire), donc exactement ce que l'utilisateur a vu avant de
  // cliquer. Role verifie a l'interieur d'executeApplySprintPlan (meme garantie que les autres routes
  // d'ecriture), pas besoin de la dupliquer ici.
  fastify.post<{ Body: { planInput?: RawPlanInput; roadmapGoals?: GeneratedRoadmapGoal[] } }>(
    '/api/ai-chat/apply-plan',
    { preHandler: authenticate },
    async (req, reply) => {
      const state = await loadState(fastify)
      if (!state) return reply.code(404).send({ error: 'Aucun etat trouve' })
      try {
        const result = await executeApplySprintPlan(fastify, state, req.body.planInput ?? {}, req.body.roadmapGoals ?? [], req.user.role)
        return { reply: result.text, toolCall: result.toolCall }
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : 'Erreur' })
      }
    }
  )
}
