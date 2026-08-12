import { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'
import {
  validateAnthropicKey, callWithTools, maskApiKey,
  CREATE_ITEM_TOOL, UPDATE_ITEM_TOOL_FULL, UPDATE_ITEM_TOOL_DEV, CREATE_HIERARCHY_NODE_TOOL, UPDATE_HIERARCHY_NODE_TOOL,
  LIST_ITEMS_TOOL, GET_ITEM_TOOL, LIST_HIERARCHY_TOOL, SEARCH_BACKLOG_TOOL,
  SIMULATE_SPRINT_PLAN_TOOL, APPLY_SPRINT_PLAN_TOOL,
  type AiConfigRow, type AnthropicMessage, type AnthropicTool, type AnthropicTextBlock, type AnthropicToolUseBlock, type AnthropicToolResultBlock,
} from '../lib/ai'
import {
  loadState, saveState, uid, nextKeyForPrefix, allKeys, normalize, getCurrentSprint,
  resolveClientId, resolveEpicId, resolveSprintId, resolveStatus, resolveType, resolvePriority, resolveLevel,
  resolveAssigneeIds, resolveDepKeys, linkedTeamMember,
  type CadenceState, type Item, type HierarchyNode, type Sprint,
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
  | { kind: 'sprint_plan_applied'; changedItems: Item[]; newItems: Item[]; newSprints: Sprint[]; keyCounters: Record<string, number> }

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
interface RawPlanInput {
  criteria?: string[]; clientOrder?: string[]; velocityFactor?: number
  capacityOverrides?: RawCapacityOverride[]; virtualItems?: RawVirtualItem[]; itemOverrides?: RawItemOverride[]
  fromSprintLabel?: string
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

function executeSimulateSprintPlan(state: CadenceState, input: RawPlanInput): string {
  const { params } = resolvePlanParams(state, input)
  const plan = computeSprintPlan(state, params)
  return formatPlanResult(state, plan, false)
}

async function executeApplySprintPlan(fastify: FastifyInstance, state: CadenceState, input: RawPlanInput, role: string): Promise<ToolExecResult> {
  if (role !== 'ADMIN' && role !== 'PO') throw new Error('Reserve aux comptes PO ou Admin (comme le bouton "Appliquer" d\'Auto-planning)')
  const { params, virtualItems } = resolvePlanParams(state, input)
  const plan = computeSprintPlan(state, params)
  const result = applySprintPlan(state, plan, virtualItems, state.itemKeyCounters ?? {}, uid, nextKeyForPrefix)
  await saveState(fastify, result.nextState)

  const changedItems = result.nextState.items.filter(ni => {
    const before = state.items.find(i => i.id === ni.id)
    return !!before && (before.sprintId !== ni.sprintId || before.status !== ni.status)
  })
  const newItems = result.nextState.items.filter(ni => !state.items.some(i => i.id === ni.id))
  const newSprints = result.nextState.sprints.filter(ns => !state.sprints.some(s => s.id === ns.id))

  const summaryParts = [`${result.newSprintsCount} sprint(s) cree(s)`, `${result.reassignedCount} item(s) reaffecte(s)`]
  if (result.createdCount > 0) summaryParts.push(`${result.createdCount} item(s) fictif(s) cree(s)`)
  const text = `Plan applique : ${summaryParts.join(', ')}.\n\n${formatPlanResult(state, plan, true)}`

  return {
    state: result.nextState, text,
    toolCall: { kind: 'sprint_plan_applied', changedItems, newItems, newSprints, keyCounters: result.nextState.itemKeyCounters ?? {} },
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
    case 'apply_sprint_plan': return executeApplySprintPlan(fastify, state, input as RawPlanInput, role)
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
    case 'simulate_sprint_plan': return executeSimulateSprintPlan(state, input as RawPlanInput)
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
    "Planification de sprints : pour toute demande de planification (\"planifie le prochain sprint\", \"et si on priorisait le client X\", \"simule un scenario ou...\"), utilise TOUJOURS simulate_sprint_plan plutot que d'estimer toi-meme un placement - c'est le meme algorithme que la page Auto-planning, le resultat doit rester identique a ce qu'elle produirait.",
    "5 criteres possibles dans `criteria` (liste ORDONNEE, l'ordre = ordre de priorite entre eux) : \"priority\" (Priorite), \"client\" (Importance client, necessite `clientOrder`), \"socle\" (Socle commun en tete), \"debt\" (Dette technique), \"epic\" (Cohesion Epic/Initiative - un Epic ou une Initiative reste groupe dans un seul sprint autant que possible, place en bloc). Par defaut, seule la priorite est active - comme un nouveau scenario cree depuis la page Auto-planning. Designe toujours un sprint par \"Sprint N\" (son numero, tel que liste ci-dessus) plutot que par son seul nom personnalise, qui peut ne pas exister.",
    "IMPORTANT - fidelite du resultat : ne recalcule JAMAIS toi-meme les totaux, ne reformule ni ne resume les chiffres renvoyes par simulate_sprint_plan dans un tableau reconstruit de memoire - recopie les totaux et cles d'items exactement tels que l'outil les a donnes. Si tu veux presenter les choses plus lisiblement (tableau markdown par exemple), recopie chaque valeur depuis le texte de l'outil, ne les recalcule pas et ne les \"corrige\" pas de toi-meme meme si un total te semble bizarre - dis-le a l'utilisateur plutot que de l'ajuster silencieusement.",
    "IMPORTANT - ne jamais appliquer sans confirmation : n'appelle JAMAIS apply_sprint_plan dans le meme tour de reponse qu'une simulation, meme si la demande initiale mentionnait deja \"applique\" ou \"planifie et applique\" - montre TOUJOURS le resultat de simulate_sprint_plan et attends un nouveau message explicite de l'utilisateur (\"applique\", \"vas-y\", \"oui\") avant d'appeler apply_sprint_plan.",
    "IMPORTANT - memes parametres entre simulation et application : quand l'utilisateur confirme, rappelle apply_sprint_plan avec EXACTEMENT les memes valeurs de `criteria`/`clientOrder`/`velocityFactor`/`capacityOverrides`/`virtualItems`/`itemOverrides`/`fromSprintLabel` que le dernier simulate_sprint_plan de cette conversation - jamais reformules ou re-devines de memoire, le resultat ecrit doit correspondre exactement a ce qui a ete montre.",
    "Les items fictifs (`virtualItems`) affiches par simulate_sprint_plan portent une cle PROVISOIRE (leur `tempKey`, ex. \"V1\") - ce n'est qu'apres apply_sprint_plan qu'ils deviennent de vrais items avec une cle definitive (prefixe du client, ex. \"JIR-004\"). Precise-le si l'utilisateur s'interroge sur cette cle provisoire.",
  ]
  if (role === 'DEV') {
    lines.push("Ce compte a le role Dev : impossible de creer un item, ni de modifier son contenu produit (titre, description, priorite, client, Epic...). Seuls le statut, les SP, la Definition of Done, les dependances et l'auto-assignation sont modifiables. Pour toute autre demande de creation/modification, explique que seul un Product Owner (ou Admin) peut le faire. Tu peux simuler un plan de sprints (simulate_sprint_plan) mais jamais l'appliquer (apply_sprint_plan est reserve PO/Admin).")
  } else if (role === 'SCRUM_MASTER') {
    lines.push("Ce compte n'a pas de droits d'ecriture sur le contenu du Backlog : aide uniquement a la reflexion et a la redaction en texte (par exemple un brouillon de User Story a copier), sans jamais creer ou modifier un item toi-meme. Tu peux en revanche simuler un plan de sprints (simulate_sprint_plan), mais jamais l'appliquer (apply_sprint_plan est reserve PO/Admin).")
  } else if (role === 'STAKEHOLDER') {
    lines.push("Ce compte n'a aucun droit d'ecriture sur le Backlog et pas acces a la simulation de plan de sprints : aide uniquement a la reflexion et a la redaction en texte, sans jamais creer/modifier un item ni simuler de planification toi-meme. Precise-le si on te le demande.")
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
        ? [CREATE_ITEM_TOOL, UPDATE_ITEM_TOOL_FULL, CREATE_HIERARCHY_NODE_TOOL, UPDATE_HIERARCHY_NODE_TOOL, APPLY_SPRINT_PLAN_TOOL]
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
