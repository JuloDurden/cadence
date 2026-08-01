import type { UserRole } from '../types'
import { canManageBacklog } from '../utils/permissions'

// Phase 2.5 (roadmap v1), Onboarding, points 2-4 (2026-08-01) : tooltips progressifs, checklist,
// démo interactive — traités comme un seul système plutôt que trois briques séparées (retour
// Julien). La checklist est la pièce centrale : chaque ligne, une fois cliquée depuis le panneau
// "Guide de démarrage" (voir context/OnboardingContext.tsx), navigue vers la page concernée et
// lance un tunnel de plusieurs tooltips (retour Julien après un 1er essai à un seul tooltip par
// ligne : "chaque étape pourrait aussi avoir un tunnel pour présenter la page"). Deux familles :
// - Tunnel "manuel" (la quasi-totalité des lignes) : navigation Suivant/Précédent dans la bulle,
//   piloté entièrement par `OnboardingContext.showTour()` à partir de `steps` ci-dessous.
// - Tunnel "piloté par la page" (uniquement "Créer votre première US") : les étapes avant
//   l'ouverture de la modale (menu Ajouter) s'enchaînent selon de vraies actions détectées par
//   BacklogPage.tsx, pas par des boutons Suivant — voir CREATE_ITEM_MODAL_STEPS, BacklogPage.tsx.
export interface OnboardingStep {
  // Élément à surligner. `testId` a la priorité ; sinon `selector` (classe CSS stable existante,
  // ex. `.kanban-board`) ; sinon le lien de la Sidebar de la page (route de la ligne parente).
  testId?: string
  selector?: string
  text: string
}

export interface OnboardingChecklistItem {
  id: string
  label: string
  description: string
  route: string
  steps: OnboardingStep[]
}

// Id de la ligne "démo interactive" — utilisé par BacklogPage.tsx pour savoir si le tunnel piloté
// par la page la concerne, et par OnboardingContext pour la traiter à part (pas un tunnel manuel).
export const CREATE_ITEM_CHECKLIST_ID = 'create-item'

// Étapes du tunnel une fois la modale "Nouvel Item" ouverte — tunnel manuel (Suivant/Précédent),
// contrairement aux 2 étapes qui précèdent (menu Ajouter → Nouvel Item, pilotées par de vraies
// actions). La quasi-totalité de ces champs sont informatifs, pas une action binaire à détecter
// automatiquement — Julien a demandé de couvrir type d'item, description, client, SP, User Story,
// critères d'acceptation, DoR/DoD. Onglets "User Story" et "DoD / DoR" : simple pointeur vers
// l'onglet (le contenu n'est visible qu'une fois l'onglet cliqué), pas de suivi étape par étape à
// l'intérieur — resterait fragile pour un gain limité, ces onglets sont déjà auto-descriptifs une
// fois ouverts.
export const CREATE_ITEM_MODAL_STEPS: OnboardingStep[] = [
  { testId: 'item-type-select', text: 'Choisissez le type d\'item : User Story, Bug, Tâche, Spike...' },
  { testId: 'item-client-select', text: 'Associez l\'item à un client.' },
  { testId: 'item-desc-input', text: 'Décrivez votre User Story en une phrase.' },
  { testId: 'item-sp-input', text: 'Estimez la charge en Story Points.' },
  { testId: 'modal-tab-us', text: 'L\'onglet "User Story" détaille le besoin (en tant que / je souhaite / afin de) et les critères d\'acceptation.' },
  { testId: 'modal-tab-dordod', text: 'L\'onglet "DoD / DoR" liste les conditions à remplir avant et après le développement.' },
  { testId: 'item-save-btn', text: 'Cliquez sur "Créer" pour enregistrer votre item.' },
]

// Réservée à ceux qui peuvent réellement créer un item (PO + Admin, voir canManageBacklog) —
// inutile de guider un Dev/Scrum Master/Stakeholder vers un bouton qu'il ne voit pas sur sa
// propre page Backlog (lecture seule pour eux). Ils ont "Découvrir le Backlog" à la place.
export function getOnboardingChecklist(role: UserRole | '' | undefined): OnboardingChecklistItem[] {
  const items: OnboardingChecklistItem[] = [
    {
      id: 'discover-dashboard',
      label: 'Découvrir le Dashboard',
      description: 'Vue d\'ensemble de la sprint en cours et des indicateurs clés.',
      route: '/dashboard',
      steps: [
        { text: 'Le Dashboard, votre page d\'accueil : vue d\'ensemble de la sprint en cours.' },
        { testId: 'dashboard-kpis', text: 'Les indicateurs clés : US terminées, vélocité moyenne, avancement du sprint actuel, blocages du jour.' },
        { testId: 'dashboard-charts', text: 'Vélocité des derniers sprints et burndown du sprint en cours.' },
        { testId: 'dashboard-clients', text: 'La santé de chaque client (RAG) et l\'activité récente de l\'équipe.' },
      ],
    },
    {
      id: 'discover-roadmap',
      label: 'Explorer la Roadmap',
      description: 'La vue chronologique des sprints, de leur contenu et de leurs objectifs.',
      route: '/roadmap',
      steps: [
        { text: 'La Roadmap : les sprints dans le temps, avec leur contenu et leur objectif.' },
        { selector: '.roadmap-grid', text: 'Chaque carte est un sprint : objectif, métriques de succès, contenu prévu.' },
      ],
    },
    {
      id: 'discover-kanban',
      label: 'Découvrir le Kanban',
      description: 'Le suivi visuel des items de la sprint en cours, colonne par colonne.',
      route: '/kanban',
      steps: [
        { text: 'Le Kanban : suivi visuel des items de la sprint en cours.' },
        { selector: '.kanban-board', text: 'Chaque colonne est une étape ; faites glisser les cartes pour changer leur statut.' },
      ],
    },
  ]

  if (canManageBacklog(role)) {
    items.push({
      id: CREATE_ITEM_CHECKLIST_ID,
      label: 'Créer votre première US',
      description: 'Une démo guidée, pas à pas, pour ajouter un premier item au Backlog.',
      route: '/backlog',
      // Pas de `steps` déclaratifs ici : le tunnel est entièrement piloté par BacklogPage.tsx
      // (état réel de l'UI), voir CREATE_ITEM_MODAL_STEPS ci-dessus pour la partie "modale ouverte".
      steps: [],
    })
  } else {
    items.push({
      id: 'discover-backlog',
      label: 'Découvrir le Backlog',
      description: 'La liste complète des items, Epics et Initiatives du produit.',
      route: '/backlog',
      steps: [
        { text: 'Le Backlog : la liste complète des items, Epics et Initiatives du produit.' },
        { selector: '.backlog-table', text: 'Chaque ligne : description, statut, Story Points, assignés.' },
        { testId: 'btn-filter', text: 'Filtrez par sprint, client, tag, statut ou priorité.' },
      ],
    })
  }

  return items
}
