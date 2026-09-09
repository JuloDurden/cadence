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
      // Démo publique v1, sous-chantier 3/5 (2026-09-09) : voir schema.prisma, User.lastLoginAt -
      // seul point d'écriture de ce champ, utilisé par lib/demoReset.ts pour mesurer la "session"
      // du compte démo. Faite avant l'émission du jeton plutôt qu'après (best-effort, pas bloquant
      // pour la connexion elle-même) : si cette écriture échouait pour une raison quelconque, mieux
      // vaut connecter la personne quand même que la bloquer pour une fonctionnalité annexe.
      await fastify.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role, isDemo: user.isDemo })
      return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role, isDemo: user.isDemo } }
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

  // GET /api/auth/invite-status/:token — vérification amont de la validité d'un lien
  // d'invitation (2026-08-01, retour Julien : "quand on révoque un lien... l'accès est toujours
  // possible au lien"). Le backend refusait déjà correctement une invitation révoquée/utilisée à
  // la soumission (410 sur POST /api/auth/accept-invite ci-dessous), mais `LoginPage.tsx` affiche
  // le formulaire dès la présence de `?invite=TOKEN` dans l'URL, sans vérification préalable — le
  // formulaire restait donc visible et remplissable même après révocation. Public comme
  // accept-invite (le token fait office d'autorisation). Renvoie seulement `{valid}`, jamais de
  // détail sur l'invitation (email du destinataire, client...), pour ne pas exposer d'information
  // à quelqu'un qui aurait un token invalide ou périmé.
  fastify.get<{ Params: { token: string } }>('/api/auth/invite-status/:token', async (req) => {
    const invitation = await fastify.prisma.invitation.findUnique({ where: { token: req.params.token } })
    return { valid: !!invitation && !invitation.usedAt }
  })

  // POST /api/auth/accept-invite — complète une invitation (Phase 2.5, Onboarding). Public :
  // le token fait office d'autorisation (généré par un Admin, voir routes/invitations.ts). Rôle
  // toujours STAKEHOLDER, jamais transmis par le client — seul rôle accessible par ce chemin,
  // décision Julien ("les invitations sont pour les stakeholders").
  fastify.post<{ Body: { token: string; email: string; password: string; name: string; poste: string; phone?: string } }>(
    '/api/auth/accept-invite',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'email', 'password', 'name', 'poste'],
          properties: {
            token: { type: 'string' },
            email: { type: 'string' },
            password: { type: 'string', minLength: 8 },
            name: { type: 'string', minLength: 1 },
            poste: { type: 'string', minLength: 1 },
            phone: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { token, email, password, name, poste, phone } = req.body
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
        await createLinkedClientContact(fastify.prisma, invitation.clientId, user.id, user.name, user.email, poste, phone)
      }

      const authToken = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role })
      return reply.code(201).send({ token: authToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
    }
  )
}
