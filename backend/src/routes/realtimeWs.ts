import { FastifyInstance } from 'fastify'
import type { SocketStream } from '@fastify/websocket'

// Synchronisation temps reel generalisee a toute l'application (2026-08-19, retour Julien : "quand
// plusieurs utilisateurs sont en meme temps sur l'outil, si l'un d'eux met quelque chose a jour,
// personne ne voit la modification sauf en faisant un refresh"). Extension du principe du canal
// dedie au Daily Standup (voir dailyWs.ts) a l'ensemble des actions du reducer frontend
// (StateContext.tsx) : un client diffuse l'action qu'il vient de dispatcher localement, les autres
// clients connectes l'appliquent a leur tour a leur propre etat local, sans jamais recharger toute
// la page. La persistance reelle continue de passer par `PUT /api/state` (inchange), ce canal ne
// sert qu'a l'affichage en direct.
//
// Choix delibere de garder DEUX connexions WebSocket distinctes (celle-ci + dailyWs.ts) plutot que
// de les fusionner en une seule : le canal Daily Standup vient d'etre stabilise le 2026-08-18 apres
// plusieurs iterations avec Julien (voir docs/corrections.md) ; le toucher a nouveau pour le
// generaliser aurait ajoute un risque de regression sur une fonctionnalite fraichement validee,
// pour un gain (une connexion en moins par onglet) marginal. A revoir si les deux canaux doivent un
// jour partager davantage de logique.
//
// Authentification et registre de connexions : memes choix que dailyWs.ts (jeton en parametre de
// requete, verifie manuellement via fastify.jwt.verify ; Set en memoire, process unique). Le
// try/catch individuel autour de chaque envoi est present des le depart ici (lecon deja tiree du
// bug trouve sur le canal Daily Standup le 2026-08-18, voir dailyWs.ts) plutot que d'attendre de le
// redecouvrir sur ce nouveau canal.

interface StateActionMessage {
  type: 'state_action'
  action: { type: string; [key: string]: unknown }
}

function isStateActionMessage(msg: unknown): msg is StateActionMessage {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  if (m.type !== 'state_action') return false
  const action = m.action
  return !!action && typeof action === 'object' && typeof (action as Record<string, unknown>).type === 'string'
}

export async function realtimeSyncWsRoutes(fastify: FastifyInstance) {
  const connections = new Set<SocketStream['socket']>()

  fastify.get<{ Querystring: { token?: string } }>(
    '/api/ws/sync',
    { websocket: true },
    (connection, req) => {
      const socket = connection.socket
      const token = req.query?.token

      let authorId = ''
      let authorName = ''
      try {
        if (!token) throw new Error('missing token')
        const payload = fastify.jwt.verify<{ id: string; email: string }>(token)
        authorId = payload.id
        authorName = payload.email
      } catch {
        socket.close(4001, 'Non authentifie')
        return
      }

      connections.add(socket)

      socket.on('message', (raw: Buffer) => {
        let msg: unknown
        try {
          msg = JSON.parse(raw.toString())
        } catch {
          return
        }
        if (!isStateActionMessage(msg)) return

        const outgoing = JSON.stringify({ ...msg, authorId, authorName })
        for (const other of connections) {
          // Jamais a l'emetteur lui-meme : son propre dispatch local a deja mis a jour son ecran.
          if (other === socket || other.readyState !== other.OPEN) continue
          try {
            other.send(outgoing)
          } catch {
            connections.delete(other)
          }
        }
      })

      socket.on('close', () => connections.delete(socket))
      socket.on('error', () => connections.delete(socket))
    }
  )
}
