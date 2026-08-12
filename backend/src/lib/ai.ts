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
    // 529 (retour Julien, 2026-08-12) : surcharge temporaire cote Anthropic (pas un bug Cadence),
    // deja documentee comme "overloaded_error" - meme traitement "message clair" que 401/429/404
    // plutot que de laisser remonter le JSON brut de l'API dans le chat.
    if (res.status === 529) throw new Error('API Anthropic temporairement surchargee, reessayez dans quelques instants')
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

// max_tokens releve de 1536 a 4096 le 2026-08-09 (3e retour Julien) : une demande de creation
// d'items "avec tous leurs details" (titre, role/besoin/benefice, plusieurs criteres GIVEN/WHEN/
// THEN) genere un appel d'outil volumineux, tronque a 1536 - la troncature en cours de generation
// d'un tool_use ne renvoie ni texte ni outil exploitable (content vide), ce que la boucle agentique
// de routes/ai.ts interpretait a tort comme "reponse terminee, rien a faire" plutot que "tronque,
// il faut continuer" (voir la verification de stop_reason ajoutee a cote de cet appel).
export async function callWithTools(
  config: AiConfigRow, system: string, messages: AnthropicMessage[], tools: AnthropicTool[]
): Promise<AnthropicResponse> {
  return anthropicCall(config, { system, messages, tools, max_tokens: 4096 })
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

/* ── Outils de LECTURE ──────────────────────────────────────────────────────────────────────────
   Ajoutes 2026-08-09 suite a un retour Julien apres usage reel : sans ces outils, le chat n'a acces
   qu'aux quelques listes (noms/libelles) injectees dans le prompt systeme, jamais au detail d'un
   item existant ni a la liste des Epics/items - il ne peut donc ni retrouver le contenu d'un item
   pour l'estimer, ni reperer quels Epics sont vides pour une demande en masse ("peuple tous les
   Epics vides"), et le dit explicitement plutot que d'inventer. Memes 4 outils que le serveur MCP
   (mcp/src/tools.ts : list_items/get_item/list_hierarchy/search_backlog), disponibles ici a TOUS
   les roles (y compris Scrum Master/Stakeholder) puisqu'ils ne font que lire - contrairement aux 5
   outils d'ecriture ci-dessus, filtres par role dans routes/ai.ts. */

export const LIST_ITEMS_TOOL: AnthropicTool = {
  name: 'list_items',
  description: 'Liste les items du Backlog (User Stories, Bugs, Taches, Spikes), avec filtres optionnels. Utilise "current" comme valeur de sprint pour le sprint en cours.',
  input_schema: {
    type: 'object',
    properties: {
      sprint: { type: 'string', description: 'Libelle du sprint, ou "current" pour le sprint en cours' },
      status: { type: 'string', description: 'Libelle du statut Kanban exact' },
      clientName: { type: 'string' },
      epicKey: { type: 'string', description: "Cle de l'Epic ou de l'Initiative parent" },
      assignee: { type: 'string', description: "Nom (ou partie du nom) d'un membre de l'equipe" },
      tag: { type: 'string' },
      type: { type: 'string', description: 'story, bug, task ou spike' },
      priority: { type: 'string', description: 'critical, high, medium ou low' },
      unassigned: { type: 'boolean', description: 'true pour ne garder que les items sans aucun assigne' },
      hasDeps: { type: 'boolean', description: 'true pour ne garder que les items ayant au moins une dependance, false pour ceux sans aucune' },
      hasDeadline: { type: 'boolean', description: 'true pour ne garder que les items avec une date de livraison renseignee, false pour ceux sans' },
      overdueOnly: { type: 'boolean', description: "true pour ne garder que les items dont la date de livraison est deja passee et le statut pas encore termine" },
      dueSoon: { type: 'boolean', description: 'true pour ne garder que les items dont la date de livraison tombe dans les 7 prochains jours (incluse) et le statut pas encore termine' },
      done: { type: 'boolean', description: 'true pour ne garder que les items dans un statut marque "termine" (colonne Kanban isDone), false pour les non-termines - a utiliser plutot que de filtrer sur `status` par libelle pour ce genre de question' },
      blocked: { type: 'boolean', description: 'true pour ne garder que les items actuellement au statut Bloque' },
      hasSp: { type: 'boolean', description: 'true pour ne garder que les items avec des Story Points (> 0), false pour ceux a 0 SP' },
      hasStory: { type: 'boolean', description: "true pour ne garder que les items dont le role/besoin/benefice (User Story) est renseigne, false pour ceux ou les 3 champs sont vides - a combiner avec type: \"story\" pour ne cibler que les User Stories" },
      hasAcceptance: { type: 'boolean', description: "true pour ne garder que les items ayant au moins un critere d'acceptation, false pour ceux sans aucun" },
      dorComplete: { type: 'boolean', description: 'true pour ne garder que les items dont la Definition of Ready est complete (toutes les cases cochees), false pour ceux vides ou incomplets' },
      dodComplete: { type: 'boolean', description: 'true pour ne garder que les items dont la Definition of Done est complete (toutes les cases cochees), false pour ceux vides ou incomplets' },
      depOnDone: { type: 'boolean', description: "true pour ne garder que les items ayant au moins une dependance pointant vers un item deja termine (dependance potentiellement obsolete)" },
      limit: { type: 'number', description: 'Par defaut 50, max 1000 - passer explicitement une limite haute (ex. 1000) pour un balayage complet du Backlog (audit, detection d\'anomalies)' },
    },
    additionalProperties: false,
  },
}

export const GET_ITEM_TOOL: AnthropicTool = {
  name: 'get_item',
  description: "Detail complet d'un item du Backlog (User Story role/besoin/benefice, criteres d'acceptation, dependances, date de livraison, severite, DoR/DoD...) a partir de sa Cle. A utiliser avant toute estimation de SP ou modification pour connaitre le contenu exact de l'item.",
  input_schema: {
    type: 'object',
    properties: { key: { type: 'string', description: 'Cle de l\'item, ex. "FAX-012"' } },
    required: ['key'],
    additionalProperties: false,
  },
}

export const LIST_HIERARCHY_TOOL: AnthropicTool = {
  name: 'list_hierarchy',
  description: "Liste les Epics et Initiatives avec, pour chacun, son SP, son nombre d'items rattaches, et un signalement si son SP ne correspond pas a la somme des SP de ses items - a utiliser pour reperer les Epics vides (0 item rattache) avant une demande en masse, ou un ecart de SP a corriger.",
  input_schema: {
    type: 'object',
    properties: {
      level: { type: 'string', description: 'epic ou initiative' },
      clientName: { type: 'string' },
    },
    additionalProperties: false,
  },
}

export const SEARCH_BACKLOG_TOOL: AnthropicTool = {
  name: 'search_backlog',
  description: "Recherche libre dans le Backlog (titre, role/besoin/benefice de la User Story), insensible aux accents et a la casse - utile pour trouver des items comparables lors d'une estimation de SP.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number', description: 'Par defaut 30, max 1000' },
    },
    required: ['query'],
    additionalProperties: false,
  },
}

