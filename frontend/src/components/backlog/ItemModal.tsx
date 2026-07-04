import { useState, useRef } from 'react'
import type { Item, CadenceState, CheckItem, BDDCriterion, ItemType, BugSeverity, Deadline, Note, NoteAttachment, MoscowValue, ScoringFramework, WSJFScore, RICEScore } from '../../types'
import { useCadence } from '../../context/StateContext'
import { BASE_TAGS } from '../../data/baseTags'

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
const ICO_BOOK     = '<path d="M11 18H3"/><path d="m15 18 2 2 4-4"/><path d="M16 12H3"/><path d="M16 6H3"/>'
const ICO_DEPS     = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
const ICO_STAR     = '<path d="M12 2l3.09 6.26 6.91.99-5 4.87 1.18 6.88L12 17.77l-6.18 3.23L7 14.12 2 9.25l6.91-.99z"/>'
const ICO_TEAM     = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
const ICO_CHECK    = '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'
const ICO_CAL      = '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
const ICO_TAG      = '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>'
const ICO_CLOSE    = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
const ICO_COMMENT    = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
const ICO_PLUS       = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
const ICO_NOTE       = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>'
const ICO_IMAGE      = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'
const ICO_PDF_ATTACH = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h6"/><path d="M9 17h3"/>'
const ICO_LINK_ATT   = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
const ICO_TRASH      = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>'

