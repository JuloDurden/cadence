import React, { useRef, useCallback, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCadence } from '../context/StateContext'
import { useToast } from '../context/ToastContext'
import { Header } from '../components/layout/Header'
import { NNLCanvas } from '../components/nnl/NNLCanvas'
import { useAuth } from '../hooks/useAuth'
import { isReadOnlyForRole } from '../utils/permissions'
import type { VisionBoard } from '../types'

type VisionView = 'vision' | 'nnl'

interface VisionPageProps {
  // Chantier "Config pages présentables" (2026-08-02) — pour PresentationPublicPage.tsx, qui
  // n'utilise pas de vraie navigation React Router entre les pages (voir ce fichier : navigation
  // par état local, l'URL réelle reste `/present/:token`) : `?view=nnl` n'y a donc aucun effet,
  // ce prop force la sous-vue initiale. Pour un compte connecté (navigation clavier du mode
  // présentation via de vrais changements d'URL), non utilisé : `?view=nnl` suffit, voir
  // useEffect ci-dessous.
  initialView?: VisionView
}

// ── Icons ────────────────────────────────────────────────────────────────
const ICO_VIEW_VISION =
  '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>' +
  '<circle cx="12" cy="12" r="3"/>'

const ICO_VIEW_NNL =
  '<path d="M425.889,648.085c-42.312,-28.723 -93.369,-45.511 -148.315,-45.511l0,-75c75.678,0 145.607,24.813 202.088,66.739l-53.772,53.772Zm124.483,16.938c41.927,56.481 66.739,126.41 66.739,202.088l-75,0c0,-54.947 -16.789,-106.003 -45.511,-148.315l53.772,-53.772Z"/>' +
  '<path d="M575.402,498.571c-81.406,-65.888 -185.043,-105.373 -297.829,-105.373l0,-75c133.49,0 255.914,47.754 351.106,127.095l-53.278,53.278Zm123.988,17.433c79.342,95.193 127.095,217.617 127.095,351.106l-75,0c0,-112.786 -39.485,-216.422 -105.373,-297.829l53.278,-53.278Z"/>' +
  '<path d="M715.116,270.468l238.649,-79.55l-79.55,238.649l-159.099,-159.099Z"/>' +
  '<path d="M318.198,826.486l508.288,-508.288" style="fill:none;stroke:currentColor;stroke-width:75px;"/>'

const ICO_SHARE =
  '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>' +
  '<polyline points="16 6 12 2 8 6"/>' +
  '<line x1="12" y1="2" x2="12" y2="15"/>'

const ICO_PLUS = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'

const ICO_VB_VISION = ICO_VIEW_VISION
const ICO_VB_USERS =
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>' +
  '<circle cx="9" cy="7" r="4"/>' +
  '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>' +
  '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
const ICO_VB_HEART =
  '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
const ICO_VB_PACKAGE =
  '<path d="M16.5 9.4l-9-5.19"/>' +
  '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' +
  '<path d="M3.27 6.96L12 12.01l8.73-5.05"/>' +
  '<path d="M12 22.08V12"/>'
const ICO_VB_TRENDING =
  '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>' +
  '<polyline points="16 7 22 7 22 13"/>'

// ── Helpers ───────────────────────────────────────────────────────────────
function ViewIco({ d, viewBox = '0 0 24 24', fill = 'none' }: { d: string; viewBox?: string; fill?: string }) {
  return (
    <svg width={14} height={14} viewBox={viewBox} fill={fill}
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

function VBIcon({ d }: { d: string }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const SEG_BTN = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-muted)',
  border: 'none',
  cursor: 'pointer',
  padding: '0 9px',
  height: 30,
  display: 'flex',
  alignItems: 'center',
  transition: 'background .15s, color .15s',
})

