import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import type { Role } from '@prisma/client'
import { createLinkedTeamMember, createLinkedClientContact } from '../lib/teamState'

// Phase 2.5 (roadmap v1), Onboarding — rôles ouverts à l'auto-inscription libre (décision Julien,
// 2026-08-01) : la personne choisit elle-même son rôle parmi ces 3 — jamais Admin (compte
// superviseur, réservé à /api/users), jamais Stakeholder (réservé à l'invitation, voir
// POST /api/auth/accept-invite ci-dessous). Validé côté serveur, pas seulement caché côté client.
const SIGNUP_ROLES: Role[] = ['PO', 'SCRUM_MASTER', 'DEV']

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { email: string; password: string } }>(
    '/api/auth/login',
    { schema: { body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } },
    async (req, reply) => {
      const { email, password } = req.body
      const user = await fastify.prisma.user.findUnique({ where: { email } })
      const match = user ? await bcrypt.compare(password, user.passwordHash) : false
      if (!user || !match) {
        return reply.code(401).send({ error: 'Email ou mot de passe incorrect' })
      }
      const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role })
      return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
    }
  )

  // POST /api/auth/signup — auto-inscription libre (Phase 2.5, Onboarding). Public (pas
  // d'authentification requise, contrairement à POST /api/users réservé Admin) : quiconque peut
  // créer un compte PO/Scrum Master/Dev, décision explicite de Julien pour cette petite équipe de
  // confiance — un Admin peut toujours corriger le rôle ensuite depuis Réglages > Utilisateurs.
  fastify.post<{ Body: { email: string; password: string; name: string; role: Role } }>(
    '/api/auth/signup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'name', 'role'],
          properties: {
            email: { type: 'string' },
            password: { type: 'string', minLength: 8 },
            name: { type: 'string', minLength: 1 },
            role: { type: 'string', enum: SIGNUP_ROLES },
          },
        },
      },
    },
    async (req, reply) => {
      const { email, password, name, role } = req.body
      if (!SIGNUP_ROLES.includes(role)) {
        return reply.code(400).send({ error: 'Rôle non autorisé pour une auto-inscription' })
      }
      const existing = await fastify.prisma.user.findUnique({ where: { email } })
      if (existing) return reply.code(409).send({ error: 'Un compte existe déjà avec cet email' })

      const passwordHash = await bcrypt.hash(password, 10)
      const user = await fastify.prisma.user.create({ data: { email, name, passwordHash, role } })
      await createLinkedTeamMember(fastify.prisma, user.id, user.name, user.role)

      const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role })
      return reply.code(201).send({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
    }
  )

  // POST /api/auth/accept-invite — complète une invitation (Phase 2.5, Onboarding). Public :
  // le token fait office d'autorisation (généré par un Admin, voir routes/invitations.ts). Rôle
  // toujours STAKEHOLDER, jamais transmis par le client — seul rôle accessible par ce chemin,
  // décision Julien ("les invitations sont pour les stakeholders").
  fastify.post<{ Body: { token: string; email: string; password: string; name: string } }>(
    '/api/auth/accept-invite',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'email', 'password', 'name'],
          properties: {
            token: { type: 'string' },
            email: { type: 'string' },
            password: { type: 'string', minLength: 8 },
            name: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const { token, email, password, name } = req.body
      const invitation = await fastify.prisma.invitation.findUnique({ where: { token } })
      if (!invitation || invitation.usedAt) {
        return reply.code(410).send({ error: 'Ce lien d\'invitation n\'est plus valide' })
      }
      const existing = await fastify.prisma.user.findUnique({ where: { email } })
      if (existing) return reply.code(409).send({ error: 'Un compte existe déjà avec cet email' })

      const passwordHash = await bcrypt.hash(password, 10)
      const user = await fastify.prisma.user.create({ data: { email, name, passwordHash, role: 'STAKEHOLDER' } })
      await fastify.prisma.invitation.update({ where: { token }, data: { usedAt: new Date() } })
      // Verrouillage Stakeholder (2026-08-01) : plus de fiche Équipe pour ce rôle — le Stakeholder
      // devient un Contact sur le Client choisi par l'Admin à l'invitation (voir routes/
      // invitations.ts). `invitation.clientId` peut être null pour une invitation générée avant ce
      // changement (aucune en pratique, la seule existante est déjà utilisée) : dans ce cas on ne
      // crée aucun contact, même best-effort que si le Client avait été supprimé entre-temps.
      if (invitation.clientId) {
        await createLinkedClientContact(fastify.prisma, invitation.clientId, user.id, user.name, user.email)
      }

      const authToken = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role })
      return reply.code(201).send({ token: authToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
    }
  )
}
