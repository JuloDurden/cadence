import { useRef, useEffect, useState } from 'react'
import { Header } from '../components/layout/Header'
import { CHANGELOG } from '../data/changelog'
import type { ChangelogVersion } from '../data/changelog'

function highlight(text: string, q: string): string {
  if (!q) return text
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${esc})`, 'gi'), '<mark style="background:#fef08a;border-radius:2px;padding:0 1px">$1</mark>')
}

export function ChangelogPage() {
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)

  const q = search.trim().toLowerCase()
  const filtered: ChangelogVersion[] = q
    ? CHANGELOG.filter(v =>
        v.version.toLowerCase().includes(q) ||
        v.title.toLowerCase().includes(q) ||
        v.changes.some(c => c.text.toLowerCase().includes(q))
      )
    : CHANGELOG

  /* ── Heatmap ── */
  const DAYS = 21
  const today = new Date()
  const heatData: Record<string, number> = {}
  CHANGELOG.forEach(v => {
    if (!v.dateISO) return
    const k = v.dateISO.slice(0, 10)
    heatData[k] = (heatData[k] ?? 0) + v.changes.length
  })
  const cells = Array.from({ length: DAYS }, (_, i) => {
    const dt = new Date(today)
    dt.setDate(dt.getDate() - (DAYS - 1 - i))
    const k = dt.toISOString().slice(0, 10)
    const n = heatData[k] ?? 0
    return { k, n, label: dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }
  })
  const maxN = Math.max(...cells.map(c => c.n), 1)
  const COLORS = ['var(--border)', '#bbf7d0', '#6ee7a4', '#22c55e', '#15803d']
  const totalChanges = CHANGELOG.reduce((a, v) => a + v.changes.length, 0)
  const activeDays = cells.filter(c => c.n > 0).length

  /* ── IntersectionObserver nav sync ── */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting)
      if (!vis.length) return
      const top = vis.reduce((a, b) =>
        a.boundingClientRect.top < b.boundingClientRect.top ? a : b)
      setActiveId((top.target as HTMLElement).dataset.version ?? null)
    }, { rootMargin: '0px 0px -65% 0px', threshold: 0 })
    cardRefs.current.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [filtered.length])

  function scrollTo(ver: string) {
    cardRefs.current.get(ver)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <Header title="Changelog" />
      <div className="page-content">
        <div style={{ maxWidth: 960, margin: '0 auto' }}>

          {/* Heatmap */}
          <div className="cl-heatmap">
            <div className="cl-heatmap-meta">
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{totalChanges} changements</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> sur {activeDays} jours actifs (21 derniers jours)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                <span>Moins</span>
                {COLORS.slice(0, 4).map((c, i) => (
                  <div key={i} style={{ width: 11, height: 11, borderRadius: 3, background: c }} />
                ))}
                <span>Plus</span>
              </div>
            </div>
            <div className="cl-heatmap-bars">
              {cells.map(cell => {
                const pct = cell.n / maxN
                const lvl = cell.n === 0 ? 0 : pct <= .15 ? 1 : pct <= .4 ? 2 : pct <= .7 ? 3 : 4
                const h = cell.n === 0 ? 6 : Math.round(6 + pct * 34)
                return (
                  <div key={cell.k} className="cl-heatmap-bar"
                    title={`${cell.label}${cell.n ? ` : ${cell.n} changement${cell.n > 1 ? 's' : ''}` : ''}`}
                    style={{ height: h, background: COLORS[lvl], cursor: cell.n ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (!cell.n) return
                      const v = CHANGELOG.find(x => x.dateISO?.startsWith(cell.k))
                      if (v) scrollTo(v.version)
                    }} />
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: 'var(--text-muted)' }}>
              <span>{cells[0].label}</span>
              <span>{cells[10].label}</span>
              <span>Aujourd'hui</span>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 18, position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
              width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input className="form-input" placeholder="Filtrer le changelog..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }} />
          </div>

          {/* Layout */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

            {/* Left nav */}
            <div className="cl-nav" style={{ flexShrink: 0, width: 108 }}>
              {filtered.map(v => {
                const isMinor = /\d+\.\d+\.[1-9]/.test(v.version)
                const isActive = activeId === v.version
                return (
                  <div
                    key={v.version}
                    className={`cl-nav-item${isActive ? ' active' : ''}${v.current ? ' current' : ''}`}
                    onClick={() => scrollTo(v.version)}
                  >
                    <div className={`cl-nav-dot${v.current ? ' current' : ''}${isMinor ? ' minor' : ''}`} />
                    <span className={`cl-nav-ver${isMinor ? ' minor' : ''}`}>{v.version}</span>
                  </div>
                )
              })}
            </div>

            {/* Cards */}
            <div ref={scrollRef} style={{ flex: 1, minWidth: 0 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucun resultat pour "{search}"
                </div>
              )}
              {filtered.map(v => (
                <div
                  key={v.version}
                  data-version={v.version}
                  ref={el => { if (el) cardRefs.current.set(v.version, el); else cardRefs.current.delete(v.version) }}
                  className={`cl-card${v.current ? ' current' : ''}`}
                >
                  {/* Card header */}
                  <div className="cl-card-meta">
                    <span className="cl-card-ver">{v.version}</span>
                    {v.current && <span className="cl-card-badge">En cours</span>}
                    <span className="cl-card-date">{v.date}</span>
                  </div>
                  <div className="cl-card-title">{v.title}</div>

                  {/* Changes */}
                  <ul className="cl-changes">
                    {v.changes.map((c, i) => (
                      <li key={i} className="cl-change">
                        <span className={`cl-tag cl-tag-${c.tag}`}>{c.tag.toUpperCase()}</span>
                        <span dangerouslySetInnerHTML={{ __html: highlight(c.text, q) }} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
