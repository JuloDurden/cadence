import { useState, useRef, useEffect } from 'react'

function Svg({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const CHEVRON_DOWN = '<path d="m6 9 6 6 6-6"/>'

export interface FDOption { value: string; label: string; color?: string }

interface Props {
  icon: string
  label: string
  value: string
  options: FDOption[]
  onChange: (v: string) => void
  allLabel?: string
  minWidth?: number
}

export function FilterDropdown({ icon, label, value, options, onChange, allLabel = 'Tous', minWidth = 160 }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`hdr-ctx-btn fd-btn${value ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <Svg d={icon} size={13} />
        <span>{selected?.label ?? label}</span>
        <Svg d={CHEVRON_DOWN} size={11} />
      </button>
      {open && (
        <div className="fd-panel" style={{ minWidth }}>
          <div className={`fd-opt${!value ? ' selected' : ''}`} onClick={() => { onChange(''); setOpen(false) }}>
            {allLabel}
          </div>
          {options.map(o => (
            <div
              key={o.value}
              className={`fd-opt${value === o.value ? ' selected' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.color && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color,
                  display: 'inline-block', marginRight: 6, flexShrink: 0 }} />
              )}
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
