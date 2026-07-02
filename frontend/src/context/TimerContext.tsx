import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'

interface TimerContextValue {
  duration: number
  seconds: number
  running: boolean
  done: boolean
  setDuration: (d: number) => void
  toggle: () => void
  reset: () => void
}

const TimerContext = createContext<TimerContextValue | null>(null)

export function TimerProvider({ children }: { children: ReactNode }) {
  const [duration, setDurationState] = useState(15)
  const [seconds, setSeconds] = useState(15 * 60)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function setDuration(d: number) {
    setDurationState(d)
    setSeconds(d * 60)
    setDone(false)
    setRunning(false)
  }

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            setRunning(false)
            setDone(true)
            clearInterval(intervalRef.current!)
            return 0
          }
          return s - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  function toggle() { if (done) reset(); else setRunning(r => !r) }
  function reset() { setSeconds(duration * 60); setRunning(false); setDone(false) }

  return (
    <TimerContext.Provider value={{ duration, seconds, running, done, setDuration, toggle, reset }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimer must be inside TimerProvider')
  return ctx
}
