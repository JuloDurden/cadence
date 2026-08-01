import { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'

// Phase 2.5 (roadmap v1), Onboarding — un Admin invite un Stakeholder en générant un lien à usage
// unique (voir routes/auth.ts, POST /api/auth/accept-invite). Pas d'infrastructure d'envoi d'email
// dans ce prototype : le lien est renvoyé à l'Admin, à lui de le partager par un autre biais
// (Slack, message direct...). Toutes ces routes sont réservées Admin, comme /api/users.
const INVITATION_SELECT = { id: true, token: true, createdBy: true, usedAt: true, createdAt: true, clientId: true } as const

export async function invitationsRoutes(fastify: FastifyInstance) {
  const adminOnly = [authenticate, requireRole('ADMIN')]

  // GET /api/invitations — liste des invitations (Admin uniquement), les plus récentes d'abord.
  fastify.get('/api/invitations', { preHandler: adminOnly }, async () => {
    const invitations = await fastify.prisma.invitation.findMany({
      select: INVITATION_SELECT,
      orderBy: { createdAt: 'desc' },
    })
    return { invitations }
  })

  // POST /api/invitations — génère un nouveau lien d'invitation Stakeholder (Admin uniquement).
  // Phase 2.5 (roadmap v1), verrouillage Stakeholder — `clientId` requis : l'Admin choisit à quel
  // Client rattacher le futur Stakeholder (comme Contact, voir accept-invite/teamState.ts), plutôt
  // que de laisser la personne invitée taper un nom d'entreprise (confidentialité, décision
  // Julien 2026-08-01). Pas de vérification d'existence du Client ici (pas de table dédiée, voir
  // WorkspaceState) — le sélecteur côté client ne propose que des clients réels.
  fastify.post<{ Body: { clientId: string } }>(
    '/api/invitations',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          required: ['clientId'],
          properties: { clientId: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (req, reply) => {
      const invitation = await fastify.prisma.invitation.create({
        data: { createdBy: req.user.id, clientId: req.body.clientId },
        select: INVITATION_SELECT,
      })
      return reply.code(201).send({ invitation })
    }
  )

  // DELETE /api/invitations/:id — révoque une invitation non encore utilisée (Admin uniquement).
  fastify.delete<{ Params: { id: string } }>('/api/invitations/:id', { preHandler: adminOnly }, async (req, reply) => {
    const invitation = await fastify.prisma.invitation.findUnique({ where: { id: req.params.id } })
    if (!invitation) return reply.code(404).send({ error: 'Invitation introuvable' })
    if (invitation.usedAt) return reply.code(409).send({ error: 'Cette invitation a déjà été utilisée' })
    await fastify.prisma.invitation.delete({ where: { id: req.params.id } })
    return reply.code(204).send()
  })
}
