import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'

export async function stateRoutes(fastify: FastifyInstance) {
  // GET /api/state — charger l'état du workspace
  fastify.get('/api/state', { preHandler: authenticate }, async (_req, reply) => {
    const state = await fastify.prisma.workspaceState.findFirst({
      orderBy: { updatedAt: 'desc' },
    })
    if (!state) return reply.code(404).send({ error: 'Aucun état trouvé' })
    return { data: state.data, version: state.version }
  })

  // PUT /api/state — sauvegarder l'état du workspace
  fastify.put<{ Body: { data: unknown } }>(
    '/api/state',
    { preHandler: authenticate },
    async (req, reply) => {
      const existing = await fastify.prisma.workspaceState.findFirst()
      if (existing) {
        await fastify.prisma.workspaceState.update({
          where: { id: existing.id },
          data: { data: req.body.data as object, version: { increment: 1 } },
        })
      } else {
        await fastify.prisma.workspaceState.create({
          data: { data: req.body.data as object },
        })
      }
      return reply.code(204).send()
    }
  )
}