type Tab = 'general' | 'us' | 'deps' | 'priority' | 'team' | 'dordod' | 'notes'

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
  tabs.push('notes')
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
  const { dispatch } = useCadence()
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
  const [showTagSug, setShowTagSug] = useState(false)
  const tagWrapRef = useRef<HTMLDivElement>(null)

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

  /* Notes */
  const [notes,              setNotes]              = useState<Note[]>(Array.isArray(item?.notes) ? item.notes : [])
  const [noteText,           setNoteText]           = useState('')
  const [pendingAtts,        setPendingAtts]        = useState<NoteAttachment[]>([])
  const [addingLink,         setAddingLink]         = useState(false)
  const [linkTitle,          setLinkTitle]          = useState('')
  const [linkUrl,            setLinkUrl]            = useState('')
  const [replyingTo,         setReplyingTo]         = useState<string | null>(null)
  const [replyText,          setReplyText]          = useState('')
  const [replyAtts,          setReplyAtts]          = useState<NoteAttachment[]>([])
  const [replyAddingLink,    setReplyAddingLink]    = useState(false)

  /* DoR / DoD */
  const [dor, setDor] = useState<CheckItem[]>(item?.dor?.length ? item.dor : mkCheck(DOR_DEFAULT))
  const [dod, setDod] = useState<CheckItem[]>(item?.dod?.length ? item.dod : mkCheck(DOD_DEFAULT))
  const [dorInput, setDorInput] = useState('')
  const [dodInput, setDodInput] = useState('')
  const dorDone = dor.filter(x => x.done).length
  const dodDone = dod.filter(x => x.done).length

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

  const allKnownTags = [...BASE_TAGS, ...(state.customTags ?? [])]
  const tagSuggestions = tagInput.trim()
    ? allKnownTags
        .filter(t => t.toLowerCase().includes(tagInput.trim().toLowerCase()) && !tags.includes(t))
        .slice(0, 8)
    : []

  function addTag(value?: string) {
    const t = (value ?? tagInput).trim()
    if (!t || tags.includes(t)) { setTagInput(''); setShowTagSug(false); return }
    setTags(ts => [...ts, t])
    setTagInput('')
    setShowTagSug(false)
    // Enregistrer dans customTags si nouveau tag
    if (!allKnownTags.includes(t)) {
      dispatch({ type: 'SET_CUSTOM_TAGS', payload: [...(state.customTags ?? []), t] })
    }
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

  /* ── Note helpers ── */
  function getAuthorName(authorId?: string) {
    return state.team.find(m => m.id === authorId)?.name ?? 'Invité'
  }
  function getAuthorInitials(authorId?: string) {
    return getAuthorName(authorId).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  }
  function formatNoteDate(iso: string) {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function handleFileUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'image' | 'pdf',
    setter: React.Dispatch<React.SetStateAction<NoteAttachment[]>>
  ) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => setter(a => [...a, { id: uid(), type, name: file.name, url: reader.result as string, mimeType: file.type }])
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function addLinkToAtts(setter: React.Dispatch<React.SetStateAction<NoteAttachment[]>>) {
    const url = linkUrl.trim(); if (!url) return
    setter(a => [...a, { id: uid(), type: 'link', name: linkTitle.trim() || url, url }])
    setLinkTitle(''); setLinkUrl(''); setAddingLink(false); setReplyAddingLink(false)
  }

  function submitNote() {
    if (!noteText.trim() && pendingAtts.length === 0) return
    setNotes(n => [...n, { id: uid(), text: noteText.trim(), createdAt: new Date().toISOString(), attachments: pendingAtts, replies: [] }])
    setNoteText(''); setPendingAtts([]); setAddingLink(false)
  }

  function deleteNote(id: string) { setNotes(n => n.filter(x => x.id !== id)) }

  function submitReply(noteId: string) {
    if (!replyText.trim() && replyAtts.length === 0) return
    setNotes(n => n.map(note => note.id !== noteId ? note : {
      ...note,
      replies: [...note.replies, { id: uid(), text: replyText.trim(), createdAt: new Date().toISOString(), attachments: replyAtts }]
    }))
    setReplyingTo(null); setReplyText(''); setReplyAtts([]); setReplyAddingLink(false)
  }

  function deleteReply(noteId: string, replyId: string) {
    setNotes(n => n.map(note => note.id !== noteId ? note : { ...note, replies: note.replies.filter(r => r.id !== replyId) }))
  }

  function renderAttachment(att: NoteAttachment, removable = false, onRemove?: () => void) {
    if (att.type === 'image') return (
      <div key={att.id} className="note-att-image">
        <img src={att.url} alt={att.name} onClick={() => window.open(att.url, '_blank')} />
        {removable && <button className="note-att-remove btn-icon danger" onClick={onRemove}><Svg d={ICO_CLOSE} size={10} /></button>}
      </div>
    )
    if (att.type === 'pdf') return (
      <div key={att.id} className="note-att-file">
        <Svg d={ICO_PDF_ATTACH} size={13} />
        <a href={att.url} download={att.name}>{att.name}</a>
        {removable && <button className="btn-icon danger" onClick={onRemove}><Svg d={ICO_CLOSE} size={10} /></button>}
      </div>
    )
    if (att.type === 'link') {
      let domain = ''; try { domain = new URL(att.url).hostname } catch { /**/ }
      return (
        <div key={att.id} className="note-att-link">
          {domain && <img src={`https://www.google.com/s2/favicons?domain=${domain}`} width={13} height={13} alt="" />}
          <a href={att.url} target="_blank" rel="noopener noreferrer">{att.name || att.url}</a>
          {removable && <button className="btn-icon danger" onClick={onRemove}><Svg d={ICO_CLOSE} size={10} /></button>}
        </div>
      )
    }
    return null
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
    const nextNum = state.items.length + 1
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
      scoringFramework: framework, wsjf, rice, notes,
      createdAt: item?.createdAt ?? now,
    }
    onSave(finalItem)
    onClose()
  }

  /* ── Tabs (dynamiques selon iType) ── */
  const ALL_TABS: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: 'general',  label: 'Général',            icon: ICO_GENERAL },
    { id: 'us',       label: usTabLabel(iType),     icon: ICO_BOOK },
    { id: 'deps',     label: 'Dépendances',         icon: ICO_DEPS },
    { id: 'priority', label: 'Priorité',            icon: ICO_STAR },
    { id: 'team',     label: 'Équipe',              icon: ICO_TEAM },
    { id: 'dordod',   label: 'DoD / DoR',           icon: ICO_CHECK },
    { id: 'notes',    label: 'Notes',               icon: ICO_NOTE,  badge: notes.length > 0 ? notes.length : undefined },
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
          <div ref={tagWrapRef} style={{ position: 'relative' }}>
            <input className="form-input" placeholder="Ajouter un tag..." value={tagInput}
              onChange={e => { setTagInput(e.target.value); setShowTagSug(true) }}
              onFocus={() => setShowTagSug(true)}
              onBlur={() => setTimeout(() => setShowTagSug(false), 150)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addTag() }
                if (e.key === 'Escape') { setTagInput(''); setShowTagSug(false) }
              }} />
            {showTagSug && tagSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: 'var(--surface)', border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-md)',
                marginTop: 2, overflow: 'hidden',
              }}>
                {tagSuggestions.map(s => (
                  <div key={s}
                    onMouseDown={() => addTag(s)}
                    style={{
                      padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                      color: 'var(--text)', borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-light)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
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

    /* ── ÉQUIPE ── */
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
      </div>
    )

    /* ── DoR / DoD ── */
    if (tab === 'dordod') return (
      <div className="modal-tab-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {([
            { label: 'Definition of Ready', items: dor, done: dorDone,
              toggle: (id: string) => setDor(dor.map(x => x.id === id ? { ...x, done: !x.done } : x)),
              remove: (id: string) => setDor(dor.filter(x => x.id !== id)),
              input: dorInput, setInput: setDorInput,
              add: () => { if (!dorInput.trim()) return; setDor([...dor, { id: uid(), text: dorInput.trim(), done: false }]); setDorInput('') }
            },
            { label: 'Definition of Done', items: dod, done: dodDone,
              toggle: (id: string) => setDod(dod.map(x => x.id === id ? { ...x, done: !x.done } : x)),
              remove: (id: string) => setDod(dod.filter(x => x.id !== id)),
              input: dodInput, setInput: setDodInput,
              add: () => { if (!dodInput.trim()) return; setDod([...dod, { id: uid(), text: dodInput.trim(), done: false }]); setDodInput('') }
            }
          ]).map(section => (
            <div key={section.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{section.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700,
                  color: section.done === section.items.length ? 'var(--success)' : 'var(--text-muted)' }}>
                  {section.done}/{section.items.length}
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 12 }}>
                <div style={{ height: 4, borderRadius: 2, transition: 'width .3s',
                  background: section.done === section.items.length ? 'var(--success)' : 'var(--primary)',
                  width: section.items.length ? `${(section.done / section.items.length) * 100}%` : '0%' }} />
              </div>
              <div className="checklist">
                {section.items.map(x => (
                  <div key={x.id} className="checklist-item" onClick={() => section.toggle(x.id)}>
                    <input type="checkbox" checked={x.done} onChange={() => section.toggle(x.id)}
                      onClick={e => e.stopPropagation()} />
                    <span style={{ flex: 1, textDecoration: x.done ? 'line-through' : 'none',
                      color: x.done ? 'var(--text-muted)' : 'var(--text)' }}>{x.text}</span>
                    <button onClick={e => { e.stopPropagation(); section.remove(x.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-faint)', fontSize: 12, padding: '0 2px', flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <input className="form-input" value={section.input}
                  onChange={e => section.setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && section.add()}
                  placeholder="Nouveau critère..." style={{ fontSize: 11 }} />
                <button className="btn btn-secondary" onClick={section.add} style={{ flexShrink: 0 }}>+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )

    /* ── NOTES ── */
    if (tab === 'notes') return (
      <div className="modal-tab-body">
        {notes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            Aucune note. Ajoutez la première ci-dessous.
          </div>
        )}
        {notes.map(note => (
          <div key={note.id} className="note-item">
            <div className="note-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="avatar" style={{ background: 'var(--primary)', flexShrink: 0, width: 26, height: 26, fontSize: 10 }}>
                  {getAuthorInitials(note.authorId)}
                </span>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{getAuthorName(note.authorId)}</span>
                  <span className="note-date">{formatNoteDate(note.createdAt)}</span>
                </div>
              </div>
              <button className="btn-icon danger" onClick={() => deleteNote(note.id)}><Svg d={ICO_TRASH} size={12} /></button>
            </div>
            {note.text && <div className="note-text">{note.text}</div>}
            {(note.attachments?.length ?? 0) > 0 && (
              <div className="note-attachments">
                {note.attachments.map(att => renderAttachment(att))}
              </div>
            )}
            {(note.replies?.length ?? 0) > 0 && (
              <div className="note-replies">
                {note.replies.map(reply => (
                  <div key={reply.id} className="note-reply">
                    <div className="note-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="avatar" style={{ background: 'var(--success)', width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>
                          {getAuthorInitials(reply.authorId)}
                        </span>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{getAuthorName(reply.authorId)}</span>
                          <span className="note-date">{formatNoteDate(reply.createdAt)}</span>
                        </div>
                      </div>
                      <button className="btn-icon danger" onClick={() => deleteReply(note.id, reply.id)}><Svg d={ICO_TRASH} size={11} /></button>
                    </div>
                    {reply.text && <div className="note-text" style={{ fontSize: 11 }}>{reply.text}</div>}
                    {(reply.attachments?.length ?? 0) > 0 && (
                      <div className="note-attachments">
                        {reply.attachments.map(att => renderAttachment(att))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {replyingTo === note.id ? (
              <div className="note-reply-form">
                <textarea className="form-input" rows={2} value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Votre réponse..." style={{ fontSize: 11 }} />
                {replyAtts.length > 0 && (
                  <div className="note-attachments" style={{ marginTop: 6 }}>
                    {replyAtts.map(att => renderAttachment(att, true, () => setReplyAtts(a => a.filter(x => x.id !== att.id))))}
                  </div>
                )}
                {replyAddingLink && (
                  <div className="note-link-form">
                    <input className="form-input" placeholder="URL (https://...)" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} style={{ fontSize: 11, marginBottom: 6 }} />
                    <input className="form-input" placeholder="Titre (optionnel)" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} style={{ fontSize: 11 }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => addLinkToAtts(setReplyAtts)}>Ajouter</button>
                      <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => setReplyAddingLink(false)}>Annuler</button>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <label className="btn-icon" title="Image" style={{ cursor: 'pointer' }}>
                    <Svg d={ICO_IMAGE} size={13} />
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileUpload(e, 'image', setReplyAtts)} />
                  </label>
                  <label className="btn-icon" title="PDF" style={{ cursor: 'pointer' }}>
                    <Svg d={ICO_PDF_ATTACH} size={13} />
                    <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => handleFileUpload(e, 'pdf', setReplyAtts)} />
                  </label>
                  <button className="btn-icon" title="Lien" onClick={() => setReplyAddingLink(v => !v)}><Svg d={ICO_LINK_ATT} size={13} /></button>
                  <div style={{ flex: 1 }} />
                  <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => { setReplyingTo(null); setReplyText(''); setReplyAtts([]); setReplyAddingLink(false) }}>Annuler</button>
                  <button className="hdr-btn primary" style={{ fontSize: 11 }} onClick={() => submitReply(note.id)}>Répondre</button>
                </div>
              </div>
            ) : (
              <button className="note-reply-btn" onClick={() => { setReplyingTo(note.id); setReplyText('') }}>
                Répondre
              </button>
            )}
          </div>
        ))}
        <div className="note-compose">
          <textarea className="form-input" rows={3} value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Écrire une note... (texte libre)" style={{ resize: 'vertical' }} />
          {pendingAtts.length > 0 && (
            <div className="note-attachments" style={{ marginTop: 8 }}>
              {pendingAtts.map(att => renderAttachment(att, true, () => setPendingAtts(a => a.filter(x => x.id !== att.id))))}
            </div>
          )}
          {addingLink && (
            <div className="note-link-form">
              <input className="form-input" placeholder="URL (https://...)" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} style={{ fontSize: 11, marginBottom: 6 }} />
              <input className="form-input" placeholder="Titre (optionnel)" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} style={{ fontSize: 11 }} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => addLinkToAtts(setPendingAtts)}>Ajouter</button>
                <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => setAddingLink(false)}>Annuler</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <label className="btn-icon" title="Attacher une image" style={{ cursor: 'pointer' }}>
              <Svg d={ICO_IMAGE} size={14} />
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: 'none' }} onChange={e => handleFileUpload(e, 'image', setPendingAtts)} />
            </label>
            <label className="btn-icon" title="Attacher un PDF" style={{ cursor: 'pointer' }}>
              <Svg d={ICO_PDF_ATTACH} size={14} />
              <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => handleFileUpload(e, 'pdf', setPendingAtts)} />
            </label>
            <button className="btn-icon" title="Ajouter un lien" onClick={() => setAddingLink(v => !v)}><Svg d={ICO_LINK_ATT} size={14} /></button>
            <div style={{ flex: 1 }} />
            <button className="hdr-btn primary" style={{ fontSize: 12 }} onClick={submitNote}>
              <Svg d={ICO_PLUS} size={13} /> Ajouter
            </button>
          </div>
        </div>
      </div>
    )

    return null
  }

  /* ── Modal ── */
  return (
    <div className="modal-overlay" data-testid="item-modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--primary)',
              background: 'var(--primary-light)', padding: '2px 8px', borderRadius: 6 }}>
              {item?.key ?? 'NOUVEAU'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {isNew ? 'Créer un item' : "Modifier l'item"}
            </span>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Fermer">
            <Svg d={ICO_CLOSE} size={16} />
          </button>
        </div>
        <div className="modal-tabs">
          {TABS.map(t => (
            <button key={t.id}
              className={`modal-tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id as Tab)}>
              <Svg d={t.icon} size={12} />
              {t.label}
              {'badge' in t && t.badge !== undefined && <span className="modal-tab-badge">{t.badge}</span>}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {renderTab()}
        </div>
        <div className="modal-footer">
          <button className="hdr-ctx-btn" onClick={onClose}>Annuler</button>
          <button className="hdr-btn primary" onClick={handleSave}>
            {isNew ? 'Créer' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
