import { useState, useRef, useMemo, useEffect } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { BASE_TAGS } from '../data/baseTags'
import { frenchHolidays, countWorkdays } from '../data/holidays'
import { fmtDate } from '../utils/fmt'
import type { TeamMember, Absence, AbsenceType, Sprint } from '../types'

function Svg({ d, size = 14 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
}
const ICO_PENCIL  = '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'
const ICO_TRASH   = '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
const ICO_PARASOL = '<path d="M12.5 11.134 18.196 21"/><path d="M20.425 5.299a10 10 0 0 0-16.941 9.78c.183.563.843.774 1.355.478L20.16 6.711c.512-.296.66-.973.264-1.413"/><path d="M21 21H3"/>'

const ROLE_OPTIONS = ['Product Owner', 'Scrum Master', 'Dev Front', 'Dev Back', 'Dev Full-stack', 'Designer', 'QA', 'DevOps', 'Data Scientist', 'Autre']
const ABSENCE_TYPES: AbsenceType[] = ['Congés payés', 'Formation', 'Urgence', 'Maladie', 'Autre']
const ABSENCE_COLORS: Record<AbsenceType, string> = {
  'Congés payés': '#1d4ed8', 'Formation': '#15803d', 'Urgence': '#dc2626', 'Maladie': '#d97706', 'Autre': '#6b7280',
}

function uid() { return Math.random().toString(36).slice(2, 9) }
function initials(name: string) { return name.split(' ').map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) }

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
function memberColor(id: string) { return COLORS[id.charCodeAt(id.length - 1) % COLORS.length] }

function absenceStatus(a: Absence): 'En cours' | 'Planifiée' | 'Terminée' {
  const today = new Date().toISOString().split('T')[0]
  if (a.end < today) return 'Terminée'
  if (a.start <= today) return 'En cours'
  return 'Planifiée'
}

/** Calcule l'impact d'une absence sur chaque sprint */
function sprintImpact(absence: Absence, sprints: Sprint[], spPerDay: number) {
  return sprints
    .filter(s => s.startDate && s.endDate)
    .filter(s => !(s.endDate < absence.start || s.startDate > absence.end))
    .map(s => {
      const overlapStart = absence.start > s.startDate ? absence.start : s.startDate
      const overlapEnd   = absence.end < s.endDate     ? absence.end   : s.endDate
      const days = countWorkdays(overlapStart, overlapEnd)
      const sp   = Math.round(days * spPerDay * 10) / 10
      return { sprint: s, overlapStart, overlapEnd, days, sp }
    })
}

// ── PhotoCropModal ────────────────────────────────────────────────────────────

interface CropModalProps { src: string; onConfirm: (cropped: string) => void; onCancel: () => void }

