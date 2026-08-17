import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { postSlackMessage, formatBlockedItemMessage } from '../lib/slack'

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

// Phase 5 (roadmap v1), Intégration Slack, 2026-08-08 : alerte "item passé au statut Bloqué" (voir
// lib/slack.ts, formatBlockedItemMessage). Contrairement à la clôture/activation de sprint (2 pages
// seulement, RoadmapPage/PlanningPage, appel additif ajouté directement là-bas), un changement de
// statut peut venir d'une bonne dizaine d'écrans différents (Backlog, Kanban, Sprint Planning,
// Sprint Review, glisser-déposer...), tous passant in fine par ce même `PUT /api/state` générique
// (voir StateContext.tsx, saveToServer). Plutôt que dupliquer l'appel Slack dans chaque écran,
// détection par comparaison de l'état précédent/nouveau ICI, au seul endroit qu'ils traversent
// tous. Coût nul si l'alerte n'est pas activée (court-circuité avant toute lecture/comparaison).
interface MinimalItem { id: string; key: string; desc: string; status: string }

function extractItems(data: unknown): MinimalItem[] {
  const items = (data as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  return items.filter((i): i is MinimalItem =>
    typeof i === 'object' && i !== null && typeof (i as MinimalItem).id === 'string' && typeof (i as MinimalItem).status === 'string'
  )
}

/** Items qui viennent de passer au statut 'blocked' entre `previousData` et `nextData` (absent ou
 *  à un autre statut avant, 'blocked' maintenant) - jamais l'inverse (un item qui sort de Bloqué
 *  n'a pas d'alerte dédiée dans ce 1er chantier). */
function newlyBlockedItems(previousData: unknown, nextData: unknown): MinimalItem[] {
  const previousStatusById = new Map(extractItems(previousData).map(i => [i.id, i.status]))
  return extractItems(nextData).filter(i => i.status === 'blocked' && previousStatusById.get(i.id) !== 'blocked')
}

export async function stateRoutes(fastify: FastifyInstance) {
  // GET /api/public/branding — logo d'équipe uniquement, pour l'écran de connexion (Phase 6bis,
  // roadmap v1, refonte du login, 2026-08-17). Public (aucune authentification) : LoginPage.tsx
  // est rendue hors StateProvider/ProtectedRoute (voir App.tsx), elle n'a donc accès à aucune
  // donnée du workspace avant connexion. Volontairement minimal : seul le logo (déjà visible de
  // tous une fois connecté, sans caractère sensible) est exposé, jamais le reste de `settings` ni
  // aucune autre donnée du workspace.
  fastify.get('/api/public/branding', async () => {
    const state = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
    const settings = (state?.data as { settings?: { logoDataUrl?: string } } | undefined)?.settings
    return { logoDataUrl: settings?.logoDataUrl ?? null }
  })

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
      const slackConfig = await fastify.prisma.slackConfig.findFirst()
      if (slackConfig?.blockedEnabled && slackConfig.blockedChannelId) {
        const previous = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
        const blocked = newlyBlockedItems(previous?.data, req.body.data)
        // Fire-and-forget : ne bloque jamais la réponse au client sur l'envoi Slack, et une
        // panne Slack ne doit jamais empêcher une sauvegarde réelle de l'état.
        for (const item of blocked) {
          postSlackMessage(slackConfig.botToken, slackConfig.blockedChannelId, formatBlockedItemMessage({ itemKey: item.key, itemDesc: item.desc }))
            .catch(() => {})
        }
      }

      await fastify.prisma.workspaceState.upsert({
        where: { id: SINGLETON_ID },
        update: { data: req.body.data as object, version: { increment: 1 } },
        create: { id: SINGLETON_ID, data: req.body.data as object },
      })
      return reply.code(204).send()
    }
  )
}
