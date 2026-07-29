import { useState, type ReactNode } from 'react'

/**
 * Card générique et repliable pour un groupe du Backlog (retour Julien, 2026-07-29) : quel
 * que soit le mode de regroupement (Sprint/Client/Type/Statut/Epic/Initiative), le groupe
 * s'affiche désormais comme une card plutôt qu'une simple ligne d'en-tête de tableau — même
 * les items qu'elle contient restent soumis aux mêmes règles de tri/filtre que le tableau
 * plat (mode "Grouper : aucun"), rien ne change de ce côté.
 *
 * Composant dédié au Backlog plutôt qu'une réutilisation de `PlanningEpicGroup.tsx`
 * (Release Planning/Swimlanes) : ce dernier est pensé pour 2 niveaux (Epic > US) et couplé
 * au contexte sprint (`compact`, `sprintEndDate`, drag vers un sprint) — un couplage plus
 * fort entre Backlog et Release Planning aurait le même inconvénient déjà écarté pour
 * Roadmap/Release Planning (voir mémoire feedback_roadmap_no_unified_visual). Ce composant
 * ne connaît que la structure du Backlog : un `id`, un libellé, un badge de résumé (SP,
 * nombre d'items...), des actions optionnelles (éditer/supprimer un Epic/Initiative), et
 * peut s'imbriquer (`indent`) pour représenter une card Epic à l'intérieur d'une card
 * Initiative.
 */
interface Props {
  id: string
  typeTag?: 'EPIC' | 'INITIATIVE'
  label: string
  sublabel?: string
  color?: string
  badge?: ReactNode
  actions?: ReactNode
  indent?: number
  children: ReactNode
}

const ICO_CHEVRON = '<path d="m6 9 6 6 6-6"/>'
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      dangerouslySetInnerHTML={{ __html: ICO_CHEVRON }}
    />
  )
}

export function BacklogGroupCard({ id, typeTag, label, sublabel, color, badge, actions, indent = 0, children }: Props) {
  // Repliée par défaut à false (dépliée) : même comportement que PlanningEpicGroup.tsx,
  // l'utilisateur choisit d'ouvrir/fermer chaque card individuellement. Pas persisté entre
  // sessions (contrairement à groupBy/sortBy/filtres) — un état de dépli est jugé trop
  // volatil (dépend du contenu du moment) pour valoir la peine d'être mémorisé.
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={`backlog-group-card${indent > 0 ? ' backlog-group-card-nested' : ''}${collapsed ? ' backlog-group-card-collapsed' : ''}`}
      style={color ? { borderLeftColor: color } : undefined}
    >
      <div className="backlog-group-card-header" onClick={() => setCollapsed(c => !c)}>
        <button
          type="button"
          className="backlog-group-card-toggle"
          data-testid={`backlog-group-toggle-${id}`}
          title={collapsed ? 'Développer' : 'Réduire'}
          onClick={e => { e.stopPropagation(); setCollapsed(c => !c) }}
        >
          <Chevron open={!collapsed} />
        </button>
        {typeTag && <span className={`hier-badge hier-badge-${typeTag.toLowerCase()}`}>{typeTag}</span>}
        <span className="backlog-group-card-label">{label}</span>
        {sublabel && <span className="backlog-group-card-sublabel">{sublabel}</span>}
        <span style={{ flex: 1 }} />
        {badge && <span className="backlog-group-card-badge">{badge}</span>}
        {actions && (
          <span className="backlog-group-card-actions" onClick={e => e.stopPropagation()}>
            {actions}
          </span>
        )}
      </div>
      {!collapsed && (
        <div className="backlog-group-card-body" data-testid={`backlog-group-body-${id}`}>
          {children}
        </div>
      )}
    </div>
  )
}