function PhotoCropModal({ src, onConfirm, onCancel }: CropModalProps) {
  const SIZE = 220
  const [pos, setPos]   = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, px: 0, py: 0 })
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const img = new window.Image()
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
  }, [src])

  const coverScale = naturalSize
    ? Math.max(SIZE / naturalSize.w, SIZE / naturalSize.h)
    : 1
  const displayW = naturalSize ? naturalSize.w * coverScale * scale : SIZE
  const displayH = naturalSize ? naturalSize.h * coverScale * scale : SIZE

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setDragging(true)
    setDragStart({ mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y })
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    setPos({ x: dragStart.px + e.clientX - dragStart.mx, y: dragStart.py + e.clientY - dragStart.my })
  }
  function onMouseUp() { setDragging(false) }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setScale(s => Math.max(0.5, Math.min(6, s + (e.deltaY < 0 ? 0.08 : -0.08))))
  }

  function confirm() {
    if (!naturalSize) { onConfirm(src); return }
    const OUT = 400  // max 500px demandé — 400 pour le cercle d'avatar
    const canvas = document.createElement('canvas')
    canvas.width = OUT; canvas.height = OUT
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2)
    ctx.clip()
    const img = new window.Image()
    img.onload = () => {
      try {
        const r = OUT / SIZE
        const w = naturalSize.w * coverScale * scale * r
        const h = naturalSize.h * coverScale * scale * r
        const x = (OUT - w) / 2 + pos.x * r
        const y = (OUT - h) / 2 + pos.y * r
        ctx.drawImage(img, x, y, w, h)
        onConfirm(canvas.toDataURL('image/webp', 0.80))
      } catch {
        // CORS sur URL externe — retourner la src telle quelle
        onConfirm(src)
      }
    }
    img.crossOrigin = 'anonymous'
    img.src = src
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ width: 340 }}>
        <div className="modal-header">
          <h2 className="modal-title">Recadrer la photo</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body" style={{ alignItems: 'center', gap: 14 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
            Glisser pour repositionner · Molette pour zoomer
          </p>
          <div
            style={{
              width: SIZE, height: SIZE, borderRadius: '50%', overflow: 'hidden',
              cursor: dragging ? 'grabbing' : 'grab', border: '3px solid var(--primary)',
              userSelect: 'none', position: 'relative', flexShrink: 0, background: '#000',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
          >
            <img
              ref={imgRef}
              src={src}
              draggable={false}
              alt="crop"
              style={{
                position: 'absolute',
                width: displayW, height: displayH,
                left: '50%', top: '50%',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                pointerEvents: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: SIZE }}>
            <span style={{ fontSize: 14 }}>−</span>
            <input type="range" min={50} max={600} value={Math.round(scale * 100)}
              onChange={e => setScale(+e.target.value / 100)} style={{ flex: 1 }} />
            <span style={{ fontSize: 14 }}>+</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>Annuler</button>
          <button className="btn-primary" onClick={confirm}>Confirmer</button>
        </div>
      </div>
    </div>
  )
}

// ── MemberModal ───────────────────────────────────────────────────────────────

interface MemberModalProps { member: TeamMember | null; onSave: (m: TeamMember) => void; onClose: () => void }

