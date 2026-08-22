import { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'

// Reforme du Changelog (2026-08-22, decision Julien) : l'historique quitte frontend/src/data/
// changelog.ts (tableau en dur, ~100 versions, 1400+ lignes) pour la table changelog_entries
// (schema.prisma). Consultation ouverte a tout compte connecte (informationnel, comme la page
// elle-meme jusqu'ici) ; publication reservee Admin (decision Julien, AskUserQuestion) - meme
// posture que GitHubConfig/SlackConfig/JiraConfig/AiConfig, une configuration/action d'organisation,
// pas une action a la portee de tous les roles.
const CHANGELOG_TAGS = ['feat', 'fix', 'ux', 'refactor', 'perf', 'test', 'info', 'chore', 'improve']

interface RawChangelogChange { tag: string; text: string }

export async function changelogRoutes(fastify: FastifyInstance) {
  // GET /api/changelog : toutes les versions, triees par `order` decroissant (le plus recent en
  // tete) - `order` fait foi, jamais `date`/`dateISO` seuls (plusieurs versions peuvent partager
  // exactement la meme date) ni `version` (comparaison de chaines non fiable numeriquement, ex.
  // "v0.9" > "v0.10" lexicographiquement).
  fastify.get('/api/changelog', { preHandler: authenticate }, async () => {
    const entries = await fastify.prisma.changelogEntry.findMany({ orderBy: { order: 'desc' } })
    return { entries }
  })

  // POST /api/changelog : publie une nouvelle version - reserve Admin. Bascule `current` sur la
  // nouvelle entree et le retire de l'ancienne dans la MEME transaction, pour ne jamais laisser 0 ou
  // 2 versions "current" a la fois si la requete echoue au milieu. `order` = 1 + le plus eleve existant
  // (0 si la table est encore vide), jamais fourni par l'appelant.
  fastify.post<{ Body: { version?: string; date?: string; dateISO?: string; title?: string; changes?: RawChangelogChange[] } }>(
    '/api/changelog',
    {
      schema: {
        body: {
          type: 'object',
          required: ['version', 'date', 'dateISO', 'title', 'changes'],
          properties: {
            version: { type: 'string', minLength: 1 },
            date: { type: 'string', minLength: 1 },
            dateISO: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            changes: {
              type: 'array', minItems: 1,
              items: {
                type: 'object',
                required: ['tag', 'text'],
                properties: { tag: { type: 'string', enum: CHANGELOG_TAGS }, text: { type: 'string', minLength: 1 } },
              },
            },
          },
        },
      },
      preHandler: [authenticate, requireRole('ADMIN')],
    },
    async (req, reply) => {
      const version = req.body.version!.trim()
      const existingVersion = await fastify.prisma.changelogEntry.findUnique({ where: { version } })
      if (existingVersion) return reply.code(400).send({ error: `La version ${version} existe deja` })

      const changes = req.body.changes!.map(c => ({ tag: c.tag, text: c.text.trim() })).filter(c => c.text)
      if (changes.length === 0) return reply.code(400).send({ error: 'Au moins un changement est requis' })

      const last = await fastify.prisma.changelogEntry.findFirst({ orderBy: { order: 'desc' } })
      const nextOrder = (last?.order ?? -1) + 1

      const [, created] = await fastify.prisma.$transaction([
        fastify.prisma.changelogEntry.updateMany({ where: { current: true }, data: { current: false } }),
        fastify.prisma.changelogEntry.create({
          data: {
            version, date: req.body.date!.trim(), dateISO: req.body.dateISO!.trim(), title: req.body.title!.trim(),
            current: true, changes, order: nextOrder, createdBy: req.user.id,
          },
        }),
      ])

      return reply.code(201).send({ entry: created })
    }
  )
}
