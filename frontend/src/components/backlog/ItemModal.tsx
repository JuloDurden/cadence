import { useState } from 'react'
import type { Item, CadenceState, CheckItem, BDDCriterion, ItemType, BugSeverity, Deadline, Comment, MoscowValue, ScoringFramework, WSJFScore, RICEScore } from '../../types'

/* ─── Constants ──────────────────────────────────────────────────── */
const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'story', label: 'Story'  },
  { value: 'epic',  label: 'Epic'   },
  { value: 'bug',   label: 'Bug'    },
  { value: 'task',  label: 'Tâche'  },
  { value: 'spike', label: 'Spike'  },
]

const DOR_DEFAULT: Omit<CheckItem, 'id'>[] = [
  { text: "User Story rédigée (rôle / besoin / objectif)", done: false },
  { text: "Critères d'acceptation définis (Gherkin)",     done: false },
  { text: "Estimé en SP par l'équipe",                    done: false },
  { text: "Dépendances identifiées et prises en compte",  done: false },
  { text: "Aucun bloqueur connu",                         done: false },
]
const DOD_DEFAULT: Omit<CheckItem, 'id'>[] = [
  { text: "Code développé et en revue (code review)",     done: false },
  { text: "Tests unitaires écrits et passants",           done: false },
  { text: "Recette fonctionnelle validée par le PO",      done: false },
  { text: "Déployé en environnement de recette",          done: false },
  { text: "Documentation mise à jour",                    done: false },
]

const MOSCOW_OPTS: { value: MoscowValue; label: string; sub: string; prio: string; color: string }[] = [
  { value: 'must',   label: 'Must have',   sub: 'P1', prio: 'critical', color: '#FF2929' },
  { value: 'should', label: 'Should have', sub: 'P2', prio: 'high',     color: '#FF981C' },
  { value: 'could',  label: 'Could have',  sub: 'P3', prio: 'medium',   color: '#165FCC' },
  { value: 'wont',   label: "Won't have",  sub: 'P4', prio: 'low',      color: '#9CC9F4' },
]

const PRIO_OPTS = [
  { value: 'critical', label: 'P1 - Critique', color: '#FF2929', textColor: '#fff' },
  { value: 'high',     label: 'P2 - Haute',    color: '#FF981C', textColor: '#fff' },
  { value: 'medium',   label: 'P3 - Normale',  color: '#165FCC', textColor: '#fff' },
  { value: 'low',      label: 'P4 - Faible',   color: '#9CC9F4', textColor: '#0d1a33' },
]

const RICE_IMPACT_OPTS = [
  { value: 0.25, label: 'Minimal (0.25)' },
  { value: 0.5,  label: 'Faible (0.5)'   },
  { value: 1,    label: 'Moyen (1)'       },
  { value: 2,    label: 'Fort (2)'        },
  { value: 3,    label: 'Massif (3)'      },
]
const RICE_CONF_OPTS = [
  { value: 0.5, label: '50%' },
  { value: 0.8, label: '80%' },
  { value: 1,   label: '100%' },
]

function uid() { return Math.random().toString(36).slice(2, 10) }
function mkCheck(items: Omit<CheckItem, 'id'>[]): CheckItem[] { return items.map(x => ({ ...x, id: uid() })) }