function MemberModal({ member, onSave, onClose }: MemberModalProps) {
  const { state } = useCadence()
  const allTags = useMemo(() => [...new Set([...BASE_TAGS, ...(state.customTags ?? [])])], [state.customTags])

  const [form, setForm] = useState<TeamMember>(
    member ?? { id: uid(), name: '', role: 'Dev Full-stack', spPerDay: 2, tags: [] }
  )
  const [tagInput, setTagInput]     = useState('')
  const [showTagSug, setShowTagSug] = useState(false)
  const [photoMode, setPhotoMode]   = useState<'upload' | 'url'>('upload')
  const [urlInput, setUrlInput]     = useState(form.photo?.startsWith('http') ? form.photo : '')
  const [cropSrc, setCropSrc]       = useState<string | null>(null) // raw image for crop
  const fileRef = useRef<HTMLInputElement>(null)

  const tagSuggestions = tagInput.trim()
    ? allTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !form.tags.includes(t)).slice(0, 8)
    : allTags.filter(t => !form.tags.includes(t)).slice(0, 8)

  function addTag(val?: string) {
    const t = (val ?? tagInput).trim()
    if (!t || form.tags.includes(t)) { setTagInput(''); setShowTagSug(false); return }
    setForm(f => ({ ...f, tags: [...f.tags, t] }))
    setTagInput('')
    setShowTagSug(false)
  }

  /** Redimensionne l'image à max maxPx px, convertit en WebP 85% */
  function resizeImage(src: string, maxPx: number): Promise<string> {
    return new Promise(resolve => {
      const img = new window.Image()
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight
        if (w > maxPx || h > maxPx) {
          const r = Math.min(maxPx / w, maxPx / h)
          w = Math.round(w * r); h = Math.round(h * r)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/webp', 0.85))
      }
      img.src = src
    })
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      if (dataUrl) setCropSrc(dataUrl)
    }
    reader.onerror = () => console.error('FileReader error')
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function applyUrl() {
    const u = urlInput.trim()
    setForm(f => ({ ...f, photo: u || undefined }))
  }

  return (
    <>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="modal" style={{ width: 500 }}>
          <div className="modal-header">
            <h2 className="modal-title">{member ? 'Modifier le membre' : 'Nouveau membre'}</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Avatar — input HORS du div cliquable pour éviter la propagation infinie */}
            <input
              ref={fileRef} type="file" accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <div className="form-group">
              <label className="form-label">Photo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Cercle aperçu — cliquable uniquement en mode upload */}
                <div
                  className="avatar-upload"
                  style={{ background: form.photo ? 'transparent' : memberColor(form.id), cursor: photoMode === 'upload' ? 'pointer' : 'default' }}
                  onClick={() => { if (photoMode === 'upload') fileRef.current?.click() }}
                  title={photoMode === 'upload' ? 'Cliquer pour choisir une image' : ''}
                >
                  {form.photo
                    ? <img src={form.photo} alt="avatar" />
                    : <span style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>{initials(form.name) || '?'}</span>
                  }
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button className={photoMode === 'upload' ? 'hdr-btn primary' : 'hdr-ctx-btn'} style={{ fontSize: 11 }}
                      onClick={() => { setPhotoMode('upload'); fileRef.current?.click() }}>Fichier</button>
                    <button className={photoMode === 'url' ? 'hdr-btn primary' : 'hdr-ctx-btn'} style={{ fontSize: 11 }}
                      onClick={() => setPhotoMode('url')}>URL</button>
                    {form.photo && (
                      <button className="hdr-ctx-btn" style={{ fontSize: 11, color: 'var(--danger)' }}
                        onClick={() => { setForm(f => ({ ...f, photo: undefined })); setUrlInput('') }}>
                        Supprimer
                      </button>
                    )}
                    {form.photo && (
                      <button className="hdr-ctx-btn" style={{ fontSize: 11 }}
                        onClick={() => { form.photo && setCropSrc(form.photo) }}>
                        Recadrer
                      </button>
                    )}
                  </div>
                  {photoMode === 'url' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="https://..."
                        value={urlInput} onChange={e => setUrlInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && applyUrl()} />
                      <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={applyUrl}>OK</button>
                    </div>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    JPG · PNG · GIF · WebP · Redimensionné automatiquement (max 500 px, WebP)
                  </span>
                </div>
              </div>
            </div>

            {/* Nom */}
            <div className="form-group">
              <label className="form-label">Nom *</label>
              <input className="form-input" value={form.name} autoFocus
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Prénom Nom" />
            </div>

            {/* Rôle */}
            <div className="form-group">
              <label className="form-label">Rôle</label>
              <select className="form-input form-select" value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>

            {/* SP/jour */}
            <div className="form-group">
              <label className="form-label">SP / jour</label>
              <input className="form-input" type="number" min={0.5} max={10} step={0.5}
                value={form.spPerDay} onChange={e => setForm(f => ({ ...f, spPerDay: +e.target.value }))}
                style={{ width: 100 }} />
            </div>

            {/* Compétences */}
            <div className="form-group">
              <label className="form-label">Compétences</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {form.tags.map(t => (
                  <span key={t} className="tag">
                    {t} <span style={{ cursor: 'pointer', opacity: .7, marginLeft: 3 }}
                      onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))}>×</span>
                  </span>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <input className="form-input" placeholder="Ajouter une compétence…" value={tagInput}
                  onChange={e => { setTagInput(e.target.value); setShowTagSug(true) }}
                  onFocus={() => setShowTagSug(true)}
                  onBlur={() => setTimeout(() => setShowTagSug(false), 150)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag() }
                    if (e.key === 'Escape') { setTagInput(''); setShowTagSug(false) }
                  }} />
                {showTagSug && tagSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 200,
                    background: 'var(--surface)', border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-md)', marginBottom: 2, overflow: 'hidden',
                  }}>
                    {tagSuggestions.map(s => (
                      <div key={s} onMouseDown={() => addTag(s)}
                        style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-light)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn-primary" disabled={!form.name.trim()}
              onClick={() => { if (form.name.trim()) onSave({ ...form, name: form.name.trim() }) }}>
              {member ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </div>

      {cropSrc && (
        <PhotoCropModal
          src={cropSrc}
          onConfirm={cropped => { setForm(f => ({ ...f, photo: cropped })); setCropSrc(null) }}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </>
  )
}

// ── AbsenceModal ──────────────────────────────────────────────────────────────

interface AbsenceModalProps { absence: Absence | null; onSave: (a: Absence) => void; onClose: () => void }

function AbsenceModal({ absence, onSave, onClose }: AbsenceModalProps) {
  const { state } = useCadence()
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState<Absence>(absence ?? {
    id: uid(), memberId: state.team[0]?.id ?? '',
    type: 'Congés payés', title: '', start: today, end: today,
  })

  const member = state.team.find(m => m.id === form.memberId)
  const days   = form.start && form.end && form.end >= form.start ? countWorkdays(form.start, form.end) : 0
  const spLost = member ? Math.round(days * member.spPerDay * 10) / 10 : 0
  const impacts = member && form.start && form.end
    ? sprintImpact(form, state.sprints, member.spPerDay)
    : []

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-header">
          <h2 className="modal-title">{absence ? "Modifier l'absence" : '🏖 Ajouter une absence'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div className="form-group">
            <label className="form-label">Membre</label>
            <select className="form-input form-select" value={form.memberId}
              onChange={e => setForm(f => ({ ...f, memberId: e.target.value }))}>
              {state.team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Titre</label>
            <input className="form-input" value={form.title} placeholder="Congés été…"
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-input form-select" value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as AbsenceType }))}>
              {ABSENCE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Début</label>
              <input className="form-input" type="date" value={form.start}
                onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Fin</label>
              <input className="form-input" type="date" value={form.end} min={form.start}
                onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
            </div>
          </div>

          {/* Résumé */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{days}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Jours ouvrés</div>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)' }}>{spLost}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>SP perdus (total)</div>
            </div>
          </div>

          {/* Impact par sprint */}
          {impacts.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                Impact par sprint
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>Sprint</th>
                    <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>Période couverte</th>
                    <th style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>Jours</th>
                    <th style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>SP perdus</th>
                  </tr>
                </thead>
                <tbody>
                  {impacts.map(({ sprint, overlapStart, overlapEnd, days: d, sp }) => (
                    <tr key={sprint.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                        Sprint {sprint.number}{sprint.label ? ` – ${sprint.label}` : ''}
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>
                        {fmtDate(overlapStart)} → {fmtDate(overlapEnd)}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>{d}j</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--danger)' }}>{sp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {state.sprints.filter(s => s.startDate).length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Renseignez les dates des sprints dans la page Planning pour voir l'impact par sprint.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary"
            disabled={!form.memberId || !form.title.trim() || !form.start || !form.end || form.end < form.start}
            onClick={() => onSave({ ...form, title: form.title.trim() })}>
            {absence ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export function TeamPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [memberModal,  setMemberModal]  = useState<TeamMember | null | undefined>(undefined)
  const [absenceModal, setAbsenceModal] = useState<Absence | null | undefined>(undefined)

  const today  = new Date().toISOString().split('T')[0]
  const year   = new Date().getFullYear()
  const absences = state.absences ?? []

  const holidays = useMemo(() => frenchHolidays(year), [year])

  // SP perdus par jour férié ouvré = somme spPerDay de toute l'équipe
  const teamSPPerDay = state.team.reduce((s, m) => s + m.spPerDay, 0)
  const holidaysWithSP = holidays.map(h => ({
    ...h,
    spLost: h.workday ? teamSPPerDay : 0,
  }))
  const totalHolidaySP = holidaysWithSP.reduce((s, h) => s + h.spLost, 0)

  const sortedAbsences = [...absences].sort((a, b) => {
    const order = { 'En cours': 0, 'Planifiée': 1, 'Terminée': 2 }
    return order[absenceStatus(a)] - order[absenceStatus(b)] || a.start.localeCompare(b.start)
  })

  function handleSaveMember(m: TeamMember) {
    const isNew = !state.team.find(t => t.id === m.id)
    dispatch({ type: isNew ? 'ADD_MEMBER' : 'UPDATE_MEMBER', payload: m })
    const newTeam = isNew ? [...state.team, m] : state.team.map(t => t.id === m.id ? m : t)
    saveToServer({ ...state, team: newTeam })
    setMemberModal(undefined)
  }

  function handleDeleteMember(id: string) {
    if (!confirm('Supprimer ce membre ?')) return
    dispatch({ type: 'DELETE_MEMBER', payload: id })
    saveToServer({ ...state, team: state.team.filter(t => t.id !== id) })
  }

  function handleSaveAbsence(a: Absence) {
    const isNew = !absences.find(x => x.id === a.id)
    dispatch({ type: isNew ? 'ADD_ABSENCE' : 'UPDATE_ABSENCE', payload: a })
    setAbsenceModal(undefined)
  }

  function handleDeleteAbsence(id: string) {
    if (!confirm('Supprimer cette absence ?')) return
    dispatch({ type: 'DELETE_ABSENCE', payload: id })
  }

  const totalCap = state.team.reduce((s, m) => s + m.spPerDay, 0)

  return (
    <>
      <Header title="Équipe">
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {state.team.length} membres · {totalCap} SP/jour
        </span>
        <div className="hdr-sep" />
        <button className="hdr-ctx-btn" onClick={() => setAbsenceModal(null)}>+ Absence</button>
        <button className="hdr-btn primary" onClick={() => setMemberModal(null)}>+ Membre</button>
      </Header>

      <div className="page-content">

        {/* ── Grille membres ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
          {state.team.map(m => {
            const color = memberColor(m.id)
            const assignedItems   = state.items.filter(i => i.assignees.includes(m.id))
            const inProgress      = assignedItems.filter(i => !['done','delivered'].includes(i.status))
            const done            = assignedItems.filter(i => ['done','delivered'].includes(i.status))
            const currentAbsence  = absences.find(a => a.start <= today && a.end >= today && a.memberId === m.id)

            return (
              <div key={m.id} data-testid="member-card" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div className="team-card-avatar" style={{ background: `${color}22` }}>
                  {m.photo
                    ? <img src={m.photo} alt={m.name} />
                    : <span style={{ zIndex: 1, fontSize: 28, fontWeight: 800, color }}>{initials(m.name)}</span>
                  }
                  <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                    <button className="btn-icon" onClick={() => setMemberModal(m)} title="Modifier"><Svg d={ICO_PENCIL} size={13} /></button>
                    <button className="btn-icon danger" onClick={() => handleDeleteMember(m.id)} title="Supprimer"><Svg d={ICO_TRASH} size={13} /></button>
                  </div>
                </div>

                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.role}</div>
                    <div className={`team-card-absence ${currentAbsence ? 'absence-active' : 'absence-none'}`}>
                      {currentAbsence ? `🏖 ${currentAbsence.title}` : '✅ Disponible'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { val: m.spPerDay, label: 'SP/jour', color: 'var(--primary)' },
                      { val: inProgress.length, label: 'En cours', color: 'var(--warning)' },
                      { val: done.length, label: 'Terminées', color: 'var(--success)' },
                    ].map(({ val, label, color: c }) => (
                      <div key={label} style={{ flex: 1, background: 'var(--surface2)', borderRadius: 8, padding: '6px 0', textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{val}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {m.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {m.tags.map(t => <span key={t} className="tag" style={{ fontSize: 10 }}>{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Panel absences ── */}
        <div className="absences-panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Svg d={ICO_PARASOL} size={15} /> Absences planifiées
            </span>
            <button className="hdr-ctx-btn" style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setAbsenceModal(null)}>+ Ajouter</button>
          </div>
          {sortedAbsences.length === 0 ? (
            <p style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Aucune absence enregistrée.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="absence-table">
                <thead>
                  <tr>
                    <th>Membre</th>
                    <th>Titre</th>
                    <th>Type</th>
                    <th>Début</th>
                    <th>Fin</th>
                    <th>Jours</th>
                    <th>SP perdus</th>
                    <th>Sprints</th>
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAbsences.map(a => {
                    const m  = state.team.find(x => x.id === a.memberId)
                    const st = absenceStatus(a)
                    const d  = countWorkdays(a.start, a.end)
                    const sp = m ? Math.round(d * m.spPerDay * 10) / 10 : '—'
                    const tc = ABSENCE_COLORS[a.type]
                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{m?.name ?? '—'}</td>
                        <td>{a.title}</td>
                        <td>
                          <span style={{ padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: `${tc}20`, color: tc }}>
                            {a.type}
                          </span>
                        </td>
                        <td>{fmtDate(a.start)}</td>
                        <td>{fmtDate(a.end)}</td>
                        <td style={{ textAlign: 'center' }}>{d}j</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--danger)' }}>{sp}</td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {m
                              ? sprintImpact(a, state.sprints, m.spPerDay).map(({ sprint }) => (
                                  <span key={sprint.id} style={{ padding: '1px 6px', borderRadius: 99, fontSize: 9, fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                                    S{sprint.number}
                                  </span>
                                ))
                              : null
                            }
                          </div>
                        </td>
                        <td>
                          <span className={`absence-status ${st === 'En cours' ? 'status-active' : st === 'Planifiée' ? 'status-planned' : 'status-done'}`}>
                            {st}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn-icon" onClick={() => setAbsenceModal(a)} title="Modifier"><Svg d={ICO_PENCIL} size={12} /></button>
                          <button className="btn-icon danger" onClick={() => handleDeleteAbsence(a.id)} title="Supprimer"><Svg d={ICO_TRASH} size={12} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Panel jours fériés ── */}
        <div className="holidays-panel">
          <div className="panel-header">
            <span>🇫🇷 Jours fériés {year}</span>
            {teamSPPerDay > 0 && (
              <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>
                Total : {Math.round(totalHolidaySP * 10) / 10} SP perdus/an
              </span>
            )}
          </div>
          <div className="holidays-grid">
            {holidaysWithSP.map(h => (
              <div key={h.date} className={`holiday-chip ${h.workday ? '' : 'holiday-weekend'}`}
                title={h.workday && h.spLost > 0 ? `${h.spLost} SP perdus (équipe)` : 'Tombe un week-end'}>
                <span style={{ fontSize: 10, opacity: .7, minWidth: 42, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDate(h.date).slice(0, 5)}
                </span>
                <span style={{ flex: 1 }}>{h.name}</span>
                {h.workday && h.spLost > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', opacity: .85 }}>
                    −{h.spLost} SP
                  </span>
                )}
                {!h.workday && <span style={{ fontSize: 9, opacity: .5 }}>WE</span>}
              </div>
            ))}
          </div>
        </div>

      </div>

      {memberModal !== undefined && (
        <MemberModal member={memberModal} onSave={handleSaveMember} onClose={() => setMemberModal(undefined)} />
      )}
      {absenceModal !== undefined && (
        <AbsenceModal absence={absenceModal} onSave={handleSaveAbsence} onClose={() => setAbsenceModal(undefined)} />
      )}
    </>
  )
}
