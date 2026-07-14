import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastEntry {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() { return useContext(ToastContext) }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const counter = useRef(0)

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counter.current
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite" aria-atomic="false"
        style={{
          position: 'fixed', bottom: 24, right: 24,
          display: 'flex', flexDirection: 'column', gap: 8,
          zIndex: 9999, pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 14px', borderRadius: 8,
              fontSize: 13, fontWeight: 500,
              boxShadow: '0 4px 16px rgba(0,0,0,.18)',
              background: t.type === 'error' ? 'var(--danger, #ef4444)'
                        : t.type === 'info'  ? 'var(--primary)'
                        :                      '#22c55e',
              color: '#fff',
              animation: 'toast-in .2s ease',
              pointerEvents: 'auto',
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              dangerouslySetInnerHTML={{ __html:
                t.type === 'error'
                  ? '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
                  : t.type === 'info'
                    ? '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'
                    : '<path d="M20 6 9 17l-5-5"/>'
              }} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
