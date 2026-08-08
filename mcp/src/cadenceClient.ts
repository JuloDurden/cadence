import type { CadenceState, HierarchyNode, Item, Sprint } from './types.js'

// CADENCE_API_URL / CADENCE_API_TOKEN : configurés dans le client MCP (Claude Desktop/Code), voir
// README.md. Le jeton est un PAT généré depuis Réglages > "Jetons API personnels (MCP)"
// (backend/src/routes/apiTokens.ts) : ce serveur MCP n'a JAMAIS de logique d'auth propre, il se
// contente de porter le jeton reçu sur chaque appel, c'est le backend qui décide, avec les mêmes
// règles de rôle (Admin/PO/etc.) que le reste de l'app, de ce que ce jeton a le droit de lire.
const API_URL = process.env.CADENCE_API_URL ?? 'http://localhost:3001'
const API_TOKEN = process.env.CADENCE_API_TOKEN

if (!API_TOKEN) {
  console.error('[cadence-mcp] CADENCE_API_TOKEN manquant, generez un jeton dans Reglages > Jetons API personnels (MCP), puis configurez-le dans votre client MCP. Voir mcp/README.md.')
  process.exit(1)
}

/** Recharge l'état complet du workspace à chaque appel (pas de cache) : le jeu de données de
 *  Cadence reste modeste (un seul workspace, quelques centaines d'items au plus) et un widget
 *  Dashboard ouvert en parallèle doit voir Claude répondre avec des données fraîches, pas un
 *  instantané figé au démarrage du serveur MCP. */
export async function fetchState(): Promise<CadenceState> {
  const res = await fetch(`${API_URL}/api/state`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  })
  if (res.status === 401) {
    throw new Error('Jeton Cadence invalide, expiré ou révoqué, régénérez-en un dans Réglages > Jetons API personnels (MCP).')
  }
  if (!res.ok) {
    throw new Error(`Cadence API ${res.status} : ${await res.text()}`)
  }
  const body = await res.json() as { data: CadenceState }
  return body.data
}

/** Même règle que frontend/src/utils/sprints.ts (`getCurrentSprint`, "ne jamais recoder cette
 *  logique ailleurs, toujours passer par ce helper"), dupliquée ici pour la même raison que
 *  types.ts : ce n'est plus "ailleurs" dans le même bundle, mais un module Node séparé. */
export function getCurrentSprint(state: CadenceState): Sprint | undefined {
  return (
    state.sprints.find(s => s.active) ??
    state.sprints.find(s => !s.closed) ??
    state.sprints[state.sprints.length - 1]
  )
}

// Écriture (Phase 5, roadmap v1, 2026-08-08, décision Julien) : ce serveur MCP ne vérifie AUCUN
// rôle lui-même, il transmet le jeton et laisse le backend (routes/items.ts, routes/
// hierarchyNodes.ts) décider, avec les mêmes règles que le reste de l'app
// (frontend/src/utils/permissions.ts, canManageBacklog/canEditBacklogOperational). Un 403 renvoyé
// par le backend (rôle insuffisant pour cette action ou ce champ) doit remonter tel quel jusqu'à
// Claude, texte explicite à l'appui, pas une erreur générique.
async function writeRequest<T>(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: unknown
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  if (!res.ok) {
    const message = (json && typeof json === 'object' && 'error' in json) ? String((json as { error: unknown }).error) : text
    throw new Error(message || `Cadence API ${res.status}`)
  }
  return json as T
}

export interface WriteItemInput {
  title?: string; role?: string; need?: string; benefit?: string
  type?: string; priority?: string; status?: string
  clientName?: string; epicKey?: string; sprintLabel?: string
  sp?: number; tags?: string[]
  deps?: string[]
  dod?: { text: string; done: boolean }[]
  assignees?: string[]
  assignSelf?: boolean
}

export function createItem(body: WriteItemInput & { title: string }) {
  return writeRequest<{ item: Item }>('POST', '/api/items', body)
}

export function updateItem(key: string, body: WriteItemInput) {
  return writeRequest<{ item: Item }>('PATCH', `/api/items/${encodeURIComponent(key)}`, body)
}

export interface WriteHierarchyNodeInput {
  title?: string; level?: string; parentKey?: string; clientName?: string; sprintLabel?: string; sp?: number
}

export function createHierarchyNode(body: WriteHierarchyNodeInput & { title: string }) {
  return writeRequest<{ node: HierarchyNode }>('POST', '/api/hierarchy-nodes', body)
}

export function updateHierarchyNode(key: string, body: WriteHierarchyNodeInput) {
  return writeRequest<{ node: HierarchyNode }>('PATCH', `/api/hierarchy-nodes/${encodeURIComponent(key)}`, body)
}
