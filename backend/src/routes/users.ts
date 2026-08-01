import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import type { Role } from '@prisma/client'
import { authenticate, requireRole } from '../middleware/auth'

// Phase 2 (roadmap v1), sous-chantier 1 : gestion des comptes, reservee au role Admin.
// Doit rester synchronise avec l'enum Prisma `Role` (schema.prisma).
const ROLES: Role[] = ['ADMIN', 'PO', 'SCRUM_MASTER', 'DEV', 'STAKEHOLDER']

const USER_SELECT = { id: true, email: true, name: true, role: true, createdAt: true } as const

export async function usersRoutes(fastify: FastifyInstance) {
  const adminOnly = [authenticate, requireRole('ADMIN')]

  // GET /api/users — liste des comptes (Admin uniquement)
  fastify.get('/api/users', { preHandler: adminOnly }, async () => {
    const users = await fastify.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    })
    return { users }
  })

  // POST /api/users — creer un compte (Admin uniquement)
  fastify.post<{ Body: { email: string; password: string; name: string; role: Role } }>(
    '/api/users',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'name', 'role'],
          properties: {
            email: { type: 'string' },
            password: { type: 'string', minLength: 8 },
            name: { type: 'string', minLength: 1 },
            role: { type: 'string', enum: ROLES },
          },
        },
      },
    },
    async (req, reply) => {
      const { email, password, name, role } = req.body
      const existing = await fastify.prisma.user.findUnique({ where: { email } })
      if (existing) return reply.code(409).send({ error: 'Un compte existe déjà avec cet email' })
      const passwordHash = await bcrypt.hash(password, 10)
      const user = await fastify.prisma.user.create({
        data: { email, name, passwordHash, role },
        select: USER_SELECT,
      })
      return reply.code(201).send({ user })
    }
  )

  // DELETE /api/users/:id — supprimer un compte (Admin uniquement). Retour Julien (2026-08-01) :
  // supprimer la fiche Équipe ne supprimait jamais le compte applicatif associé (il restait
  // capable de se connecter) — jusqu'ici aucun moyen de supprimer un compte du tout. Un compte
  // Admin ne peut pas être ciblé (ni par un autre Admin, ni par lui-même) : pas de rôle de
  // "super-admin" distinct dans ce prototype pour arbitrer ce cas, plus sûr de l'interdire
  // catégoriquement. La fiche Équipe ou le Contact lié (`linkedUserId`) sont nettoyés côté client
  // (`UsersSettingsSection.tsx`), pas ici : `WorkspaceState.data` est un blob JSON entièrement
  // piloté par le frontend (voir routes/state.ts), cette route ne fait que supprimer le compte.
  fastify.delete<{ Params: { id: string } }>(
    '/api/users/:id',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { id } = req.params
      const user = await fastify.prisma.user.findUnique({ where: { id } })
      if (!user) return reply.code(404).send({ error: 'Compte introuvable' })
      if (user.role === 'ADMIN') return reply.code(403).send({ error: 'Un compte Admin ne peut pas être supprimé' })
      await fastify.prisma.user.delete({ where: { id } })
      return reply.code(204).send()
    }
  )

  // PATCH /api/users/:id — changer le role et/ou le nom d'un compte (Admin uniquement)
  fastify.patch<{ Params: { id: string }; Body: { role?: Role; name?: string } }>(
    '/api/users/:id',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ROLES },
            name: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params
      const { role, name } = req.body
      const user = await fastify.prisma.user.findUnique({ where: { id } })
      if (!user) return reply.code(404).send({ error: 'Utilisateur introuvable' })
      const updated = await fastify.prisma.user.update({
        where: { id },
        data: { ...(role ? { role } : {}), ...(name ? { name } : {}) },
        select: USER_SELECT,
      })
      return { user: updated }
    }
  )
}
