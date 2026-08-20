import type { SocketStream } from '@fastify/websocket'

// Registre partagé des connexions WebSocket de synchronisation temps réelle (voir routes/
// realtimeWs.ts), extrait ici plutôt que gardé local à la fonction de route (2026-08-20, contrôle
// de version optimiste de PUT /api/state) : routes/state.ts a aussi besoin d'y diffuser un message
// après une sauvegarde réussie (voir plus bas, `state_version`), sans dépendre de l'encapsulation
// Fastify - routes/realtimeWs.ts et routes/state.ts sont enregistrés comme deux plugins distincts
// (index.ts), sans `fastify-plugin` : un `fastify.decorate()` posé dans l'un ne serait pas visible
// depuis l'autre, alors qu'un module partagé classique l'est simplement par import.
export const syncConnections = new Set<SocketStream['socket']>()

export function broadcastSync(message: object) {
  const outgoing = JSON.stringify(message)
  for (const socket of syncConnections) {
    if (socket.readyState !== socket.OPEN) continue
    try {
      socket.send(outgoing)
    } catch {
      syncConnections.delete(socket)
    }
  }
}
