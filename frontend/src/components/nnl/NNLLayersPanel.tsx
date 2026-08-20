import React, { useState, useRef } from 'react'
import { useCadence } from '../../context/StateContext'
import type { NNLLayer, CadenceState, HierarchyLevel } from '../../types'
import { isItemInFrame } from '../../utils/nnlFrames'

// ── Icônes ────────────────────────────────────────────────────────────────────
const Svg = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
)
const ICO_PLUS      = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
const ICO_FOLDER    = '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'
const ICO_TRASH     = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>'
const ICO_LOCK      = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
const ICO_UNLOCK    = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'
const ICO_EYE       = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
const ICO_EYEOFF    = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
const ICO_UP        = '<polyline points="18 15 12 9 6 15"/>'
const ICO_DOWN      = '<polyline points="6 9 12 15 18 9"/>'
const ICO_LAYERS    = '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'
const ICO_MERGE     = '<line x1="12" y1="3" x2="12" y2="21"/><polyline points="6 9 12 3 18 9"/><polyline points="6 15 12 21 18 15"/>'
const ICO_CHEV_R    = '<polyline points="9 18 15 12 9 6"/>'
const ICO_CHEV_D    = '<polyline points="6 9 12 15 18 9"/>'
const ICO_UNGROUP   = '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'
// Cadre Epic/Initiative (point 3) — même icône Lucide "group" que le bouton de la toolbar
const ICO_FRAME     = '<path d="M3 7V5c0-1.1.9-2 2-2h2"/><path d="M17 3h2c1.1 0 2 .9 2 2v2"/><path d="M21 17v2c0 1.1-.9 2-2 2h-2"/><path d="M7 21H5c-1.1 0-2-.9-2-2v-2"/><rect width="7" height="5" x="7" y="7" rx="1"/><rect width="7" height="5" x="10" y="12" rx="1"/>'

function uid() { return Math.random().toString(36).slice(2, 9) }

// Mêmes couleurs/libellés que FRAME_COLOR/FRAME_LEVEL_LABEL dans NNLCanvas.tsx (dupliqué ici
// volontairement plutôt qu'exporté, pour ne pas alourdir le couplage entre les deux fichiers pour
// deux petites constantes d'affichage — sous-chantier 6, point 3.5, entrée miroir calques).
const FRAME_LEVEL_COLOR: Record<HierarchyLevel, string> = { epic: '#6366f1', initiative: '#b45309' }
const FRAME_LEVEL_LABEL: Record<HierarchyLevel, string> = { epic: 'EPIC', initiative: 'INITIATIVE' }

interface NNLLayersPanelProps {
  activeLayerId: string
  onActiveLayerChange: (id: string) => void
  // Bug 5 : saveNNL passé depuis NNLCanvas pour inclure les ops calques dans l'historique undo
  onSave?: (state: CadenceState) => void
  // Sélection cadre (point 3.5, 2026-07-29) — cliquer une entrée "Cadres" sélectionne le cadre
  // correspondant sur le canevas (ouvre son panneau de propriétés), comme cliquer directement
  // sur son contour.
  selectedFrameId?: string | null
  onSelectFrame?: (id: string | null) => void
  // Bug calque/forme (2026-08-20, remonte par Julien) : id du calque proprietaire de la forme/
  // texte/trace actuellement selectionne sur le canevas (NNLCanvas.tsx, `selectedShapeLayerId`) -
  // met la ligne du calque en surbrillance, meme principe que selectedFrameId ci-dessus pour les
  // cadres. Jamais renseigne pour un calque verrouille (NNLCanvas.tsx empeche deja la selection
  // d'y entrer), pas besoin de re-verifier `locked` ici.
  selectedShapeLayerId?: string | null
}

// ── Types DnD ─────────────────────────────────────────────────────────────────
type DropPos = 'above' | 'below' | 'into'
interface DropTarget { id: string; pos: DropPos }