/* ── Planification de sprints (Phase 6, sous-chantier 4, etape 2/2, 2026-08-12) ────────────────────
   simulate_sprint_plan / apply_sprint_plan reproduisent exactement l'algorithme d'Auto-planning
   (lib/sprintPlanner.ts, portage fidele de AutoPlanningPage.tsx) plutot que de laisser Claude
   raisonner librement - decision Julien (AskUserQuestion) : le resultat doit etre identique a
   Auto-planning (jamais un Epic/Initiative coupe quand le critere est actif, capacite de sprint
   reellement respectee), pas une estimation approximative. Les deux outils partagent le MEME schema
   d'entree : apply_sprint_plan recalcule le plan a partir des memes parametres plutot que de
   referencer un plan simule precedemment (le chat est sans etat cote serveur, voir routes/ai.ts). */

const SPRINT_PLAN_PARAMS = {
  criteria: {
    type: 'array', items: { type: 'string' },
    description: "Liste ORDONNEE des criteres actifs (l'ordre = ordre de priorite entre eux), parmi : \"priority\" (Priorite : items critiques/high en premier), \"client\" (Importance client : necessite clientOrder), \"socle\" (Socle commun en tete : items sans client en premier), \"debt\" (Dette technique : Bugs en premier), \"epic\" (Cohesion Epic/Initiative : garde les items d'un meme Epic/Initiative dans le meme sprint, place les groupes en bloc). Par defaut, seule \"priority\".",
  },
  clientOrder: { type: 'array', items: { type: 'string' }, description: "Noms de clients dans l'ordre d'importance decroissante, utilise seulement si \"client\" est dans criteria." },
  velocityFactor: { type: 'number', description: 'Multiplicateur applique a la capacite de chaque sprint, 1 = normal, 0.8 = 80%. Par defaut 1.' },
  capacityOverrides: {
    type: 'array',
    description: 'Force la capacite (en SP) d\'un sprint precis, ex. pour une absence connue.',
    items: {
      type: 'object',
      properties: { sprintLabel: { type: 'string' }, capacity: { type: 'number' }, note: { type: 'string' } },
      required: ['sprintLabel', 'capacity'],
    },
  },
  virtualItems: {
    type: 'array',
    description: "Items fictifs a inclure dans le plan (n'existent pas reellement dans le Backlog, sauf si le plan est ensuite applique via apply_sprint_plan, qui les cree alors pour de vrai).",
    items: {
      type: 'object',
      properties: {
        tempKey: { type: 'string', description: 'Identifiant temporaire choisi par toi pour cette demande (ex. "V1"), pour le referencer dans les deps d\'un autre item fictif de la meme demande.' },
        desc: { type: 'string' }, sp: { type: 'number' },
        priority: { type: 'string', description: 'critical, high, medium ou low' },
        clientName: { type: 'string' }, type: { type: 'string', description: 'story, bug, task ou spike' },
        deps: { type: 'array', items: { type: 'string' }, description: "Cles d'items reels, ou tempKey d'autres items fictifs de cette meme demande, dont celui-ci depend" },
      },
      required: ['tempKey', 'desc', 'sp'],
    },
  },
  itemOverrides: {
    type: 'array',
    description: 'Modifie un item reel UNIQUEMENT pour ce plan (jamais ecrit dans le Backlog, meme via apply_sprint_plan), pour simuler "et si ce statut/cette priorite/ces SP/ces deps etaient differents".',
    items: {
      type: 'object',
      properties: {
        key: { type: 'string', description: "Cle de l'item, ex. \"FAX-012\"" },
        status: { type: 'string' }, priority: { type: 'string' }, sp: { type: 'number' },
        deps: { type: 'array', items: { type: 'string' }, description: 'Remplace completement les dependances de cet item pour la simulation' },
      },
      required: ['key'],
    },
  },
  fromSprintLabel: { type: 'string', description: 'Ne planifier qu\'a partir de ce sprint (inclus), ou "current" pour le sprint en cours. Par defaut, tous les sprints ouverts depuis le debut.' },
}

