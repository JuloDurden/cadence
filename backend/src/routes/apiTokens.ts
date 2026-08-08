import { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { authenticate } from '../middleware/auth'

// Phase 5 (roadmap v1), MCP Claude (Cadence), 2026-08-08 : jetons d'acces personnels (PAT), un par
// utilisateur/usage ("Claude Desktop", "MCP local"...). Decision Julien (AskUserQuestion) : le MCP
// reutilise l'authentification existante plutot qu'un token statique unique, pour respecter les
// memes roles (Admin/PO/etc.) que le reste de l'app. Chaque utilisateur connecte gere ses PROPRES
// jetons (pas de gating par role ici : un Stakeholder a autant besoin d'un acces MCP scope a son
// propre role qu'un Admin) ; `authenticate` seul suffit, `req.user.id` filtre systematiquement sur
// le proprietaire. Le jeton en clair n'est jamais stocke ni rejouable depuis le serveur : seul
// `jti` (identifiant unique du JWT) est persiste, pour permettre sa revocation malgre le caractere
// stateless d'un JWT (voir middleware/auth.ts).
export async function apiTokensRoutes(fastify: FastifyInstance) {
  // GET /api/api-tokens : jetons actifs (non revoques) du compte connecte, jamais la valeur du
  // jeton lui-meme (impossible a reafficher apres coup, memo UX que passwordHash).
  fastify.get('/api/api-tokens', { preHandler: authenticate }, async (req) => {
    const tokens = await fastify.prisma.apiToken.findMany({
      where: { userId: req.user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    })
    return { tokens }
  })

  // POST /api/api-tokens { name } : genere un nouveau jeton, longue duree (contrairement aux 8h
  // d'une session normale : ce jeton est destine a etre colle une seule fois dans la config d'un
  // client MCP, pas ressaisi a chaque expiration). Retourne le jeton en clair UNE SEULE FOIS, a
  // charge du frontend de le presenter clairement comme non recuperable ensuite.
  fastify.post<{ Body: { name: string } }>(
    '/api/api-tokens',
    {
      schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 } } } },
      preHandler: authenticate,
    },
    async (req, reply) => {
      const jti = randomUUID()
      const token = fastify.jwt.sign({ id: req.user.id, email: req.user.email, role: req.user.role, jti }, { expiresIn: '5y' })
      const apiToken = await fastify.prisma.apiToken.create({
        data: { userId: req.user.id, name: req.body.name.trim(), jti },
        select: { id: true, name: true, createdAt: true, lastUsedAt: true },
      })
      return reply.code(201).send({ token, apiToken })
    }
  )

  // DELETE /api/api-tokens/:id : revoque un jeton. 404 (pas 403) si le jeton n'appartient pas au
  // compte connecte, pour ne jamais confirmer l'existence d'un jeton d'un autre utilisateur.
  fastify.delete<{ Params: { id: string } }>(
    '/api/api-tokens/:id',
    { preHandler: authenticate },
    async (req, reply) => {
      const apiToken = await fastify.prisma.apiToken.findUnique({ where: { id: req.params.id } })
      if (!apiToken || apiToken.userId !== req.user.id) {
        return reply.code(404).send({ error: 'Jeton introuvable' })
      }
      await fastify.prisma.apiToken.update({ where: { id: req.params.id }, data: { revokedAt: new Date() } })
      return reply.code(204).send()
    }
  )
}
