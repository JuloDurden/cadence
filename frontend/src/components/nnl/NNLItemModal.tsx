import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useCadence } from '../../context/StateContext'
import type { NNLItem, NNLItemType, NNLZone, Note, NoteAttachment } from '../../types'

// ── Icônes SVG ───────────────────────────────────────────────────────────────
const Svg = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
)
const ICO_CLOSE    = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
const ICO_TRASH    = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>'
const ICO_IMAGE    = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'
const ICO_LINK_ATT = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
const ICO_NOTE     = '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>'
const ICO_LINK_EXT = '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'
const ICO_GENERAL  = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'
const ICO_MEDIA    = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'
const ICO_ATTACH   = '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'
const ICO_VIEW_MODAL    = '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/>'
const ICO_VIEW_SIDE     = '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>'
const ICO_VIEW_FULLPAGE = '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'
const ICO_SEARCH   = '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
const ICO_PLUS     = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
const ICO_PDF      = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'

function uid() { return Math.random().toString(36).slice(2, 9) }

function luminance(hex: string): number {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 0.5
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

type ModalView = 'modal' | 'side' | 'fullpage'
type Tab = 'general' | 'notes' | 'link'

// Couleurs par défaut par type
const TYPE_COLORS: Record<NNLItemType, string> = {
  feature: '#fbbf24',
  release: '#3b82f6',
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface NNLItemModalProps {
  open:       boolean
  item?:      NNLItem            // undefined = mode création
  defaultZone?: NNLZone
  defaultType?: NNLItemType
  onSave:     (item: NNLItem) => void
  onDelete?:  (id: string) => void
  onClose:    () => void
  /** Ouvrir la ItemModal Backlog pour créer un item lié */
  onCreateLinkedItem?: (onLinked: (itemId: string) => void) => void
}

export function NNLItemModal({
  open, item, defaultZone = 'now', defaultType = 'feature',
  onSave, onDelete, onClose, onCreateLinkedItem,
}: NNLItemModalProps) {
  const { state } = useCadence()

  // ── View mode (persisté comme ItemModal) ────────────────────────────────────
  const [view, setView] = useState<ModalView>(
    () => (localStorage.getItem('nnl-modal-view') as ModalView) ?? 'modal'
  )
  const [sideWidth, setSideWidth] = useState(() =>
    parseInt(localStorage.getItem('nnl-modal-side-width') ?? '520', 10)
  )
  const sideWidthRef  = useRef(sideWidth)
  const resizingRef   = useRef(false)

  function onResizeStart(e: React.MouseEvent) {
    resizingRef.current = true
    const x0 = e.clientX, w0 = sideWidthRef.current
    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return
      const newW = Math.max(360, Math.min(window.innerWidth * 0.8, w0 - (ev.clientX - x0)))
      setSideWidth(newW); sideWidthRef.current = newW
    }
    function onUp() { resizingRef.current = false; localStorage.setItem('nnl-modal-side-width', String(sideWidthRef.current)); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function switchView(v: ModalView) { setView(v); localStorage.setItem('nnl-modal-view', v) }

  // ── Form state ───────────────────────────────────────────────────────────────
  const isEdit = !!item
  const [tab,      setTab]      = useState<Tab>('general')
  const [title,    setTitle]    = useState(item?.text    ?? '')
  const [body,     setBody]     = useState(item?.body    ?? '')
  const [color,    setColor]    = useState(item?.color   ?? TYPE_COLORS[defaultType])
  const [itype,    setItype]    = useState<NNLItemType>(item?.type ?? defaultType)
  const [zone,     setZone]     = useState<NNLZone>(item?.zone ?? defaultZone)
  const [image,    setImage]    = useState<string | undefined>(item?.image)
  const [linkUrl,  setLinkUrl]  = useState(item?.link?.url   ?? '')
  const [linkLabel,setLinkLabel]= useState(item?.link?.label ?? '')
  const [notes,    setNotes]    = useState<Note[]>(item?.notes ?? [])
  const [linkedId, setLinkedId] = useState<string | undefined>(item?.linkedItemId)

  // Note form state
  const [noteText,  setNoteText]  = useState('')
  const [noteAtts,  setNoteAtts]  = useState<NoteAttachment[]>([])
  const [noteLink,  setNoteLink]  = useState(false)
  const [noteLinkUrl,   setNoteLinkUrl]   = useState('')
  const [noteLinkTitle, setNoteLinkTitle] = useState('')

  // Item search state (onglet Rattachement)
  const [search, setSearch] = useState('')

  // Reset when item changes
  useEffect(() => {
    setTab('general')
    setTitle(item?.text    ?? '')
    setBody(item?.body     ?? '')
    setColor(item?.color   ?? TYPE_COLORS[item?.type ?? defaultType])
    setItype(item?.type    ?? defaultType)
    setZone(item?.zone     ?? defaultZone)
    setImage(item?.image)
    setLinkUrl(item?.link?.url   ?? '')
    setLinkLabel(item?.link?.label ?? '')
    setNotes(item?.notes ?? [])
    setLinkedId(item?.linkedItemId)
    setSearch('')
  }, [item?.id, open])

  // Auto-color when type changes (only if color hasn't been manually changed)
  useEffect(() => {
    if (!item?.color) setColor(TYPE_COLORS[itype])
  }, [itype])

  if (!open) return null

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setImage(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleNoteAttUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setNoteAtts(a => [...a, {
      id: uid(), type: file.type.startsWith('image/') ? 'image' : 'pdf',
      name: file.name, url: ev.target?.result as string, mimeType: file.type,
    }])
    reader.readAsDataURL(file)
  }

  function addNoteLink() {
    if (!noteLinkUrl.trim()) return
    setNoteAtts(a => [...a, { id: uid(), type: 'link', name: noteLinkTitle || noteLinkUrl, url: noteLinkUrl }])
    setNoteLinkUrl(''); setNoteLinkTitle(''); setNoteLink(false)
  }

  function submitNote() {
    if (!noteText.trim() && noteAtts.length === 0) return
    setNotes(n => [...n, {
      id: uid(), text: noteText.trim(),
      createdAt: new Date().toISOString(),
      attachments: noteAtts, replies: [],
    }])
    setNoteText(''); setNoteAtts([]); setNoteLink(false)
  }

  function buildItem(): NNLItem {
    return {
      ...(item ?? { id: uid(), x: 0, y: 0 }),
      type:  itype,
      text:  title.trim() || (itype === 'release' ? 'Release X.Y' : 'Nouvelle fonctionnalité'),
      body:  body.trim() || undefined,
      color: color !== TYPE_COLORS[itype] ? color : undefined,
      zone,
      image: image || undefined,
      link:  linkUrl.trim() ? { url: linkUrl.trim(), label: linkLabel.trim() || linkUrl.trim() } : undefined,
      notes: notes.length > 0 ? notes : undefined,
      linkedItemId: linkedId || undefined,
    }
  }

  function handleSave() { onSave(buildItem()); onClose() }

  // Item search results
  const allItems = state.items ?? []
  const filtered = allItems.filter(it =>
    !search.trim() || it.key.toLowerCase().includes(search.toLowerCase()) ||
    it.desc.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20)

  const linkedItem = linkedId ? allItems.find(i => i.id === linkedId) : undefined

  function renderNote(note: Note) {
    return (
      <div key={note.id} className="note-item" style={{ marginBottom: 10 }}>
        <div className="note-header">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {new Date(note.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <button className="btn-icon danger" style={{ padding: 2 }}
            onClick={() => setNotes(n => n.filter(x => x.id !== note.id))}>
            <Svg d={ICO_TRASH} size={11} />
          </button>
        </div>
        {note.text && <div className="note-text">{note.text}</div>}
        {(note.attachments?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {note.attachments.map(att => (
              <a key={att.id} href={att.url} target="_blank" rel="noreferrer"
                className="note-att-chip"
                style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Svg d={att.type === 'link' ? ICO_LINK_ATT : att.type === 'pdf' ? ICO_PDF : ICO_IMAGE} size={10} />
                {att.name}
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  const TABS: Array<{ id: Tab; label: string; icon: string; badge?: number }> = [
    { id: 'general', label: 'Général',      icon: ICO_GENERAL },
    { id: 'notes',   label: 'Notes',        icon: ICO_NOTE,     badge: notes.length || undefined },
    { id: 'link',    label: 'Rattachement', icon: ICO_ATTACH,   badge: linkedItem ? 1 : undefined },
  ]

  // ── Content ──────────────────────────────────────────────────────────────────
  // Palette de couleurs post-it (même que toolbar + turquoise)
  const POSTIT_PALETTE = [
    '#fbbf24', '#f97316', '#ef4444', '#ec4899', '#8b5cf6',
    '#3b82f6', '#22c55e', '#40e0d0', '#1e293b', '#ffffff',
  ]

  function renderGeneral() {
    const ZONES: NNLZone[] = ['now', 'next', 'later']
    const ZL: Record<NNLZone, string> = { now: 'Now', next: 'Next', later: 'Later' }
    return (
      <div className="modal-tab-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Titre */}
        <div>
          <label className="form-label">TITRE</label>
          <input className="form-input" value={title} onChange={e => setTitle(e.target.value)}
            placeholder={itype === 'release' ? 'Release X.Y' : 'Titre du post-it'} autoFocus />
        </div>

        {/* Type + Couleur + Zone */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">TYPE</label>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
              {(['feature', 'release'] as NNLItemType[]).map((t, i) => (
                <button key={t}
                  data-testid={`menu-add-${t}`}
                  onClick={() => setItype(t)} style={{
                    flex: 1, padding: '8px 0', border: 'none',
                    borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                    background: itype === t ? color : 'transparent',
                    color: itype === t ? (luminance(color) < 0.45 ? '#fff' : '#1a0f00') : 'var(--text-muted)',
                    cursor: 'pointer', fontWeight: 700, fontSize: 11, textTransform: 'uppercase',
                  }}>{t === 'feature' ? 'Feature' : 'Release'}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="form-label">COULEUR</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {/* Palette rapide */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {POSTIT_PALETTE.map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{
                    width: 20, height: 20, borderRadius: 4, border: c === color ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: c, padding: 0, cursor: 'pointer', boxSizing: 'border-box',
                  }} />
                ))}
              </div>
              {/* Sélecteur libre */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 5, background: color, border: '2px solid var(--border)', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                  <input type="color" value={color} onChange={e => setColor(e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{color}</span>
              </div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">ZONE</label>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
              {ZONES.map((z, i) => (
                <button key={z} onClick={() => setZone(z)} style={{
                  flex: 1, padding: '8px 0', border: 'none',
                  borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                  background: zone === z ? 'var(--primary)' : 'transparent',
                  color: zone === z ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 700, fontSize: 10, textTransform: 'uppercase',
                }}>{ZL[z]}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Corps */}
        <div>
          <label className="form-label">DESCRIPTION</label>
          <textarea className="form-input" rows={4} value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Description, détails, points clés…"
            style={{ resize: 'vertical', lineHeight: 1.5 }} />
        </div>

        {/* Image */}
        <div>
          <label className="form-label">IMAGE</label>
          {image ? (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={image} alt="aperçu" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
              <button className="btn-icon danger" style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.5)', color: '#fff', borderRadius: 4 }}
                onClick={() => setImage(undefined)}><Svg d={ICO_CLOSE} size={12} /></button>
            </div>
          ) : (
            <label className="nnl-dropzone" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 0', borderRadius: 8, border: '2px dashed var(--border)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>
              <Svg d={ICO_IMAGE} size={22} />
              <span>Glisser-déposer ou cliquer pour ajouter une image</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
            </label>
          )}
        </div>

        {/* Lien */}
        <div>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Svg d={ICO_LINK_EXT} size={11} /> LIEN
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" style={{ flex: 2 }} value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" />
            <input className="form-input" style={{ flex: 1 }} value={linkLabel}
              onChange={e => setLinkLabel(e.target.value)} placeholder="Label (optionnel)" />
          </div>
        </div>
      </div>
    )
  }

  function renderNotes() {
    return (
      <div className="modal-tab-body">
        {notes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            Aucune note. Ajoutez la première ci-dessous.
          </div>
        )}
        {notes.map(renderNote)}

        {/* Formulaire de nouvelle note */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
          <textarea className="form-input" rows={3} value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Ajouter une note…" style={{ resize: 'none', marginBottom: 6 }} />
          {noteAtts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              {noteAtts.map(att => (
                <span key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '2px 6px', background: 'var(--surface2)', borderRadius: 4 }}>
                  <Svg d={att.type === 'link' ? ICO_LINK_ATT : ICO_IMAGE} size={10} />
                  {att.name}
                  <button onClick={() => setNoteAtts(a => a.filter(x => x.id !== att.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}>×</button>
                </span>
              ))}
            </div>
          )}
          {noteLink && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input className="form-input" placeholder="URL" value={noteLinkUrl} onChange={e => setNoteLinkUrl(e.target.value)} style={{ flex: 2, fontSize: 11 }} />
              <input className="form-input" placeholder="Titre (opt.)" value={noteLinkTitle} onChange={e => setNoteLinkTitle(e.target.value)} style={{ flex: 1, fontSize: 11 }} />
              <button className="btn btn-secondary" onClick={addNoteLink} style={{ fontSize: 11 }}>OK</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label className="btn-icon" title="Image" style={{ cursor: 'pointer' }}>
              <Svg d={ICO_IMAGE} size={14} />
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleNoteAttUpload} />
            </label>
            <button className="btn-icon" title="Lien" onClick={() => setNoteLink(l => !l)}>
              <Svg d={ICO_LINK_ATT} size={14} />
            </button>
            <button className="btn btn-primary" style={{ marginLeft: 'auto', fontSize: 12 }}
              onClick={submitNote} disabled={!noteText.trim() && noteAtts.length === 0}>
              Ajouter
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderLinkTab() {
    return (
      <div className="modal-tab-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Item lié actuel */}
        {linkedItem && (
          <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>{linkedItem.key}</span>
            <span style={{ flex: 1, fontSize: 12 }}>{linkedItem.desc}</span>
            <button className="btn-icon danger" onClick={() => setLinkedId(undefined)}>
              <Svg d={ICO_CLOSE} size={12} />
            </button>
          </div>
        )}

        {/* Créer un nouvel item */}
        {onCreateLinkedItem && (
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
            onClick={() => onCreateLinkedItem(id => setLinkedId(id))}>
            <Svg d={ICO_PLUS} size={13} /> Créer un item dans le Backlog
          </button>
        )}

        {/* Recherche item existant */}
        <div>
          <label className="form-label">RECHERCHER UN ITEM EXISTANT</label>
          <div style={{ position: 'relative' }}>
            <Svg d={ICO_SEARCH} size={14} />
            <input className="form-input" style={{ paddingLeft: 28 }} value={search}
              onChange={e => setSearch(e.target.value)} placeholder="Clé ou description…" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
          {filtered.length === 0 && search && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Aucun résultat</div>
          )}
          {filtered.map(it => (
            <button key={it.id}
              onClick={() => setLinkedId(it.id === linkedId ? undefined : it.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                border: `1px solid ${it.id === linkedId ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 7, background: it.id === linkedId ? 'var(--primary-light)' : 'transparent',
                cursor: 'pointer', textAlign: 'left',
              }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>{it.key}</span>
              <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.desc}</span>
              {it.id === linkedId && <span style={{ color: 'var(--primary)', fontSize: 10 }}>✓</span>}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Shared inner content ─────────────────────────────────────────────────────
  // NOTE: must be a JSX variable, NOT `function Inner()` — defining a function
  // component inside the render function causes React to remount the entire tree
  // on every render, which loses focus after each keystroke.
  const inner = (
    <>
      {/* Header */}
      <div className="modal-header" style={{ gap: 8 }}>
        <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0, display: 'inline-block' }} />
          {isEdit ? title || 'Post-it' : 'Nouveau Post-it'}
        </span>
        {/* View switcher */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
          {([['modal', ICO_VIEW_MODAL], ['side', ICO_VIEW_SIDE], ['fullpage', ICO_VIEW_FULLPAGE]] as [ModalView, string][]).map(([v, ico]) => (
            <button key={v} className={`btn-icon${view === v ? ' active' : ''}`}
              onClick={() => switchView(v)} style={{ opacity: view === v ? 1 : 0.5 }}>
              <Svg d={ico} size={14} />
            </button>
          ))}
        </div>
        <button className="modal-close btn-icon" onClick={onClose}><Svg d={ICO_CLOSE} size={16} /></button>
      </div>

      {/* Tabs */}
      <div className="modal-tabs">
        {TABS.map(t => (
          <button key={t.id}
            className={`modal-tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}>
            <Svg d={t.icon} size={12} />
            {t.label}
            {t.badge !== undefined && <span className="badge" style={{ fontSize: 9, minWidth: 14, height: 14, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary)', color: '#fff', padding: '0 4px', marginLeft: 2 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'general' && renderGeneral()}
      {tab === 'notes'   && renderNotes()}
      {tab === 'link'    && renderLinkTab()}

      {/* Footer */}
      <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        {isEdit && onDelete && (
          <button className="btn btn-danger" style={{ marginRight: 'auto' }}
            onClick={() => { onDelete(item!.id); onClose() }}>
            <Svg d={ICO_TRASH} size={13} /> Supprimer
          </button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" data-testid="nnl-modal-submit" onClick={handleSave}>
          {isEdit ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </>
  )

  if (view === 'side') return (
    <div className="modal-side-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-side" style={{ width: sideWidth }} onClick={e => e.stopPropagation()}>
        <div className="modal-side-handle" onMouseDown={onResizeStart} />
        {inner}
      </div>
    </div>
  )

  if (view === 'fullpage') return (
    <div className="modal-fullpage">
      <div className="modal-fullpage-inner" style={{ maxWidth: 900 }}>
        {inner}
      </div>
    </div>
  )

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 620, maxWidth: '95vw' }}>
        {inner}
      </div>
    </div>
  )
}