// ── VBSection ─────────────────────────────────────────────────────────────
interface VBSectionProps {
  icon: string; title: string; value: string; placeholder: string; top?: boolean
  textareaRef?: (el: HTMLTextAreaElement | null) => void
  onChange: (v: string) => void; onBlur: () => void
  readOnly?: boolean
}
function VBSection({ icon, title, value, placeholder, top, textareaRef, onChange, onBlur, readOnly = false }: VBSectionProps) {
  return (
    <div className={`vb-section${top ? ' vb-section-top' : ''}`}>
      <div className="vb-section-head">
        <div className="vb-icon-circle"><VBIcon d={icon} /></div>
        <h3 className="vb-title">{title}</h3>
      </div>
      <textarea ref={textareaRef} className="vb-textarea" value={value} placeholder={placeholder}
        rows={top ? 3 : 6} onChange={e => onChange(e.target.value)} onBlur={onBlur} disabled={readOnly} />
    </div>
  )
}

// ── VisionPage ────────────────────────────────────────────────────────────
export function VisionPage({ initialView }: VisionPageProps = {}) {
  const { state, dispatch, saveToServer } = useCadence()
  const { showToast } = useToast()
  const { userRole } = useAuth()
  // Phase 2.5 (roadmap v1) — Stakeholder en lecture seule sur Vision/NNL.
  const readOnly = isReadOnlyForRole(userRole)
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<VisionView>(
    () => initialView ?? (searchParams.get('view') === 'nnl' ? 'nnl' : 'vision')
  )
  const [modalOpen, setModalOpen] = useState(false)

  // Chantier "Config pages présentables" (2026-08-02) — synchronise la sous-vue affichée avec
  // `?view=nnl` quand l'URL change (navigation clavier ← → du mode présentation pour un compte
  // connecté, voir PresentationModeContext.tsx : `/vision` <-> `/vision?view=nnl`, même route
  // React Router, donc VisionPage n'est PAS remonté — seul cet effet permet de suivre le
  // changement). N'affecte pas le toggle manuel Vision/NNL de l'en-tête ci-dessous : ce dernier
  // ne touche pas l'URL, `searchParams` ne change donc pas suite à un clic dessus.
  useEffect(() => {
    if (initialView) return
    setView(searchParams.get('view') === 'nnl' ? 'nnl' : 'vision')
  }, [searchParams, initialView])

  // Vision Board — sync refs
  const gridRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const setGridRef = useCallback((key: string) => (el: HTMLTextAreaElement | null) => {
    if (el) gridRefs.current.set(key, el)
    else gridRefs.current.delete(key)
  }, [])

  const vb: VisionBoard = state.visionBoard ?? {
    productName: '', vision: '', targetGroup: '', needs: '', product: '', businessGoals: '',
  }
  const productName = vb.productName ?? ''

  function update(field: keyof VisionBoard, value: string) {
    if (readOnly) return
    dispatch({ type: 'UPDATE_VISION_BOARD', payload: { ...vb, [field]: value } })
    syncGridHeights()
  }
  function updateProductName(value: string) {
    if (readOnly) return
    dispatch({ type: 'UPDATE_VISION_BOARD', payload: { ...vb, productName: value } })
  }
  function save() {
    if (readOnly) return
    saveToServer({ ...state, visionBoard: vb })
    showToast('Vision Board enregistré')
  }
  function saveProductName() {
    if (readOnly) return
    saveToServer({ ...state, visionBoard: vb })
    showToast('Nom du produit enregistré')
  }
  function syncGridHeights() {
    requestAnimationFrame(() => {
      const els = Array.from(gridRefs.current.values())
      els.forEach(el => { el.style.height = '' })
      const maxH = Math.max(...els.map(el => el.scrollHeight))
      els.forEach(el => { el.style.height = `${maxH}px` })
    })
  }

  return (
    <>
      <Header title="Vision Board" hideUndoRedo={view === 'nnl'}>
        {/* Nom produit éditable */}
        <span style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 2px' }}>|</span>
        <input
          className="vb-product-name-input"
          value={productName}
          placeholder="Nom du produit"
          onChange={e => updateProductName(e.target.value)}
          onBlur={saveProductName}
          disabled={readOnly}
          style={{
            border: 'none', background: 'transparent',
            fontSize: 13, fontWeight: 500, color: 'var(--text)',
            outline: 'none', width: 160, padding: '2px 4px', borderRadius: 4,
          }}
        />

        <div style={{ flex: 1 }} />

        {/* Toggle Vision / NNL */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button style={SEG_BTN(view === 'vision')} onClick={() => setView('vision')} title="Vision Board">
            <ViewIco d={ICO_VIEW_VISION} />
          </button>
          <button
            style={{ ...SEG_BTN(view === 'nnl'), borderLeft: '1px solid var(--border)' }}
            onClick={() => setView('nnl')}
            title="Now / Next / Later"
            data-testid="btn-toggle-nnl"
          >
            <ViewIco d={ICO_VIEW_NNL} viewBox="230 150 750 750" fill="currentColor" />
          </button>
        </div>

        {/* Bouton contextuel NNL — ouvre la modal de création (masqué en lecture seule) */}
        {view === 'nnl' && !readOnly && (
          <button
            data-testid="btn-add-postit"
            className="hdr-btn primary"
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setModalOpen(true)}
          >
            <ViewIco d={ICO_PLUS} /> Post-it
          </button>
        )}

        {view === 'vision' && (
          <button className="hdr-btn primary" onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }} title="Exporter en PDF">
            <ViewIco d={ICO_SHARE} /> Exporter PDF
          </button>
        )}
      </Header>

      {/* ── Vue Vision Board ── */}
      {view === 'vision' && (
        <div className="page-content">
          <div className="vision-board">
            <div className="vb-header">
              <span className="vb-header-label">Vision Board produit</span>
              <span className="vb-header-sub">Roman Pichler</span>
            </div>
            <VBSection icon={ICO_VB_VISION} title="Vision" top
              value={vb.vision}
              placeholder="Quelle est la raison d'être du produit ? Quel changement positif doit-il apporter ?"
              onChange={v => update('vision', v)} onBlur={save} readOnly={readOnly} />
            <div className="vb-grid">
              <VBSection icon={ICO_VB_USERS} title="Groupe cible"
                value={vb.targetGroup}
                placeholder="Quel segment de marché adresse-t-on ? Qui sont les clients et utilisateurs cibles ?"
                textareaRef={setGridRef('targetGroup')}
                onChange={v => update('targetGroup', v)} onBlur={save} readOnly={readOnly} />
              <VBSection icon={ICO_VB_HEART} title="Besoins"
                value={vb.needs}
                placeholder="Quel problème le produit résout-il ? Si plusieurs besoins, priorisez-les et mettez le plus important en premier."
                textareaRef={setGridRef('needs')}
                onChange={v => update('needs', v)} onBlur={save} readOnly={readOnly} />
              <VBSection icon={ICO_VB_PACKAGE} title="Produit"
                value={vb.product}
                placeholder="Qu'est-ce que le produit ? Quelles sont ses 3 à 5 fonctionnalités différenciantes ? Est-il réalisable ?"
                textareaRef={setGridRef('product')}
                onChange={v => update('product', v)} onBlur={save} readOnly={readOnly} />
              <VBSection icon={ICO_VB_TRENDING} title="Objectifs business"
                value={vb.businessGoals}
                placeholder="Comment le produit bénéficiera-t-il à l'entreprise ? Priorisez les objectifs et mettez le plus important en premier."
                textareaRef={setGridRef('businessGoals')}
                onChange={v => update('businessGoals', v)} onBlur={save} readOnly={readOnly} />
            </div>
          </div>
        </div>
      )}

      {/* ── Vue Now / Next / Later ── */}
      {view === 'nnl' && (
        <div className="page-content nnl-page-content">
          <NNLCanvas modalOpen={modalOpen && !readOnly} onModalClose={() => setModalOpen(false)} readOnly={readOnly} />
        </div>
      )}
    </>
  )
}
