import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'

// Préférences personnelles (2026-08-19, décision Julien), thème/couleur principale (claire+
// sombre)/densité d'affichage/page de démarrage, propres au compte connecté, voir schema.prisma
// (`User.personalSettings`) pour le détail des champs couverts et de ce qui reste partagé
// (Dashboard, logo d'équipe, sprints, pages de présentation). Même esprit que routes/
// onboarding.ts : le contenu (clés/valeurs valides) vit entièrement côté frontend
// (types/index.ts, `PersonalSettings`), ce backend ne fait que persister le blob par compte.
export async function personalSettingsRoutes(fastify: FastifyInstance) {
  // GET /api/personal-settings : préférences du compte connecté, `null` si rien n'a encore été
  // personnalisé (le frontend retombe alors sur la valeur workspace, voir
  // PersonalSettingsContext.tsx).
  fastify.get('/api/personal-settings', { preHandler: authenticate }, async (req, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { personalSettings: true },
    })
    if (!user) return reply.code(404).send({ error: 'Compte introuvable' })
    return { personalSettings: user.personalSettings ?? null }
  })

  // PATCH /api/personal-settings : fusionne un patch partiel dans le blob existant (même
  // convention que `onChange(patch: Partial<Settings>)` côté frontend, AppearanceSection.tsx),
  // jamais un remplacement complet : un client qui n'envoie que `{ theme: 'dark' }` ne doit pas
  // effacer une couleur principale déjà choisie par ailleurs.
  fastify.patch<{ Body: Record<string, unknown> }>(
    '/api/personal-settings',
    { preHandler: authenticate },
    async (req, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: req.user.id },
        select: { personalSettings: true },
      })
      if (!user) return reply.code(404).send({ error: 'Compte introuvable' })
      const current = (user.personalSettings as Record<string, unknown> | null) ?? {}
      const merged = { ...current, ...req.body }
      const updated = await fastify.prisma.user.update({
        where: { id: req.user.id },
        // `as object` : même convention que routes/state.ts (`data: Json`) pour un blob
        // arbitraire, la forme réelle est validée côté frontend (types/index.ts, `PersonalSettings`).
        data: { personalSettings: merged as object },
        select: { personalSettings: true },
      })
      return { personalSettings: updated.personalSettings }
    }
  )
}
