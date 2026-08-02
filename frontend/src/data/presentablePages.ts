// Chantier "Config pages présentables" (roadmap v1, Phase 3, suite), 2026-08-02 — retour Julien
// du 2026-08-01 : "Le PO et l'admin peuvent choisir quelles pages afficher en mode présentation
// [...] Le PO et l'admin pourraient choisir l'ordre d'affichage des pages [...]". Catalogue fixe
// de toutes les pages/sous-vues candidates au mode présentation (voir PresentationModeContext.tsx,
// App.tsx, Header.tsx, PresentationPublicPage.tsx, PresentationPagesSection.tsx) — la sélection et
// l'ordre effectifs vivent dans `state.settings.presentationPages` (liste d'ids, voir types/index.ts).
//
// Vision et NNL sont deux entrées séparées du catalogue bien qu'elles pointent vers la MÊME route
// (`/vision`) : ce sont deux sous-vues internes de VisionPage.tsx (toggle Vision Board / tableau
// blanc NNL), pas deux routes React Router distinctes. Résolues ici comme deux chemins complets
// (pathname + query, ex. `/vision` vs `/vision?view=nnl`) plutôt que id de route + paramètre de
// vue séparé, pour que toute la logique de correspondance en aval reste une simple comparaison de
// chaîne (`location.pathname + location.search === page.path`), voir VisionPage.tsx (lecture de
// `?view=nnl` au montage/changement d'URL).
export type PresentablePageId =
  | 'dashboard' | 'vision' | 'nnl' | 'backlog' | 'roadmap'
  | 'planning' | 'auto' | 'sprint-planning' | 'kanban' | 'sprint-review'

export interface PresentablePageDef {
  id: PresentablePageId
  /** pathname + query éventuelle, ex: '/vision?view=nnl' — comparé tel quel à `location.pathname + location.search`. */
  path: string
  /** Libellé affiché dans la section Réglages (choix/ordre des pages) et dans les vignettes. */
  label: string
  /** Tracé(s) SVG (viewBox 0 0 24 24, stroke=currentColor) — repris des icônes de la Sidebar pour
   *  qu'une page s'identifie visuellement de la même façon dans les vignettes du mode présentation
   *  (voir PresentationThumbnails.tsx) que dans la navigation normale. NNL n'a pas d'icône dédiée
   *  dans la Sidebar (simple bascule interne de VisionPage, pas une route à part) : icône propre
   *  choisie ici (repères Now/Next/Later). */
  icon: string
}

export const PRESENTABLE_PAGE_CATALOG: PresentablePageDef[] = [
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard',
    icon: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>' },
  { id: 'vision', path: '/vision', label: 'Vision',
    icon: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>' },
  { id: 'nnl', path: '/vision?view=nnl', label: 'Now/Next/Later',
    icon: '<line x1="4" y1="12" x2="20" y2="12"/><circle cx="6" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="18" cy="12" r="2.5"/>' },
  { id: 'backlog', path: '/backlog', label: 'Backlog',
    icon: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>' },
  { id: 'roadmap', path: '/roadmap', label: 'Roadmap',
    icon: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>' },
  { id: 'planning', path: '/planning', label: 'Release Planning',
    icon: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>' },
  { id: 'auto', path: '/auto', label: 'Auto-planning',
    icon: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>' },
  { id: 'sprint-planning', path: '/sprint-planning', label: 'Sprint Planning',
    icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>' },
  { id: 'kanban', path: '/kanban', label: 'Kanban',
    icon: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/>' },
  { id: 'sprint-review', path: '/sprint-review', label: 'Sprint Review',
    icon: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect width="6" height="4" x="9" y="3" rx="1"/><path d="m9 14 2 2 4-4"/>' },
]

// Ordre/sélection d'origine (avant ce chantier) — reste la valeur par défaut tant qu'un
// workspace n'a pas explicitement choisi sa propre liste (`state.settings.presentationPages`
// absent), pour ne rien changer au comportement existant.
export const DEFAULT_PRESENTATION_PAGE_IDS: PresentablePageId[] =
  ['dashboard', 'roadmap', 'vision', 'sprint-review', 'backlog']

/**
 * Résout une liste d'ids (ordonnée, telle que stockée dans `state.settings.presentationPages`)
 * en définitions complètes du catalogue, dans le même ordre. Filtre silencieusement tout id
 * inconnu (catalogue modifié entre-temps — ne devrait pas arriver en pratique, robustesse). Si
 * la liste est absente/vide, ou si elle ne contient plus aucun id valide, retombe sur la
 * sélection/ordre par défaut plutôt que de renvoyer une liste vide (le mode présentation a besoin
 * d'au moins une page).
 */
export function resolvePresentationPages(ids: string[] | undefined): PresentablePageDef[] {
  const source = ids && ids.length > 0 ? ids : DEFAULT_PRESENTATION_PAGE_IDS
  const resolved = source
    .map(id => PRESENTABLE_PAGE_CATALOG.find(p => p.id === id))
    .filter((p): p is PresentablePageDef => !!p)
  if (resolved.length > 0) return resolved
  return DEFAULT_PRESENTATION_PAGE_IDS
    .map(id => PRESENTABLE_PAGE_CATALOG.find(p => p.id === id))
    .filter((p): p is PresentablePageDef => !!p)
}
