// Phase 0 de la roadmap v1 (docs/roadmap-v1.md, 2026-07-28) : boîte de dialogue propre à l'outil,
// parallèle au système de toasts existant (ToastContext.tsx). Remplace progressivement les
// confirm()/alert() natifs du navigateur, au style non personnalisable et incohérent avec le
// reste de l'UI (voir docs/corrections futures.md, section Transverse / UI).
//
// API volontairement calquée sur les globales natives (confirm(message, options) renvoie une
// Promise<boolean>, alert(message, options) une Promise<void>) pour que la migration des appels
// existants se limite à : ajouter `const { confirm, alert } = useDialog()` en tête du composant,
// rendre la fonction appelante `async`, et ajouter `await` devant chaque appel.
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'

export interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Bouton de confirmation en rouge (`.btn-danger`) — pour les actions destructrices (suppression...). */
  danger?: boolean
}

export interface AlertOptions {
  title?: string
  okLabel?: string
}

interface DialogEntry {
  id: number
  kind: 'confirm' | 'alert'
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  okLabel?: string
  danger?: boolean
  resolve: (value: boolean) => void
}

interface DialogContextValue {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
  alert: (message: string, options?: AlertOptions) => Promise<void>
}

const noopConfirm = async () => false
const noopAlert = async () => {}

const DialogContext = createContext<DialogContextValue>({ confirm: noopConfirm, alert: noopAlert })

export function useDialog() { return useContext(DialogContext) }

export function DialogProvider({ children }: { children: ReactNode }) {
  // File d'attente plutôt qu'un unique dialogue actif : si un appel a lieu sans être attendu
  // (await manquant lors d'une future migration), les demandes s'empilent au lieu de s'écraser.
  const [queue, setQueue] = useState<DialogEntry[]>([])
  const counter = useRef(0)

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>(resolve => {
      const id = ++counter.current
      setQueue(q => [...q, {
        id, kind: 'confirm', message,
        title: options.title, confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel, danger: options.danger,
        resolve,
      }])
    })
  }, [])

  const alertFn = useCallback((message: string, options: AlertOptions = {}) => {
    return new Promise<void>(resolve => {
      const id = ++counter.current
      setQueue(q => [...q, {
        id, kind: 'alert', message,
        title: options.title, okLabel: options.okLabel,
        resolve: () => resolve(),
      }])
    })
  }, [])

  const current = queue[0]
  const modalRef = useModalFocus<HTMLDivElement>(!!current)

  const close = useCallback((value: boolean) => {
    setQueue(q => {
      const [head, ...rest] = q
      head?.resolve(value)
      return rest
    })
  }, [])

  // Échap = annuler (confirm) / fermer (alert) ; Entrée = valider — cohérent avec les habitudes
  // natives de confirm()/alert() que ce système remplace.
  useEffect(() => {
    if (!current) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(false) }
      if (e.key === 'Enter')  { e.preventDefault(); close(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, close])

  return (
    <DialogContext.Provider value={{ confirm, alert: alertFn }}>
      {children}
      {current && (
        <div
          className="modal-overlay open dialog-overlay"
          data-testid="dialog-overlay"
          onClick={e => { if (e.target === e.currentTarget) close(false) }}
        >
          <div className="modal dialog-modal" role="alertdialog" aria-modal="true" ref={modalRef} tabIndex={-1}>
            {current.title && (
              <div className="modal-header">
                <span className="modal-title">{current.title}</span>
                <button className="modal-close" data-testid="dialog-close" onClick={() => close(false)} aria-label="Fermer">×</button>
              </div>
            )}
            <div className="modal-body">
              <p className="dialog-message">{current.message}</p>
            </div>
            <div className="modal-footer">
              {current.kind === 'confirm' && (
                <button className="btn-secondary" data-testid="dialog-cancel" onClick={() => close(false)}>
                  {current.cancelLabel || 'Annuler'}
                </button>
              )}
              <button
                className={current.kind === 'confirm' && current.danger ? 'btn-danger' : 'btn-primary'}
                data-testid="dialog-confirm"
                onClick={() => close(true)}
                autoFocus
              >
                {current.kind === 'confirm' ? (current.confirmLabel || 'Confirmer') : (current.okLabel || 'OK')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
