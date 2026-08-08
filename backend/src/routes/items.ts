import { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'
import {
  loadState, saveState, uid, nextKeyForPrefix, allKeys,
  resolveClientId, resolveEpicId, resolveSprintId, resolveStatus, resolveType, resolvePriority,
  resolveAssigneeIds, resolveDepKeys, linkedTeamMember,
  type Item,
} from '../lib/backlogWrite'

// Phase 5 (roadmap v1), MCP Claude (Cadence), écriture, 2026-08-08 : 1er couple de routes d'écriture
// ciblées (voir backlogWrite.ts pour le choix d'architecture). Reproduit côté serveur les règles de
// frontend/src/utils/permissions.ts (jamais vérifiées côté API jusqu'ici, seulement côté écrans) :
// `canManageBacklog` (PO + Admin, création et édition complète) et `canEditBacklogOperational`
// (PO/Dev/Admin, sous-ensemble statut/SP/DoD/dépendances + auto-assignation, voir PATCH ci-dessous).
// Champs volontairement hors périmètre pour cette 1re version : notes/commentaires (fil de
// discussion avec auteur/réponses, pas un simple champ), suppression d'item (aucune route DELETE).
const DEV_ALLOWED_FIELDS = new Set(['status', 'sp', 'dod', 'deps', 'assignSelf'])

interface CreateItemBody {
  title: string
  role?: string; need?: string; benefit?: string
  type?: string; priority?: string; status?: string
  clientName?: string; epicKey?: string; sprintLabel?: string
  sp?: number; tags?: string[]
  criteria?: { given: string; when: string; then: string }[]
}

interface UpdateItemBody {
  title?: string
  role?: string; need?: string; benefit?: string
  type?: string; priority?: string; status?: string
  clientName?: string; epicKey?: string; sprintLabel?: string
  sp?: number; tags?: string[]
  criteria?: { given: string; when: string; then: string }[]
  dor?: { text: string; done: boolean }[]
  dod?: { text: string; done: boolean }[]
  deps?: string[]
  assignees?: string[]
  assignSelf?: boolean
}

export async function itemsRoutes(fastify: FastifyInstance) {

  // POST /api/items : création, réservée PO + Admin (canManageBacklog). Un Dev ne peut pas créer
  // d'item via le MCP, exactement comme le bouton "+ Ajouter" du Backlog lui est déjà masqué.
  fastify.post<{ Body: CreateItemBody }>(
    '/api/items',
    {
      schema: { body: { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1 } } } },
      preHandler: [authenticate, requireRole('ADMIN', 'PO')],
    },
    async (req, reply) => {
      const state = await loadState(fastify)
      if (!state) return reply.code(404).send({ error: 'Aucun état trouvé' })

      const clientId = resolveClientId(state, req.body.clientName, state.clients[0]?.id) ?? ''
      const epicId = resolveEpicId(state, req.body.epicKey, null) ?? null
      const sprintId = resolveSprintId(state, req.body.sprintLabel, null) ?? null
      const defaultStatus = state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id ?? 'todo'
      const status = resolveStatus(state, req.body.status, defaultStatus)
      const type = resolveType(req.body.type, 'story')
      const priority = resolvePriority(req.body.priority, 'medium')

      const client = state.clients.find(c => c.id === clientId)
      const prefix = client?.prefix ?? 'ITEM'
      const counters = state.itemKeyCounters ?? {}
      const { key, nextCounters } = nextKeyForPrefix(prefix, allKeys(state), counters)

      const item: Item = {
        id: uid(), key, desc: req.body.title.trim(), sp: req.body.sp ?? 0, status, clientId, sprintId, priority,
        assignees: [], tags: req.body.tags ?? [], type, epicId,
        role: req.body.role, need: req.body.need, benefit: req.body.benefit,
        criteria: req.body.criteria?.map(c => ({ id: uid(), ...c })),
        createdAt: new Date().toISOString(),
      }

      await saveState(fastify, { ...state, items: [...state.items, item], itemKeyCounters: nextCounters })
      return reply.code(201).send({ item })
    }
  )

  // PATCH /api/items/:key : édition. PO/Admin : tous les champs. Dev : sous-ensemble opérationnel
  // uniquement (DEV_ALLOWED_FIELDS ci-dessus) : toute autre clé présente dans le corps de la
  // requête renvoie 403 avec le détail, plutôt qu'un échec silencieux qui laisserait Claude croire
  // que le changement a été appliqué. `assignSelf` (Dev) : bascule SA propre fiche équipe liée
  // (linkedUserId) dans/hors `assignees`, jamais celle d'un autre : `assignees` (remplacement
  // complet de la liste) reste réservé PO/Admin.
  fastify.patch<{ Params: { key: string }; Body: UpdateItemBody }>(
    '/api/items/:key',
    { preHandler: [authenticate, requireRole('ADMIN', 'PO', 'DEV')] },
    async (req, reply) => {
      const state = await loadState(fastify)
      if (!state) return reply.code(404).send({ error: 'Aucun état trouvé' })

      const existing = state.items.find(i => i.key.toLowerCase() === req.params.key.toLowerCase())
      if (!existing) return reply.code(404).send({ error: `Aucun item avec la clé "${req.params.key}"` })

      const body = req.body ?? {}
      const isFullEditor = req.user.role === 'ADMIN' || req.user.role === 'PO'
      if (!isFullEditor) {
        const disallowed = Object.keys(body).filter(k => !DEV_ALLOWED_FIELDS.has(k))
        if (disallowed.length > 0) {
          return reply.code(403).send({ error: `Champ(s) réservé(s) à un PO ou Admin : ${disallowed.join(', ')}` })
        }
      }

      let assignees = existing.assignees
      if (isFullEditor && body.assignees) {
        assignees = resolveAssigneeIds(state, body.assignees, existing.assignees)
      } else if (body.assignSelf !== undefined) {
        const member = linkedTeamMember(state, req.user.id)
        if (!member) return reply.code(403).send({ error: 'Aucune fiche équipe liée à ce compte : auto-assignation impossible' })
        assignees = body.assignSelf
          ? [...new Set([...existing.assignees, member.id])]
          : existing.assignees.filter(id => id !== member.id)
      }

      const updated: Item = {
        ...existing,
        desc: body.title?.trim() || existing.desc,
        role: body.role ?? existing.role,
        need: body.need ?? existing.need,
        benefit: body.benefit ?? existing.benefit,
        type: resolveType(body.type, existing.type),
        priority: resolvePriority(body.priority, existing.priority),
        status: resolveStatus(state, body.status, existing.status),
        clientId: resolveClientId(state, body.clientName, existing.clientId) ?? existing.clientId,
        epicId: resolveEpicId(state, body.epicKey, existing.epicId ?? null),
        sprintId: resolveSprintId(state, body.sprintLabel, existing.sprintId),
        sp: body.sp ?? existing.sp,
        tags: body.tags ?? existing.tags,
        criteria: body.criteria ? body.criteria.map(c => ({ id: uid(), ...c })) : existing.criteria,
        dor: body.dor ? body.dor.map(c => ({ id: uid(), ...c })) : existing.dor,
        dod: body.dod ? body.dod.map(c => ({ id: uid(), ...c })) : existing.dod,
        deps: resolveDepKeys(state, body.deps, existing.deps),
        assignees,
      }

      const items = state.items.map(i => i.id === existing.id ? updated : i)
      await saveState(fastify, { ...state, items })
      return { item: updated }
    }
  )
}
