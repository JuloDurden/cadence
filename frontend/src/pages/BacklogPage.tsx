import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCadence } from '../context/StateContext'
import { useAuth } from '../hooks/useAuth'
import { Header } from '../components/layout/Header'
import { ItemModal } from '../components/backlog/ItemModal'
import { EXTRA_STAGES } from '../utils/kanbanStages'
import { fmtDate } from '../utils/dates'
import { HierarchyNodeModal } from '../components/backlog/HierarchyNodeModal'
import { BacklogGroupCard } from '../components/backlog/BacklogGroupCard'
import { findEpicChildren, detachEpicChildren, findHierarchyChildren, detachHierarchyChildren, findDependents, detachDependents } from '../utils/cascadeDelete'
import { withHistoryEntry } from '../utils/history'
import { canManageBacklog, canEditBacklogOperational } from '../utils/permissions'
import { useDialog } from '../context/DialogContext'
import { useOnboarding } from '../context/OnboardingContext'
import { CREATE_ITEM_CHECKLIST_ID, CREATE_ITEM_MODAL_STEPS } from '../data/onboardingChecklist'
import { attachItemsToEpics, getHierarchyNodeSP, buildInitiativeSections, getItemInitiativeId, type InitiativeSection, type EpicGroup } from '../utils/hierarchyScore'
import type { Item, ItemType, BugSeverity, HistoryEntry, HierarchyNode, HierarchyLevel } from '../types'

/* ─── Error Boundary ─────────────────────────────────────────────── */
class ModalErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ItemModal crash]', error, info)
  }
  render() {
    if (this.state.error) return (
      <div className="modal-overlay" onClick={this.props.onClose}>
        <div className="modal" style={{ padding: 24 }}>
          <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>Erreur dans la modal :</p>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: 'var(--text)', background: 'var(--surface2)', padding: 10, borderRadius: 6 }}>
            {this.state.error.message}
          </pre>
          <button className="hdr-ctx-btn" style={{ marginTop: 12 }} onClick={this.props.onClose}>Fermer</button>
        </div>
      </div>
    )
    return this.props.children
  }
}

/* ─── Constants ─────────────────────────────────────────────────── */

const PRIO_LABEL:   Record<string, string> = { critical: 'P1', high: 'P2', medium: 'P3', low: 'P4' }
const PRIO_COLOR:   Record<string, string> = { critical: '#FF2929', high: '#FF981C', medium: '#165FCC', low: '#9CC9F4' }
const PRIO_TEXT:    Record<string, string> = { critical: '#fff', high: '#fff', medium: '#fff', low: '#0d1a33' }
const PRIO_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const TYPE_LABEL: Record<ItemType, string> = { story: 'US', bug: 'Bug', task: 'Tâche', spike: 'Spike' }
const TYPE_BG:    Record<ItemType, string> = { story: '#165FCC18', bug: '#FF292918', task: '#6b728018', spike: '#0891b218' }
const TYPE_FG:    Record<ItemType, string> = { story: '#165FCC',   bug: '#FF2929',   task: '#6b7280',   spike: '#0891b2'   }
const SEV_LABEL:  Record<BugSeverity, string> = { critical: 'Crit.', major: 'Maj.', minor: 'Min.' }
const SEV_COLOR:  Record<BugSeverity, string> = { critical: '#FF2929', major: '#FF981C', minor: '#165FCC' }

// Menu "+ Ajouter" (Item / Epic / Initiative) — mêmes styles que le menu "+ Ajouter" de
// ClientsPage.tsx. Poids normal (retour Julien, 2026-07-29 : les choix d'un menu déroulant ne
// doivent pas être en gras) ; plus de séparateur entre "Nouvel Item" et "Nouvel Epic" (son rôle
// — distinguer Item de Epic/Initiative — n'était pas assez lisible pour valoir la confusion).
const ADD_MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 400, color: 'var(--text)',
}

type GroupBy = 'sprint' | 'client' | 'type' | 'status' | 'epic' | 'initiative' | 'none'

// Persistance de la configuration d'affichage du Backlog (retour Julien, 2026-07-29) :
// groupement, tri et filtres actifs, retrouvés à l'identique au retour sur la page — même
// principe que la persistance du mode d'affichage de la modale (`localStorage`, ItemModal.tsx),
// un seul blob JSON ici plutôt qu'une clé par champ pour ne pas polluer localStorage.
const BACKLOG_PREFS_KEY = 'backlog-prefs'
interface BacklogPrefs {
  filterSprint?: string
  filterClient?: string
  filterTag?: string
  filterStatus?: string
  filterReady?: boolean
  filterEpic?: string
  filterInitiative?: string
  groupBy?: GroupBy
  sortBy?: string
}
function loadBacklogPrefs(): BacklogPrefs {
  try {
    return JSON.parse(localStorage.getItem(BACKLOG_PREFS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

// `node` généralisé (2026-07-29, sous-chantier 4) : un groupe de card peut représenter un
// Epic OU une Initiative — `node.level` distingue les deux pour le badge de niveau et les
// actions (éditer/supprimer). Anciennement `epicNode`, epic-only.
interface Group {
  id: string; label: string; sublabel?: string; color?: string
  items: Item[]; capacity?: number; used?: number
  epicSP?: number; epicFixed?: boolean; doneCount?: number
  node?: HierarchyNode
}

/* ─── SVG helpers ────────────────────────────────────────────────── */
function Svg({ d, size = 13 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
}
const SVG_EDIT   = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>'
const SVG_DEL    = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>'
const SVG_CHEV_R = '<path d="m9 18 6-6-6-6"/>'
const SVG_CHEV_D = '<path d="m6 9 6 6 6-6"/>'

const ICO_SORT   = '<line x1="4" y1="6" x2="11" y2="6"/><line x1="4" y1="12" x2="11" y2="12"/><line x1="4" y1="18" x2="11" y2="18"/><polyline points="14 9 17 6 20 9"/><polyline points="14 15 17 18 20 15"/>'
const ICO_LAYERS = '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/>'
const ICO_PLUS    = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
const ICO_CHECK   = '<path d="M20 6 9 17l-5-5"/>'
const ICO_FILTER  = '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>'

// Header Backlog — ergonomie (retour Julien, 2026-07-29) : 8 contrôles (7 selects + bouton
// Prêt) ramenés à 3 boutons à dropdown (Trier/Filtrer/Grouper, "unibody" — un seul contour,
// séparateurs internes) + le bouton "+ Ajouter" resté séparé. Options de Trier/Grouper.
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: '',         label: 'Aucun tri' },
  { value: 'key',       label: 'Clé' },
  { value: 'priority',  label: 'Priorité' },
  { value: 'sprint',    label: 'Sprint' },
  { value: 'deadline',  label: 'Deadline' },
  { value: 'sp-desc',   label: 'SP descendant' },
  { value: 'sp-asc',    label: 'SP ascendant' },
]
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none',       label: 'Aucun' },
  { value: 'sprint',     label: 'Sprint' },
  { value: 'client',     label: 'Client' },
  { value: 'type',       label: 'Type' },
  { value: 'status',     label: 'Statut' },
  { value: 'epic',       label: 'Epic' },
  { value: 'initiative', label: 'Initiative' },
]

/** Petit hook partagé pour les 3 dropdowns du header (Trier/Filtrer/Grouper) — même mécanisme
 *  que le menu "+ Ajouter" (position calculée depuis le bouton, fermeture au clic extérieur),
 *  factorisé ici pour éviter de tripler la logique. */
function useHeaderMenu() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setPos(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function toggle() {
    if (open) { setOpen(false); setPos(null); return }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) { setOpen(true); setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right }) }
  }
  function close() { setOpen(false); setPos(null) }

  return { open, pos, btnRef, menuRef, toggle, close }
}