function Svg({ d, size = 13, cls }: { d: string; size?: number; cls?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={cls} dangerouslySetInnerHTML={{ __html: d }} />
}

/* ─── SVG icons (monochrome) ─────────────────────────────────────── */
const ICO_PENCIL   = '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>'
const ICO_GENERAL  = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'
const ICO_BOOK     = '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'
const ICO_DEPS     = '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/><path d="M8 6h8"/><path d="M8 10h8"/><path d="M8 14h4"/>'
const ICO_STAR     = '<path d="M12 2l3.09 6.26 6.91.99-5 4.87 1.18 6.88L12 17.77l-6.18 3.23L7 14.12 2 9.25l6.91-.99z"/>'
const ICO_TEAM     = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
const ICO_CHECK    = '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'
const ICO_CAL      = '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
const ICO_TAG      = '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>'
const ICO_CLOSE    = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
const ICO_COMMENT  = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
const ICO_PLUS     = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'

type Tab = 'general' | 'us' | 'deps' | 'priority' | 'team' | 'dordod'

const SEV_OPTS: { value: BugSeverity; label: string; color: string }[] = [
  { value: 'critical', label: 'Critique', color: '#FF2929' },
  { value: 'major',    label: 'Majeur',   color: '#FF981C' },
  { value: 'minor',    label: 'Mineur',   color: '#165FCC' },
]

/** Onglets visibles selon le type d'item */
function getVisibleTabs(type: ItemType): Tab[] {
  // Général + Équipe + Dépendances → toujours présents
  const tabs: Tab[] = ['general']
  if (type !== 'task') tabs.push('us')        // Tâche : pas d'US/critères/objectif
  tabs.push('deps')
  if (type === 'story' || type === 'epic' || type === 'bug') tabs.push('priority')
  tabs.push('team')
  if (type === 'story' || type === 'epic' || type === 'bug') tabs.push('dordod')
  return tabs
}

/** Label de l'onglet 'us' selon le type */
function usTabLabel(type: ItemType) {
  if (type === 'bug')   return 'Critères'
  if (type === 'spike') return 'Objectif'
  return 'User Story'
}

/* ─── Props ─────────────────────────────────────────────────────── */
interface Props {
  item: Item | null
  state: CadenceState
  onSave: (item: Item) => void
  onClose: () => void
}

/* ─── Component ─────────────────────────────────────────────────── */
export function ItemModal({ item, state, onSave, onClose }: Props) {
  const isNew = !item
  const defaultStatus = state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id ?? 'todo'

  const [tab, setTab] = useState<Tab>('general')

  /* Général */
  const [iType,    setIType]    = useState<ItemType>(item?.type ?? 'story')
  const [severity, setSeverity] = useState<BugSeverity | ''>(item?.severity ?? '')
  const [epicId,   setEpicId]   = useState(item?.epicId ?? '')
  const [desc,     setDesc]     = useState(item?.desc ?? '')
  const [clientId, setClientId] = useState(item?.clientId ?? '')
  const [sp,       setSp]       = useState(item?.sp ?? 3)
  const [sprintId, setSprintId] = useState(item?.sprintId ?? '')
  const [status] = useState(item?.status ?? defaultStatus)
  const [deadline, setDeadline] = useState<Deadline>(item?.deadline ?? { date: '', type: 'none' })
  const [tags,     setTags]     = useState<string[]>(item?.tags ?? [])
  const [tagInput, setTagInput] = useState('')

  /* User Story */
  const [role,    setRole]    = useState(item?.role ?? '')
  const [need,    setNeed]    = useState(item?.need ?? '')
  const [benefit, setBenefit] = useState(item?.benefit ?? '')
  const [criteria, setCriteria] = useState<BDDCriterion[]>(item?.criteria ?? [])

  /* Deps */
  const [deps,      setDeps]      = useState<string[]>(item?.deps ?? [])
  const [depSearch, setDepSearch] = useState('')

  /* Priority */
  const [priority,  setPriority]  = useState<import('../../types').Priority>(item?.priority ?? 'medium')
  const [moscow,    setMoscow]    = useState<MoscowValue | ''>(item?.moscow ?? '')
  const [framework, setFramework] = useState<ScoringFramework>(item?.scoringFramework ?? 'moscow')
  /* WSJF */
  const [wBV, setWBV] = useState(item?.wsjf?.businessValue ?? 5)
  const [wTC, setWTC] = useState(item?.wsjf?.timeCriticality ?? 5)
  const [wRR, setWRR] = useState(item?.wsjf?.riskReduction ?? 5)
  /* RICE */
  const [rReach, setRReach] = useState(item?.rice?.reach ?? 100)
  const [rImpact, setRImpact] = useState(item?.rice?.impact ?? 1)
  const [rConf, setRConf]     = useState(item?.rice?.confidence ?? 0.8)
  const [rEffort, setREffort] = useState(item?.rice?.effort ?? 5)

  /* Team */
  const [assignees, setAssignees] = useState<string[]>(item?.assignees ?? [])

  /* Comments */
  const [comments,    setComments]    = useState<Comment[]>(item?.comments ?? [])
  const [commentText, setCommentText] = useState('')
  const [editingCmt,  setEditingCmt]  = useState<string | null>(null)
  const [editCmtText, setEditCmtText] = useState('')

  /* DoR / DoD */
  const [dor, setDor] = useState<CheckItem[]>(item?.dor?.length ? item.dor : mkCheck(DOR_DEFAULT))
  const [dod, setDod] = useState<CheckItem[]>(item?.dod?.length ? item.dod : mkCheck(DOD_DEFAULT))

  /* ── Criterion helpers ── */
  function addCriterion() {
    setCriteria(c => [...c, { id: uid(), given: '', when: '', then: '' }])
  }
  function removeCriterion(id: string) { setCriteria(c => c.filter(x => x.id !== id)) }
  function updateCriterion(id: string, field: keyof BDDCriterion, val: string) {
    setCriteria(c => c.map(x => x.id === id ? { ...x, [field]: val } : x))
  }
  function appendToField(id: string, field: 'given' | 'when' | 'then') {
    setCriteria(cs => cs.map(x => x.id === id ? { ...x, [field]: x[field] + (x[field] ? '\n' : '') } : x))
  }

  function addTag() {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags(ts => [...ts, t])
    setTagInput('')
  }

  const epicOptions = state.items.filter(i => (i.type ?? 'story') === 'epic')
  const depResults = depSearch.length >= 2
    ? state.items.filter(i => i.id !== item?.id && !deps.includes(i.id) &&
        (i.key.toLowerCase().includes(depSearch.toLowerCase()) || i.desc.toLowerCase().includes(depSearch.toLowerCase()))
      ).slice(0, 6)
    : []

  function addDep(id: string) { setDeps(d => [...d, id]); setDepSearch('') }
  function removeDep(id: string) { setDeps(d => d.filter(x => x !== id)) }
  function toggleAssignee(id: string) { setAssignees(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]) }

  const suggestedMembers = state.team.filter(m => !assignees.includes(m.id) && m.tags.some(t => tags.includes(t)))

  function submitComment() {
    const t = commentText.trim(); if (!t) return
    setComments(c => [...c, { id: uid(), author: 'Invité', text: t, createdAt: new Date().toISOString() }])
    setCommentText('')
  }
  function deleteComment(id: string) { setComments(c => c.filter(x => x.id !== id)) }
  function startEditComment(cmt: Comment) { setEditingCmt(cmt.id); setEditCmtText(cmt.text) }
  function saveEditComment(id: string) {
    setComments(c => c.map(x => x.id === id ? { ...x, text: editCmtText, updatedAt: new Date().toISOString() } : x))
    setEditingCmt(null)
  }

  /* ── Priority helpers ── */
  function calcWSJF() {
    const jobSize = sp || 1
    const score = (wBV + wTC + wRR) / jobSize
    return { score: +score.toFixed(2), prio: score >= 8 ? 'critical' : score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low' }
  }
  function calcRICE() {
    const effort = rEffort || 1
    const score = (rReach * rImpact * rConf) / effort
    return { score: +score.toFixed(1), prio: score >= 100 ? 'critical' : score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low' }
  }

  /* ── Save ── */
  function handleSave() {
    const now = new Date().toISOString()
    const client = state.clients.find(c => c.id === clientId) ?? state.clients[0]
    const prefix = client?.prefix ?? 'ITEM'
    const nextNum = state.items.filter(i => i.key.startsWith(prefix + '-')).length + 1
    const wsjf: WSJFScore | undefined = framework === 'wsjf' ? { businessValue: wBV, timeCriticality: wTC, riskReduction: wRR } : item?.wsjf
    const rice: RICEScore | undefined = framework === 'rice' ? { reach: rReach, impact: rImpact, confidence: rConf, effort: rEffort } : item?.rice
    const finalItem: Item = {
      id:       item?.id ?? uid(),
      key:      item?.key ?? `${prefix}-${String(nextNum).padStart(3, '0')}`,
      desc, sp: +sp, status,
      clientId: clientId || (state.clients[0]?.id ?? ''),
      sprintId: sprintId || null,
      priority: priority as Item['priority'],
      assignees, tags, type: iType,
      severity: (iType === 'bug' && severity) ? severity as BugSeverity : undefined,
      epicId: epicId || null,
      role: (iType === 'story' || iType === 'epic' || iType === 'spike') ? role : undefined,
      need: (iType === 'story' || iType === 'epic' || iType === 'spike') ? need : undefined,
      benefit: (iType === 'story' || iType === 'epic' || iType === 'spike') ? benefit : undefined,
      criteria: (iType === 'story' || iType === 'epic' || iType === 'bug') ? criteria : undefined,
      deps,
      dor: (iType === 'story' || iType === 'epic' || iType === 'bug') ? dor : undefined,
      dod: (iType === 'story' || iType === 'epic' || iType === 'bug') ? dod : undefined,
      deadline, moscow: (iType === 'story' || iType === 'epic' || iType === 'bug') ? moscow || undefined : undefined,
      scoringFramework: framework, wsjf, rice, comments,
      createdAt: item?.createdAt ?? now,
    }
    onSave(finalItem)
    onClose()
  }

  /* ── Tabs (dynamiques selon iType) ── */
  const ALL_TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'general',  label: 'Général',            icon: ICO_GENERAL },
    { id: 'us',       label: usTabLabel(iType),     icon: ICO_BOOK },
    { id: 'deps',     label: 'Dépendances',         icon: ICO_DEPS },
    { id: 'priority', label: 'Priorité',            icon: ICO_STAR },
    { id: 'team',     label: 'Équipe',              icon: ICO_TEAM },
    { id: 'dordod',   label: 'DoD / DoR',           icon: ICO_CHECK },
  ]
  const visibleTabIds = getVisibleTabs(iType)
  const TABS = ALL_TABS.filter(t => visibleTabIds.includes(t.id))

  /* ── Render tab content ── */
  function renderTab() {

    /* ── GÉNÉRAL ── */
    if (tab === 'general') return (
      <div className="modal-tab-body">
        {item && <div style={{ marginBottom: 14 }}><span className="item-key" style={{ fontSize: 12 }}>{item.key}</span></div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">TYPE D'ITEM</label>
            <select className="form-input" value={iType} onChange={e => {
              const t = e.target.value as ItemType
              setIType(t)
              if (!getVisibleTabs(t).includes(tab)) setTab('general')
            }}>
              {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {iType === 'bug' ? (
            <div className="form-group">
              <label className="form-label">SÉVÉRITÉ</label>
              <select className="form-input" value={severity} onChange={e => setSeverity(e.target.value as BugSeverity)}>
                <option value="">— choisir —</option>
                {SEV_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {severity && <span style={{ fontSize: 10, fontWeight: 700, color: SEV_OPTS.find(o => o.value === severity)?.color }}>{SEV_OPTS.find(o => o.value === severity)?.label}</span>}
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">EPIC PARENT</label>
              <select className="form-input" value={epicId} onChange={e => setEpicId(e.target.value)}>
                <option value="">Rechercher un Epic...</option>
                {epicOptions.map(e => <option key={e.id} value={e.id}>{e.key} – {e.desc}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">DESCRIPTION</label>
          <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description de l'item..." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">CLIENT / TYPE</label>
            <select className="form-input" value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">Sélectionner...</option>
              {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">STORY POINTS</label>
            <input className="form-input" type="number" min={0} max={100} value={sp} onChange={e => setSp(+e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: iType === 'task' || iType === 'spike' ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">SPRINT ASSIGNÉ</label>
            <select className="form-input" value={sprintId} onChange={e => setSprintId(e.target.value)}>
              <option value="">Non assigné</option>
              {state.sprints.map(s => <option key={s.id} value={s.id}>Sprint {s.number}{s.goal ? ` – ${s.goal}` : ''}</option>)}
            </select>
          </div>
          {(iType === 'task' || iType === 'spike') && (
            <div className="form-group">
              <label className="form-label">PRIORITÉ</label>
              <select className="form-input" value={priority} onChange={e => setPriority(e.target.value as import('../../types').Priority)}>
                {PRIO_OPTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Svg d={ICO_CAL} size={11} /> DATE DE LIVRAISON</label>
            <input className="form-input" type="date" value={deadline.date} onChange={e => setDeadline(d => ({ ...d, date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">TYPE</label>
            <select className="form-input" value={deadline.type} onChange={e => setDeadline(d => ({ ...d, type: e.target.value as Deadline['type'] }))}>
              <option value="none">Aucune</option>
              <option value="imposed">Imposée</option>
              <option value="negotiable">Négociable</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Svg d={ICO_TAG} size={11} /> TAGS</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {tags.map(t => (
              <span key={t} className="tag">
                {t} <span style={{ cursor: 'pointer', opacity: .7, marginLeft: 3 }} onClick={() => setTags(ts => ts.filter(x => x !== t))}>×</span>
              </span>
            ))}
          </div>
          <input className="form-input" placeholder="Ajouter un tag..." value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} />
        </div>
      </div>
    )

    /* ── USER STORY / CRITÈRES / OBJECTIF ── */
    if (tab === 'us') return (
      <div className="modal-tab-body">
        {/* Bloc User Story — Story, Epic, Spike */}
        {(iType === 'story' || iType === 'epic' || iType === 'spike') && (
          <>
            <div className="us-section-label">{iType === 'spike' ? 'OBJECTIF DU SPIKE' : 'USER STORY'}</div>
            <div className="us-card">
              {[
                { label: iType === 'spike' ? 'Contexte'  : 'En tant que', value: role,    setter: setRole },
                { label: iType === 'spike' ? 'On explore' : 'je souhaite', value: need,    setter: setNeed },
                { label: iType === 'spike' ? 'Pour décider' : 'afin de',   value: benefit, setter: setBenefit },
              ].map(row => (
                <div key={row.label} className="us-row">
                  <span className="us-prefix">{row.label}</span>
                  <input className="form-input" value={row.value} onChange={e => row.setter(e.target.value)} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Bloc Critères d'acceptation — Story, Epic, Bug */}
        {(iType === 'story' || iType === 'epic' || iType === 'bug') && (
        <div style={{ marginTop: iType === 'bug' ? 0 : 24 }}>
          <div className="us-section-label">{iType === 'bug' ? 'CRITÈRES DE RÉSOLUTION (GHERKIN)' : 'CRITÈRES D\'ACCEPTATION (GHERKIN)'}</div>
          {criteria.map(c => (
            <div key={c.id} className="bdd-block" style={{ position: 'relative' }}>
              <button className="bdd-remove-btn" onClick={() => removeCriterion(c.id)} title="Supprimer ce critère">
                <Svg d={ICO_CLOSE} size={14} />
              </button>
              {/* Given */}
              <div className="bdd-row">
                <span className="bdd-label given">Étant donné que</span>
                <textarea className="form-input bdd-area" rows={2} value={c.given}
                  onChange={e => updateCriterion(c.id, 'given', e.target.value)} />
              </div>
              <div className="bdd-add-btn-wrap">
                <button className="bdd-add-inline" onClick={() => appendToField(c.id, 'given')}>+ Et que</button>
              </div>
              {/* When */}
              <div className="bdd-row">
                <span className="bdd-label when">Quand</span>
                <textarea className="form-input bdd-area" rows={2} value={c.when}
                  onChange={e => updateCriterion(c.id, 'when', e.target.value)} />
              </div>
              <div className="bdd-add-btn-wrap">
                <button className="bdd-add-inline" onClick={() => appendToField(c.id, 'when')}>+ Et que</button>
              </div>
              {/* Then */}
              <div className="bdd-row">
                <span className="bdd-label then">Alors</span>
                <textarea className="form-input bdd-area" rows={2} value={c.then}
                  onChange={e => updateCriterion(c.id, 'then', e.target.value)} />
              </div>
              <div className="bdd-add-btn-wrap">
                <button className="bdd-add-inline" onClick={() => appendToField(c.id, 'then')}>+ Et</button>
              </div>
            </div>
          ))}
          <button className="hdr-ctx-btn" onClick={addCriterion} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Svg d={ICO_PLUS} size={11} /> Ajouter un critère
          </button>
        </div>
        )}
      </div>
    )

    /* ── DÉPENDANCES ── */
    if (tab === 'deps') return (
      <div className="modal-tab-body">
        <div className="us-section-label">CETTE US NÉCESSITE QUE CES US SOIENT DANS UN SPRINT PRÉCÉDENT</div>
        <div className="deps-list">
          {deps.length === 0 && <div className="deps-empty">Aucune dépendance.</div>}
          {deps.map(id => {
            const dep = state.items.find(i => i.id === id)
            return dep ? (
              <span key={id} className="dep-badge">
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{dep.key}</span>
                {' '}<span style={{ color: 'var(--text-muted)' }}>{dep.desc.slice(0, 40)}</span>
                <button className="dep-badge-remove" onClick={() => removeDep(id)}>×</button>
              </span>
            ) : null
          })}
        </div>
        <div style={{ position: 'relative', marginTop: 14 }}>
          <input className="form-input" placeholder={`Rechercher par clé (${state.clients[0]?.prefix ?? '...'})`}
            value={depSearch} onChange={e => setDepSearch(e.target.value)} />
          {depResults.length > 0 && (
            <div className="dep-search-results">
              {depResults.map(i => (
                <div key={i.id} className="dep-search-opt" onClick={() => addDep(i.id)}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{i.key}</span>
                  {' – '}{i.desc.slice(0, 50)}
                </div>
              ))}
            </div>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
          Ex. : déclarer "e-commerce 2/3" avec dep sur "e-commerce 1/3" — jamais l'inverse.
        </p>
      </div>
    )

    /* ── PRIORITÉ / SCORING ── */
    if (tab === 'priority') return (
      <div className="modal-tab-body">
        <div className="moscow-prio-row">
          <span style={{ fontWeight: 600, fontSize: 13 }}>Priorité :</span>
          {(() => { const opt = PRIO_OPTS.find(p => p.value === priority); return opt ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 800, background: opt.color, color: opt.textColor }}>{opt.label.split(' - ')[0]}</span> : null })()}
          <select className="form-input" style={{ width: 'auto', minWidth: 160 }} value={priority} onChange={e => setPriority(e.target.value as import('../../types').Priority)}>
            {PRIO_OPTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {(moscow || framework !== 'manual') && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
              — calculé via <strong>{framework.toUpperCase()}</strong> · cliquer "Appliquer" pour recalculer
            </span>
          )}
        </div>

        <div className="us-section-label" style={{ marginTop: 20 }}>FRAMEWORK DE SCORING</div>
        <div className="scoring-tabs">
          {(['wsjf', 'rice', 'moscow', 'manual'] as ScoringFramework[]).map(f => (
            <button key={f} className={`scoring-tab-btn${framework === f ? ' active' : ''}`} onClick={() => setFramework(f)}>
              {f === 'moscow' ? 'MoSCoW' : f.toUpperCase()}
            </button>
          ))}
        </div>

        {/* MoSCoW */}
        {framework === 'moscow' && (
          <div style={{ marginTop: 16 }}>
            <div className="moscow-grid">
              {MOSCOW_OPTS.map(opt => (
                <button key={opt.value}
                  className={`moscow-btn${moscow === opt.value ? ' selected' : ''}`}
                  style={{ borderColor: moscow === opt.value ? opt.color : 'var(--border)',
                    background: moscow === opt.value ? opt.color : 'var(--surface)',
                    color: moscow === opt.value ? (opt.value === 'wont' ? '#0d1a33' : '#fff') : 'var(--text)' }}
                  onClick={() => { setMoscow(opt.value); setPriority(opt.prio as import('../../types').Priority) }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, opacity: .85 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
            {moscow && (
              <div className="moscow-summary">
                MoSCoW : <strong>{moscow}</strong> → priorité auto-calculée : <strong>{PRIO_OPTS.find(p => p.value === priority)?.label}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>(appliqué automatiquement)</span>
              </div>
            )}
          </div>
        )}

        {/* WSJF */}
        {framework === 'wsjf' && (() => {
          const { score, prio } = calcWSJF()
          return (
            <div style={{ marginTop: 16 }}>
              {[
                { key: 'bv', label: 'Business Value',       value: wBV, setter: setWBV },
                { key: 'tc', label: 'Time Criticality',      value: wTC, setter: setWTC },
                { key: 'rr', label: 'Risk Reduction / OE',   value: wRR, setter: setWRR },
              ].map(row => (
                <div key={row.key} className="wsjf-row">
                  <span className="wsjf-label">{row.label}</span>
                  <input type="range" min={1} max={10} value={row.value} className="wsjf-range"
                    onChange={e => row.setter(+e.target.value)} />
                  <span className="wsjf-val">{row.value}</span>
                </div>
              ))}
              <div className="wsjf-row" style={{ marginTop: 8 }}>
                <span className="wsjf-label" style={{ color: 'var(--text-muted)' }}>Job Size (SP)</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{sp} SP (depuis onglet Général)</span>
              </div>
              <div className="moscow-summary" style={{ marginTop: 12 }}>
                WSJF = ({wBV} + {wTC} + {wRR}) / {sp || 1} = <strong>{score}</strong>
                → <strong>{PRIO_OPTS.find(p => p.value === prio)?.label}</strong>
                <button className="hdr-ctx-btn" style={{ marginLeft: 10, fontSize: 11 }} onClick={() => setPriority(prio as import('../../types').Priority)}>Appliquer</button>
              </div>
            </div>
          )
        })()}

        {/* RICE */}
        {framework === 'rice' && (() => {
          const { score, prio } = calcRICE()
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">REACH (utilisateurs/trimestre)</label>
                  <input className="form-input" type="number" min={0} value={rReach} onChange={e => setRReach(+e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">IMPACT</label>
                  <select className="form-input" value={rImpact} onChange={e => setRImpact(+e.target.value)}>
                    {RICE_IMPACT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">CONFIDENCE</label>
                  <select className="form-input" value={rConf} onChange={e => setRConf(+e.target.value)}>
                    {RICE_CONF_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">EFFORT (semaines)</label>
                  <input className="form-input" type="number" min={0.5} step={0.5} value={rEffort} onChange={e => setREffort(+e.target.value)} />
                </div>
              </div>
              <div className="moscow-summary" style={{ marginTop: 12 }}>
                RICE = ({rReach} × {rImpact} × {rConf}) / {rEffort} = <strong>{score}</strong>
                → <strong>{PRIO_OPTS.find(p => p.value === prio)?.label}</strong>
                <button className="hdr-ctx-btn" style={{ marginLeft: 10, fontSize: 11 }} onClick={() => setPriority(prio as import('../../types').Priority)}>Appliquer</button>
              </div>
            </div>
          )
        })()}

        {framework === 'manual' && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--surface2)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            Utilise le sélecteur de priorité ci-dessus pour définir manuellement la priorité.
          </div>
        )}
      </div>
    )

    /* ── ÉQUIPE & COMMENTAIRES ── */
    if (tab === 'team') return (
      <div className="modal-tab-body">
        <div className="us-section-label">ASSIGNÉ(S)</div>
        <div className="assignee-chips-grid">
          {state.team.map(m => {
            const sel = assignees.includes(m.id)
            const initials = m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)
            return (
              <button key={m.id} className={`assignee-member-chip${sel ? ' selected' : ''}`}
                onClick={() => toggleAssignee(m.id)}>
                <span className="avatar" style={{ background: sel ? 'var(--primary)' : undefined, flexShrink: 0 }}>{initials}</span>
                <span style={{ fontSize: 12 }}>{m.name.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>

        {suggestedMembers.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="us-section-label">MEMBRES SUGGÉRÉS (PAR TAG COMMUN)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {suggestedMembers.map(m => {
                const initials = m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)
                const commonTags = m.tags.filter(t => tags.includes(t))
                return (
                  <button key={m.id} className="assignee-member-chip suggested" onClick={() => toggleAssignee(m.id)}>
                    <span className="avatar" style={{ background: 'var(--success)', flexShrink: 0 }}>{initials}</span>
                    <span style={{ fontSize: 12 }}>{m.name.split(' ')[0]}</span>
                    {commonTags.map(t => <span key={t} style={{ fontSize: 10, background: 'var(--surface2)', borderRadius: 4, padding: '1px 5px', color: 'var(--text-muted)' }}>{t}</span>)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <div className="us-section-label">COMMENTAIRES ({comments.length})</div>
          {comments.map(cmt => (
            <div key={cmt.id} className="comment-card">
              <div className="comment-header">
                <span className="comment-author">{cmt.author}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="comment-date">{new Date(cmt.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  {editingCmt !== cmt.id && (
                    <>
                      <button className="btn-icon" onClick={() => startEditComment(cmt)}><Svg d={ICO_PENCIL} size={12} /></button>
                      <button className="btn-icon danger" onClick={() => deleteComment(cmt.id)}><Svg d={ICO_CLOSE} size={12} /></button>
                    </>
                  )}
                </div>
              </div>
              {editingCmt === cmt.id ? (
                <div style={{ marginTop: 8 }}>
                  <textarea className="form-input" rows={3} value={editCmtText} onChange={e => setEditCmtText(e.target.value)} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button className="hdr-btn primary" style={{ fontSize: 11 }} onClick={() => saveEditComment(cmt.id)}>Enregistrer</button>
                    <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => setEditingCmt(null)}>Annuler</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="comment-text">{cmt.text}</div>
                  <button className="co