// Phase 6 (roadmap v1), Compagnon IA, 2026-08-08 : appels a l'API Anthropic (Claude), Messages API
// avec outils (tool use / function calling). Decision Julien (AskUserQuestion) : API Claude
// (Anthropic) plutot qu'un autre fournisseur LLM. Meme posture que lib/github.ts/lib/slack.ts/
// lib/jira.ts : un seul fichier bas niveau (appel HTTP + formatage des erreurs), consomme par
// routes/ai.ts qui, lui, execute reellement les outils (reutilise backlogWrite.ts). En-tete
// `anthropic-version` : version de l'API Messages elle-meme (stable depuis Claude 3), sans lien
// avec le modele demande (`config.model`, ex. "claude-sonnet-5").
const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

export interface AiConfigRow { apiKey: string; model: string }

export interface AnthropicTextBlock { type: 'text'; text: string }
export interface AnthropicToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock
export interface AnthropicToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | (AnthropicContentBlock | AnthropicToolResultBlock)[]
}

export interface AnthropicTool {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean }
}

interface AnthropicResponse {
  content: AnthropicContentBlock[]
  stop_reason: string
}

async function anthropicCall(
  config: AiConfigRow,
  body: { system?: string; messages: AnthropicMessage[]; tools?: AnthropicTool[]; max_tokens: number }
): Promise<AnthropicResponse> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: config.model, ...body }),
  })
  if (!res.ok) {
    const text = await res.text()
    if (res.status === 401) throw new Error('Cle API Anthropic invalide ou revoquee')
    if (res.status === 429) throw new Error('Limite de requetes Anthropic atteinte, reessayez dans quelques instants')
    if (res.status === 404) throw new Error(`Modele Anthropic "${config.model}" introuvable : verifiez l'identifiant`)
    throw new Error(`API Anthropic ${res.status} : ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<AnthropicResponse>
}

/** Verifie que la cle (et le modele) fonctionnent avant d'enregistrer la config - un appel minimal
 *  (1 jeton de sortie), meme logique que validateRepo (github.ts) / validateSlackToken (slack.ts) :
 *  mieux vaut echouer maintenant, avec un message clair, qu'au premier message envoye par un
 *  utilisateur du chat. */
export async function validateAnthropicKey(config: AiConfigRow): Promise<void> {
  await anthropicCall(config, { messages: [{ role: 'user', content: 'Bonjour' }], max_tokens: 1 })
}

export async function callWithTools(
  config: AiConfigRow, system: string, messages: AnthropicMessage[], tools: AnthropicTool[]
): Promise<AnthropicResponse> {
  return anthropicCall(config, { system, messages, tools, max_tokens: 1536 })
}

/** Meme logique que maskToken (github.ts) / maskSlackToken (slack.ts) : jamais la cle en clair une
 *  fois enregistree, seulement ses 4 derniers caracteres. */
export function maskApiKey(key: string): string {
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`
}

/* ── Outils (tool use) ──────────────────────────────────────────────────────────────────────────
   Memes champs/descriptions que mcp/src/tools.ts (create_item, update_item, create_hierarchy_node,
   update_hierarchy_node) : une seule source de verite conceptuelle pour ce qu'un "Claude" (ici
   embarque dans l'appli, la-bas cote MCP) peut faire au Backlog - dupliquee en JSON Schema ici
   (mcp/src/tools.ts est en zod, deux runtimes distincts, meme constat deja fait pour
   backlogWrite.ts). `additionalProperties: false` : indication au modele, pas une validation dure
   cote Anthropic - l'application stricte du sous-ensemble Dev reste verifiee cote serveur
   (routes/ai.ts, DEV_ALLOWED_FIELDS), exactement comme le PATCH /api/items/:key existant. */

export const CREATE_ITEM_TOOL: AnthropicTool = {
  name: 'create_item',
  description: 'Cree un nouvel item du Backlog (User Story, Bug, Tache ou Spike). Reserve aux comptes PO ou Admin.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: "Titre de l'item" },
      role: { type: 'string', description: 'User Story : "en tant que ..."' },
      need: { type: 'string', description: 'User Story : "je souhaite ..."' },
      benefit: { type: 'string', description: 'User Story : "afin de ..."' },
      type: { type: 'string', description: 'story, bug, task ou spike (story par defaut)' },
      priority: { type: 'string', description: 'critical, high, medium ou low (medium par defaut)' },
      status: { type: 'string', description: 'Libelle du statut Kanban (statut par defaut sinon)' },
      clientName: { type: 'string' },
      epicKey: { type: 'string', description: "Cle de l'Epic ou de l'Initiative parent" },
      sprintLabel: { type: 'string', description: 'Libelle du sprint, ou "current" pour le sprint en cours' },
      sp: { type: 'number' },
      tags: { type: 'array', items: { type: 'string' } },
      criteria: {
        type: 'array',
        description: "Criteres d'acceptation (format GIVEN/WHEN/THEN)",
        items: {
          type: 'object',
          // "then" ci-dessous est un nom de champ JSON Schema (format BDD Given/When/Then), jamais
          // une methode d'objet appelee/attendue.
          // oxlint-disable-next-line unicorn/no-thenable
          properties: { given: { type: 'string' }, when: { type: 'string' }, then: { type: 'string' } },
          required: ['given', 'when', 'then'],
        },
      },
    },
    required: ['title'],
    additionalProperties: false,
  },
}

