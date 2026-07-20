import { useState, useMemo, useRef, useEffect } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { GanttView } from '../components/planning/GanttView'
import { ItemModal } from '../components/backlog/ItemModal'
import type { Item, TeamMember, Sprint, CadenceState } from '../types'
import { computeMemberCapacity, isMemberFullyAbsent, isMemberPartiallyAbsent } from '../utils/sprintCapacity'
import { getCurrentSprint } from '../utils/sprints'

const ICO_SHREDDER = '<path d="M4 13V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 22v-5"/><path d="M14 19v-2"/><path d="M18 20v-3"/><path d="M2 13h20"/><path d="M6 20v-3"/>'
const ICO_WAND    = '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>'
const ICO_CLOSE   = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
const ICO_CHECK   = '<path d="M20 6 9 17l-5-5"/>'

const BTN_PRIMARY: React.CSSProperties = {
  height: 30, border: 'none', borderRadius: 7,
  backgroundColor: 'var(--primary)', color: '#fff',
  fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', outline: 'none', flexShrink: 0,
  display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
}

function Svg({ d, size = 14, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

// ── Résultat du calcul auto-attribution ──────────────────────────────────
interface AutoResult {
  itemId:   string
  itemKey:  string
  itemDesc: string
  itemSP:   number
  assignees: TeamMember[]   // [0] = dev attitré, [1+] = co-assignés
}

function computeAutoAssign(
  sprint: Sprint,
  items: Item[],
  team: TeamMember[],
  state: CadenceState,
  maxCoAssign: number,
): AutoResult[] {
  const allSprintItems = items.filter(i => i.sprintId === sprint.id)
  const toAssign = allSprintItems.filter(i => i.assignees.length === 0)
  if (!toAssign.length) return []

  // Devs disponibles : pas absents tout le sprint
  const availableTeam = team.filter(m => !isMemberFullyAbsent(m.id, sprint, state))
  if (!availableTeam.length) return []

  // Dev attitré possible : pas d'absence qui chevauche le sprint (même partielle)
  const primaryTeam = availableTeam.filter(m => !isMemberPartiallyAbsent(m.id, sprint, state))

  // Tri items : priorité desc, SP desc
  const PRIO: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
  const sorted = [...toAssign].sort((a, b) => {
    const pd = (PRIO[b.priority ?? 'low'] ?? 1) - (PRIO[a.priority ?? 'low'] ?? 1)
    return pd !== 0 ? pd : b.sp - a.sp
  })

  // Charge initiale (items déjà attribués avant auto-attribution)
  const caps: Record<string, number> = {}
  const used: Record<string, number> = {}
  for (const m of availableTeam) {
    caps[m.id] = computeMemberCapacity(m, sprint, state)
    used[m.id] = allSprintItems
      .filter(i => i.assignees.includes(m.id))
      .reduce((s, i) => s + i.sp / Math.max(1, i.assignees.length), 0)
  }

  // Capacité moyenne restante — sert à calculer idealN
  const avgRemaining = availableTeam.reduce((s, m) => s + Math.max(0, caps[m.id] - used[m.id]), 0)
    / Math.max(1, availableTeam.length)

  // Fonction de score d'un dev pour un item donné
  const scoreOf = (m: TeamMember): number => {
    if (caps[m.id] <= 0 || (caps[m.id] - used[m.id]) <= 0) return -Infinity
    const tagMatch = 0  // sera calculé par l'appelant avec l'item courant
    return tagMatch
  }

  const results: AutoResult[] = []

  for (const item of sorted) {
    // Nombre idéal de co-assignés
    const idealN = Math.min(maxCoAssign, Math.max(1, Math.ceil(item.sp / Math.max(1, avgRemaining))))

    const score = (m: TeamMember): number => {
      if (caps[m.id] <= 0 || (caps[m.id] - used[m.id]) <= 0) return -Infinity
      const tagMatch = item.tags.filter(t => m.tags.includes(t)).length
      const pct = used[m.id] / caps[m.id]
      const remaining = caps[m.id] - used[m.id]
      return tagMatch * 3 + (pct < 0.5 ? 2 : pct < 0.8 ? 1 : 0) + (remaining / caps[m.id]) * 0.5
    }

    // Dev attitré : uniquement parmi les devs sans absence (même partielle)
    const sortedPrimary = [...primaryTeam]
      .filter(m => score(m) > -Infinity)
      .sort((a, b) => score(b) - score(a))

    const primary = sortedPrimary[0]
    if (!primary) continue   // aucun dev pleinement disponible → item non assigné

    const chosen: TeamMember[] = [primary]

    // Co-assignés : parmi tous les devs disponibles (hors primary, hors déjà épuisés)
    if (idealN > 1) {
      const sortedCo = [...availableTeam]
        .filter(m => m.id !== primary.id && score(m) > -Infinity)
        .sort((a, b) => score(b) - score(a))
      chosen.push(...sortedCo.slice(0, idealN - 1))
    }

    const spPerDev = item.sp / chosen.length
    chosen.forEach(m => { used[m.id] = (used[m.id] ?? 0) + spPerDev })

    results.push({
      itemId: item.id, itemKey: item.key, itemDesc: item.desc, itemSP: item.sp,
      assignees: chosen,
    })
  }

  return results
}

// ── Modal d'auto-attribution ──────────────────────────────────────────────
interface AutoModalProps {
  unassignedCount: number
  unassignedSP: number
  remainingCap: number
  availableDevs: number
  preview: AutoResult[]
  maxCoAssign: number
  onChangeMax: (n: number) => void
  onApply: () => void
  onClose: () => void
}

function AutoAssignModal({
  unassignedCount, unassignedSP,
  remainingCap, availableDevs, preview,
  maxCoAssign, onChangeMax, onApply, onClose,
}: AutoModalProps) {
  const assignedCount = preview.length
  const leftover      = unassignedCount - assignedCount
  const spAssigned    = preview.reduce((s, r) => s + r.itemSP, 0)
  const spOverflow    = Math.max(0, unassignedSP - remainingCap)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 520 }}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Svg d={ICO_WAND} size={16} stroke="var(--primary)" />
            <span className="modal-title">Auto-attribution</span>
          </div>
          <button className="modal-close" onClick={onClose}><Svg d={ICO_CLOSE} size={13} /></button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ gap: 18 }}>

          {/* Stats sprint */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Items non attribués',  value: `${unassignedCount} items · ${unassignedSP} SP` },
              { label: 'Capacité disponible',  value: `${availableDevs} devs · ${remainingCap} SP` },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Avertissement overflow SP */}
          {spOverflow > 0 && (
            <div style={{ fontSize: 12, color: 'var(--danger)', background: 'rgba(220,38,38,.07)', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid var(--danger)', fontWeight: 500 }}>
              ⚠ Capacité insuffisante : <strong>{spOverflow} SP</strong> en excès sur la capacité restante ({remainingCap} SP). Les devs les moins chargés absorberont le surplus.
            </div>
          )}

          {/* Explication algo */}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, background: 'var(--primary-light)', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid var(--primary)' }}>
            <strong style={{ color: 'var(--primary)' }}>Algorithme</strong> — Items traités du plus prioritaire au moins prioritaire (à priorité égale, les plus lourds en premier). Pour chaque item, les devs sont scorés selon l'<strong>affinité de leurs tags</strong> avec ceux de l'item, puis par <strong>charge restante</strong> (tiebreaker déterministe : jamais aléatoire). <strong>Dev attitré</strong> = dev sans aucune absence sur la période du sprint. <strong>Co-assigné</strong> = tout dev disponible (absences partielles incluses).
          </div>

          {/* Réglage co-assignation */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Co-assignés max par item
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => onChangeMax(n)}
                  style={{
                    flex: 1, height: 36,
                    border: `2px solid ${maxCoAssign === n ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 8,
                    background: maxCoAssign === n ? 'var(--primary-light)' : 'var(--surface)',
                    color: maxCoAssign === n ? 'var(--primary)' : 'var(--text-muted)',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {n === 1 ? '1 — solo' : n === 2 ? '2 — duo' : '3 — trio'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
              {maxCoAssign === 1
                ? 'Mode solo : chaque item est confié à un seul dev (aucune co-assignation).'
                : `Au-delà de la capacité d'un seul dev, l'item est réparti sur ${maxCoAssign} devs max.`}
            </div>
          </div>

          {/* Prévisualisation */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Répartition proposée
            </div>
            {preview.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '12px 0' }}>
                Aucun item à attribuer ou aucun dev disponible.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                {preview.map(r => (
                  <div key={r.itemId} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 6,
                    background: 'var(--surface2)', fontSize: 12,
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--primary)', flexShrink: 0, fontSize: 11 }}>{r.itemKey}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{r.itemDesc}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>{r.itemSP} SP</span>
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      {r.assignees.map((m, idx) => (
                        <span key={m.id} title={`${m.name}${idx === 0 ? ' (attitré)' : ' (co-assigné)'}`} style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, borderRadius: '50%',
                          background: idx === 0 ? 'var(--primary)' : 'var(--warning)',
                          color: '#fff', fontSize: 8, fontWeight: 700, flexShrink: 0,
                        }}>
                          {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              {assignedCount > 0 && (
                <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
                  ✓ {assignedCount} item{assignedCount > 1 ? 's' : ''} attribué{assignedCount > 1 ? 's' : ''} ({spAssigned} SP)
                </span>
              )}
              {leftover > 0 && (
                <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
                  ⚠ {leftover} item{leftover > 1 ? 's' : ''} sans dev attitré disponible
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} style={{ height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            onClick={onApply}
            disabled={preview.length === 0}
            style={{ ...BTN_PRIMARY, height: 34, padding: '0 18px', fontSize: 13, opacity: preview.length === 0 ? 0.45 : 1 }}
          >
            <Svg d={ICO_CHECK} size={14} stroke="#fff" />
            Appliquer ({preview.length} item{preview.length !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────
export function SprintPlanningPage() {
  const { state, dispatch, saveToServer, stateLoaded } = useCadence()
  const [modalItem,     setModalItem]     = useState<Item | null | undefined>(undefined)
  const [showAutoModal, setShowAutoModal] = useState(false)
  const [maxCoAssign,   setMaxCoAssign]   = useState(2)

  const defaultSprintId = getCurrentSprint(state)?.id ?? ''
  const [selectedSprintId, setSelectedSprintId] = useState(defaultSprintId)
  // Le choix par défaut ci-dessus est figé au premier rendu, potentiellement sur les données
  // de démo si le chargement serveur n'est pas encore arrivé. On le corrige une seule fois
  // dès que l'état est définitivement chargé (voir Chantier A, corrections.md).
  const resyncedRef = useRef(false)
  useEffect(() => {
    if (stateLoaded && !resyncedRef.current) {
      resyncedRef.current = true
      setSelectedSprintId(getCurrentSprint(state)?.id ?? '')
    }
  }, [stateLoaded, state])

  const sprint      = state.sprints.find(s => s.id === selectedSprintId)
  const sprintItems = sprint ? state.items.filter(i => i.sprintId === selectedSprintId) : []
  const totalSP     = sprintItems.reduce((s, i) => s + i.sp, 0)
  const assignedSP  = sprintItems.filter(i => i.assignees.length > 0).reduce((s, i) => s + i.sp, 0)
  const assignedN   = sprintItems.filter(i => i.assignees.length > 0).length

  // Devs disponibles + capacité restante (pour la modal)
  const availableTeam = sprint
    ? state.team.filter(m => !isMemberFullyAbsent(m.id, sprint, state))
    : []
  const totalCap = sprint
    ? availableTeam.reduce((s, m) => s + computeMemberCapacity(m, sprint, state), 0)
    : 0
  const alreadyUsedSP = sprint
    ? availableTeam.reduce((s, m) =>
        s + sprintItems
          .filter(i => i.assignees.includes(m.id))
          .reduce((ss, i) => ss + i.sp / Math.max(1, i.assignees.length), 0)
      , 0)
    : 0
  const remainingCap = Math.max(0, totalCap - alreadyUsedSP)

  const unassignedItems = sprintItems.filter(i => i.assignees.length === 0)

  // Prévisualisation recalculée à chaque changement de maxCoAssign ou d'état
  const autoPreview = useMemo(() => {
    if (!sprint || !showAutoModal) return []
    return computeAutoAssign(sprint, state.items, state.team, state, maxCoAssign)
  }, [sprint, state, maxCoAssign, showAutoModal])

  function handleUpdateItem(item: Item) {
    dispatch({ type: 'UPDATE_ITEM', payload: item })
    saveToServer({ ...state, items: state.items.map(i => i.id === item.id ? item : i) })
  }

  function clearAllAssignments() {
    const assigned = state.items.filter(i => i.sprintId === selectedSprintId && i.assignees.length > 0)
    if (!assigned.length) return
    if (!window.confirm(`Effacer toutes les attributions du sprint (${assigned.length} item${assigned.length > 1 ? 's' : ''}) ?`)) return
    const updatedItems = state.items.map(i =>
      i.sprintId === selectedSprintId ? { ...i, assignees: [] } : i
    )
    assigned.forEach(item => dispatch({ type: 'UPDATE_ITEM', payload: { ...item, assignees: [] } }))
    saveToServer({ ...state, items: updatedItems })
  }

  function applyAutoAssign() {
    if (!sprint || !autoPreview.length) return
    const updatedItems = state.items.map(i => {
      const r = autoPreview.find(r => r.itemId === i.id)
      return r ? { ...i, assignees: r.assignees.map(m => m.id) } : i
    })
    autoPreview.forEach(r => {
      const item = state.items.find(i => i.id === r.itemId)
      if (item) dispatch({ type: 'UPDATE_ITEM', payload: { ...item, assignees: r.assignees.map(m => m.id) } })
    })
    saveToServer({ ...state, items: updatedItems })
    setShowAutoModal(false)
  }

  function handleSave(item: Item, keyCounters?: Record<string, number>) {
    const isNew = !state.items.find(i => i.id === item.id)
    if (isNew) {
      dispatch({ type: 'ADD_ITEM', payload: item, keyCounters })
    } else {
      dispatch({ type: 'UPDATE_ITEM', payload: item })
    }
    saveToServer({
      ...state,
      items: isNew
        ? [...state.items, item]
        : state.items.map(i => i.id === item.id ? item : i),
      ...(keyCounters ? { itemKeyCounters: keyCounters } : {}),
    })
    setModalItem(undefined)
  }

  return (
    <>
      <Header title="Sprint Planning">
        <div className="hdr-sep" />
        <select
          className="hdr-select sp-sprint-select"
          value={selectedSprintId}
          onChange={e => setSelectedSprintId(e.target.value)}
          style={{ maxWidth: 250 }}
        >
          {state.sprints.map(s => (
            <option key={s.id} value={s.id}>
              {s.label}{s.active ? ' (actif)' : ''}{s.closed ? ' (clôturé)' : ''}
            </option>
          ))}
        </select>
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{assignedN}/{sprintItems.length} items assignés</span>
        <div className="hdr-sep" />
        <span className="hdr-ctx-stat">{assignedSP}/{totalSP} SP assignés</span>
        {sprint?.closed && (
          <>
            <div className="hdr-sep" />
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Sprint clôturé</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button
          style={BTN_PRIMARY}
          onClick={() => setShowAutoModal(true)}
          title="Attribuer automatiquement les items non assignés"
        >
          <Svg d={ICO_WAND} size={13} stroke="#fff" />
          Auto-attribuer
        </button>
        <div className="hdr-sep" />
        <button
          className="hdr-btn"
          onClick={clearAllAssignments}
          title="Effacer toutes les attributions"
        >
          <Svg d={ICO_SHREDDER} size={14} />
        </button>
        <div className="hdr-sep" />
      </Header>

      <div className="page-content" style={{ padding: '12px 16px' }}>
        {/* Bandeau DoR : items assignés au sprint sans DoR complète */}
        {(() => {
          const notReady = sprintItems.filter(i => {
            const dor = i.dor ?? []
            return dor.length > 0 && dor.some(c => !c.done)
          })
          if (notReady.length === 0) return null
          return (
            <div data-testid="dor-banner" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(245,158,11,.08)', borderLeft: '3px solid #f59e0b',
              borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12,
              color: 'var(--text-muted)'
            }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#f59e0b"
                strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>
                <strong style={{ color: '#f59e0b' }}>{notReady.length} item{notReady.length > 1 ? 's' : ''}</strong>
                {' '}dans ce sprint {notReady.length > 1 ? "n'ont" : "n'a"} pas leur DoR complète :{' '}
                {notReady.slice(0, 4).map(i => (
                  <span key={i.id} style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                    color: 'var(--primary)', background: 'var(--primary-light)',
                    borderRadius: 4, padding: '1px 5px', marginRight: 3 }}>{i.key}</span>
                ))}
                {notReady.length > 4 && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>+{notReady.length - 4}</span>}
              </span>
            </div>
          )
        })()}

        <GanttView
          state={state}
          sprintId={selectedSprintId}
          onEdit={item => setModalItem(item)}
          onUpdateItem={handleUpdateItem}
        />
      </div>

      {showAutoModal && sprint && (
        <AutoAssignModal
          unassignedCount={unassignedItems.length}
          unassignedSP={unassignedItems.reduce((s, i) => s + i.sp, 0)}
          remainingCap={remainingCap}
          availableDevs={availableTeam.length}
          preview={autoPreview}
          maxCoAssign={maxCoAssign}
          onChangeMax={setMaxCoAssign}
          onApply={applyAutoAssign}
          onClose={() => setShowAutoModal(false)}
        />
      )}

      {modalItem !== undefined && (
        <ItemModal
          item={modalItem}
          state={state}
          onSave={handleSave}
          onClose={() => setModalItem(undefined)}
        />
      )}
    </>
  )
}