export const SIMULATE_SPRINT_PLAN_TOOL: AnthropicTool = {
  name: 'simulate_sprint_plan',
  description: "Simule un plan de sprints (quel item dans quel sprint) en reproduisant exactement l'algorithme de la page Auto-planning, sans rien ecrire. A utiliser pour repondre a toute demande de planification (\"planifie le prochain sprint\", \"et si on priorisait le client X\"). N'ecrit rien : pour ecrire reellement le plan, utilise apply_sprint_plan (reserve PO/Admin) apres accord explicite de l'utilisateur.",
  input_schema: { type: 'object', properties: SPRINT_PLAN_PARAMS, additionalProperties: false },
}

export const APPLY_SPRINT_PLAN_TOOL: AnthropicTool = {
  name: 'apply_sprint_plan',
  description: "Calcule ET ECRIT REELLEMENT un plan de sprints : reaffecte les items reels aux sprints calcules, cree les nouveaux sprints necessaires, materialise les items fictifs en vrais items du Backlog. Reserve aux comptes PO ou Admin (comme le bouton \"Appliquer\" d'Auto-planning). A n'utiliser qu'apres avoir montre le resultat via simulate_sprint_plan ET obtenu un accord explicite de l'utilisateur (\"applique\", \"vas-y\", \"oui\") - jamais sur une simple demande de planification, qui doit d'abord passer par simulate_sprint_plan.",
  input_schema: { type: 'object', properties: SPRINT_PLAN_PARAMS, additionalProperties: false },
}
