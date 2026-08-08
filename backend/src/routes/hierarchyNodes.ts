import { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'
import {
  loadState, saveState, uid, nextKeyForPrefix, allKeys,
  resolveClientId, resolveEpicId, resolveSprintId, resolveLevel,
  type HierarchyNode,
} from '../lib/backlogWrite'

// Phase 5 (roadmap v1), MCP Claude (Cadence), écriture, 2026-08-08 : Epics/Initiatives, réservé
// PO + Admin (canManageBacklog, frontend/src/utils/permissions.ts) sans variante Dev, contrairement
// aux items (routes/items.ts) : le frontend gate déjà toute action Epic/Initiative derrière
// `if (!canManage) return null` (BacklogPage.tsx), pas de sous-ensemble opérationnel équivalent.
// Le statut d'un Epic/Initiative n'est pas résolu par libellé Kanban ici (contrairement à un item) :
// il déclenche la cascade "Epic terminé -> enfants terminés" (voir cascadeDelete.ts côté frontend),
// hors périmètre de cette 1re version d'écriture pour ne pas dupliquer cette cascade côté serveur.
interface CreateHierarchyNodeBody {
  title: string
  level?: string
  parentKey?: string
  clientName?: string
  sprintLabel?: string
  sp?: number
}

interface UpdateHierarchyNodeBody {
  title?: string
  level?: string
  parentKey?: string
  clientName?: string
  sprintLabel?: string
  sp?: number
}

export async function hierarchyNodesRoutes(fastify: FastifyInstance) {

  fastify.post<{ Body: CreateHierarchyNodeBody }>(
    '/api/hierarchy-nodes',
    {
      schema: { body: { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1 } } } },
      preHandler: [authenticate, requireRole('ADMIN', 'PO')],
    },
    async (req, reply) => {
      const state = await loadState(fastify)
      if (!state) return reply.code(404).send({ error: 'Aucun état trouvé' })

      const level = resolveLevel(req.body.level, 'epic')
      const clientId = resolveClientId(state, req.body.clientName, undefined)
      const parentId = resolveEpicId(state, req.body.parentKey, null) ?? null
      const sprintId = resolveSprintId(state, req.body.sprintLabel, null) ?? null

      const client = clientId ? state.clients.find(c => c.id === clientId) : undefined
      const prefix = client?.prefix ?? 'ITEM'
      const counters = state.itemKeyCounters ?? {}
      const { key, nextCounters } = nextKeyForPrefix(prefix, allKeys(state), counters)

      const node: HierarchyNode = {
        id: uid(), key, level, parentId, desc: req.body.title.trim(),
        clientId, sprintId, sp: req.body.sp, createdAt: new Date().toISOString(),
      }

      await saveState(fastify, { ...state, hierarchyNodes: [...state.hierarchyNodes, node], itemKeyCounters: nextCounters })
      return reply.code(201).send({ node })
    }
  )

  fastify.patch<{ Params: { key: string }; Body: UpdateHierarchyNodeBody }>(
    '/api/hierarchy-nodes/:key',
    { preHandler: [authenticate, requireRole('ADMIN', 'PO')] },
    async (req, reply) => {
      const state = await loadState(fastify)
      if (!state) return reply.code(404).send({ error: 'Aucun état trouvé' })

      const existing = state.hierarchyNodes.find(n => n.key.toLowerCase() === req.params.key.toLowerCase())
      if (!existing) return reply.code(404).send({ error: `Aucun Epic/Initiative avec la clé "${req.params.key}"` })

      const body = req.body ?? {}
      const updated: HierarchyNode = {
        ...existing,
        desc: body.title?.trim() || existing.desc,
        level: resolveLevel(body.level, existing.level),
        parentId: resolveEpicId(state, body.parentKey, existing.parentId) ?? existing.parentId,
        clientId: resolveClientId(state, body.clientName, existing.clientId),
        sprintId: resolveSprintId(state, body.sprintLabel, existing.sprintId ?? null),
        sp: body.sp ?? existing.sp,
      }

      const hierarchyNodes = state.hierarchyNodes.map(n => n.id === existing.id ? updated : n)
      await saveState(fastify, { ...state, hierarchyNodes })
      return { node: updated }
    }
  )
}