export function NNLLayersPanel({ activeLayerId, onActiveLayerChange, onSave, selectedFrameId, onSelectFrame, selectedShapeLayerId }: NNLLayersPanelProps) {
  const { state, dispatch, saveToServer } = useCadence()
  const saveCallback = onSave ?? saveToServer

  const [collapsed,   setCollapsed]   = useState(false)
  const [framesCollapsed, setFramesCollapsed] = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editName,    setEditName]    = useState('')
  const [groupMenuId, setGroupMenuId] = useState<string | null>(null)

  // ── DnD state ────────────────────────────────────────────────────────────
  const [draggingId,  setDraggingId]  = useState<string | null>(null)
  const [dropTarget,  setDropTarget]  = useState<DropTarget | null>(null)
  const draggingRef  = useRef<string | null>(null)
  // Ref miroir de dropTarget : évite la capture stale dans handleDrop
  // (onDragLeave peut remettre le state à null juste avant le onDrop)
  const dropTargetRef = useRef<DropTarget | null>(null)

  const allLayers = state.nnlLayers ?? []

  // ── Save (dispatch + serveur) ─────────────────────────────────────────────
  function save(newLayers: NNLLayer[]) {
    dispatch({ type: 'SET_NNL_LAYERS', payload: newLayers })
    saveCallback({ ...state, nnlLayers: newLayers })
  }

  // ── Ajouter un calque normal ───────────────────────────────────────────────
  function addLayer() {
    const maxOrder = Math.max(0, ...allLayers.map(l => l.order))
    const nl: NNLLayer = {
      id: uid(), name: `Calque ${allLayers.filter(l => !l.isGroup).length + 1}`,
      locked: false, visible: true, order: maxOrder + 1,
    }
    save([...allLayers, nl])
    onActiveLayerChange(nl.id)
    setEditingId(nl.id); setEditName(nl.name)
  }

  // ── Ajouter un groupe (dossier) ───────────────────────────────────────────
  function addGroup() {
    const maxOrder = Math.max(0, ...allLayers.map(l => l.order))
    const ng: NNLLayer = {
      id: uid(), name: 'Groupe',
      locked: false, visible: true, order: maxOrder + 1,
      isGroup: true, collapsed: false,
    }
    save([...allLayers, ng])
    setEditingId(ng.id); setEditName(ng.name)
  }

  // ── Supprimer ─────────────────────────────────────────────────────────────
  function deleteLayer(id: string) {
    const layer = allLayers.find(l => l.id === id)
    // Bug 6 : impossible de supprimer un calque/groupe verrouillé
    if (layer?.locked) return
    const nonGroups = allLayers.filter(l => !l.isGroup)
    if (!layer?.isGroup && nonGroups.length <= 1) return
    // Détacher les enfants sans hériter du verrou du groupe
    const withDetached = allLayers.map(l => l.parentId === id ? { ...l, parentId: undefined } : l)
    const remaining = withDetached.filter(l => l.id !== id)
    if (activeLayerId === id) {
      const fallback = remaining.find(l => !l.isGroup)
      if (fallback) onActiveLayerChange(fallback.id)
    }
    const newShapes  = (state.nnlShapes  ?? []).filter(s => s.layerId !== id)
    const newTexts   = (state.nnlTexts   ?? []).filter(t => t.layerId !== id)
    const newStrokes = (state.nnlStrokes ?? []).filter(s => s.layerId !== id)
    ;(state.nnlShapes  ?? []).filter(s => s.layerId === id).forEach(s => dispatch({ type: 'DELETE_NNL_SHAPE',  payload: s.id }))
    ;(state.nnlTexts   ?? []).filter(t => t.layerId === id).forEach(t => dispatch({ type: 'DELETE_NNL_TEXT',   payload: t.id }))
    ;(state.nnlStrokes ?? []).filter(s => s.layerId === id).forEach(s => dispatch({ type: 'DELETE_NNL_STROKE', payload: s.id }))
    dispatch({ type: 'SET_NNL_LAYERS', payload: remaining })
    saveCallback({ ...state, nnlLayers: remaining, nnlShapes: newShapes, nnlTexts: newTexts, nnlStrokes: newStrokes })
  }

  // ── Fusionner vers le calque en dessous ───────────────────────────────────
  function mergeDown(id: string) {
    const sorted = allLayers.filter(l => !l.isGroup).slice().sort((a, b) => b.order - a.order)
    const idx = sorted.findIndex(l => l.id === id)
    if (idx >= sorted.length - 1) return
    const below = sorted[idx + 1]
    const newShapes  = (state.nnlShapes  ?? []).map(s => s.layerId === id ? { ...s, layerId: below.id } : s)
    const newTexts   = (state.nnlTexts   ?? []).map(t => t.layerId === id ? { ...t, layerId: below.id } : t)
    const newStrokes = (state.nnlStrokes ?? []).map(s => s.layerId === id ? { ...s, layerId: below.id } : s)
    newShapes .filter(s => (state.nnlShapes  ?? []).find(o => o.id === s.id)?.layerId === id).forEach(s => dispatch({ type: 'UPDATE_NNL_SHAPE', payload: s }))
    newTexts  .filter(t => (state.nnlTexts   ?? []).find(o => o.id === t.id)?.layerId === id).forEach(t => dispatch({ type: 'UPDATE_NNL_TEXT',  payload: t }))
    const remaining = allLayers.filter(l => l.id !== id)
    dispatch({ type: 'SET_NNL_LAYERS', payload: remaining })
    if (activeLayerId === id) onActiveLayerChange(below.id)
    saveCallback({ ...state, nnlLayers: remaining, nnlShapes: newShapes, nnlTexts: newTexts, nnlStrokes: newStrokes })
  }

  // ── Regrouper par type de forme (v0.91) ──────────────────────────────────
  // Crée un groupe-dossier par shapeType pour tous les calques autoCreated

  // ── Dissoudre un groupe ───────────────────────────────────────────────────
  function ungroup(groupId: string) {
    // Bug 6 : impossible de dissoudre un groupe verrouillé
    const group = allLayers.find(l => l.id === groupId)
    if (group?.locked) return
    const detached = allLayers.map(l => l.parentId === groupId ? { ...l, parentId: undefined } : l)
    save(detached.filter(l => l.id !== groupId))
  }

  // ── Déplacer vers un groupe ───────────────────────────────────────────────
  function assignToGroup(layerId: string, groupId: string | null) {
    save(allLayers.map(l => l.id === layerId ? { ...l, parentId: groupId ?? undefined } : l))
    setGroupMenuId(null)
  }

  // ── Visibilité / Verrou / Repliage ────────────────────────────────────────
  function toggleVisible(id: string) {
    save(allLayers.map(l => l.id === id ? { ...l, visible: l.visible === false } : l))
  }
  function toggleLock(id: string) {
    save(allLayers.map(l => l.id === id ? { ...l, locked: !l.locked } : l))
  }
  function toggleCollapse(id: string) {
    save(allLayers.map(l => l.id === id ? { ...l, collapsed: !l.collapsed } : l))
  }

  // ── Monter / Descendre ────────────────────────────────────────────────────
  function moveUp(id: string) {
    const sorted = allLayers.slice().sort((a, b) => a.order - b.order)
    const i = sorted.findIndex(l => l.id === id)
    if (i >= sorted.length - 1) return
    save(sorted.map((l, j) => j === i ? { ...l, order: sorted[i+1].order } : j === i+1 ? { ...l, order: sorted[i].order } : l))
  }
  function moveDown(id: string) {
    const sorted = allLayers.slice().sort((a, b) => a.order - b.order)
    const i = sorted.findIndex(l => l.id === id)
    if (i <= 0) return
    save(sorted.map((l, j) => j === i ? { ...l, order: sorted[i-1].order } : j === i-1 ? { ...l, order: sorted[i].order } : l))
  }

  // ── Renommer ──────────────────────────────────────────────────────────────
  function commitName(id: string) {
    if (editName.trim()) save(allLayers.map(l => l.id === id ? { ...l, name: editName.trim() } : l))
    setEditingId(null)
  }

  // ── DnD handlers ─────────────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, id: string) {
    draggingRef.current = id
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Données opaques pour les navigateurs qui en ont besoin
    e.dataTransfer.setData('text/plain', id)
  }

  function handleDragEnd() {
    draggingRef.current = null
    dropTargetRef.current = null
    setDraggingId(null)
    setDropTarget(null)
  }

  // Helper : rect du HEADER de ligne (firstElementChild), pas le conteneur entier (qui inclut les enfants pour les groupes)
  function rowRect(e: React.DragEvent): DOMRect {
    const outer = e.currentTarget as HTMLElement
    const header = outer.firstElementChild as HTMLElement | null
    return header ? header.getBoundingClientRect() : outer.getBoundingClientRect()
  }

  function computePos(e: React.DragEvent, isGroup: boolean): DropPos {
    const rect = rowRect(e)
    const y = e.clientY - rect.top
    const h = rect.height
    if (isGroup && y > h * 0.25 && y < h * 0.75) return 'into'
    return y < h / 2 ? 'above' : 'below'
  }

  function handleDragOver(e: React.DragEvent, id: string, isGroup: boolean) {
    e.preventDefault()
    e.stopPropagation()
    const dragging = draggingRef.current
    if (!dragging || dragging === id) {
      dropTargetRef.current = null
      setDropTarget(null)
      return
    }
    const pos = computePos(e, isGroup)
    const dt: DropTarget = { id, pos }
    dropTargetRef.current = dt
    setDropTarget(dt)
  }

  function handleDragLeave(e: React.DragEvent) {
    // Ignorer si on entre dans un enfant du même conteneur
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return
    // NE PAS vider dropTargetRef ici : dragLeave fire AVANT drop dans certains navigateurs,
    // ce qui viderait le ref avant que handleDrop ne puisse le lire.
    // On vide seulement l'état visuel.
    setDropTarget(null)
  }

  // Protection contre les références circulaires (ex: glisser un groupe dans l'un de ses descendants)
  function isDescendantOf(childId: string, ancestorId: string): boolean {
    if (childId === ancestorId) return true
    const child = allLayers.find(l => l.id === childId)
    if (!child?.parentId) return false
    return isDescendantOf(child.parentId, ancestorId)
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    e.stopPropagation()
    const draggingId = draggingRef.current
    draggingRef.current = null
    dropTargetRef.current = null
    setDraggingId(null)
    setDropTarget(null)
    if (!draggingId || draggingId === targetId) return

    const target = allLayers.find(l => l.id === targetId)
    if (!target) return

    // Recalculer la position depuis l'event (fiable même si dragLeave a vidé state/ref avant)
    const pos = computePos(e, !!target.isGroup)

    if (pos === 'into' && target.isGroup) {
      // Protection circulaire : ne pas assigner un groupe comme enfant de lui-même
      if (isDescendantOf(targetId, draggingId)) return
      save(allLayers.map(l => l.id === draggingId ? { ...l, parentId: targetId } : l))
      return
    }

    // Réordonner above / below
    const newParentId = target.parentId
    // Protection circulaire : ne pas créer de cycle via parentId
    if (newParentId && isDescendantOf(newParentId, draggingId)) return

    const sorted = allLayers.slice().sort((a, b) => a.order - b.order)
    const targetIdx = sorted.findIndex(l => l.id === targetId)
    let newOrder: number
    // Panneau trié DESC (order élevé = haut de liste).
    // 'above' target dans le panneau = order PLUS ÉLEVÉ (idx+1 dans le tableau ASC)
    // 'below' target dans le panneau = order MOINS ÉLEVÉ (idx-1 dans le tableau ASC)
    if (pos === 'above') {
      const next = targetIdx < sorted.length - 1 ? sorted[targetIdx + 1].order : target.order + 2
      newOrder = (target.order + next) / 2
    } else {
      const prev = targetIdx > 0 ? sorted[targetIdx - 1].order : target.order - 2
      newOrder = (prev + target.order) / 2
    }

    save(allLayers.map(l =>
      l.id === draggingId
        ? { ...l, order: newOrder, parentId: newParentId }
        : l
    ))
  }

  // ── Rendu d'une ligne de calque ───────────────────────────────────────────
  function renderLayer(layer: NNLLayer, indent = 0) {
    const isActive     = layer.id === activeLayerId && !layer.isGroup
    // Bug calque/forme (2026-08-20) : surbrillance plus discrete que isActive (qui reste
    // reservee au calque cible du prochain dessin) pour signaler "la selection courante du
    // canevas appartient a ce calque", sans se confondre visuellement avec lui.
    const ownsSelection = !isActive && !layer.isGroup && layer.id === selectedShapeLayerId
    const groups       = allLayers.filter(l => l.isGroup)
    const nonGroups    = allLayers.filter(l => !l.isGroup)
    const isOnlyNormal = !layer.isGroup && nonGroups.length <= 1
    const isDragging   = draggingId === layer.id

    const sorted    = nonGroups.slice().sort((a, b) => b.order - a.order)
    const idxSorted = sorted.findIndex(l => l.id === layer.id)
    const canMerge  = !layer.isGroup && idxSorted < sorted.length - 1

    const dt = dropTarget
    const isDropAbove = dt?.id === layer.id && dt.pos === 'above'
    const isDropBelow = dt?.id === layer.id && dt.pos === 'below'
    const isDropInto  = dt?.id === layer.id && dt.pos === 'into'

    // Contenu de la ligne (header)
    const rowInner = (
      <div
        onClick={() => { if (!layer.locked && !layer.isGroup) onActiveLayerChange(layer.id) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: `5px 6px 5px ${6 + indent * 12}px`,
          background: isActive ? 'var(--primary-light)' : ownsSelection ? 'var(--surface2)' : 'transparent',
          borderLeft: `3px solid ${isActive ? 'var(--primary)' : ownsSelection ? 'var(--border-strong)' : 'transparent'}`,
          cursor: layer.locked ? 'not-allowed' : layer.isGroup ? 'default' : 'pointer',
          opacity: layer.visible === false ? 0.4 : 1,
          position: 'relative',
        }}
      >
        {/* Chevron repliage (groupe) ou espace */}
        {layer.isGroup ? (
          <button style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); toggleCollapse(layer.id) }}>
            <Svg d={layer.collapsed ? ICO_CHEV_R : ICO_CHEV_D} size={9} />
          </button>
        ) : <span style={{ width: 11, flexShrink: 0 }} />}

        {/* Nom */}
        {editingId === layer.id ? (
          <input value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => commitName(layer.id)}
            onKeyDown={e => { if (e.key === 'Enter') commitName(layer.id); if (e.key === 'Escape') setEditingId(null) }}
            autoFocus onClick={e => e.stopPropagation()}
            style={{ flex: 1, fontSize: 11, padding: '1px 4px', border: '1px solid var(--primary)', borderRadius: 4, background: 'var(--surface-2)', outline: 'none', color: 'var(--text)', minWidth: 0 }}
          />
        ) : (
          <span
            style={{
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: 11, minWidth: 0,
              color: isActive ? 'var(--primary)' : 'var(--text)',
              fontWeight: isActive ? 700 : layer.isGroup ? 600 : 400,
              fontStyle: layer.isGroup ? 'italic' : 'normal',
            }}
            onDoubleClick={e => { e.stopPropagation(); setEditingId(layer.id); setEditName(layer.name) }}
          >
            {layer.isGroup && <span style={{ marginRight: 3 }}>📁</span>}{layer.name}
          </span>
        )}

        {/* Visibilité */}
        <button className="btn-icon" title={layer.visible === false ? 'Afficher' : 'Masquer'}
          onClick={e => { e.stopPropagation(); toggleVisible(layer.id) }}
          style={{ padding: 2, opacity: .6, flexShrink: 0 }}>
          <Svg d={layer.visible === false ? ICO_EYEOFF : ICO_EYE} size={10} />
        </button>

        {/* Verrou */}
        <button className="btn-icon" title={layer.locked ? 'Déverrouiller' : 'Verrouiller'}
          onClick={e => { e.stopPropagation(); toggleLock(layer.id) }}
          style={{ padding: 2, opacity: .6, flexShrink: 0 }}>
          <Svg d={layer.locked ? ICO_LOCK : ICO_UNLOCK} size={10} />
        </button>

        {/* Monter / Descendre */}
        <button className="btn-icon" title="Monter" onClick={e => { e.stopPropagation(); moveUp(layer.id) }}
          style={{ padding: 2, opacity: .5, flexShrink: 0 }}>
          <Svg d={ICO_UP} size={9} />
        </button>
        <button className="btn-icon" title="Descendre" onClick={e => { e.stopPropagation(); moveDown(layer.id) }}
          style={{ padding: 2, opacity: .5, flexShrink: 0 }}>
          <Svg d={ICO_DOWN} size={9} />
        </button>

        {/* Fusionner vers le bas */}
        {canMerge && (
          <button className="btn-icon" title="Fusionner avec le calque en dessous"
            onClick={e => { e.stopPropagation(); mergeDown(layer.id) }}
            style={{ padding: 2, opacity: .6, flexShrink: 0 }}>
            <Svg d={ICO_MERGE} size={10} />
          </button>
        )}

        {/* Groupe : dissoudre | calque : déplacer vers groupe */}
        {layer.isGroup ? (
          <button className="btn-icon" title="Dissoudre le groupe"
            onClick={e => { e.stopPropagation(); ungroup(layer.id) }}
            style={{ padding: 2, opacity: .6, flexShrink: 0 }}>
            <Svg d={ICO_UNGROUP} size={10} />
          </button>
        ) : groups.length > 0 && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button className="btn-icon" title="Déplacer vers un groupe"
              onClick={e => { e.stopPropagation(); setGroupMenuId(g => g === layer.id ? null : layer.id) }}
              style={{ padding: 2, opacity: .6 }}>
              <Svg d={ICO_FOLDER} size={10} />
            </button>
            {groupMenuId === layer.id && (
              <div onMouseDown={e => e.stopPropagation()} style={{
                position: 'absolute', right: 0, top: 18, zIndex: 200,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '4px 0', boxShadow: '0 4px 12px rgba(0,0,0,.18)',
                minWidth: 130,
              }}>
                {layer.parentId && (
                  <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 10px', fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text)' }}
                    onClick={() => assignToGroup(layer.id, null)}>
                    Retirer du groupe
                  </button>
                )}
                {groups.filter(g => g.id !== layer.parentId).map(g => (
                  <button key={g.id} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 10px', fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text)' }}
                    onClick={() => assignToGroup(layer.id, g.id)}>
                    → {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Supprimer */}
        {!isOnlyNormal && (
          <button className="btn-icon danger" title={layer.locked ? 'Verrouillé' : 'Supprimer'}
            onClick={e => { e.stopPropagation(); deleteLayer(layer.id) }}
            style={{ padding: 2, flexShrink: 0, opacity: layer.locked ? 0.25 : 1, cursor: layer.locked ? 'not-allowed' : 'pointer' }}>
            <Svg d={ICO_TRASH} size={10} />
          </button>
        )}
      </div>
    )

    // ── GROUPE : on isole le div draggable du header pour ne PAS englober
    //   les enfants dedans (évite le conflit nested-draggable en HTML5 DnD).
    if (layer.isGroup) {
      const children = allLayers
        .filter(l => l.parentId === layer.id)
        .slice().sort((a, b) => b.order - a.order)
      const hasChildren = !layer.collapsed && children.length > 0
      return (
        <div key={layer.id} data-testid={`nnl-layer-${layer.id}`}
          style={{ opacity: isDragging ? 0.35 : 1 }}>
          {/* Header draggable (seul élément draggable du groupe) */}
          <div
            draggable
            onDragStart={e => handleDragStart(e, layer.id)}
            onDragEnd={handleDragEnd}
            onDragOver={e => handleDragOver(e, layer.id, true)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, layer.id)}
            style={{
              boxShadow: isDropInto ? 'inset 0 0 0 2px var(--primary)' : undefined,
              borderTop: isDropAbove ? '2px solid var(--primary)' : undefined,
              borderBottom: !hasChildren && isDropBelow ? '2px solid var(--primary)' : undefined,
            }}
          >
            {rowInner}
          </div>
          {/* Enfants en dehors du div draggable (pas de conflit DnD imbriqué) */}
          {hasChildren && children.map(child => renderLayer(child, indent + 1))}
          {/* Indicateur "below" sous le dernier enfant visible */}
          {hasChildren && isDropBelow && (
            <div style={{ height: 2, background: 'var(--primary)', margin: `0 0 0 ${(indent + 1) * 12}px` }} />
          )}
        </div>
      )
    }

    // ── CALQUE NORMAL ─────────────────────────────────────────────────────────
    return (
      <div key={layer.id} data-testid={`nnl-layer-${layer.id}`}
        draggable
        onDragStart={e => handleDragStart(e, layer.id)}
        onDragEnd={handleDragEnd}
        onDragOver={e => handleDragOver(e, layer.id, false)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, layer.id)}
        style={{
          opacity: isDragging ? 0.35 : 1,
          borderTop: isDropAbove ? '2px solid var(--primary)' : undefined,
          borderBottom: isDropBelow ? '2px solid var(--primary)' : undefined,
        }}
      >
        {rowInner}
      </div>
    )
  }

  // Calques de premier niveau (sans parent), triés desc
  const topLevel = allLayers
    .filter(l => !l.parentId)
    .slice().sort((a, b) => b.order - a.order)

  return (
    <div className="nnl-layers-panel" data-testid="nnl-layers-panel"
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', right: 12, top: 60, zIndex: 60,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,.14)',
        width: collapsed ? 40 : 215, overflow: 'visible',
        transition: 'width .15s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--border)', gap: 4 }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
          title={collapsed ? 'Afficher les calques' : 'Réduire'}
          onClick={() => setCollapsed(c => !c)}>
          <Svg d={ICO_LAYERS} size={16} />
        </button>
        {!collapsed && (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', flex: 1 }}>
              Calques
            </span>
            <button className="btn-icon" title="Ajouter un calque" onClick={addLayer}>
              <Svg d={ICO_PLUS} size={13} />
            </button>
            <button className="btn-icon" title="Créer un groupe de calques" onClick={addGroup}>
              <Svg d={ICO_FOLDER} size={13} />
            </button>
          </>
        )}
      </div>

      {/* Liste */}
      {!collapsed && (
        <div style={{ maxHeight: 360, overflowY: 'auto', overflowX: 'visible' }}>
          {topLevel.map(layer => renderLayer(layer))}
        </div>
      )}

      {/* ── Cadres Epic/Initiative (sous-chantier 6, point 3.5, 2026-07-29) ──────
          Entrée miroir en LECTURE SEULE (décision Julien) : liste les post-its actuellement
          contenus par containment géométrique (isItemInFrame), calculé à la volée à chaque
          rendu — aucune donnée stockée ici, aucun impact sur le modèle de calques ci-dessus.
          Volontairement pas de drag-drop / réordonnancement / renommage : ce n'est pas un vrai
          calque, seulement une vue de ce que le canevas contient déjà. */}
      {!collapsed && (state.nnlFrames ?? []).length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', gap: 4 }}>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
              title={framesCollapsed ? 'Afficher les cadres' : 'Réduire'}
              onClick={() => setFramesCollapsed(c => !c)}>
              <Svg d={framesCollapsed ? ICO_CHEV_R : ICO_CHEV_D} size={11} />
            </button>
            <Svg d={ICO_FRAME} size={13} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', flex: 1 }}>
              Cadres ({(state.nnlFrames ?? []).length})
            </span>
          </div>
          {!framesCollapsed && (
            <div style={{ maxHeight: 240, overflowY: 'auto', paddingBottom: 6 }}>
              {(state.nnlFrames ?? []).map(f => {
                const node = (state.hierarchyNodes ?? []).find(n => n.id === f.hierarchyNodeId)
                const contained = (state.nnlItems ?? []).filter(it => isItemInFrame(it, f))
                const isSelected = f.id === selectedFrameId
                return (
                  <div key={f.id} data-testid={`nnl-layers-frame-${f.id}`}
                    onClick={() => onSelectFrame?.(isSelected ? null : f.id)}
                    style={{
                      padding: '5px 10px', cursor: onSelectFrame ? 'pointer' : 'default',
                      background: isSelected ? 'var(--primary-light)' : 'transparent',
                      borderLeft: `3px solid ${isSelected ? 'var(--primary)' : 'transparent'}`,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: '#fff', padding: '1px 5px', borderRadius: 3,
                        background: f.color ?? FRAME_LEVEL_COLOR[f.level], flexShrink: 0,
                      }}>{FRAME_LEVEL_LABEL[f.level]}</span>
                      <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node ? `${node.key} · ${node.desc}` : 'Nœud introuvable'}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, paddingLeft: 2 }}>
                      {contained.length === 0
                        ? 'Aucun post-it'
                        : contained.length === 1
                          ? contained[0].text
                          : `${contained.length} post-its`}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
