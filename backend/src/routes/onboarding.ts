import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'

// Phase 2.5 (roadmap v1), Onboarding, points 2-4 (tooltips progressifs, checklist, démo
// interactive) — voir docs/roadmap-v1.md. Le contenu de la checklist (labels, routes, étapes
// guidées) vit entièrement côté frontend (data/onboardingChecklist.ts) : ce backend ne fait que
// persister deux choses par compte, sans rien connaître du sens des ids qu'il stocke.
// - onboardingSeenAt : premier affichage du panneau "Guide de démarrage" (auto-ouvert une seule
//   fois pour un compte réellement nouveau, voir migration 20260801160000).
// - onboardingCompletedItems : ids de checklist cochés, ajoutés par le frontend au fil de l'eau
//   quand il détecte une action réelle correspondante (ex. création de la 1re US).
export async function onboardingRoutes(fastify: FastifyInstance) {
  const ONBOARDING_SELECT = { onboardingSeenAt: true, onboardingCompletedItems: true } as const

  // GET /api/onboarding — état de progression du compte connecté
  fastify.get('/api/onboarding', { preHandler: authenticate }, async (req, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: req.user.id },
      select: ONBOARDING_SELECT,
    })
    if (!user) return reply.code(404).send({ error: 'Compte introuvable' })
    return user
  })

  // POST /api/onboarding/seen — marque le panneau comme déjà vu (idempotent : n'écrase jamais
  // une valeur déjà posée, pour ne pas décaler la date d'un affichage à l'autre).
  fastify.post('/api/onboarding/seen', { preHandler: authenticate }, async (req, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { onboardingSeenAt: true },
    })
    if (!user) return reply.code(404).send({ error: 'Compte introuvable' })
    if (user.onboardingSeenAt) {
      return { onboardingSeenAt: user.onboardingSeenAt }
    }
    const updated = await fastify.prisma.user.update({
      where: { id: req.user.id },
      data: { onboardingSeenAt: new Date() },
      select: { onboardingSeenAt: true },
    })
    return updated
  })

  // POST /api/onboarding/complete — coche une ligne de checklist (idempotent : un id déjà présent
  // n'est pas dupliqué). L'id lui-même n'est jamais validé côté serveur contre une liste connue —
  // le frontend est seul propriétaire du référentiel de checklist, cohérent avec le reste du
  // prototype (WorkspaceState.data est un blob JSON, pas de table dédiée par type de contenu).
  fastify.post<{ Body: { itemId: string } }>(
    '/api/onboarding/complete',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['itemId'],
          properties: { itemId: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (req, reply) => {
      const { itemId } = req.body
      const user = await fastify.prisma.user.findUnique({
        where: { id: req.user.id },
        select: { onboardingCompletedItems: true },
      })
      if (!user) return reply.code(404).send({ error: 'Compte introuvable' })
      if (user.onboardingCompletedItems.includes(itemId)) {
        return { onboardingCompletedItems: user.onboardingCompletedItems }
      }
      const updated = await fastify.prisma.user.update({
        where: { id: req.user.id },
        data: { onboardingCompletedItems: { push: itemId } },
        select: { onboardingCompletedItems: true },
      })
      return updated
    }
  )

  // POST /api/onboarding/reset — remet la checklist à zéro (bouton "Réinitialiser" du panneau,
  // retour Julien). Ne touche volontairement pas `onboardingSeenAt` : "recommencer la checklist"
  // n'est pas la même chose que "je n'ai encore jamais vu ce panneau", pas de raison de
  // redéclencher l'ouverture automatique au prochain login.
  fastify.post('/api/onboarding/reset', { preHandler: authenticate }, async (req) => {
    return fastify.prisma.user.update({
      where: { id: req.user.id },
      data: { onboardingCompletedItems: [] },
      select: { onboardingCompletedItems: true },
    })
  })
}
