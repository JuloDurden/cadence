import { useState } from 'react'
import type { Item, CadenceState, CheckItem, BDDCriterion, ItemType, Deadline } from '../../types'

/* ─── Constants ──────────────────────────────────────────────────── */
const PRIORITIES = [
  { value: 'critical', label: 'P1 – Critique' },
  { value: 'high',     label: 'P2 – Haute'    },
  { value: 'medium',   label: 'P3 – Normale'  },
  { value: 'low',      label: 'P4 – Faible'   },
]

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'story', label: '📋 Story'  },
  { value: 'epic',  label: '⬡ Epic'   },
  { value: 'bug',   label: '🐛 Bug'    },
  { value: 'task',  label: '🔧 Tâche'  },
  { value: 'spike', label: '⚡ Spike'  },
]

const DOR_DEFAULT: Omit<CheckItem, 'id'>[] = [
  { text: "User Story rédigée (rôle / besoin / objectif)", done: false },
  { text: "Critères d'acceptation définis (Gherkin)",     done: false },
  { text: "Estimé en SP par l'équipe",                    done: false },
  { text: "Dépendances identifiées",                      done: false },
  { text: "Aucun bloqueur connu",                         done: false },
]

const DOD_DEFAULT: Omit<CheckItem, 'id'>[] = [
  { text: "Code développé et en revue",                   done: false },
  { text: "Tests unitaires écrits et passants",           done: false },
  { text: "Recette fonctionnelle validée par le PO",      done: false },
  { text: "Déployé en environnement de recette",          done: false },
  { text: "Documentation mise à jour",                    done: false },
]

function uid() { return Math.random().toString(36).slice(2, 10) }
function mkCheck(items: Omit<CheckItem, 'id'>[]): CheckItem[] {
  return items.map(x => ({ ...x, id: uid() }))
}

/* ─── Props ─────────────────────────────────────────────────────── */
interface Props {
  item: Item | null
  state: CadenceState
  onSave: (item: Item) => void
  onClose: () => void
}

type Tab = 'general' | 'us' | 'bdd' | 'deps' | 'dordod'

