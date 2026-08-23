import { useRef, useEffect, useState, useMemo } from 'react'
import { Header } from '../components/layout/Header'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { PublishChangelogModal } from '../components/changelog/PublishChangelogModal'
import type { ChangelogVersion } from '../data/changelog'
import { escapeHtml } from '../utils/escapeHtml'

// Phase 7, sécurité (2026-08-23) : `text` échappé AVANT le surlignage - une entrée de changelog
// contenant du HTML (même si la publication est réservée Admin, voir routes/changelog.ts) ne doit
// jamais s'exécuter tel quel chez qui consulte la page. Voir docs/corrections.md.
function highlight(text: string, q: string): string {
  const safe = escapeHtml(text)
  if (!q) return safe
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safe.replace(new RegExp(`(${esc})`, 'gi'), '<mark style="background:#fef08a;border-radius:2px;padding:0 1px">$1</mark>')
}

const TIMEFRAMES = [
  { label: '1 mois', days: 30 },
  { label: '3 mois', days: 90 },
  { label: '6 mois', days: 180 },
  { label: '1 an', days: 365 },
]

/** Une version est "mineure" (regroupable, retrait dans la nav) si :
 *  - patch > 0 : v0.84.1, v0.19.1… (déjà le cas avant)
 *  - ET si ce n'est PAS : la version courante, l'une des 9 premières (v0.1–v0.9),
 *    ni un "jalon dizaine" (v0.10, v0.20, v0.30…)
 */
function isNavMinor(v: ChangelogVersion): boolean {
  if (v.current) return false
  if (/v\d+\.\d+\.[1-9]/.test(v.version)) return true
  const m = v.version.match(/v\d+\.(\d+)/)
  if (!m) return false
  const minor = parseInt(m[1], 10)
  if (minor < 10) return false          // v0.1–v0.9 : prominents
  if (minor % 10 === 0) return false    // v0.10, v0.20… : jalons, prominents
  return true                           // tout le reste : en retrait
}

function versionPrefix(v: string): string {
  const m = v.match(/^v(\d+)\.(\d+)/)
  return m ? `v${m[1]}.${m[2]}` : v
}

// Reforme du Changelog (2026-08-22, maquette validee par Julien - option A "nav groupee" + option
// B "pagination") : les versions "mineures" consecutives (isNavMinor, meme prefixe major.minor) sont
// regroupees en un seul bloc repliable plutot que d'occuper chacune leur propre ligne de nav/carte -
// c'est ce qui rend une liste de 170 versions praticable sans jamais rien cacher definitivement. Un
// groupe garde un id STABLE (prefixe + version la plus recente du groupe) pour que l'etat replie/
// deplie (`expandedGroups`, une simple liste d'ids) survive a un re-render meme si la liste filtree
// change de forme.
type NavGroup =
  | { kind: 'single'; id: string; entry: ChangelogVersion }
  | { kind: 'cluster'; id: string; prefix: string; entries: ChangelogVersion[] }

function buildGroups(entries: ChangelogVersion[]): NavGroup[] {
  const groups: NavGroup[] = []
  let i = 0
  while (i < entries.length) {
    const e = entries[i]
    if (!isNavMinor(e)) {
      groups.push({ kind: 'single', id: e.version, entry: e })
      i++
      continue
    }
    const prefix = versionPrefix(e.version)
    const cluster: ChangelogVersion[] = [e]
    let j = i + 1
    while (j < entries.length && isNavMinor(entries[j]) && versionPrefix(entries[j].version) === prefix) {
      cluster.push(entries[j])
      j++
    }
    groups.push({ kind: 'cluster', id: `${prefix}-${e.version}`, prefix, entries: cluster })
    i = j
  }
  return groups
}

const GROUPS_PAGE_SIZE = 12
const DAY_LABELS = ['Lun', '', 'Mer', '', 'Ven', '', '']