const UPDATE_ITEM_FIELDS_FULL = {
  key: { type: 'string', description: 'Cle de l\'item a modifier, ex. "FAX-012"' },
  title: { type: 'string' },
  role: { type: 'string' },
  need: { type: 'string' },
  benefit: { type: 'string' },
  type: { type: 'string' },
  priority: { type: 'string', description: 'critical, high, medium ou low' },
  status: { type: 'string', description: 'Libelle du statut Kanban' },
  clientName: { type: 'string' },
  epicKey: { type: 'string' },
  sprintLabel: { type: 'string', description: 'Libelle du sprint, ou "current"' },
  sp: { type: 'number' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Remplace tous les tags' },
  assignees: { type: 'array', items: { type: 'string' }, description: 'Noms des membres, remplace la liste complete' },
  deps: { type: 'array', items: { type: 'string' }, description: "Cles des items dont celui-ci depend, remplace la liste complete" },
  dor: {
    type: 'array', description: 'Definition of Ready, remplace la liste complete',
    items: { type: 'object', properties: { text: { type: 'string' }, done: { type: 'boolean' } }, required: ['text', 'done'] },
  },
  dod: {
    type: 'array', description: 'Definition of Done, remplace la liste complete',
    items: { type: 'object', properties: { text: { type: 'string' }, done: { type: 'boolean' } }, required: ['text', 'done'] },
  },
}

export const UPDATE_ITEM_TOOL_FULL: AnthropicTool = {
  name: 'update_item',
  description: "Modifie un item existant du Backlog par sa Cle. Reserve aux comptes PO ou Admin (tous les champs).",
  input_schema: { type: 'object', properties: UPDATE_ITEM_FIELDS_FULL, required: ['key'], additionalProperties: false },
}

export const UPDATE_ITEM_TOOL_DEV: AnthropicTool = {
  name: 'update_item',
  description: "Modifie le statut, les SP, la Definition of Done, les dependances, ou ta propre auto-assignation sur un item existant par sa Cle. Un compte Dev ne peut modifier que ce sous-ensemble operationnel, jamais le contenu produit (titre, description, priorite, client, Epic...).",
  input_schema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Cle de l\'item a modifier, ex. "FAX-012"' },
      status: { type: 'string', description: 'Libelle du statut Kanban' },
      sp: { type: 'number' },
      deps: { type: 'array', items: { type: 'string' } },
      dod: UPDATE_ITEM_FIELDS_FULL.dod,
      assignSelf: { type: 'boolean', description: 'true pour t\'auto-assigner, false pour te retirer' },
    },
    required: ['key'],
    additionalProperties: false,
  },
}

export const CREATE_HIERARCHY_NODE_TOOL: AnthropicTool = {
  name: 'create_hierarchy_node',
  description: 'Cree un nouvel Epic ou une nouvelle Initiative. Reserve aux comptes PO ou Admin.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      level: { type: 'string', description: 'epic ou initiative (epic par defaut)' },
      parentKey: { type: 'string', description: "Cle de l'Initiative parente, pour un Epic" },
      clientName: { type: 'string' },
      sprintLabel: { type: 'string', description: 'Libelle du sprint, ou "current"' },
      sp: { type: 'number' },
    },
    required: ['title'],
    additionalProperties: false,
  },
}

export const UPDATE_HIERARCHY_NODE_TOOL: AnthropicTool = {
  name: 'update_hierarchy_node',
  description: 'Modifie un Epic ou une Initiative existant par sa Cle. Reserve aux comptes PO ou Admin.',
  input_schema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: "Cle de l'Epic/Initiative a modifier" },
      title: { type: 'string' },
      level: { type: 'string', description: 'epic ou initiative' },
      parentKey: { type: 'string' },
      clientName: { type: 'string' },
      sprintLabel: { type: 'string', description: 'Libelle du sprint, ou "current"' },
      sp: { type: 'number' },
    },
    required: ['key'],
    additionalProperties: false,
  },
}
