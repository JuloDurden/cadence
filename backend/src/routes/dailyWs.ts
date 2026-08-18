import { FastifyInstance } from 'fastify'
import type { SocketStream } from '@fastify/websocket'

// Phase 7 (pre-check), 2026-08-18 : synchronisation temps reel de la page Daily Standup (retour
// Julien, "seule page du projet censee etre vue et remplie par plusieurs personnes en meme
// temps", sur le modele d'une messagerie instantanee). Canal WebSocket dedie, separe du blob
// `PUT /api/state` existant : ce canal ne sert qu'a diffuser l'affichage en direct aux autres
// clients connectes, jamais persiste tel quel. La sauvegarde reelle en base continue de passer
// par `PUT /api/state` (desormais avec anti-rebond cote client, voir DailyPage.tsx), qui reste la
// seule source de verite au rechargement.
//
// Authentification : le WebSocket natif du navigateur ne permet pas d'en-tete Authorization
// personnalise au moment du handshake, donc le jeton de session est passe en parametre de requete
// (?token=...) plutot qu'en en-tete, et verifie manuellement ici avec la meme instance
// fastify-jwt que le reste de l'API (`authenticate()` dans middleware/auth.ts est concu pour un
// preHandler REST classique, non reutilisable tel quel sur une route websocket).
//
// Registre de connexions en memoire (process unique, coherent avec le reste de l'architecture :
// une seule ligne singleton `workspace_state`, aucune mise a l'echelle multi-instance prevue) -
// perdu au redemarrage du serveur, sans consequence : chaque client rouvre sa connexion (voir
// hooks/useDailyRealtime.ts, reconnexion automatique cote frontend).

interface FieldUpdateMessage {
  type: 'field_update'
  memberId: string
  date: string
  field: 'yesterday' | 'today' | 'blockers'
  value: string
}

function isFieldUpdateMessage(msg: unknown): msg is FieldUpdateMessage {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  return m.type === 'field_update'
    && typeof m.memberId === 'string'
    && typeof m.date === 'string'
    && (m.field === 'yesterday' || m.field === 'today' || m.field === 'blockers')
    && typeof m.value === 'string'
}

export async function dailyWsRoutes(fastify: FastifyInstance) {
  // Une seule salle pour l'instant (page Daily Standup globale, pas de notion d'equipe
  // multiple) : un Set suffit, pas besoin d'un registre par salle/date.
  const connections = new Set<SocketStream['socket']>()

  fastify.get<{ Querystring: { token?: string } }>(
    '/api/ws/daily',
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
        // 4001 : code prive (plage 4000-4999 reservee aux applications par la RFC 6455), le
        // frontend s'en sert pour distinguer un rejet volontaire (jeton invalide/expire, pas la
        // peine de retenter en boucle) d'une simple coupure reseau (retente automatiquement).
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
        if (!isFieldUpdateMessage(msg)) return

        const outgoing = JSON.stringify({ ...msg, authorId, authorName })
        for (const other of connections) {
          // Jamais a l'emetteur lui-meme : il affiche deja sa propre frappe localement (voir
          // MemberCard.tsx), un echo ne ferait que risquer de percuter sa saisie en cours.
          if (other === socket || other.readyState !== other.OPEN) continue
          // Bug reel trouve par Julien (2026-08-18, test a 2 onglets) : `.send()` peut lever une
          // exception meme quand `readyState` reporte encore OPEN (course entre la verification et
          // l'envoi effectif, connexion "zombie" - notamment celle laissee en tres bref suspens par
          // le double-montage des effets de React.StrictMode en developpement, deja source d'autres
          // bugs similaires dans ce projet, voir SprintReviewPage.tsx/Sidebar.tsx/SettingsPage.tsx).
          // Sans ce try/catch, une exception ici interrompait purement et simplement la boucle
          // for...of AVANT d'atteindre les connexions suivantes du Set (ordre d'insertion) : une
          // seule connexion en mauvais etat pouvait donc priver TOUS les autres clients connectes
          // apres elle d'un message, de facon intermittente - exactement le symptome observe
          // (certains mots/lettres bien recus, d'autres jamais, jusqu'au rechargement complet qui
          // relit l'etat reellement persiste). Une connexion qui echoue est retiree du registre.
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