/* ─── Component ─────────────────────────────────────────────────── */
export function ItemModal({ item, state, onSave, onClose }: Props) {
  const isNew = !item
  const defaultStatus = state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id ?? 'todo'

  /* form state */
  const [tab,       setTab]       = useState<Tab>('general')
  const [iType,     setIType]     = useState<ItemType>(item?.type ?? 'story')
  const [desc,      setDesc]      = useState(item?.desc ?? '')
  const [sp,        setSp]        = useState(item?.sp ?? 3)
  const [priority,  setPriority]  = useState<Item['priority']>(item?.priority ?? 'medium')
  const [status,    setStatus]    = useState(item?.status ?? defaultStatus)
  const [clientId,  setClientId]  = useState(item?.clientId ?? (state.clients[0]?.id ?? ''))
  const [sprintId,  setSprintId]  = useState<string | null>(item?.sprintId ?? null)
  const [assignees, setAssignees] = useState<string[]>(item?.assignees ?? [])
  const [tags,      setTags]      = useState<string[]>(item?.tags ?? [])
  const [epicId,    setEpicId]    = useState<string | null>(item?.epicId ?? null)
  const [role,      setRole]      = useState(item?.role ?? '')
  const [need,      setNeed]      = useState(item?.need ?? '')
  const [benefit,   setBenefit]   = useState(item?.benefit ?? '')
  const [criteria,  setCriteria]  = useState<BDDCriterion[]>(item?.criteria ?? [])
  const [deps,      setDeps]      = useState<string[]>(item?.deps ?? [])
  const [dor,       setDor]       = useState<CheckItem[]>(item?.dor ?? mkCheck(DOR_DEFAULT))
  const [dod,       setDod]       = useState<CheckItem[]>(item?.dod ?? mkCheck(DOD_DEFAULT))
  const [notes,     setNotes]     = useState(item?.notes ?? '')
  const [deadline,  setDeadline]  = useState<Deadline>(item?.deadline ?? { date: '', type: 'none' })

  /* input helpers */
  const [tagInput,  setTagInput]  = useState('')
  const [depSearch, setDepSearch] = useState('')
  const [dorInput,  setDorInput]  = useState('')
  const [dodInput,  setDodInput]  = useState('')
  const [newCrit,   setNewCrit]   = useState({ given: '', when: '', then: '' })

  /* derived */
  const epics = state.items.filter(i => (i.type ?? 'story') === 'epic' && i.id !== item?.id)
  const depResults = depSearch.trim()
    ? state.items.filter(i =>
        i.id !== item?.id && !deps.includes(i.id) &&
        (i.key.toLowerCase().includes(depSearch.toLowerCase()) ||
         i.desc.toLowerCase().includes(depSearch.toLowerCase()))
      ).slice(0, 8)
    : []

  /* submit */
  function handleSubmit() {
    if (!desc.trim()) return
    const client = state.clients.find(c => c.id === clientId)
    let key = item?.key
    if (!key && client) {
      const nums = state.items
        .filter(i => i.key.startsWith(client.prefix + '-'))
        .map(i => parseInt(i.key.split('-')[1]))
        .filter(n => !isNaN(n))
      const next = nums.length ? Math.max(...nums) + 1 : 1
      key = `${client.prefix}-${String(next).padStart(3, '0')}`
    }
    const saved: Item = {
      id: item?.id ?? uid(), key: key ?? 'NEW-001',
      desc, sp, priority, status, clientId,
      sprintId: sprintId || null, assignees, tags,
      type: iType, epicId,
      role, need, benefit, criteria, deps, dor, dod, notes,
      deadline: deadline.type === 'none' ? undefined : deadline,
      createdAt: item?.createdAt ?? new Date().toISOString(),
    }
    onSave(saved)
  }

  /* helpers */
  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }
  function addDep(id: string) { if (!deps.includes(id)) setDeps([...deps, id]); setDepSearch('') }
  function addCriterion() {
    if (!newCrit.given && !newCrit.when && !newCrit.then) return
    setCriteria([...criteria, { id: uid(), ...newCrit }])
    setNewCrit({ given: '', when: '', then: '' })
  }
  function updateCrit(id: string, field: 'given' | 'when' | 'then', val: string) {
    setCriteria(criteria.map(c => c.id === id ? { ...c, [field]: val } : c))
  }

  /* Tabs config */
  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: 'Général' },
    { id: 'us',      label: 'User Story' },
    { id: 'bdd',     label: criteria.length ? `BDD (${criteria.length})` : 'BDD' },
    { id: 'deps',    label: deps.length ? `Dép. (${deps.length})` : 'Dép.' },
    { id: 'dordod',  label: 'DoR / DoD' },
  ]

  const dorDone = dor.filter(x => x.done).length
  const dodDone = dod.filter(x => x.done).length

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <select value={iType} onChange={e => setIType(e.target.value as ItemType)}
              className="form-input form-select" style={{ width: 130, flexShrink: 0 }}>
              {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {item?.key && (
              <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, padding: '2px 8px',
                background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 6, flexShrink: 0 }}>
                {item.key}
              </span>
            )}
            {isNew && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Clé générée à la création</span>}
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`modal-tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* ── Général ── */}
          {tab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Description *</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)}
                  placeholder={iType === 'epic' ? "Nom de l'Epic…" : "Description de l'item…"}
                  style={{ minHeight: 60 }} autoFocus />
              </div>

              {iType !== 'epic' && epics.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Epic parent</label>
                  <select value={epicId ?? ''} onChange={e => setEpicId(e.target.value || null)}
                    className="form-input form-select">
                    <option value="">— Aucun —</option>
                    {epics.map(e => <option key={e.id} value={e.id}>{e.key} – {e.desc}</option>)}
                  </select>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Client</label>
                  <select value={clientId} onChange={e => setClientId(e.target.value)}
                    className="form-input form-select">
                    {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sprint</label>
                  <select value={sprintId ?? ''} onChange={e => setSprintId(e.target.value || null)}
                    className="form-input form-select">
                    <option value="">Non assigné</option>
                    {state.sprints.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Story Points</label>
                  <input type="number" min={0} max={200} value={sp}
                    onChange={e => setSp(parseInt(e.target.value) || 0)} className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Priorité</label>
                  <select value={priority} onChange={e => setPriority(e.target.value as Item['priority'])}
                    className="form-input form-select">
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Statut</label>
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    className="form-input form-select">
                    {state.kanbanCols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date de livraison</label>
                  <input type="date" value={deadline.date}
                    onChange={e => setDeadline({ ...deadline, date: e.target.value })}
                    className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Type de deadline</label>
                  <select value={deadline.type}
                    onChange={e => setDeadline({ ...deadline, type: e.target.value as Deadline['type'] })}
                    className="form-input form-select">
                    <option value="none">Aucune</option>
                    <option value="imposed">Imposée (non négociable)</option>
                    <option value="negotiable">Négociable</option>
                  </select>
                </div>
              </div>

              {/* Assignees */}
              <div className="form-group">
                <label className="form-label">Assignés</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {state.team.map(m => {
                    const sel = assignees.includes(m.id)
                    return (
                      <div key={m.id}
                        className={`assignee-chip-select${sel ? ' selected' : ''}`}
                        onClick={() => setAssignees(prev => prev.includes(m.id)
                          ? prev.filter(x => x !== m.id) : [...prev, m.id])}>
                        <div className="assignee-dot">
                          {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <span>{m.name.split(' ')[0]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tags */}
              <div className="form-group">
                <label className="form-label">Tags</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {tags.map(t => (
                    <span key={t} className="tag" style={{ cursor: 'pointer' }}
                      onClick={() => setTags(tags.filter(x => x !== t))}>{t} ✕</span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="form-input" value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder="Ajouter un tag (Entrée)" />
                  <button className="btn btn-secondary" type="button" onClick={addTag}>+</button>
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">Notes internes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Notes, liens, contexte…" style={{ minHeight: 72 }} />
              </div>
            </div>
          )}

          {/* ── User Story ── */}
          {tab === 'us' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="us-block">
                <div className="form-label" style={{ marginBottom: 12 }}>Format User Story</div>
                {([ ['En tant que', role, setRole, 'profil utilisateur…'],
                    ['je souhaite', need, setNeed, 'action ou fonctionnalité…'],
                    ['afin de',     benefit, setBenefit, 'bénéfice ou objectif métier…'],
                ] as [string, string, (v: string) => void, string][]).map(([label, val, setter, ph]) => (
                  <div key={label} className="us-row">
                    <span className="us-prefix">{label}</span>
                    <input className="form-input us-input" value={val}
                      onChange={e => setter(e.target.value)} placeholder={ph} />
                  </div>
                ))}
              </div>
              {(role || need || benefit) && (
                <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '10px 14px',
                  fontSize: 12, color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.6 }}>
                  {role && <><strong>En tant que</strong> {role}</>}
                  {need && <>, <strong>je souhaite</strong> {need}</>}
                  {benefit && <>, <strong>afin de</strong> {benefit}</>}.
                </div>
              )}
            </div>
          )}

          {/* ── Critères BDD ── */}
          {tab === 'bdd' && (
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
                Format Gherkin — décrivez les scénarios d'acceptation de l'item.
              </p>
              {criteria.map((c, idx) => (
                <div key={c.id} className="bdd-block">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>CRITÈRE {idx + 1}</span>
                    <button onClick={() => setCriteria(criteria.filter(x => x.id !== c.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14 }}>✕</button>
                  </div>
                  {(['given', 'when', 'then'] as const).map(field => {
                    const labels = { given: 'Étant donné que', when: 'Quand', then: 'Alors' }
                    const colors = { given: '#059669', when: '#1d4ed8', then: '#be185d' }
                    const phs = { given: 'contexte initial…', when: 'action déclencheur…', then: 'résultat attendu…' }
                    return (
                      <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: colors[field],
                          minWidth: 100, textAlign: 'right', flexShrink: 0 }}>{labels[field]}</span>
                        <input className="form-input" value={c[field]}
                          onChange={e => updateCrit(c.id, field, e.target.value)}
                          placeholder={phs[field]} style={{ fontSize: 12 }} />
                      </div>
                    )
                  })}
                </div>
              ))}
              {/* New criterion */}
              <div className="bdd-block" style={{ borderStyle: 'dashed' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>NOUVEAU CRITÈRE</div>
                {(['given', 'when', 'then'] as const).map(field => {
                  const labels = { given: 'Étant donné que', when: 'Quand', then: 'Alors' }
                  const colors = { given: '#059669', when: '#1d4ed8', then: '#be185d' }
                  const phs = { given: 'contexte initial…', when: 'action déclencheur…', then: 'résultat attendu…' }
                  return (
                    <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: colors[field],
                        minWidth: 100, textAlign: 'right', flexShrink: 0 }}>{labels[field]}</span>
                      <input className="form-input" value={newCrit[field]}
                        onChange={e => setNewCrit({ ...newCrit, [field]: e.target.value })}
                        placeholder={phs[field]} style={{ fontSize: 12 }}
                        onKeyDown={e => e.key === 'Enter' && field === 'then' && addCriterion()} />
                    </div>
                  )
                })}
                <button className="hdr-ctx-btn" onClick={addCriterion}
                  style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}>
                  + Ajouter ce critère
                </button>
              </div>
            </div>
          )}

          {/* ── Dépendances ── */}
          {tab === 'deps' && (
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                Lier des items dont celui-ci dépend — ils doivent être livrés avant.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 36, padding: '8px 12px',
                background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14 }}>
                {deps.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', alignSelf: 'center' }}>Aucune dépendance</span>
                )}
                {deps.map(depId => {
                  const di = state.items.find(i => i.id === depId)
                  if (!di) return null
                  return (
                    <span key={depId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: 'var(--primary-light)', color: 'var(--primary)',
                      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                      {di.key}
                      <button onClick={() => setDeps(deps.filter(x => x !== depId))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit',
                          fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                    </span>
                  )
                })}
              </div>
              <div style={{ position: 'relative' }}>
                <input className="form-input" placeholder="Rechercher par clé ou description…"
                  value={depSearch} onChange={e => setDepSearch(e.target.value)} />
                {depResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 100, marginTop: 2 }}>
                    {depResults.map(r => {
                      const cl = state.clients.find(c => c.id === r.clientId)
                      return (
                        <div key={r.id} onClick={() => addDep(r.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                            cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                          className="dep-result-row">
                          <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                            color: cl?.color ?? 'var(--primary)', flexShrink: 0 }}>{r.key}</span>
                          <span style={{ fontSize: 12, flex: 1, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.desc}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── DoR / DoD ── */}
          {tab === 'dordod' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* DoR */}
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
                      placeholder="Nouveau critère…" style={{ fontSize: 11 }} />
                    <button className="btn btn-secondary" onClick={section.add} style={{ flexShrink: 0 }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {isNew ? 'Créer' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
