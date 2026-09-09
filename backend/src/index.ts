import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import prismaPlugin from './plugins/prisma'
import { authRoutes } from './routes/auth'
import { stateRoutes } from './routes/state'
import { dailyWsRoutes } from './routes/dailyWs'
import { realtimeSyncWsRoutes } from './routes/realtimeWs'
import { usersRoutes } from './routes/users'
import { invitationsRoutes } from './routes/invitations'
import { onboardingRoutes } from './routes/onboarding'
import { personalSettingsRoutes } from './routes/personalSettings'
import { presentationRoutes } from './routes/presentation'
import { apiTokensRoutes } from './routes/apiTokens'
import { itemsRoutes } from './routes/items'
import { hierarchyNodesRoutes } from './routes/hierarchyNodes'
import { githubRoutes } from './routes/github'
import { slackRoutes } from './routes/slack'
import { jiraRoutes } from './routes/jira'
import { aiRoutes } from './routes/ai'
import { changelogRoutes } from './routes/changelog'
import { demoRoutes } from './routes/demo'
import { startDemoResetScheduler } from './lib/demoReset'

const fastify = Fastify({ logger: true })

async function start() {
  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'changeme-in-production',
    sign: { expiresIn: '8h' },
  })

  await fastify.register(prismaPlugin)
  await fastify.register(websocket)

  await fastify.register(authRoutes)
  await fastify.register(stateRoutes)
  await fastify.register(dailyWsRoutes)
  await fastify.register(realtimeSyncWsRoutes)
  await fastify.register(usersRoutes)
  await fastify.register(invitationsRoutes)
  await fastify.register(onboardingRoutes)
  await fastify.register(personalSettingsRoutes)
  await fastify.register(presentationRoutes)
  await fastify.register(apiTokensRoutes)
  await fastify.register(itemsRoutes)
  await fastify.register(hierarchyNodesRoutes)
  await fastify.register(githubRoutes)
  await fastify.register(slackRoutes)
  await fastify.register(jiraRoutes)
  await fastify.register(aiRoutes)
  await fastify.register(changelogRoutes)
  await fastify.register(demoRoutes)

  fastify.get('/api/health', async () => ({ status: 'ok' }))

  const port = Number(process.env.PORT ?? 3001)
  await fastify.listen({ port, host: '0.0.0.0' })

  // Démo publique v1, sous-chantier 3/5 (2026-09-09) : démarré sans condition, y compris sur
  // l'instance réelle de Julien - sûr car il ne fait jamais rien tant qu'aucun compte `isDemo`
  // n'existe (voir lib/demoReset.ts, checkAndResetIfSessionExpired). Après `listen()` plutôt
  // qu'avant, pour ne pas retarder la disponibilité du serveur d'une vérification qui peut attendre
  // le prochain intervalle de toute façon.
  startDemoResetScheduler(fastify.prisma)
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})
