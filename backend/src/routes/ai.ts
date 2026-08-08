import { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'
import {
  validateAnthropicKey, callWithTools, maskApiKey,
  CREATE_ITEM_TOOL, UPDATE_ITEM_TOOL_FULL, UPDATE_ITEM_TOOL_DEV, CREATE_HIERARCHY_NODE_TOOL, UPDATE_HIERARCHY_NODE_TOOL,
  type AiConfigRow, type AnthropicMessage, type AnthropicTool, type AnthropicTextBlock, type AnthropicToolUseBlock, type AnthropicToolResultBlock,
} from '../lib/ai'
import {
  loadState, saveState, uid, nextKeyForPrefix, allKeys,
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

/** Contexte injecte dans le prompt systeme : listes courtes (noms/libelles) pour que Claude designe
 *  toujours un Client/Sprint/Statut/Epic par son NOM, jamais par un identifiant technique - memes
 *  fonctions resolveXxx que le reste de backlogWrite.ts en aval, qui matchent par nom normalise. Le
 *  Backlog complet n'est volontairement PAS injecte ici (hors perimetre de ce sous-chantier "aide a
 *  la redaction/creation d'items" - une liste de 100+ items alourdirait chaque appel pour rien). */
function buildSystemPrompt(state: CadenceState, role: string): string {
  const clients = state.clients.map(c => c.name).join(', ') || '(aucun)'
  const sprints = state.sprints.map(s => `${s.label}${s.closed ? '' : ' (ouvert)'}`).join(', ') || '(aucun)'
  const statuses = state.kanbanCols.map(c => c.label).join(', ') || '(aucun)'
  const epics = state.hierarchyNodes.slice(0, 40).map(n => `${n.key} (${n.desc})`).join(', ') || '(aucun)'

  const lines = [
    "Tu es le Compagnon IA de Cadence, un outil de gestion de backlog agile (Scrum). Tu aides a la redaction et a la creation d'items du Backlog (User Stories, Bugs, Taches, Spikes) et d'Epics/Initiatives. Reponds toujours en francais, dans un ton professionnel et concis.",
    `Clients existants : ${clients}`,
    `Sprints existants : ${sprints}`,
    `Statuts Kanban existants : ${statuses}`,
    `Epics/Initiatives existants (40 premiers) : ${epics}`,
    "Quand une demande implique de creer ou modifier un item/Epic/Initiative, utilise les outils a ta disposition plutot que de te contenter de decrire le resultat en texte. Designe toujours un client, un sprint, un statut ou un Epic par son NOM ou LIBELLE exact tel que liste ci-dessus, jamais par un identifiant technique interne.",
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
      const tools: AnthropicTool[] = isFullEditor
        ? [CREATE_ITEM_TOOL, UPDATE_ITEM_TOOL_FULL, CREATE_HIERARCHY_NODE_TOOL, UPDATE_HIERARCHY_NODE_TOOL]
        : role === 'DEV' ? [UPDATE_ITEM_TOOL_DEV] : []

      const system = buildSystemPrompt(state, role)
      const messages: AnthropicMessage[] = (req.body.messages ?? []).map(m => ({ role: m.role, content: m.content }))
      if (messages.length === 0) return reply.code(400).send({ error: 'Message vide' })

      const toolCalls: AiToolCall[] = []
      let finalText = ''

      // Boucle agentique : un tour peut enchainer plusieurs appels d'outils (ex. "cree un Epic X
      // puis 3 US dedans") avant de revenir a du texte pur. Plafond de securite pour ne jamais
      // boucler indefiniment sur une reponse mal formee.
      for (let iteration = 0; iteration < 6; iteration++) {
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
        if (toolUses.length === 0) break

        const resultBlocks: AnthropicToolResultBlock[] = []
        for (const call of toolUses) {
          try {
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

      return { reply: finalText, toolCalls }
    }
  )
}
