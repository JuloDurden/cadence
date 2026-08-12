import { FastifyInstance } from 'fastify'

// Phase 5 (roadmap v1), MCP Claude (Cadence), écriture, 2026-08-08 : brique commune aux nouvelles
// routes POST/PATCH items et hierarchy-nodes (routes/items.ts, routes/hierarchyNodes.ts). Décision
// Julien (AskUserQuestion) : des routes ciblées par action plutôt que de réutiliser PUT /api/state
// (lire/patcher/réécrire tout le blob), pour pouvoir vérifier le rôle côté serveur sur CHAQUE
// action et limiter la casse d'un bug de patch à l'item/Epic concerné, pas au workspace entier.
//
// Types dupliqués depuis frontend/src/types/index.ts (même convention que mcp/src/types.ts et
// frontend/src/utils/excelBacklog.ts, qui duplique déjà nextKeyForPrefix depuis ItemModal.tsx) :
// le backend n'a jamais partagé de code avec le frontend dans ce projet (deux `package.json`,
// deux runtimes), donc pas de "vraie" duplication évitable ici, juste la continuation d'un choix
// déjà fait ailleurs. À tenir manuellement à jour si ces types changent côté frontend.

// `deadline`/`severity`/`moscow`/`wsjf`/`rice` ajoutes 2026-08-10 (retour Julien, pre-travail du
// sous-chantier 3 "detection d'anomalies") : ces champs existent bien dans Item (frontend/src/
// types/index.ts) et sont affiches dans ItemModal.tsx, mais n'avaient jamais ete portes ici - le
// chat (routes/ai.ts) n'avait donc aucun moyen de savoir qu'un item avait une deadline, meme quand
// Julien lui posait la question directement (ex. AGA-030). Meme constat pour KanbanCol.isDone
// ci-dessous : sans lui, aucun moyen fiable de distinguer un statut "termine" d'un statut en cours
// autrement qu'en devinant sur le libelle.
export interface Item {
  id: string; key: string; desc: string; sp: number; status: string
  clientId: string; sprintId: string | null; priority: string
  assignees: string[]; tags: string[]
  type?: string
  severity?: string
  epicId?: string | null
  role?: string; need?: string; benefit?: string
  criteria?: { id: string; given: string; when: string; then: string }[]
  deps?: string[]
  dor?: { id: string; text: string; done: boolean }[]
  dod?: { id: string; text: string; done: boolean }[]
  deadline?: { date: string; type: string }
  moscow?: string
  wsjf?: { businessValue: number; timeCriticality: number; riskReduction: number }
  rice?: { reach: number; impact: number; confidence: number; effort: number }
  createdAt: string
}

export interface HierarchyNode {
  id: string; key: string; level: string; parentId: string | null; desc: string
  clientId?: string; sprintId?: string | null; sp?: number; status?: string
  deadline?: { date: string; type: string }
  createdAt: string
}

// `number`/`startDate`/`endDate`/`capacity` ajoutes 2026-08-12 (Phase 6, sous-chantier 4, etape 2/2
// - planification de sprints par le Compagnon IA) : ces champs existent bien dans Sprint (frontend/
// src/types/index.ts, meme convention deja notee en tete de fichier) mais n'avaient jamais ete
// portes ici, seuls label/closed/active etaient necessaires jusqu'a present (resolution par
// libelle). Le portage de l'algorithme d'Auto-planning (voir sprintPlanner.ts) en a besoin pour
// calculer une capacite effective et generer un plan identique a celui d'Auto-planning.
export interface Sprint { id: string; number: number; label: string; startDate: string; endDate: string; capacity: number; closed: boolean; active?: boolean }
// `spPerDay` ajoute 2026-08-12, meme raison que Sprint ci-dessus : necessaire au calcul de
// capacite effective (deduction des absences par membre, voir sprintPlanner.ts).
export interface TeamMember { id: string; name: string; spPerDay?: number; linkedUserId?: string }
export interface Client { id: string; name: string; prefix: string; excludeFromPlanning?: boolean }
export interface KanbanCol { id: string; label: string; isDone?: boolean; isDefault?: boolean }
// Duplique depuis frontend/src/types/index.ts (AbsenceType/Absence) - meme convention.
export interface Absence { id: string; memberId: string; start: string; end: string }

export interface CadenceState {
  items: Item[]
  hierarchyNodes: HierarchyNode[]
  sprints: Sprint[]
  team: TeamMember[]
  clients: Client[]
  kanbanCols: KanbanCol[]
  absences?: Absence[]
  settings?: { defaultCapacity?: number; sprintDuration?: number }
  itemKeyCounters?: Record<string, number>
  [key: string]: unknown // le reste du blob (dailies, retro, nnl...) transite sans y toucher
}

const SINGLETON_ID = 'workspace-state-singleton'

export async function loadState(fastify: FastifyInstance): Promise<CadenceState | null> {
  const row = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
  return row ? (row.data as unknown as CadenceState) : null
}

