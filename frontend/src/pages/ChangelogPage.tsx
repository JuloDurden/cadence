import { useRef, useEffect, useState } from 'react'
import { Header } from '../components/layout/Header'
import { CHANGELOG } from '../data/changelog'
import type { ChangelogVersion } from '../data/changelog'

const TAG_STYLE: Record<string, { bg: string; color: string }> = {
  feat:     { bg: '#d1fae5', color: '#065f46' },
  fix:      { bg: '#fee2e2', color: '#991b1b' },
  ux:       { bg: '#dbeafe', color: '#1e40af' },
  refactor: { bg: '#ede9fe', color: '#6d28d9' },
  perf:     { bg: '#fef3c7', color: '#92400e' },
  test:     { bg: '#f3f4f6', color: '#374151' },
  info:     { bg: '#f3f4f6', color: '#374151' },
}

function highlight(text: string, query: string): string {
  if (!query) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fef08a;border-radius:2px;padding:0 1px">$1</mark>')
}

export function ChangelogPage() {
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  // Filter by search
  const q = search.trim().toLowerCase()
  const filtered: ChangelogVersion[] = q
    ? CHANGELOG.filter(v =>
        v.version.toLowerCase().includes(q) ||
        v.title.toLowerCase().includes(q) ||
        v.changes.some(c => c.text.toLowerCase().includes(q))
      )
    : CHANGELOG

  // Heatmap — last 21 days
  const today = new Date()
  const DAYS = 21
  const heatData: Record<string, number> = {}
  CHANGELOG.forEach(v => {
    if (!v.dateISO) return
    const d = v.dateISO.slice(0, 10)
    heatData[d] = (heatData[d] ?? 0) + v.changes.length
  })
  const heatCells = Array.from({ length: DAYS }, (_, i) => {
    const dt = new Date(today)
    dt.setDate(dt.getDate() - (DAYS - 1 - i))
    const k = dt.toISOString().slice(0, 10)
    const n = heatData[k] ?? 0
    const label = dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    return { k, n, label }
  })
  const maxN = Math.max(...heatCells.map(c => c.n), 1)
  const HC = ['var(--border)', '#bbf7d0', '#6ee7a4', '#22c55e', '#15803d']
  const totalChanges = CHANGELOG.reduce((a, v) => a + v.changes.length, 0)
  const activeDays = heatCells.filter(c => c.n > 0).length

  // Scroll sync: highlight active version in left nav
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          // Pick the topmost visible
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          )
          setActiveId((top.target as HTMLElement).dataset.version ?? null)
        }
      },
      { root: container, rootMargin: '0px 0px -70% 0px', threshold: 0 }
    )
    cardRefs.current.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [filtered.length])

  function scrollTo(version: string) {
    cardRefs.current.get(version)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <Header title="Changelog" />
      <div className="page-content">
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* Heatmap */}
          <div className="cl-heatmap">
            <div className="cl-heatmap-meta">
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{totalChanges} changements</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}> sur {activeDays} jours actifs (21 derniers jours)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                <span>Moins</span>
                {HC.slice(0, 4).map((c, i) => (
                  <div key={i} style={{ width: 11, height: 11, borderRadius: 3, background: c }} />
                ))}
                <span>Plus</span>
              </div>
            </div>
            <div className="cl-heatmap-bars">
              {heatCells.map(cell => {
                const pct = cell.n / maxN
                const lvl = cell.n === 0 ? 0 : pct <= 0.15 ? 1 : pct <= 0.4 ? 2 : pct <= 0.7 ? 3 : 4
                const h = cell.n === 0 ? 8 : Math.round(8 + pct * 32)
                return (
                  <div
                    key={cell.k}
                    className="cl-heatmap-bar"
                    title={`${cell.label}${cell.n > 0 ? ` : ${cell.n} changement${cell.n > 1 ? 's' : ''}` : ''}`}
                    style={{ height: h, background: HC[lvl], cursor: cell.n > 0 ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (!cell.n) return
                      const v = CHANGELOG.find(x => x.dateISO?.startsWith(cell.k))
                      if (v) scrollTo(v.version)
                    }}
                  />
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>{heatCells[0].label}</span>
              <span>{heatCells[10].label}</span>
              <span>Aujourd'hui</span>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <input
              className="form-input"
              placeholder="Filtrer le changelog..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
              width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
          </div>

          {/* Main layout */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

            {/* Left nav */}
            <div className="cl-nav">
              <div style={{ position: 'relative' }}>
                <div className="cl-nav-line" />
                {filtered.map(v => {
                  const isMinor = /\d+\.\d+\.([1-9])/.test(v.version)
                  const isActive = activeId === v.version
                  return (
                    <div
                      key={v.version}
                      className="cl-nav-item"
                      onClick={() => scrollTo(v.version)}
                      style={{ padding: isMinor ? '3px 0' : '5px 0' }}
                    >
                      <div style={{ width: 22, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                        <div className="cl-dot" style={{
                          width: isMinor ? 7 : 10, height: isMinor ? 7 : 10,
                          background: v.current ? 'var(--primary)' : isActive ? 'var(--primary)' : isMinor ? 'var(--border)' : 'var(--text-muted)',
                          opacity: isActive && isMinor ? 0.6 : 1,
                        }} />
                      </div>
                      <span style={{
                        fontSize: isMinor ? 9 : 10, fontWeight: isMinor ? 400 : 700,
                        color: v.current || isActive ? 'var(--primary)' : 'var(--text-muted)',
                        whiteSpace: 'nowrap', marginLeft: 4,
                      }}>{v.version}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Cards */}
            <div ref={containerRef} style={{ flex: 1, minWidth: 0 }}>
              {filtered.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucune version ne correspond à "{search}"
                </div>
              )}
              {filtered.map(v => {
                const id = 'cl-' + v.version.replace(/\./g, '-')
                return (
                  <div
                    key={v.version}
                    id={id}
                    data-version={v.version}
                    ref={el => { if (el) cardRefs.current.set(v.version, el); else cardRefs.current.delete(v.version) }}
                    className={`cl-card${v.current ? ' cl-card-current' : ''}`}
                  >
                    <div className="cl-card-head">
                      <span className="cl-version">{v.version}</span>
                      {v.current && <span className="cl-badge-current">En cours</span>}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v.date}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{v.title}</span>
                    </div>
                    <ul className="cl-changes">
                      {v.changes.map((c, i) => {
                        const ts = TAG_STYLE[c.tag] ?? TAG_STYLE.info
                        return (
                          <li key={i} className="cl-change-item">
                            <span className="cl-tag" style={{ background: ts.bg, color: ts.color }}>
                              {c.tag.toUpperCase()}
                            </span>
                            <span dangerouslySetInnerHTML={{ __html: highlight(c.text, q) }} />
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
