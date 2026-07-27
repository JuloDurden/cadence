import { useMemo } from 'react'
import type { Item, KanbanCol, CadenceState } from '../../types'
import { KanbanCard } from './KanbanCard'
import { KanbanCardSkeleton } from './KanbanCardSkeleton'

// Hauteur approximative d'une carte squelette + son gap (.kanban-cards gap: 6px) — sert
// uniquement à estimer combien de squelettes il faut pour couvrir la hauteur visible de
// l'écran, pas une valeur pixel-perfect (la zone scrolle de toute façon si on en met trop).
const SKELETON_CARD_HEIGHT = 96
// Hauteur retirée pour le header applicatif + l'en-tête de colonne + le padding de la zone
// de cartes, avant de diviser par SKELETON_CARD_HEIGHT.
const SKELETON_CHROME_HEIGHT = 200

interface Props {
  col: KanbanCol
  items: Item[]
  state: CadenceState
  isBase: boolean
  reorgMode: boolean
  isDragOver: boolean
  onCardDragStart:    (itemId: string) => void
  onColDragStart:     (colId: string)  => void
  onDragOver:         (colId: string)  => void
  onDrop:             (colId: string)  => void
  onDeleteCol:        (colId: string)  => void
  onEdit:             (item: Item)     => void
  onRemoveFromSprint: (id: string)     => void
}

function Ico({ d, size = 14, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const ICO = {
  grip:        '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  circleMinus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
}

export function KanbanColumn({
  col, items, state, isBase, reorgMode, isDragOver,
  onCardDragStart, onColDragStart, onDragOver, onDrop,
  onDeleteCol, onEdit, onRemoveFromSprint,
}: Props) {
  // Nombre de squelettes en mode Réorganiser : indépendant du nombre d'items réels de la
  // colonne (docs/corrections futures.md, Kanban — "pas juste celles existantes"), calé sur
  // la hauteur d'écran visible, ± 1 ou 2 au hasard par colonne pour un rendu moins uniforme.
  // Recalculé uniquement à l'activation du mode (dépendance [reorgMode]) : rester stable tant
  // qu'on réorganise, pas se réinitialiser à chaque re-rendu pendant le drag des colonnes.
  const skeletonCount = useMemo(() => {
    if (!reorgMode) return 0
    const available = (typeof window !== 'undefined' ? window.innerHeight : 900) - SKELETON_CHROME_HEIGHT
    // "maxi" = le nombre qui atteint le bas de l'écran sans scroll — la variance ne doit donc
    // jamais l'augmenter (sinon la colonne déborde et un scroll apparaît), seulement le
    // réduire de 0, 1 ou 2 cartes au hasard pour un rendu moins uniforme d'une colonne à l'autre.
    const max = Math.max(4, Math.floor(available / SKELETON_CARD_HEIGHT))
    const variance = Math.floor(Math.random() * 3) // 0, 1 ou 2
    return Math.max(3, max - variance)
  }, [reorgMode])

  return (
    <div
      className={`kanban-col${isDragOver ? ' kanban-col-over' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(col.id) }}
      onDrop={e => { e.preventDefault(); onDrop(col.id) }}
    >
      {/* Header */}
      <div
        className={`kanban-col-header${reorgMode ? ' reorg-active' : ''}`}
        style={{ background: col.color + '22', borderBottom: `2px solid ${col.color}44` }}
        draggable={reorgMode}
        onDragStart={e => { if (reorgMode) { e.stopPropagation(); onColDragStart(col.id) } }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {reorgMode && <Ico d={ICO.grip} size={13} stroke={col.color} />}
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', color: col.color }}>
            {col.label.toUpperCase()}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            className="kanban-col-count"
            style={{ background: col.color + '22', color: col.color, borderColor: 'transparent' }}
          >
            {items.length}
          </span>
          {reorgMode && !isBase && (
            <button
              onClick={() => onDeleteCol(col.id)}
              title="Supprimer la colonne"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', borderRadius: 4, display: 'flex', alignItems: 'center', color: 'var(--danger)' }}
            >
              <Ico d={ICO.circleMinus} size={12} stroke="var(--danger)" />
            </button>
          )}
        </span>
      </div>

      {/* Cards area — en mode Réorganiser, des squelettes remplacent les vraies cartes
          (jamais draggables dans ce mode) pour ne pas inviter l'utilisateur à essayer de les
          glisser. Leur nombre (skeletonCount) est indépendant des items réels de la colonne,
          calé sur la hauteur d'écran. Voir KanbanCardSkeleton.tsx et docs/corrections
          futures.md, Kanban. */}
      {/* overflowY forcé à 'hidden' en mode Réorganiser : filet de sécurité pour garantir
          "sans scroll" même si l'estimation de skeletonCount (fondée sur window.innerHeight,
          pas une mesure DOM réelle) est légèrement optimiste sur un écran ou un zoom donné. */}
      <div className="kanban-cards" style={{ background: col.color + '0d', overflowY: reorgMode ? 'hidden' : 'auto' }}>
        {reorgMode
          ? Array.from({ length: skeletonCount }, (_, i) => <KanbanCardSkeleton key={i} />)
          : items.map(item => (
            <KanbanCard
              key={item.id}
              item={item}
              state={state}
              colColor={col.color}
              cardDraggable={!reorgMode}
              onEdit={onEdit}
              onRemoveFromSprint={onRemoveFromSprint}
              onDragStart={onCardDragStart}
            />
          ))}
        {!reorgMode && items.length === 0 && (
          <div className="kanban-empty">Glisser ici</div>
        )}
      </div>
    </div>
  )
}