/** Ligne d'un menu Trier/Grouper : coche + couleur accent sur l'option active plutôt que du
 *  gras (retour Julien, 2026-07-29 : les choix d'un dropdown ne doivent pas être en gras). */
function MenuOption({ label, active, onClick, testId }: { label: string; active: boolean; onClick: () => void; testId?: string }) {
  return (
    <button className={`hdr-menu-option${active ? ' active' : ''}`} onClick={onClick} data-testid={testId}>
      <span style={{ width: 14, display: 'inline-flex', flexShrink: 0 }}>
        {active && <Svg d={ICO_CHECK} size={12} />}
      </span>
      {label}
    </button>
  )
}

/** Ligne du panel "Filtrer" : libellé + select pour un axe (Client/Sprint/Epic/Initiative/
 *  Tag/Statut). Le select reste natif (accessibilité, comportement familier) mais gagne un
 *  poids de police normal — voir aussi la règle globale `option { font-weight: 400 }`. */
function FilterRow({ label, value, onChange, options, testId }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  testId: string
}) {
  return (
    <div className="hdr-menu-filter-row">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <select data-testid={testId} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Tous</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

/** Retourne null si pas de critères ; sinon { done, total } */
function dorDodStat(items: { done: boolean }[] | undefined): { done: number; total: number } | null {
  if (!items || items.length === 0) return null
  return { done: items.filter(c => c.done).length, total: items.length }
}

/** Pastille DoR ou DoD : ✓ vert si 100%, "X/N" sinon */
function DorDodBadge({ stat, label }: { stat: { done: number; total: number } | null; label: string }) {
  if (!stat) return <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>—</span>
  if (stat.done === stat.total) {
    return (
      <span title={`${label} : ${stat.done}/${stat.total} critères validés`}
        style={{ color: 'var(--success, #22c55e)', display: 'inline-flex', alignItems: 'center' }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </span>
    )
  }
  const pct = stat.done / stat.total
  const color = pct === 0 ? 'var(--text-faint)' : pct >= 0.6 ? '#f59e0b' : 'var(--danger)'
  return (
    <span title={`${label} : ${stat.done}/${stat.total} critères validés`}
      style={{ fontSize: 10, fontWeight: 600, color, fontFamily: 'monospace' }}>
      {stat.done}/{stat.total}
    </span>
  )
}

/** En-tête de tableau partagé (15 colonnes) — réutilisé par la table plate (mode "Grouper :
 *  aucun") et par la mini-table de chaque card de groupe (sous-chantier 4, 2026-07-29). */
function BacklogTableHead() {
  return (
    <thead>
      <tr>
        <th style={{ width: 28 }} />
        <th style={{ width: 46, textAlign: 'center' }}>Prio.</th>
        <th style={{ width: 72, textAlign: 'center' }}>Clé</th>
        <th style={{ width: 68, textAlign: 'center' }}>Type</th>
        <th style={{ width: 50 }}>Sprint</th>
        <th style={{ width: 100, textAlign: 'center' }}>Client</th>
        <th style={{ width: 90, textAlign: 'center' }}>Statut</th>
        <th style={{ maxWidth: 200 }}>Description</th>
        <th style={{ width: 200, textAlign: 'center' }}>Tags</th>
        <th style={{ width: 72, textAlign: 'center' }}>Assignés</th>
        <th style={{ width: 42, textAlign: 'center' }}>SP</th>
        <th style={{ width: 120 }}>Dépendances</th>
        <th style={{ width: 38, textAlign: 'center' }} title="Definition of Ready">DoR</th>
        <th style={{ width: 38, textAlign: 'center' }} title="Definition of Done">DoD</th>
        <th style={{ width: 64, textAlign: 'center' }}>Actions</th>
      </tr>
    </thead>
  )
}

/* ─── Component ─────────────────────────────────────────────────── */
export function BacklogPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const { userName, userId, userRole } = useAuth()
  const { confirm } = useDialog()
  // Phase 2 (roadmap v1), sous-chantier 3/6, page 4/4 : PO (+ Admin) accès complet, Dev
  // sous-ensemble opérationnel (statut/SP/notes/DoD/dépendances/auto-assignation), Scrum Master
  // et Stakeholder en lecture seule — voir utils/permissions.ts.
  const canManage  = canManageBacklog(userRole)
  const canOperate = canEditBacklogOperational(userRole)
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined)
  // Modale Epic/Initiative unifiée (sous-chantier 4, 2026-07-29) : remplace `modalEpic`
  // (epic-only) — `level` distingue une création d'Epic d'une création d'Initiative (les
  // deux partent d'un `node` à `null`), et porte le niveau réel en édition.
  const [nodeModal, setNodeModal] = useState<{ node: HierarchyNode | null; level: HierarchyLevel } | undefined>(undefined)
  // Valeurs initiales lues une seule fois depuis localStorage (retour Julien, 2026-07-29) :
  // groupement/tri/filtres retrouvés tels quels au retour sur la page.
  const [backlogPrefs] = useState(loadBacklogPrefs)
  const [filterSprint,   setFilterSprint]   = useState(backlogPrefs.filterSprint ?? '')
  const [filterClient,   setFilterClient]   = useState(backlogPrefs.filterClient ?? '')
  const [filterPriority] = useState('')
  const [filterTag,      setFilterTag]      = useState(backlogPrefs.filterTag ?? '')
  const [filterStatus,   setFilterStatus]   = useState(backlogPrefs.filterStatus ?? '')
  const [filterReady,    setFilterReady]    = useState(backlogPrefs.filterReady ?? false)
  const [filterEpic,     setFilterEpic]     = useState(backlogPrefs.filterEpic ?? '')
  const [filterInitiative, setFilterInitiative] = useState(backlogPrefs.filterInitiative ?? '')
  const [groupBy,        setGroupBy]        = useState<GroupBy>(backlogPrefs.groupBy ?? 'none')
  const [sortBy,         setSortBy]         = useState(backlogPrefs.sortBy ?? '')
  const [expandedIds,      setExpandedIds]      = useState<Set<string>>(new Set())
  const [hoveredId,        setHoveredId]        = useState<string | null>(null)

  // Sauvegarde de la configuration d'affichage à chaque changement (retour Julien, 2026-07-29).
  useEffect(() => {
    const prefs: BacklogPrefs = { filterSprint, filterClient, filterTag, filterStatus, filterReady, filterEpic, filterInitiative, groupBy, sortBy }
    localStorage.setItem(BACKLOG_PREFS_KEY, JSON.stringify(prefs))
  }, [filterSprint, filterClient, filterTag, filterStatus, filterReady, filterEpic, filterInitiative, groupBy, sortBy])

  // Menu "+ Ajouter" (Item / Epic) — même pattern que ClientsPage.tsx ("+ Ajouter" client/groupe) :
  // deux refs (bouton + menu) pour que le mousedown sur le menu ne le referme pas avant le click.
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addMenuPos,  setAddMenuPos]  = useState<{ top: number; right: number } | null>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!addMenuOpen) return
    function handle(e: MouseEvent) {
      if (!addBtnRef.current?.contains(e.target as Node) && !addMenuRef.current?.contains(e.target as Node)) {
        setAddMenuOpen(false)
        setAddMenuPos(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [addMenuOpen])

  // Phase 2.5 (roadmap v1), Onboarding, point 4 (démo interactive) — ligne "Créer votre première
  // US" du Guide de démarrage (voir data/onboardingChecklist.ts). Avant l'ouverture de la modale,
  // le tunnel est piloté par cette page elle-même selon son propre état d'UI réel (addMenuOpen) —
  // pas de bouton Suivant, l'étape change quand une vraie action se produit. Une fois la modale
  // ouverte, on bascule sur un tour manuel (CREATE_ITEM_MODAL_STEPS, Suivant/Précédent) : la
  // plupart des champs qui suivent sont informatifs, pas une action binaire à détecter (retour
  // Julien : couvrir aussi type d'item, client, SP, User Story, critères, DoR/DoD). La ligne se
  // coche plus bas, dans handleSave, à la vraie création de l'item — jamais en atteignant la fin
  // d'un tunnel. La navigation ailleurs pendant le tunnel est gérée par OnboardingContext.tsx
  // (comparaison de route), pas par un effet de nettoyage ici — un effet de nettoyage basé sur le
  // démontage se déclenchait à tort pendant le double-appel des effets de React.StrictMode en
  // développement (bug remonté par Julien, voir docs/corrections.md).
  const onboarding = useOnboarding()
  const guidingCreateItem = onboarding.activeGuideId === CREATE_ITEM_CHECKLIST_ID
  useEffect(() => {
    if (!guidingCreateItem) return
    if (modalItem === null) {
      onboarding.showTour(CREATE_ITEM_MODAL_STEPS, { route: '/backlog' })
    } else if (addMenuOpen) {
      onboarding.showSpotlight('[data-testid="menu-new-item"]', 'Choisissez "Nouvel Item".')
    } else {
      onboarding.showSpotlight('[data-testid="btn-add-menu"]', 'Cliquez sur "Ajouter" pour créer un item.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidingCreateItem, modalItem, addMenuOpen])

  function openAddMenu() {
    if (addMenuOpen) { setAddMenuOpen(false); setAddMenuPos(null); return }
    const rect = addBtnRef.current?.getBoundingClientRect()
    if (rect) {
      setAddMenuOpen(true)
      setAddMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }

  // Header — ergonomie (retour Julien, 2026-07-29) : Trier/Filtrer/Grouper, 3 boutons à
  // dropdown "unibody" (voir useHeaderMenu ci-dessus).
  const sortMenu  = useHeaderMenu()
  const filterMenu = useHeaderMenu()
  const groupMenu = useHeaderMenu()

  function clearAllFilters() {
    setFilterClient(''); setFilterSprint(''); setFilterEpic(''); setFilterInitiative('')
    setFilterTag(''); setFilterStatus(''); setFilterReady(false)
  }

  /* ── dep chain: Map<itemId, depth> ── */
  const depChain = useMemo(() => {
    if (!hoveredId) return new Map<string, number>()
    function collect(id: string, depth: number, visited: Set<string>): Map<string, number> {
      const m = new Map<string, number>()
      const it = state.items.find(x => x.id === id)
      if (!it || visited.has(id)) return m
      visited.add(id)
      for (const depId of (it.deps ?? [])) {
        if (!m.has(depId) || m.get(depId)! > depth) m.set(depId, depth)
        collect(depId, depth + 1, visited).forEach((d, k) => {
          if (!m.has(k) || m.get(k)! > d) m.set(k, d)
        })
      }
      return m
    }
    return collect(hoveredId, 1, new Set<string>())
  }, [hoveredId, state.items])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    state.items.forEach(i => i.tags.forEach(t => s.add(t)))
    return Array.from(s).sort()
  }, [state.items])

  /** Catalogue complet des statuts connus (colonnes actives + extra stages) */
  const allStatusCols = useMemo(() => {
    const catalog = new Map([...state.kanbanCols, ...EXTRA_STAGES].map(c => [c.id, c]))
    // Garder uniquement les statuts présents dans les items
    const usedIds = new Set(state.items.map(i => i.status).filter(Boolean))
    return Array.from(usedIds)
      .map(id => catalog.get(id))
      .filter(Boolean)
      .sort((a, b) => a!.label.localeCompare(b!.label)) as typeof EXTRA_STAGES
  }, [state.items, state.kanbanCols])

  /* ── filter + sort ── */
  const filtered = useMemo(() => {
    let items = [...state.items]
    if (filterSprint === 'unassigned') items = items.filter(i => !i.sprintId)
    else if (filterSprint) items = items.filter(i => i.sprintId === filterSprint)
    if (filterClient)   items = items.filter(i => i.clientId === filterClient)
    if (filterPriority) items = items.filter(i => i.priority === filterPriority)
    if (filterTag)      items = items.filter(i => i.tags.includes(filterTag))
    if (filterStatus)   items = items.filter(i => i.status === filterStatus)
    if (filterReady)    items = items.filter(i => { const s = dorDodStat(i.dor); return s !== null && s.done === s.total })
    // Filtre Epic (ergonomie du header, 2026-07-29) : rattachement direct uniquement — un
    // item rattaché à l'Initiative parente d'un Epic ne matche pas ce filtre (voir le filtre
    // Initiative ci-dessous, qui lui est transitif).
    if (filterEpic)      items = items.filter(i => i.epicId === filterEpic)
    // Sous-chantier 4 (2026-07-29) : Initiative effective d'un item — directe si `epicId`
    // pointe dessus, transitive via l'Epic parent sinon (utils/hierarchyScore.ts).
    if (filterInitiative) items = items.filter(i => getItemInitiativeId(i, state.hierarchyNodes) === filterInitiative)
    items.sort((a, b) => {
      if (sortBy === 'sp-desc')   return b.sp - a.sp
      if (sortBy === 'sp-asc')    return a.sp - b.sp
      if (sortBy === 'sprint')    return (a.sprintId ?? 'z').localeCompare(b.sprintId ?? 'z')
      if (sortBy === 'deadline')  return (a.deadline?.date ?? 'z').localeCompare(b.deadline?.date ?? 'z')
      if (sortBy === 'priority')  return (PRIO_ORDER[a.priority] ?? 4) - (PRIO_ORDER[b.priority] ?? 4)
      // '' or 'key' → sort by numeric suffix (004 in AGA-004)
      const keyNum = (k: string) => parseInt(k.match(/(\d+)$/)?.[1] ?? '0', 10)
      return keyNum(a.key) - keyNum(b.key)
    })
    return items
  }, [state.items, state.hierarchyNodes, filterSprint, filterClient, filterPriority, filterTag, filterStatus, filterReady, filterEpic, filterInitiative, sortBy])

  const noFilterActive = !filterSprint && !filterClient && !filterPriority && !filterTag && !filterStatus && !filterReady && !filterEpic && !filterInitiative
  const activeFilterCount = [filterClient, filterSprint, filterEpic, filterInitiative, filterTag, filterStatus].filter(Boolean).length + (filterReady ? 1 : 0)

  /** Transforme un EpicGroup (utils/hierarchyScore.ts) en Group affichable (card) —
   *  partagé entre le mode "Grouper par Epic" et les Epics imbriqués dans une Initiative. */
  function epicGroupToDisplayGroup(eg: EpicGroup<Item>, childrenForTotals?: Item[]): Group {
    const children = childrenForTotals ?? eg.items
    const epicFixed = (eg.epic.sp ?? 0) > 0
    const epicSP = getHierarchyNodeSP(eg.epic, children.map(c => c.sp))
    const doneCount = children.filter(i => i.status === 'done').length
    const color = state.clients.find(c => c.id === eg.epic.clientId)?.color
    return { id: eg.epicId, label: eg.epic.key, sublabel: eg.epic.desc, color, items: eg.items, epicSP, epicFixed, doneCount, capacity: epicSP, used: doneCount, node: eg.epic }
  }

  /* ── group (Sprint/Client/Type/Statut/Epic) ── */
  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'sprint') {
      const result: Group[] = []
      const sprints = state.sprints // trié à la source (StateContext), pas besoin de re-trier ici
      for (const sp of sprints) {
        const items = filtered.filter(i => i.sprintId === sp.id)
        if (items.length || noFilterActive)
          result.push({ id: sp.id, label: `Sprint ${sp.number}`, items, capacity: sp.capacity, used: items.reduce((s, i) => s + i.sp, 0) })
      }
      const unassigned = filtered.filter(i => !i.sprintId)
      if (unassigned.length) result.push({ id: 'unassigned', label: 'Non assigné', items: unassigned })
      return result
    }
    if (groupBy === 'client') return state.clients.map(c => ({ id: c.id, label: c.name, color: c.color, items: filtered.filter(i => i.clientId === c.id) })).filter(g => g.items.length)
    if (groupBy === 'type')   return (['story','bug','task','spike'] as ItemType[]).map(t => ({ id: t, label: TYPE_LABEL[t], items: filtered.filter(i => (i.type ?? 'story') === t) })).filter(g => g.items.length)
    // Chantier G (2026-07-23, complément) : basé sur `state.kanbanCols` seul, ce groupement ne
    // montrait aucun groupe pour un statut qui n'est plus (ou jamais été) une colonne active du
    // Kanban — "Annulé" étant désormais optionnel (3e complément du jour), un item annulé sans
    // colonne dédiée sur le board devenait invisible ici. `allStatusCols` (calculé plus haut,
    // catalogue `kanbanCols` ∪ `EXTRA_STAGES` restreint aux statuts réellement portés par des
    // items) couvre ce cas comme il couvre déjà celui du filtre STATUT juste au-dessus.
    if (groupBy === 'status') return allStatusCols.map(c => ({ id: c.id, label: c.label, color: c.color, items: filtered.filter(i => i.status === c.id) })).filter(g => g.items.length)
    if (groupBy === 'epic') {
      // Phase 1 (2026-07-28) : un Epic n'est plus un Item mais un HierarchyNode (voir
      // types/index.ts). Un Epic n'a donc plus de statut/sprint/tag/client "filtrable" au même
      // titre qu'un item dans `filtered` (qui ne contient plus que des Items) — un groupe Epic
      // reste affiché dès qu'il a au moins un enfant correspondant aux filtres actifs, ou
      // toujours si aucun filtre n'est actif (comportement précédent conservé pour ce 2e cas).
      // Regroupement épics-first via l'utilitaire partagé (sous-chantier 2, utils/hierarchyScore.ts) :
      // un appel scope sur `filtered` (affichage), un second scope sur `state.items` (SP/done
      // non filtrés) — un Epic vide reste inclus dans les deux.
      const allEpics = state.hierarchyNodes.filter(n => n.level === 'epic')
      const { groups: filteredGroups, orphans: noEpic } = attachItemsToEpics(allEpics, filtered)
      const { groups: allChildrenGroups } = attachItemsToEpics(allEpics, state.items)
      const allChildrenByEpicId = new Map(allChildrenGroups.map(g => [g.epicId, g.items]))
      const result: Group[] = filteredGroups
        .map(eg => epicGroupToDisplayGroup(eg, allChildrenByEpicId.get(eg.epicId)))
        .filter(g => g.items.length > 0 || noFilterActive)
      if (noEpic.length) result.push({ id: 'no-epic', label: 'Sans Epic', items: noEpic })
      return result
    }
    // 'initiative' et 'none' sont rendus via d'autres chemins (initiativeSections / table plate).
    return [{ id: 'all', label: 'Tous les items', items: filtered }]
  }, [groupBy, filtered, state.sprints, state.clients, state.kanbanCols, state.hierarchyNodes, state.items, allStatusCols, noFilterActive])

  /* ── group (Initiative) — sous-chantier 4, 2026-07-29 ── */
  const initiativeSections = useMemo<InitiativeSection<Item>[]>(() => {
    if (groupBy !== 'initiative') return []
    return buildInitiativeSections(filtered, state.hierarchyNodes)
  }, [groupBy, filtered, state.hierarchyNodes])

  /* ── save / delete (Items) ── */
  function handleSave(item: Item, keyCounters?: Record<string, number>) {
    const isNew = !state.items.find(i => i.id === item.id)
    const base = isNew ? [...state.items, item] : state.items.map(i => i.id === item.id ? item : i)

    if (isNew) {
      dispatch({ type: 'ADD_ITEM', payload: item, keyCounters })
      // Phase 2.5 (roadmap v1), Onboarding, point 4 (démo interactive) — la ligne "Créer votre
      // première US" se complète ici, sur la vraie création, que l'item vienne du tunnel guidé
      // ou d'une création spontanée pendant que le tunnel était affiché.
      if (guidingCreateItem) {
        onboarding.completeItem(CREATE_ITEM_CHECKLIST_ID)
        onboarding.stopGuide()
      }
    } else {
      dispatch({ type: 'UPDATE_ITEM', payload: item })
    }
    // Historique
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: isNew ? 'item_create' : 'item_edit',
      timestamp: new Date().toISOString(),
      itemKey: item.key,
      itemDesc: item.desc,
      sprintId: item.sprintId ?? undefined,
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    // withHistoryEntry() : même bug de persistance que celui corrigé sur les 7 tranches du
    // Chantier B (2026-07-21) — `state` ici est capturé avant le dispatch ADD_HISTORY
    // ci-dessus, son `history` ne contient donc pas encore cette entrée sans ce helper.
    saveToServer(withHistoryEntry({ ...state, items: base, ...(keyCounters ? { itemKeyCounters: keyCounters } : {}) }, historyEntry))
  }
  async function handleDelete(id: string) {
    const item = state.items.find(i => i.id === id)
    const dependents = findDependents(state.items, id)
    const msg = dependents.length > 0
      ? `Retiré des dépendances de ${dependents.length} item(s).`
      : 'Cette action est irréversible.'
    if (!await confirm(msg, { title: 'Supprimer cet item ?', confirmLabel: 'Supprimer', danger: true })) return
    dispatch({ type: 'DELETE_ITEM', payload: id })
    dependents.forEach(d => dispatch({ type: 'UPDATE_ITEM', payload: { ...d, deps: (d.deps ?? []).filter(x => x !== id) } }))
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'item_delete',
      timestamp: new Date().toISOString(),
      itemKey: item?.key,
      itemDesc: item?.desc,
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    let remaining = state.items.filter(i => i.id !== id)
    if (dependents.length > 0) remaining = detachDependents(remaining, id)
    saveToServer(withHistoryEntry({ ...state, items: remaining }, historyEntry))
  }

  /* ── save / delete (Epic ou Initiative — HierarchyNode) ── */
  function handleSaveHierarchyNode(node: HierarchyNode, keyCounters?: Record<string, number>) {
    const isNew = !state.hierarchyNodes.find(n => n.id === node.id)

    // Cascade conservée du modèle précédent (Epic = Item) : Epic "done" → tous ses enfants passent
    // à 'done'. Le statut "done" du HierarchyNode se compare désormais à state.kanbanCols, comme
    // pour un Item.
    const doneStatus = state.kanbanCols.find(c => c.isDone)?.id ?? 'done'
    const epicDoneCascade = node.status === doneStatus
    let items = state.items
    if (epicDoneCascade) {
      items = items.map(i => i.epicId === node.id ? { ...i, status: doneStatus } : i)
    }

    if (isNew) {
      dispatch({ type: 'ADD_HIERARCHY_NODE', payload: node, keyCounters })
    } else {
      dispatch({ type: 'UPDATE_HIERARCHY_NODE', payload: node })
    }
    if (epicDoneCascade) {
      items.filter(i => i.epicId === node.id).forEach(child => {
        dispatch({ type: 'UPDATE_ITEM', payload: child })
      })
    }
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: isNew ? 'hierarchy_node_create' : 'hierarchy_node_edit',
      timestamp: new Date().toISOString(),
      itemKey: node.key,
      itemDesc: node.desc,
      sprintId: node.sprintId ?? undefined,
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    const nodes = isNew ? [...state.hierarchyNodes, node] : state.hierarchyNodes.map(n => n.id === node.id ? node : n)
    saveToServer(withHistoryEntry({ ...state, items, hierarchyNodes: nodes, ...(keyCounters ? { itemKeyCounters: keyCounters } : {}) }, historyEntry))
  }
  /**
   * Suppression généralisée (sous-chantier 4, 2026-07-29) : un Epic comme une Initiative.
   * Détache les items directement rattachés (comme avant), ET — nouveau, propre à
   * l'Initiative — les Epics enfants (`parentId` remis à `null`, Epics conservés) via
   * `findHierarchyChildren`/`detachHierarchyChildren` (utils/cascadeDelete.ts, existantes
   * depuis le sous-chantier 1 mais jamais utilisées jusqu'ici).
   */
  async function handleDeleteHierarchyNode(id: string) {
    const node = state.hierarchyNodes.find(n => n.id === id)
    const childItems = findEpicChildren(state.items, id)
    const childNodes = findHierarchyChildren(state.hierarchyNodes, id)
    const isInitiative = node?.level === 'initiative'
    const parts: string[] = []
    if (childItems.length > 0) parts.push(`${childItems.length} item(s) détaché(s) (conservés)`)
    if (childNodes.length > 0) parts.push(`${childNodes.length} Epic(s) détaché(s) de cette Initiative (conservés)`)
    const msg = parts.length > 0 ? `${parts.join(', ')}.` : 'Cette action est irréversible.'
    const label = isInitiative ? 'cette Initiative' : 'cet Epic'
    if (!await confirm(msg, { title: `Supprimer ${label} ?`, confirmLabel: 'Supprimer', danger: true })) return
    dispatch({ type: 'DELETE_HIERARCHY_NODE', payload: id })
    childItems.forEach(c => dispatch({ type: 'UPDATE_ITEM', payload: { ...c, epicId: null } }))
    childNodes.forEach(n => dispatch({ type: 'UPDATE_HIERARCHY_NODE', payload: { ...n, parentId: null } }))
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'hierarchy_node_delete',
      timestamp: new Date().toISOString(),
      itemKey: node?.key,
      itemDesc: node?.desc,
      author: userName,
    }
    dispatch({ type: 'ADD_HISTORY', payload: historyEntry })
    let remainingNodes = state.hierarchyNodes.filter(n => n.id !== id)
    if (childNodes.length > 0) remainingNodes = detachHierarchyChildren(remainingNodes, id)
    const remainingItems = childItems.length > 0 ? detachEpicChildren(state.items, id) : state.items
    saveToServer(withHistoryEntry({ ...state, items: remainingItems, hierarchyNodes: remainingNodes }, historyEntry))
  }
  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /* ── lookups ── */
  function getClient(id: string) { return state.clients.find(c => c.id === id) }
  function getMember(id: string) { return state.team.find(m => m.id === id) }
  function getSprint(id: string | null) { return id ? state.sprints.find(s => s.id === id) : null }
  function getStatus(id: string) { return state.kanbanCols.find(c => c.id === id) ?? EXTRA_STAGES.find(s => s.id === id) }
  function getDepItems(ids: string[]) { return ids.map(id => state.items.find(i => i.id === id)).filter(Boolean) as Item[] }

  /** Ligne d'un item (+ sa ligne d'expand US/CA) — extrait (sous-chantier 4, 2026-07-29) car
   *  désormais utilisé à la fois par la table plate (mode "Grouper : aucun") et par la
   *  mini-table de chaque card de groupe, plutôt que dupliqué. */
  function renderItemRow(item: Item) {
    const client   = getClient(item.clientId)
    const sprint   = getSprint(item.sprintId)
    const status   = getStatus(item.status)
    const iType    = (item.type ?? 'story') as ItemType
    const depItems = getDepItems(item.deps ?? [])
    const dl       = item.deadline
    const criteria = item.criteria ?? []
    const hasUS = !!(item.role || item.need || item.benefit)
    const isExpanded = expandedIds.has(item.id)

    const depDepth = depChain.get(item.id)
    const hasDeps = (item.deps ?? []).length > 0
    const DEP_COLOR = 'var(--primary)'

    return (
      <React.Fragment key={item.id}>
        <tr
          onDoubleClick={() => setModalItem(item)}
          onMouseEnter={() => setHoveredId(hasDeps ? item.id : null)}
          onMouseLeave={() => setHoveredId(null)}
          className={depDepth ? `dep-hl dep-hl-${depDepth}` : ''}
          style={{ cursor: 'default' }}>
          {/* Expand */}
          <td style={{ textAlign: 'center', padding: '0 4px' }}>
            {(criteria.length > 0 || hasUS) && (
              <button className="btn-icon" style={{ opacity: .55 }}
                onClick={e => { e.stopPropagation(); toggleExpand(item.id) }}
                title={isExpanded ? 'Masquer' : `US${criteria.length > 0 ? ' + CA' : ''}`}>
                <Svg d={isExpanded ? SVG_CHEV_D : SVG_CHEV_R} size={12} />
              </button>
            )}
          </td>

          {/* Prio */}
          <td style={{ textAlign: 'center' }}>
            <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: PRIO_COLOR[item.priority], color: PRIO_TEXT[item.priority], whiteSpace: 'nowrap' }}>
              {PRIO_LABEL[item.priority]}
            </span>
          </td>

          {/* Clé */}
          <td style={{ textAlign: 'center' }}>
            <span className="item-key">{item.key}</span>
          </td>

          {/* Type */}
          <td style={{ textAlign: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: TYPE_BG[iType], color: TYPE_FG[iType], whiteSpace: 'nowrap' }}>
                {TYPE_LABEL[iType]}
              </span>
              {iType === 'bug' && item.severity && (
                <span title={SEV_LABEL[item.severity]} style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[item.severity], display: 'inline-block', flexShrink: 0 }} />
              )}
            </span>
          </td>

          {/* Sprint */}
          <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
            {sprint ? `S${sprint.number}` : '—'}
          </td>

          {/* Client */}
          <td style={{ textAlign: 'center' }}>
            {client && <span style={{ fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap' }}>{client.name}</span>}
          </td>

          {/* Statut */}
          <td style={{ textAlign: 'center' }}>
            {status && <span className="badge" style={{ background: status.color + '20', color: status.color }}>{status.label}</span>}
          </td>

          {/* Description */}
          <td style={{ maxWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <div style={{ minWidth: 0 }}>
                {item.epicId && (() => {
                  const ep = state.hierarchyNodes.find(x => x.id === item.epicId)
                  const epColor = ep ? (state.clients.find(c => c.id === ep.clientId)?.color ?? 'var(--primary)') : 'var(--primary)'
                  return ep ? <span title={ep.desc} style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: epColor + '18', color: epColor, marginBottom: 2, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.key}</span> : null
                })()}
                <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, lineHeight: 1.4 }}>
                  {item.desc}
                </div>
                {dl?.type !== 'none' && dl?.date && (
                  <span className={`deadline-badge deadline-${dl.type}`} style={{ marginTop: 3, display: 'inline-flex' }}>
                    {fmtDate(dl.date)}
                  </span>
                )}
              </div>
            </div>
          </td>

          {/* Tags */}
          <td style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
              {item.tags.map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          </td>

          {/* Assignés */}
          <td style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {item.assignees.map(id => {
                const m = getMember(id)
                return m ? <span key={id} className="avatar" title={m.name}>{m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span> : null
              })}
            </div>
          </td>

          {/* SP */}
          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: 12 }}>
            {item.sp}
          </td>

          {/* Dépendances */}
          <td style={{ whiteSpace: 'nowrap' }}>
            {depItems.length === 0 && !depDepth && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>}
            {depItems.slice(0, 2).map(d => (
              <span key={d.id} style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', borderRadius: 4, padding: '1px 5px', marginRight: 3 }}>{d.key}</span>
            ))}
            {depItems.length > 2 && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 3 }}>{depItems.length} dép.</span>}
            {depDepth !== undefined && (
              <span className="dep-level-badge" style={{ background: DEP_COLOR }}>Niv.{depDepth}</span>
            )}
          </td>

          {/* DoR */}
          <td style={{ textAlign: 'center' }} data-testid="dor-cell">
            <DorDodBadge stat={dorDodStat(item.dor)} label="DoR" />
          </td>

          {/* DoD */}
          <td style={{ textAlign: 'center' }} data-testid="dod-cell">
            <DorDodBadge stat={dorDodStat(item.dod)} label="DoD" />
          </td>

          {/* Actions — Modifier : PO/Admin (accès complet) ou Dev (sous-ensemble opérationnel).
              Supprimer : PO/Admin uniquement (voir utils/permissions.ts). */}
          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
            {(canManage || canOperate) && (
              <button className="btn-icon" onClick={() => setModalItem(item)} title="Modifier"><Svg d={SVG_EDIT} /></button>
            )}
            {canManage && (
              <button className="btn-icon danger" onClick={() => handleDelete(item.id)} title="Supprimer"><Svg d={SVG_DEL} /></button>
            )}
          </td>
        </tr>

        {/* US + CA expand */}
        {isExpanded && (hasUS || criteria.length > 0) && (
          <tr className="ca-expand-row">
            <td colSpan={15} className="ca-expand-cell">
              <div className="ca-expand-inner">
                {hasUS && (
                  <div className="ca-us-block">
                    <div className="ca-label-top">User Story</div>
                    {item.role && <div className="ca-us-row"><span className="ca-us-prefix">En tant que</span><span>{item.role}</span></div>}
                    {item.need && <div className="ca-us-row"><span className="ca-us-prefix">je souhaite</span><span>{item.need}</span></div>}
                    {item.benefit && <div className="ca-us-row"><span className="ca-us-prefix">afin de</span><span>{item.benefit}</span></div>}
                  </div>
                )}
                {criteria.length > 0 && (
                  <div className="ca-bdd-block">
                    <div className="ca-label-top">
                      {item.type === 'bug' ? 'Critères de résolution' : "Critères d'acceptation"}
                    </div>
                    {criteria.map((c, ci) => (
                      <div key={c.id} className="ca-bdd-row">
                        <span className="ca-bdd-num">#{ci + 1}</span>
                        <span className="ca-bdd-field given"><span className="ca-badge given">Étant donné que</span> {c.given}</span>
                        <span className="ca-bdd-sep">→</span>
                        <span className="ca-bdd-field when"><span className="ca-badge when">Quand</span> {c.when}</span>
                        <span className="ca-bdd-sep">→</span>
                        <span className="ca-bdd-field then"><span className="ca-badge then">Alors</span> {c.then}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    )
  }

  /** Badge de résumé d'une card de groupe (US/SP, ou capacité de sprint) — même contenu
   *  qu'avant (ligne d'en-tête de tableau), désormais affiché dans l'en-tête d'une
   *  BacklogGroupCard (sous-chantier 4, 2026-07-29). */
  function renderGroupBadge(group: Group): ReactNode {
    if (group.epicSP !== undefined) {
      return (
        <>
          <span>{group.doneCount}/{group.items.length} US terminées</span>
          <span style={{ marginLeft: 6, fontWeight: 600, color: group.color ?? 'var(--primary)' }}>{group.epicSP} SP</span>
          <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 3 }}>{group.epicFixed ? 'fixé' : 'calculé'}</span>
        </>
      )
    }
    if (group.capacity !== undefined) {
      return (
        <>
          <span>{group.used}/{group.capacity} SP</span>
          <span className="capacity-bar">
            <span className="capacity-bar-fill" style={{
              width: `${Math.min(100, ((group.used ?? 0) / group.capacity) * 100)}%`,
              background: (group.used ?? 0) > group.capacity ? 'var(--danger)' : 'var(--primary)'
            }} />
          </span>
        </>
      )
    }
    return <span>{group.items.length} item{group.items.length !== 1 ? 's' : ''}{group.items.length > 0 ? ` · ${group.items.reduce((s, i) => s + i.sp, 0)} SP` : ''}</span>
  }

  /** Actions d'édition/suppression d'un Epic ou d'une Initiative — mêmes boutons qu'avant,
   *  désormais partagés entre les deux niveaux (généralisation `handleSaveHierarchyNode`/
   *  `handleDeleteHierarchyNode`, sous-chantier 4). */
  function renderGroupActions(node: HierarchyNode): ReactNode {
    // Epics/Initiatives : contenu produit, comme les champs "généraux" d'un item — réservé au
    // PO/Admin (voir canManageBacklog, utils/permissions.ts).
    if (!canManage) return null
    const label = node.level === 'initiative' ? "l'Initiative" : "l'Epic"
    return (
      <>
        <button className="btn-icon" onClick={() => setNodeModal({ node, level: node.level })} title={`Modifier ${label}`}><Svg d={SVG_EDIT} size={11} /></button>
        <button className="btn-icon danger" onClick={() => handleDeleteHierarchyNode(node.id)} title={`Supprimer ${label}`}><Svg d={SVG_DEL} size={11} /></button>
      </>
    )
  }

  /** Card générique d'un groupe (Sprint/Client/Type/Statut/Epic, et Epic imbriqué dans une
   *  Initiative via `indent`) — retour Julien, 2026-07-29 : tous les modes de regroupement
   *  du Backlog s'affichent en cards repliables plutôt qu'en lignes d'en-tête de tableau. */
  function renderGroupCard(group: Group, indent = 0) {
    const typeTag = group.node?.level === 'epic' ? 'EPIC' : group.node?.level === 'initiative' ? 'INITIATIVE' : undefined
    return (
      <BacklogGroupCard
        key={group.id}
        id={group.id}
        indent={indent}
        typeTag={typeTag}
        label={group.label}
        sublabel={group.sublabel}
        color={group.color}
        badge={renderGroupBadge(group)}
        actions={group.node ? renderGroupActions(group.node) : undefined}
      >
        {group.items.length > 0 ? (
          <table className="backlog-table">
            <BacklogTableHead />
            <tbody>{group.items.map(renderItemRow)}</tbody>
          </table>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, textAlign: 'center', padding: '6px 0' }}>Aucun item.</p>
        )}
      </BacklogGroupCard>
    )
  }

  /** Card d'une Initiative : ses Epics enfants (cards imbriquées) + ses items rattachés
   *  directement (sans passer par un Epic) — sous-chantier 4, 2026-07-29. */
  function renderInitiativeCard(section: InitiativeSection<Item>) {
    const initiative = section.initiative!
    const epicDisplayGroups = section.epics.map(eg => epicGroupToDisplayGroup(eg))
    const allItems = [...section.epics.flatMap(eg => eg.items), ...section.directItems]
    const epicSPs = epicDisplayGroups.map(g => g.epicSP ?? 0)
    const directSPs = section.directItems.map(i => i.sp)
    const fixed = (initiative.sp ?? 0) > 0
    const sp = getHierarchyNodeSP(initiative, [...epicSPs, ...directSPs])
    const doneCount = allItems.filter(i => i.status === 'done').length
    const color = state.clients.find(c => c.id === initiative.clientId)?.color
    const displayGroup: Group = {
      id: section.initiativeId!, label: initiative.key, sublabel: initiative.desc, color,
      items: allItems, epicSP: sp, epicFixed: fixed, doneCount, node: initiative,
    }
    return (
      <BacklogGroupCard
        key={displayGroup.id}
        id={displayGroup.id}
        typeTag="INITIATIVE"
        label={displayGroup.label}
        sublabel={displayGroup.sublabel}
        color={displayGroup.color}
        badge={renderGroupBadge(displayGroup)}
        actions={renderGroupActions(initiative)}
      >
        {epicDisplayGroups.map(g => renderGroupCard(g, 1))}
        {section.directItems.length > 0 && (
          <table className="backlog-table">
            <BacklogTableHead />
            <tbody>{section.directItems.map(renderItemRow)}</tbody>
          </table>
        )}
        {section.epics.length === 0 && section.directItems.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, textAlign: 'center', padding: '6px 0' }}>Aucun Epic ni item rattaché.</p>
        )}
      </BacklogGroupCard>
    )
  }

  /** Section "Sans Initiative" : les Epics sans parent restent des cards top-level (comme en
   *  mode "Grouper par Epic"), les items vraiment orphelins vont dans une card finale plate,
   *  sans actions — même convention que "Sans Epic" en mode Epic. */
  function renderNoInitiativeCards(section: InitiativeSection<Item>): ReactNode[] {
    const cards: ReactNode[] = section.epics.map(eg => renderGroupCard(epicGroupToDisplayGroup(eg), 0))
    if (section.directItems.length > 0) {
      const sp = section.directItems.reduce((s, i) => s + i.sp, 0)
      cards.push(
        <BacklogGroupCard
          key="no-initiative"
          id="no-initiative"
          label="Sans Initiative"
          badge={<span>{section.directItems.length} item{section.directItems.length !== 1 ? 's' : ''} · {sp} SP</span>}
        >
          <table className="backlog-table">
            <BacklogTableHead />
            <tbody>{section.directItems.map(renderItemRow)}</tbody>
          </table>
        </BacklogGroupCard>
      )
    }
    return cards
  }

  return (
    <>
      <Header title="Product Backlog">
        <div style={{ flex: 1 }} />

        {/* Trier / Filtrer / Grouper — "unibody" : un seul contour, séparateurs internes
            (retour Julien, 2026-07-29 : 8 contrôles ramenés à 3 boutons à dropdown). */}
        <div className="hdr-btn-group">
          <button ref={sortMenu.btnRef} className={`hdr-menu-trigger${sortBy ? ' active' : ''}`}
            data-testid="btn-sort-by" onClick={sortMenu.toggle}>
            <Svg d={ICO_SORT} size={13} /> Trier <Svg d={SVG_CHEV_D} size={11} />
          </button>
          <button ref={filterMenu.btnRef} className={`hdr-menu-trigger${activeFilterCount ? ' active' : ''}`}
            data-testid="btn-filter" onClick={filterMenu.toggle}>
            <Svg d={ICO_FILTER} size={13} /> Filtrer
            {activeFilterCount > 0 && <span className="hdr-menu-trigger-badge">{activeFilterCount}</span>}
            <Svg d={SVG_CHEV_D} size={11} />
          </button>
          <button ref={groupMenu.btnRef} className={`hdr-menu-trigger${groupBy !== 'none' ? ' active' : ''}`}
            data-testid="btn-group-by" onClick={groupMenu.toggle}>
            <Svg d={ICO_LAYERS} size={13} />
            {groupBy === 'none' ? 'Grouper' : `Grouper : ${GROUP_OPTIONS.find(o => o.value === groupBy)?.label}`}
            <Svg d={SVG_CHEV_D} size={11} />
          </button>
        </div>

        {canManage && <div className="hdr-ctx-sep" />}
        {canManage && (
          <button ref={addBtnRef} className="hdr-btn primary" data-testid="btn-add-menu" onClick={openAddMenu}
            style={{ gap: 5, display: 'flex', alignItems: 'center' }}>
            <Svg d={ICO_PLUS} size={11} /> Ajouter <Svg d={SVG_CHEV_D} size={11} />
          </button>
        )}
      </Header>

      {/* Rendu hors du Header pour échapper à son overflow, même principe que ClientsPage.tsx */}
      {addMenuOpen && addMenuPos && (
        <div ref={addMenuRef} className="hdr-menu-panel" style={{
          position: 'fixed', top: addMenuPos.top, right: addMenuPos.right, zIndex: 9999, minWidth: 160,
        }}>
          <button style={ADD_MENU_ITEM_STYLE} data-testid="menu-new-item"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setModalItem(null); setAddMenuOpen(false); setAddMenuPos(null) }}>
            Nouvel Item
          </button>
          <button style={ADD_MENU_ITEM_STYLE} data-testid="menu-new-epic"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setNodeModal({ node: null, level: 'epic' }); setAddMenuOpen(false); setAddMenuPos(null) }}>
            Nouvel Epic
          </button>
          <button style={ADD_MENU_ITEM_STYLE} data-testid="menu-new-initiative"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setNodeModal({ node: null, level: 'initiative' }); setAddMenuOpen(false); setAddMenuPos(null) }}>
            Nouvelle Initiative
          </button>
        </div>
      )}

      {/* Dropdown "Trier" */}
      {sortMenu.open && sortMenu.pos && (
        <div ref={sortMenu.menuRef} className="hdr-menu-panel"
          style={{ position: 'fixed', top: sortMenu.pos.top, right: sortMenu.pos.right, zIndex: 9999, minWidth: 170 }}>
          {SORT_OPTIONS.map(o => (
            <MenuOption key={o.value || '_none'} label={o.label} active={sortBy === o.value}
              testId={`sort-by-option-${o.value || 'none'}`}
              onClick={() => { setSortBy(o.value); sortMenu.close() }} />
          ))}
        </div>
      )}

      {/* Dropdown "Grouper" */}
      {groupMenu.open && groupMenu.pos && (
        <div ref={groupMenu.menuRef} className="hdr-menu-panel"
          style={{ position: 'fixed', top: groupMenu.pos.top, right: groupMenu.pos.right, zIndex: 9999, minWidth: 170 }}>
          {GROUP_OPTIONS.map(o => (
            <MenuOption key={o.value} label={o.label} active={groupBy === o.value}
              testId={`group-by-option-${o.value}`}
              onClick={() => { setGroupBy(o.value); groupMenu.close() }} />
          ))}
        </div>
      )}

      {/* Dropdown "Filtrer" — panel multi-axes (Client/Sprint/Epic/Initiative/Tag/Statut),
          contrairement à Trier/Grouper qui sont un choix unique : ces 6 axes se combinent. */}
      {filterMenu.open && filterMenu.pos && (
        <div ref={filterMenu.menuRef} className="hdr-menu-panel"
          style={{ position: 'fixed', top: filterMenu.pos.top, right: filterMenu.pos.right, zIndex: 9999, minWidth: 230 }}>
          <FilterRow label="Client" testId="filter-client" value={filterClient} onChange={setFilterClient}
            options={state.clients.map(c => ({ value: c.id, label: c.name }))} />
          <FilterRow label="Sprint" testId="filter-sprint" value={filterSprint} onChange={setFilterSprint}
            options={[...state.sprints.map(s => ({ value: s.id, label: `Sprint ${s.number}` })), { value: 'unassigned', label: 'Non assigné' }]} />
          <FilterRow label="Epic" testId="filter-epic" value={filterEpic} onChange={setFilterEpic}
            options={state.hierarchyNodes.filter(n => n.level === 'epic').map(e => ({ value: e.id, label: e.key }))} />
          <FilterRow label="Initiative" testId="filter-initiative" value={filterInitiative} onChange={setFilterInitiative}
            options={state.hierarchyNodes.filter(n => n.level === 'initiative').map(i => ({ value: i.id, label: i.key }))} />
          <FilterRow label="Tag" testId="filter-tag" value={filterTag} onChange={setFilterTag}
            options={allTags.map(t => ({ value: t, label: t }))} />
          <FilterRow label="Statut" testId="filter-status" value={filterStatus} onChange={setFilterStatus}
            options={allStatusCols.map(c => ({ value: c.id, label: c.label }))} />
          <div className="hdr-menu-option hdr-menu-checkbox-row" onClick={() => setFilterReady(v => !v)}>
            <input type="checkbox" data-testid="filter-ready" checked={filterReady}
              onChange={e => setFilterReady(e.target.checked)} onClick={e => e.stopPropagation()} />
            <span>Prêt (DoR complète)</span>
          </div>
          {activeFilterCount > 0 && (
            <button className="hdr-menu-clear-btn" data-testid="filter-clear" onClick={clearAllFilters}>
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}

      <div className="page-content">
        {groupBy === 'none' ? (
          // Pas de regroupement actif : table plate inchangée (retour Julien, 2026-07-29 —
          // seuls les modes de regroupement passent en cards, ce mode par défaut n'a rien à
          // "regrouper" visuellement).
          <table className="backlog-table" data-testid="backlog-table">
            <BacklogTableHead />
            <tbody>{filtered.map(renderItemRow)}</tbody>
          </table>
        ) : (
          <div className="backlog-group-cards" data-testid="backlog-table">
            {groupBy === 'initiative' ? (
              <>
                {initiativeSections.filter(s => s.initiativeId !== null).map(renderInitiativeCard)}
                {(() => {
                  const noInit = initiativeSections.find(s => s.initiativeId === null)
                  return noInit ? renderNoInitiativeCards(noInit) : null
                })()}
              </>
            ) : (
              groups.map(g => renderGroupCard(g, 0))
            )}
          </div>
        )}
      </div>

      {modalItem !== undefined && (
        <ModalErrorBoundary key={modalItem?.id ?? 'new'} onClose={() => setModalItem(undefined)}>
          <ItemModal item={modalItem} state={state} onSave={handleSave} onClose={() => setModalItem(undefined)}
            canManage={canManage} canOperate={canOperate} currentUserId={userId} currentUserRole={userRole} />
        </ModalErrorBoundary>
      )}

      {nodeModal !== undefined && (
        <HierarchyNodeModal
          node={nodeModal.node}
          level={nodeModal.level}
          state={state}
          onSave={(node, keyCounters) => { handleSaveHierarchyNode(node, keyCounters); setNodeModal(undefined) }}
          onClose={() => setNodeModal(undefined)}
        />
      )}
    </>
  )
}
