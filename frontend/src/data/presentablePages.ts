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
  /** Libellé affiché dans la section Réglages (choix/ordre des pages). */
  label: string
}

export const PRESENTABLE_PAGE_CATALOG: PresentablePageDef[] = [
  { id: 'dashboard',       path: '/dashboard',          label: 'Dashboard' },
  { id: 'vision',          path: '/vision',             label: 'Vision' },
  { id: 'nnl',             path: '/vision?view=nnl',    label: 'Now/Next/Later' },
  { id: 'backlog',         path: '/backlog',            label: 'Backlog' },
  { id: 'roadmap',         path: '/roadmap',            label: 'Roadmap' },
  { id: 'planning',        path: '/planning',           label: 'Release Planning' },
  { id: 'auto',            path: '/auto',               label: 'Auto-planning' },
  { id: 'sprint-planning', path: '/sprint-planning',    label: 'Sprint Planning' },
  { id: 'kanban',          path: '/kanban',             label: 'Kanban' },
  { id: 'sprint-review',   path: '/sprint-review',      label: 'Sprint Review' },
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
