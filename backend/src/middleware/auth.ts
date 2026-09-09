import { FastifyRequest, FastifyReply } from 'fastify'

// Le payload JWT signe dans routes/auth.ts contient id/email/role — on le declare ici pour que
// `req.user` soit type partout (utilise par `requireRole` ci-dessous), plutot que `any` implicite.
// `jti` ajoute en Phase 5 (roadmap v1), MCP Claude (Cadence) : uniquement present sur un jeton
// d'acces personnel (PAT, voir routes/apiTokens.ts), absent d'un jeton de session normal emis par
// POST /api/auth/login, c'est ce qui distingue les deux en aval dans `authenticate` ci-dessous.
// `isDemo` ajouté à la Démo publique v1 (2026-09-09) : optionnel, absent/`false` sur un jeton émis
// avant ce chantier, jamais vrai en dehors du déploiement de démo dédié (voir schema.prisma, champ
// `User.isDemo`).
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string; jti?: string; isDemo?: boolean }
    user: { id: string; email: string; role: string; jti?: string; isDemo?: boolean }
  }
}

// Phase 5 (roadmap v1), MCP Claude (Cadence), 2026-08-08 : un jeton d'acces personnel (PAT) est un
// JWT classique (meme signature, memes claims id/email/role qu'une session normale), donc verifie
// par le meme `req.jwtVerify()` sans rien dupliquer, mais contrairement a une session, il doit
// pouvoir etre revoque avant son expiration (longue duree, voir routes/apiTokens.ts). Seul un
// payload qui porte un `jti` (donc un PAT, jamais un jeton de session) declenche cette verification
// supplementaire en base : aucun cout ajoute sur le flux de connexion existant, qui reste
// exactement aussi rapide qu'avant.
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Non authentifié' })
  }

  const jti = req.user?.jti
  if (jti) {
    const apiToken = await req.server.prisma.apiToken.findUnique({ where: { jti } })
    if (!apiToken || apiToken.revokedAt) {
      return reply.code(401).send({ error: 'Jeton révoqué ou invalide' })
    }
    // Fire-and-forget : ne bloque jamais la requete pour une simple mise a jour de metadonnee
    // d'affichage (derniere utilisation, visible dans la section Reglages).
    req.server.prisma.apiToken.update({ where: { jti }, data: { lastUsedAt: new Date() } }).catch(() => {})
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

// Démo publique v1 (2026-09-09) : à chaîner APRES `authenticate`, même principe que `requireRole`.
// N'importe quel rôle passe `requireRole('ADMIN')` sur le compte démo (il est réellement Admin, pour
// montrer toute l'étendue de l'outil) - seule cette garde bloque spécifiquement les routes coûteuses
// (Compagnon IA, voir routes/ai.ts) pour ce compte précis, sans toucher au reste de ses droits.
export async function forbidDemo(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.isDemo) {
    reply.code(403).send({ error: 'Fonctionnalité désactivée sur le compte de démonstration' })
  }
}
