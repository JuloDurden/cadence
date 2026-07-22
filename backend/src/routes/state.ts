import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'

// Correctif 2026-07-22, complément final (voir docs/corrections.md, Sprint Review) : le tri
// `orderBy: { updatedAt: 'desc' }` ajouté au correctif précédent supposait un ordre toujours
// déterministe entre PUT et GET, mais s'il existe plusieurs lignes `workspace_state` dont le
// `updatedAt` tombe sur la même valeur (deux écritures rapprochées, résolution de l'horloge de la
// base), `ORDER BY` sans second critère de tri ne garantit RIEN en cas d'égalité — Postgres peut
// renvoyer l'une ou l'autre ligne de façon incohérente d'une requête à l'autre. C'est ce qui
// produisait le "une fois sur deux" observé par l'utilisateur : deux lignes bien réelles, dont le
// choix entre elles n'était pas déterministe en cas d'égalité de date.
//
// Solution définitive : un vrai singleton, garanti par la base elle-même via un identifiant fixe
// et un `upsert` atomique (une seule opération, aucune fenêtre de course possible), plutôt qu'un
// "trouver puis créer/mettre à jour" qui laisse toujours une place à l'ambiguïté. GET/PUT ciblent
// désormais tous les deux exactement la même ligne, sans jamais dépendre d'un tri.
const SINGLETON_ID = 'workspace-state-singleton'

export async function stateRoutes(fastify: FastifyInstance) {
  // GET /api/state — charger l'état du workspace
  fastify.get('/api/state', { preHandler: authenticate }, async (_req, reply) => {
    let state = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })

    // Migration ponctuelle : d'anciennes lignes avec un id généré (cuid) peuvent déjà exister,
    // d'avant ce correctif. On adopte la plus récente comme état canonique unique, une seule fois —
    // aucune intervention manuelle nécessaire pour migrer.
    if (!state) {
      const legacy = await fastify.prisma.workspaceState.findFirst({
        where: { id: { not: SINGLETON_ID } },
        orderBy: { updatedAt: 'desc' },
      })
      if (legacy) {
        try {
          state = await fastify.prisma.workspaceState.create({
            data: { id: SINGLETON_ID, data: legacy.data as object, version: legacy.version },
          })
        } catch {
          // Deux requêtes concurrentes ont pu migrer en même temps (ex. deux onglets ouverts au
          // même instant) : la seconde se heurte à la contrainte d'unicité sur l'id fixe — sans
          // gravité, il suffit de relire la ligne que l'autre vient de créer.
          state = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
        }
      }
    }

    if (!state) return reply.code(404).send({ error: 'Aucun état trouvé' })
    return { data: state.data, version: state.version }
  })

  // PUT /api/state — sauvegarder l'état du workspace
  fastify.put<{ Body: { data: unknown } }>(
    '/api/state',
    { preHandler: authenticate },
    async (req, reply) => {
      await fastify.prisma.workspaceState.upsert({
        where: { id: SINGLETON_ID },
        update: { data: req.body.data as object, version: { increment: 1 } },
        create: { id: SINGLETON_ID, data: req.body.data as object },
      })
      return reply.code(204).send()
    }
  )
}
