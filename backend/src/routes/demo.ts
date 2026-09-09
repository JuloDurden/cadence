import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { resetDemoWorkspace } from '../lib/demoReset'

export async function demoRoutes(fastify: FastifyInstance) {
  // POST /api/demo/reset - bouton manuel "Réinitialiser la démo" (Réglages > Avancé, visible
  // seulement pour `isDemo`, voir SettingsPage.tsx). Démo publique v1, sous-chantier 3/5
  // (2026-09-09, décision Julien : reset automatique de fin de session ET bouton manuel). Réservé
  // au compte démo lui-même (vérifié ici, pas seulement caché côté frontend) : aucun autre compte,
  // même un vrai Admin, n'a de raison légitime de déclencher un reset qui n'a de sens que pour ce
  // compte précis.
  fastify.post('/api/demo/reset', { preHandler: authenticate }, async (req, reply) => {
    if (!req.user?.isDemo) {
      return reply.code(403).send({ error: 'Réservé au compte de démonstration' })
    }
    await resetDemoWorkspace(fastify.prisma)
    return { ok: true }
  })
}
