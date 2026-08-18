import { useCallback, useEffect, useRef } from 'react'
import { useCadence } from '../context/StateContext'
import { BASE_URL } from '../services/api'
import type { DailyEntry } from '../types'

const WS_BASE_URL = BASE_URL.replace(/^http/, 'ws')

interface FieldUpdatePayload {
  type: 'field_update'
  memberId: string
  date: string
  field: 'yesterday' | 'today' | 'blockers'
  value: string
}

interface IncomingFieldUpdate extends FieldUpdatePayload {
  authorId: string
  authorName: string
}

/**
 * Synchronisation temps réel de la page Daily Standup (retour Julien, 2026-08-18 : "seule page du
 * projet censée être vue et remplie par plusieurs personnes en même temps", sur le modèle d'une
 * messagerie instantanée). Canal WebSocket dédié à `/api/ws/daily`, séparé du blob `PUT
 * /api/state` (voir `backend/src/routes/dailyWs.ts` pour le détail et le raisonnement).
 * `sendFieldUpdate` diffuse une frappe aux autres clients connectés sans jamais l'écrire en base ;
 * la sauvegarde réelle reste à la charge de l'appelant (voir `DailyPage.tsx`, anti-rebond sur
 * `saveToServer`). Les frappes reçues des autres mettent à jour `state.dailyEntries` localement en
 * ne fusionnant QUE le champ concerné (jamais l'entrée entière), pour ne pas écraser un autre
 * champ de la même entrée en cours de frappe par quelqu'un d'autre (ex. le membre tape "Hier"
 * pendant qu'un Admin corrige "Blocages" au même instant).
 *
 * Connexion tolérante à l'échec (réseau hors-ligne, backend indisponible...), comme le reste de
 * l'app (voir `saveToServer`, `StateContext.tsx`) : jamais d'erreur bloquante ni de `pageerror`,
 * reconnexion automatique à délai croissant tant que la page reste montée. Un rejet volontaire du
 * serveur (jeton invalide/expiré, code 4001) n'est volontairement pas retenté en boucle : sans
 * intérêt tant que le jeton ne change pas.
 */
export function useDailyRealtime() {
  const { dispatch, state } = useCadence()
  const stateRef = useRef(state)
  stateRef.current = state

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(1000)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false

    function connect() {
      if (unmountedRef.current) return
      const token = localStorage.getItem('cadence_token')
      if (!token) return

      let ws: WebSocket
      try {
        ws = new WebSocket(`${WS_BASE_URL}/api/ws/daily?token=${encodeURIComponent(token)}`)
      } catch {
        return
      }
      wsRef.current = ws

      ws.onopen = () => { reconnectDelayRef.current = 1000 }

      ws.onmessage = e => {
        let msg: IncomingFieldUpdate
        try { msg = JSON.parse(e.data) } catch { return }
        if (msg?.type !== 'field_update') return
        const current = stateRef.current
        const existing = current.dailyEntries.find(en => en.memberId === msg.memberId && en.date === msg.date)
          ?? { memberId: msg.memberId, date: msg.date, yesterday: '', today: '', blockers: '' }
        const updated: DailyEntry = { ...existing, [msg.field]: msg.value }
        dispatch({ type: 'UPSERT_DAILY_ENTRY', payload: updated })
      }

      ws.onclose = e => {
        wsRef.current = null
        if (e.code === 4001 || unmountedRef.current) return
        reconnectTimerRef.current = setTimeout(connect, reconnectDelayRef.current)
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 15000)
      }

      // onerror est toujours suivi d'onclose (spec WebSocket) : la reconnexion y est déjà gérée,
      // rien à faire de plus ici sinon dupliquer la planification du prochain essai.
      ws.onerror = () => {}
    }

    connect()

    return () => {
      unmountedRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [dispatch])

  // useCallback (2026-08-18, retour Julien : la vue Admin "ne suit pas le rythme" d'une frappe
  // rapide côté Dev) : référence stable indispensable pour que `handleChange` (DailyPage.tsx),
  // qui en dépend, garde lui aussi une référence stable, condition pour que `React.memo` sur
  // `MemberCard` (voir components/daily/MemberCard.tsx) empêche le re-rendu des cartes non
  // concernées à chaque message WebSocket reçu.
  const sendFieldUpdate = useCallback((payload: Omit<FieldUpdatePayload, 'type'>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'field_update', ...payload }))
    }
  }, [])

  return { sendFieldUpdate }
}
