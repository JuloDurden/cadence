import { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'

// Phase 3 (roadmap v1), Mode présentation — lien de partage public (sans authentification) qui
// ouvre le mode présentation (Dashboard, Roadmap, Vision/NNL, Sprint Review, sidebar masquée,
// navigation clavier ←/→ — voir frontend PresentationPublicPage.tsx). Décision actée avec Julien
// (AskUserQuestion, 2026-08-01) après qu'il a fait remarquer que le compte Stakeholder couvre déjà
// un vrai mode lecture seule authentifié : ce lien n'est donc utile QUE pour le mode présentation
// (partage ponctuel sans compte, écran public), pas comme mode "lecture seule" générique — d'où un
// seul type de lien, pas une brique de permissions séparée. Génération/révocation réservées
// Admin + PO (Julien : le PO est souvent celui qui présente en externe).
//
// Un seul lien actif à la fois (voir PresentationLink dans schema.prisma) : `WorkspaceState` est
// déjà un singleton unique dans ce prototype, il n'y a donc qu'un seul workspace à présenter — pas
// besoin d'une vraie liste comme pour les invitations Stakeholder (une par destinataire).
const SINGLETON_ID = 'workspace-state-singleton'

export async function presentationRoutes(fastify: FastifyInstance) {
  const presenterOnly = [authenticate, requireRole('ADMIN', 'PO')]

  // GET /api/presentation-link — lien actif actuel (ou null), pour l'afficher dans Réglages.
  fastify.get('/api/presentation-link', { preHandler: presenterOnly }, async () => {
    const link = await fastify.prisma.presentationLink.findFirst({ orderBy: { createdAt: 'desc' } })
    return { link }
  })

  // POST /api/presentation-link — (re)génère le lien. Supprime l'éventuel lien existant avant d'en
  // créer un nouveau : régénérer invalide donc automatiquement tout lien précédemment partagé
  // (son token ne correspond plus à rien), sans étape de révocation séparée nécessaire pour ça.
  fastify.post('/api/presentation-link', { preHandler: presenterOnly }, async (req, reply) => {
    await fastify.prisma.presentationLink.deleteMany({})
    const link = await fastify.prisma.presentationLink.create({ data: { createdBy: req.user.id } })
    return reply.code(201).send({ link })
  })

  // DELETE /api/presentation-link — révoque le lien actif, sans en générer un nouveau (contrairement
  // à POST). Idempotent : pas d'erreur si aucun lien n'existait déjà.
  fastify.delete('/api/presentation-link', { preHandler: presenterOnly }, async (_req, reply) => {
    await fastify.prisma.presentationLink.deleteMany({})
    return reply.code(204).send()
  })

  // GET /api/presentation/state/:token — PUBLIC (pas d'authentification, le token fait office
  // d'autorisation, même principe que POST /api/auth/accept-invite). Renvoie l'état du workspace en
  // lecture seule pour un visiteur qui ouvre le lien de présentation. 404 si le token ne correspond
  // à aucun lien actif (jamais généré, ou révoqué/régénéré depuis) — le frontend affiche alors un
  // message "lien invalide" plutôt que d'essayer d'afficher un workspace vide.
  fastify.get<{ Params: { token: string } }>('/api/presentation/state/:token', async (req, reply) => {
    const link = await fastify.prisma.presentationLink.findUnique({ where: { token: req.params.token } })
    if (!link) return reply.code(404).send({ error: 'Lien de présentation invalide' })

    const state = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
    if (!state) return reply.code(404).send({ error: 'Aucun état trouvé' })
    return { data: state.data }
  })
}