export async function saveState(fastify: FastifyInstance, state: CadenceState): Promise<void> {
  await fastify.prisma.workspaceState.update({
    where: { id: SINGLETON_ID },
    data: { data: state as object, version: { increment: 1 } },
  })
}

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Même règle que frontend/src/utils/sprints.ts (getCurrentSprint). */
export function getCurrentSprint(state: CadenceState): Sprint | undefined {
  return (
    state.sprints.find(s => s.active) ??
    state.sprints.find(s => !s.closed) ??
    state.sprints[state.sprints.length - 1]
  )
}

/** Même logique que utils/excelBacklog.ts (nextKeyForPrefix) : Item.key et HierarchyNode.key
 *  partagent le même espace de numérotation par préfixe, `existingKeys` doit donc couvrir les deux
 *  à chaque appel. */
export function nextKeyForPrefix(prefix: string, existingKeys: string[], counters: Record<string, number>): { key: string; nextCounters: Record<string, number> } {
  const usedNums = existingKeys
    .filter(k => k?.startsWith(`${prefix}-`))
    .map(k => parseInt(k.slice(prefix.length + 1), 10))
    .filter(n => !isNaN(n))
  const liveMax = usedNums.length > 0 ? Math.max(...usedNums) : 0
  const persisted = counters[prefix] ?? 0
  const nextNum = Math.max(liveMax, persisted) + 1
  return { key: `${prefix}-${String(nextNum).padStart(3, '0')}`, nextCounters: { ...counters, [prefix]: nextNum } }
}

export function allKeys(state: CadenceState): string[] {
  return [...state.items.map(i => i.key), ...state.hierarchyNodes.map(n => n.key)]
}

export function resolveClientId(state: CadenceState, name: string | undefined, fallback: string | undefined): string | undefined {
  if (!name) return fallback
  return state.clients.find(c => normalize(c.name) === normalize(name))?.id ?? fallback
}

export function resolveEpicId(state: CadenceState, key: string | undefined, fallback: string | null): string | null {
  if (!key) return fallback
  return state.hierarchyNodes.find(n => normalize(n.key) === normalize(key))?.id ?? fallback
}

/** "current" resout le sprint en cours (voir getCurrentSprint) ; sinon cherche d'abord une
 *  correspondance de libellé (Sprint.label, insensible accents/casse - ex. un sprint nomme
 *  "INTELLIGENCE"), puis, a defaut, une correspondance par NUMERO ("Sprint 3", "S3", "3") sur
 *  Sprint.number - ajoute 2026-08-12 (retour Julien, planification de sprints par le Compagnon IA) :
 *  un sprint avec un libelle personnalise (frequent, voir capture Auto-planning) n'etait resolvable
 *  par AUCUN moyen fiable auparavant si le modele s'y referait par son numero, ce qui est pourtant
 *  la convention affichee partout dans l'UI ("Sprint 3", "Sprint 3 – <libelle>"). */
export function resolveSprintId(state: CadenceState, label: string | undefined, fallback: string | null): string | null {
  if (!label) return fallback
  if (normalize(label) === 'current') return getCurrentSprint(state)?.id ?? fallback
  const byLabel = state.sprints.find(s => normalize(s.label) === normalize(label))
  if (byLabel) return byLabel.id
  const numMatch = normalize(label).match(/(\d+)\s*$/)
  if (numMatch) {
    const byNumber = state.sprints.find(s => s.number === parseInt(numMatch[1], 10))
    if (byNumber) return byNumber.id
  }
  return fallback
}

export function resolveStatus(state: CadenceState, label: string | undefined, fallback: string): string {
  if (!label) return fallback
  return state.kanbanCols.find(c => normalize(c.label) === normalize(label))?.id ?? fallback
}

export function resolveAssigneeIds(state: CadenceState, names: string[] | undefined, fallback: string[]): string[] {
  if (!names) return fallback
  return names
    .map(name => state.team.find(m => normalize(m.name) === normalize(name))?.id)
    .filter((id): id is string => !!id)
}

export function resolveDepKeys(state: CadenceState, keys: string[] | undefined, fallback: string[] | undefined): string[] | undefined {
  if (!keys) return fallback
  return keys
    .map(key => state.items.find(i => normalize(i.key) === normalize(key))?.id)
    .filter((id): id is string => !!id)
}

/** Membre d'équipe lié au compte connecté (TeamMember.linkedUserId), utilisé pour l'auto-
 *  assignation d'un Dev (canToggleBacklogAssignee côté frontend, permissions.ts) : un Dev sans
 *  fiche liée ne peut s'auto-assigner nulle part. */
export function linkedTeamMember(state: CadenceState, userId: string): TeamMember | undefined {
  return state.team.find(m => m.linkedUserId === userId)
}

const ITEM_TYPES = ['story', 'bug', 'task', 'spike']
const PRIORITIES = ['critical', 'high', 'medium', 'low']

export function resolveType(value: string | undefined, fallback: string | undefined): string | undefined {
  if (!value) return fallback
  return ITEM_TYPES.find(t => t === normalize(value)) ?? fallback
}

export function resolvePriority(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  return PRIORITIES.find(p => p === normalize(value)) ?? fallback
}

const HIERARCHY_LEVELS = ['epic', 'initiative']

export function resolveLevel(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  return HIERARCHY_LEVELS.find(l => l === normalize(value)) ?? fallback
}
