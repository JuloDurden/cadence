import { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'
import { validateRepo, searchCommits, searchPullRequests, maskToken } from '../lib/github'

// Phase 5 (roadmap v1), Intégration GitHub, 2026-08-08 : un seul dépôt lié au workspace (singleton,
// voir schema.prisma). Configuration (owner/repo/jeton) réservée Admin, secret d'organisation
// plutôt que personnel (contrairement aux jetons API MCP, gérés par chacun). Consultation
// (commits/PR liés à un item) ouverte à tout compte connecté : relier du code à un item n'est pas
// une action sensible par rôle, à l'inverse de la configuration du dépôt elle-même.
export async function githubRoutes(fastify: FastifyInstance) {
  const adminOnly = [authenticate, requireRole('ADMIN')]

  fastify.get('/api/github-config', { preHandler: adminOnly }, async () => {
    const config = await fastify.prisma.gitHubConfig.findFirst()
    if (!config) return { config: null }
    return { config: { owner: config.owner, repo: config.repo, tokenPreview: maskToken(config.token), updatedAt: config.updatedAt } }
  })

  // PUT (re)configure le dépôt. `token` optionnel à la mise à jour (garde le jeton existant si
  // omis, pour changer owner/repo sans avoir à ressaisir un jeton déjà enregistré), vérifié
  // auprès de GitHub AVANT d'écrire quoi que ce soit, pour ne jamais enregistrer une config cassée.
  fastify.put<{ Body: { owner: string; repo: string; token?: string } }>(
    '/api/github-config',
    {
      schema: {
        body: {
          type: 'object', required: ['owner', 'repo'],
          properties: { owner: { type: 'string', minLength: 1 }, repo: { type: 'string', minLength: 1 }, token: { type: 'string' } },
        },
      },
      preHandler: adminOnly,
    },
    async (req, reply) => {
      const existing = await fastify.prisma.gitHubConfig.findFirst()
      const token = req.body.token?.trim() || existing?.token
      if (!token) return reply.code(400).send({ error: 'Jeton requis pour une première connexion' })

      try {
        await validateRepo(req.body.owner, req.body.repo, token)
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : 'Connexion GitHub impossible' })
      }

      const saved = existing
        ? await fastify.prisma.gitHubConfig.update({ where: { id: existing.id }, data: { owner: req.body.owner, repo: req.body.repo, token } })
        : await fastify.prisma.gitHubConfig.create({ data: { owner: req.body.owner, repo: req.body.repo, token } })

      return { config: { owner: saved.owner, repo: saved.repo, tokenPreview: maskToken(saved.token), updatedAt: saved.updatedAt } }
    }
  )

  fastify.delete('/api/github-config', { preHandler: adminOnly }, async (_req, reply) => {
    await fastify.prisma.gitHubConfig.deleteMany({})
    return reply.code(204).send()
  })

  fastify.get<{ Params: { key: string } }>('/api/github-config/commits/:key', { preHandler: authenticate }, async (req, reply) => {
    const config = await fastify.prisma.gitHubConfig.findFirst()
    if (!config) return reply.code(404).send({ error: 'Aucun dépôt GitHub connecté' })
    try {
      return { commits: await searchCommits(config, req.params.key) }
    } catch (e) {
      return reply.code(502).send({ error: e instanceof Error ? e.message : 'Erreur GitHub' })
    }
  })

  fastify.get<{ Params: { key: string } }>('/api/github-config/prs/:key', { preHandler: authenticate }, async (req, reply) => {
    const config = await fastify.prisma.gitHubConfig.findFirst()
    if (!config) return reply.code(404).send({ error: 'Aucun dépôt GitHub connecté' })
    try {
      return { pullRequests: await searchPullRequests(config, req.params.key) }
    } catch (e) {
      return reply.code(502).send({ error: e instanceof Error ? e.message : 'Erreur GitHub' })
    }
  })
}
