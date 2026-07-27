// Carte "squelette" affichée à la place des vraies cartes d'item en mode Réorganiser
// (KanbanPage.tsx, reorgMode). But : dans ce mode les cartes ne sont plus draggables
// (cardDraggable={!reorgMode} dans KanbanColumn.tsx) mais restaient visuellement identiques
// à des cartes normales, invitant l'utilisateur à essayer de les glisser pour rien. Un
// squelette générique, sans contenu réel, signale sans ambiguïté "pas d'interaction possible
// ici en ce moment" — cohérent avec le bandeau et le cadre pointillé du mode Réorganiser
// (docs/corrections futures.md, Kanban).
export function KanbanCardSkeleton() {
  return (
    <div className="kanban-card-skeleton">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="skel-bar" style={{ width: 46, height: 9 }} />
        <div className="skel-bar" style={{ width: 24, height: 9 }} />
      </div>
      <div className="skel-bar" style={{ width: '90%', height: 8 }} />
      <div className="skel-bar" style={{ width: '65%', height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="skel-bar" style={{ width: 22, height: 22, borderRadius: '50%' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          <div className="skel-bar" style={{ width: 16, height: 16, borderRadius: 4 }} />
          <div className="skel-bar" style={{ width: 16, height: 16, borderRadius: 4 }} />
        </div>
      </div>
    </div>
  )
}