export function ChangelogPage() {
  const { userRole } = useAuth()
  const isAdmin = userRole === 'ADMIN'

  const [entries, setEntries] = useState<ChangelogVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState(90)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [visibleGroupCount, setVisibleGroupCount] = useState(GROUPS_PAGE_SIZE)

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const navItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)

  function loadEntries() {
    setLoading(true)
    setLoadError(false)
    api.listChangelog()
      .then(({ entries }) => setEntries(entries))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }
  useEffect(loadEntries, [])

  const q = search.trim().toLowerCase()
  const filtered: ChangelogVersion[] = q
    ? entries.filter(v =>
        v.version.toLowerCase().includes(q) ||
        v.title.toLowerCase().includes(q) ||
        v.changes.some(c => c.text.toLowerCase().includes(q))
      )
    : entries

  // Pendant une recherche, tous les groupes sont deplies et la pagination est desactivee - un
  // resultat de recherche ne doit jamais rester cache derriere un "charger plus" ou un groupe replie.
  const groups = useMemo(() => buildGroups(filtered), [filtered])
  const visibleGroups = q ? groups : groups.slice(0, visibleGroupCount)
  const hasMoreGroups = !q && groups.length > visibleGroupCount

  function isGroupExpanded(g: NavGroup): boolean {
    if (g.kind === 'single') return true
    return q ? true : expandedGroups.has(g.id)
  }
  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  /* ── Heatmap façon GitHub (grille semaine/jour) ── */
  const DAYS = timeframe
  const today = new Date()
  const heatByDay: Record<string, number> = {}
  entries.forEach(v => {
    if (!v.dateISO) return
    const k = v.dateISO.slice(0, 10)
    heatByDay[k] = (heatByDay[k] ?? 0) + v.changes.length
  })
  // Grille alignee sur le vrai jour de la semaine (lundi en haut) : on part du DAYS-ieme jour avant
  // aujourd'hui, puis on recule jusqu'au lundi precedent pour que la 1re colonne soit complete,
  // comme le fait le contribution graph de GitHub plutot qu'une grille tronquee sur le cote gauche.
  const rangeStart = new Date(today)
  rangeStart.setDate(rangeStart.getDate() - (DAYS - 1))
  const startWeekday = (rangeStart.getDay() + 6) % 7 // 0 = lundi
  const gridStart = new Date(rangeStart)
  gridStart.setDate(gridStart.getDate() - startWeekday)
  const totalCells = startWeekday + DAYS
  const weeks = Math.ceil(totalCells / 7)
  const cells: { k: string; n: number; label: string; inRange: boolean }[] = Array.from({ length: weeks * 7 }, (_, i) => {
    const dt = new Date(gridStart)
    dt.setDate(dt.getDate() + i)
    const k = dt.toISOString().slice(0, 10)
    const inRange = dt >= rangeStart && dt <= today
    return { k, n: inRange ? (heatByDay[k] ?? 0) : 0, label: dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), inRange }
  })
  const maxN = Math.max(...cells.map(c => c.n), 1)
  const COLORS = ['var(--border)', '#bbf7d0', '#6ee7a4', '#22c55e', '#15803d']
  const totalChanges = entries.reduce((a, v) => a + v.changes.length, 0)
  const activeDays = Object.keys(heatByDay).length

  // Libelles de mois : un par colonne dont la 1re ligne (lundi) entre dans un nouveau mois.
  const monthLabels: { col: number; label: string }[] = []
  let lastMonth = -1
  for (let w = 0; w < weeks; w++) {
    const dt = new Date(gridStart)
    dt.setDate(dt.getDate() + w * 7)
    if (dt.getMonth() !== lastMonth) {
      monthLabels.push({ col: w, label: dt.toLocaleDateString('fr-FR', { month: 'short' }) })
      lastMonth = dt.getMonth()
    }
  }

  /* ── IntersectionObserver nav sync ── */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting)
      if (!vis.length) return
      const top = vis.reduce((a, b) =>
        a.boundingClientRect.top < b.boundingClientRect.top ? a : b)
      setActiveId((top.target as HTMLElement).dataset.groupId ?? null)
    }, { rootMargin: '0px 0px -65% 0px', threshold: 0 })
    cardRefs.current.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [visibleGroups.length])

  function scrollTo(id: string) {
    cardRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* ── Effet Dock macOS (nav) ── */
  function handleNavMouseMove(e: React.MouseEvent) {
    const mouseY = e.clientY
    navItemRefs.current.forEach(item => {
      const ir = item.getBoundingClientRect()
      const center = ir.top + ir.height / 2
      const dist = Math.abs(mouseY - center)
      const range = 75
      const t = Math.max(0, 1 - dist / range)
      const isMajor = item.dataset.major === '1'
      const dot = item.querySelector('.cl-nav-dot') as HTMLElement | null
      const lbl = item.querySelector('.cl-nav-ver') as HTMLElement | null
      if (dot) {
        const baseD = isMajor ? 8 : 5
        const maxD  = isMajor ? 14 : 9
        dot.style.width  = `${baseD + (maxD - baseD) * t}px`
        dot.style.height = `${baseD + (maxD - baseD) * t}px`
        if (t > 0.08) { dot.style.background = 'var(--primary)'; dot.style.opacity = isMajor ? '1' : '0.55' }
        else { dot.style.background = ''; dot.style.opacity = '' }
      }
      if (lbl) {
        const baseF = isMajor ? 10.5 : 9.5
        const maxF  = isMajor ? 13.5 : 11.5
        lbl.style.fontSize   = `${baseF + (maxF - baseF) * t}px`
        lbl.style.fontWeight = t > 0.3 ? '700' : (isMajor ? '600' : '400')
        if (t > 0.08) lbl.style.color = 'var(--primary)'
        else lbl.style.color = ''
      }
    })
  }

  function handleNavMouseLeave() {
    navItemRefs.current.forEach(item => {
      const dot = item.querySelector('.cl-nav-dot') as HTMLElement | null
      const lbl = item.querySelector('.cl-nav-ver') as HTMLElement | null
      if (dot) { dot.style.width = ''; dot.style.height = ''; dot.style.background = ''; dot.style.opacity = '' }
      if (lbl) { lbl.style.fontSize = ''; lbl.style.fontWeight = ''; lbl.style.color = '' }
    })
  }

  function handlePublished(entry: ChangelogVersion) {
    // La nouvelle entree devient l'unique "current" - meme garantie que cote serveur (transaction,
    // routes/changelog.ts), reproduite ici pour un affichage immediat sans recharger toute la liste.
    setEntries(prev => [entry, ...prev.map(e => ({ ...e, current: false }))])
    setPublishOpen(false)
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
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> sur {activeDays} jours actifs ({DAYS} derniers jours)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {TIMEFRAMES.map(tf => (
                    <button key={tf.days} onClick={() => setTimeframe(tf.days)}
                      style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer',
                        background: timeframe === tf.days ? 'var(--primary)' : 'transparent',
                        color: timeframe === tf.days ? '#fff' : 'var(--text-muted)',
                        fontWeight: timeframe === tf.days ? 700 : 400 }}>
                      {tf.label}
                    </button>
                  ))}
                </div>
                {isAdmin && (
                  <button data-testid="publish-changelog-btn" onClick={() => setPublishOpen(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--primary)', color: '#fff', border: 'none',
                      fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' }}>
                    + Publier une version
                  </button>
                )}
              </div>
            </div>

            {/* Grille façon GitHub : jours en lignes, semaines en colonnes */}
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, paddingTop: 14 }}>
                {DAY_LABELS.map((d, i) => (
                  <span key={i} style={{ height: 11, fontSize: 9, color: 'var(--text-muted)', lineHeight: '11px' }}>{d}</span>
                ))}
              </div>
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 3, height: 11 }}>
                  {monthLabels.map((m, i) => (
                    <span key={i} style={{ position: 'relative', left: m.col * 14, fontSize: 9, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{m.label}</span>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gridAutoFlow: 'column', gap: 3, width: 'max-content' }}>
                  {cells.map(cell => (
                    <div key={cell.k}
                      title={cell.inRange ? `${cell.label}${cell.n ? ` : ${cell.n} changement${cell.n > 1 ? 's' : ''}` : ''}` : ''}
                      style={{
                        width: 11, height: 11, borderRadius: 2,
                        background: cell.inRange ? COLORS[cell.n === 0 ? 0 : cell.n / maxN <= .15 ? 1 : cell.n / maxN <= .4 ? 2 : cell.n / maxN <= .7 ? 3 : 4] : 'transparent',
                        cursor: cell.n ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (!cell.n) return
                        const v = entries.find(x => x.dateISO?.startsWith(cell.k))
                        if (!v) return
                        const g = groups.find(gr => gr.kind === 'single' ? gr.entry.version === v.version : gr.entries.some(e => e.version === v.version))
                        if (g && !isGroupExpanded(g)) toggleGroup(g.id)
                        if (g) scrollTo(g.id)
                      }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, alignSelf: 'flex-end' }}>
                <span>Moins</span>
                {COLORS.slice(0, 4).map((c, i) => (
                  <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                ))}
                <span>Plus</span>
              </div>
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

          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 13 }}>Chargement du changelog…</div>
          )}
          {!loading && loadError && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Impossible de charger le changelog. <button className="btn btn-secondary" style={{ marginLeft: 8, fontSize: 11, padding: '3px 10px' }} onClick={loadEntries}>Réessayer</button>
            </div>
          )}

          {!loading && !loadError && (
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

              {/* Left nav */}
              <div className="cl-nav" style={{ flexShrink: 0, width: 118 }}
                onMouseMove={handleNavMouseMove}
                onMouseLeave={handleNavMouseLeave}>
                {visibleGroups.map(g => {
                  const isMajor = g.kind === 'single'
                  const isActive = activeId === g.id
                  const label = g.kind === 'single' ? g.entry.version : `${g.prefix}.x`
                  const isCurrent = g.kind === 'single' && !!g.entry.current
                  return (
                    <div
                      key={g.id}
                      ref={el => { if (el) navItemRefs.current.set(g.id, el); else navItemRefs.current.delete(g.id) }}
                      data-major={isMajor ? '1' : '0'}
                      className={`cl-nav-item${isActive ? ' active' : ''}${isCurrent ? ' current' : ''}`}
                      onClick={() => scrollTo(g.id)}
                    >
                      <div className={`cl-nav-dot${isCurrent ? ' current' : ''}${!isMajor ? ' minor' : ''}`} />
                      <span className={`cl-nav-ver${!isMajor ? ' minor' : ''}`}>{label}</span>
                      {g.kind === 'cluster' && <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>· {g.entries.length}</span>}
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
                {visibleGroups.map(g => {
                  if (g.kind === 'single') {
                    const v = g.entry
                    return (
                      <div
                        key={g.id}
                        data-group-id={g.id}
                        ref={el => { if (el) cardRefs.current.set(g.id, el); else cardRefs.current.delete(g.id) }}
                        className={`cl-card${v.current ? ' current' : ''}`}
                      >
                        <div className="cl-card-meta">
                          <span className="cl-card-ver">{v.version}</span>
                          {v.current && <span className="cl-card-badge">En cours</span>}
                          <span className="cl-card-date">{v.date}</span>
                        </div>
                        <div className="cl-card-title">{v.title}</div>
                        <ul className="cl-changes">
                          {v.changes.map((c, i) => (
                            <li key={i} className="cl-change">
                              <span className={`cl-tag cl-tag-${c.tag}`}>{c.tag.toUpperCase()}</span>
                              <span dangerouslySetInnerHTML={{ __html: highlight(c.text, q) }} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  }

                  const expanded = isGroupExpanded(g)
                  return (
                    <div key={g.id} data-group-id={g.id} ref={el => { if (el) cardRefs.current.set(g.id, el); else cardRefs.current.delete(g.id) }} style={{ marginBottom: 14 }}>
                      <div
                        data-testid="cl-group-header"
                        onClick={() => toggleGroup(g.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                          background: 'var(--surface2)', borderRadius: 10, padding: '10px 16px',
                        }}
                      >
                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                          {g.entries[g.entries.length - 1].version} → {g.entries[0].version}
                          <strong style={{ color: 'var(--text)', marginLeft: 6 }}>· {g.entries.length} version{g.entries.length > 1 ? 's' : ''}</strong>
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
                      </div>
                      {expanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
                          {g.entries.map(v => (
                            <div key={v.version} className="cl-card">
                              <div className="cl-card-meta">
                                <span className="cl-card-ver">{v.version}</span>
                                <span className="cl-card-date">{v.date}</span>
                              </div>
                              <div className="cl-card-title">{v.title}</div>
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
                      )}
                    </div>
                  )
                })}

                {hasMoreGroups && (
                  <button
                    data-testid="cl-load-more-btn"
                    onClick={() => setVisibleGroupCount(c => c + GROUPS_PAGE_SIZE)}
                    style={{ width: '100%', background: 'none', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 12, padding: 10, borderRadius: 8, cursor: 'pointer' }}
                  >
                    Charger les versions précédentes
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {publishOpen && <PublishChangelogModal onPublished={handlePublished} onClose={() => setPublishOpen(false)} />}
    </>
  )
}
