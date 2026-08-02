import type { PresentablePageDef } from '../../data/presentablePages'

interface PresentationThumbnailsProps {
  pages: PresentablePageDef[]
  currentPath: string
  onSelect: (page: PresentablePageDef) => void
}

// Chantier "Vignettes au survol" (2026-08-02, retour Julien du 2026-08-01 : "passer le curseur sur
// la presentation-bar affiche les vignettes des pages du mode présentation") — panneau affiché au
// survol de la barre flottante du mode présentation, partagé par les 2 points d'entrée
// (PresentationBar.tsx pour un compte connecté, PresentationPublicPage.tsx pour le lien public :
// même besoin, même traitement, comme le reste du mode présentation), cliquable pour naviguer
// directement plutôt que de cycler une à une avec les flèches.
//
// Retour Julien (2026-08-02, 1er essai) : une simple icône ne suffisait pas, il voulait une vraie
// image de la page. Choix retenu (question posée, réponse de Julien) : vraies captures d'écran
// statiques plutôt qu'un mini-rendu live (trop lourd : ferait tourner les 10 pages en arrière-plan
// à chaque survol) ou des mini-illustrations dessinées à la main. Générées une fois par
// `scripts/generate-presentation-thumbnails.js` (`npm run thumbnails:generate`), servies depuis
// `frontend/public/presentation-thumbs/<id>.png` (dossier `public/` Vite, aucun import JS
// nécessaire). L'icône (voir data/presentablePages.ts) reste affichée EN DESSOUS de l'image comme
// filet de sécurité : si le script n'a pas encore été lancé, ou qu'une page a été ajoutée au
// catalogue sans capture correspondante, `onError` masque l'`<img>` cassée et l'icône reste visible
// à sa place plutôt que d'afficher une image brisée.
export function PresentationThumbnails({ pages, currentPath, onSelect }: PresentationThumbnailsProps) {
  return (
    <div className="presentation-thumbs-panel" data-testid="presentation-thumbs-panel">
      {pages.map(page => (
        <button
          key={page.id}
          type="button"
          data-testid={`presentation-thumb-${page.id}`}
          className={`presentation-thumb${page.path === currentPath ? ' active' : ''}`}
          title={page.label}
          onClick={() => onSelect(page)}
        >
          <span className="presentation-thumb-preview">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
              dangerouslySetInnerHTML={{ __html: page.icon }} />
            <img
              className="presentation-thumb-img"
              src={`/presentation-thumbs/${page.id}.png`}
              alt=""
              loading="lazy"
              onError={e => { e.currentTarget.style.visibility = 'hidden' }}
            />
          </span>
          <span>{page.label}</span>
        </button>
      ))}
    </div>
  )
}
