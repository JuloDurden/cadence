import { FastifyRequest, FastifyReply } from 'fastify'

// Le payload JWT signe dans routes/auth.ts contient id/email/role — on le declare ici pour que
// `req.user` soit type partout (utilise par `requireRole` ci-dessous), plutot que `any` implicite.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string }
    user: { id: string; email: string; role: string }
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Non authentifié' })
  }
}

// Phase 2 (roadmap v1), sous-chantier 1 : guard de role, a chainer APRES `authenticate` dans un
// tableau `preHandler` (ex. `preHandler: [authenticate, requireRole('ADMIN')]`) — `authenticate`
// peuple `req.user` via `jwtVerify()`, `requireRole` ne fait que le lire.
export function requireRole(...roles: string[]) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const role = req.user?.role
    if (!role || !roles.includes(role)) {
      reply.code(403).send({ error: 'Accès réservé à un rôle non autorisé pour ce compte' })
    }
  }
}
