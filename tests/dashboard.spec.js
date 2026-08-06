const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Dashboard', () => {

  // Recherche scopée à `.dash-flip-front` (2026-08-06) — `FlipCard.tsx` rend la face avant ET la
  // face arrière en même temps dans le DOM (la face inactive est seulement `visibility: hidden`,
  // pas retirée, voir le commentaire d'en-tête de FlipCard.tsx). Chaque face porte son propre titre
  // "US terminées"/"Sprint actuel" : une recherche non scopée remonte 2 éléments (violation du
  // mode strict Playwright) depuis que ces 2 widgets ont une face cachée de réglages.
  test('affiche les KPI StatCards', async ({ page }) => {
    await goTo(page, '/dashboard');
    await expect(page.locator('.dash-flip-front').getByText('US terminées')).toBeVisible();
    await expect(page.locator('.dash-flip-front').getByText('Sprint actuel')).toBeVisible();
  });

  test('affiche la section page-content', async ({ page }) => {
    await goTo(page, '/dashboard');
    await expect(page.locator('.page-content')).toBeVisible();
  });

});

// Chantier "Dashboard widgets" (roadmap v1, Phase 4, 2026-08-03) — placement libre sur grille façon
// iOS Springboard (voir DashboardWidgetGrid.tsx, data/dashboardWidgets.ts). Réglage de workspace
// (comme le reste de state.settings), personnalisable par Admin + PO uniquement.
test.describe('Dashboard — widgets configurables (Phase 4)', () => {

  const DEFAULT_WIDGET_IDS = [
    'kpi-done', 'kpi-velocity', 'kpi-current-sprint', 'kpi-blockers',
    'velocity-chart', 'burndown-chart', 'client-rag', 'recent-activity',
  ];

  test('les 8 widgets par défaut sont affichés, dans leur position d\'origine', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    for (const id of DEFAULT_WIDGET_IDS) {
      await expect(page.locator(`[data-testid="dashboard-widget-${id}"]`)).toBeVisible();
    }
  });

  test('un Admin et un PO voient le bouton "Personnaliser", un Dev ne le voit pas', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="dashboard-customize-toggle"]')).toBeVisible();

    await goTo(page, '/dashboard', { role: 'PO' });
    await expect(page.locator('[data-testid="dashboard-customize-toggle"]')).toBeVisible();

    await goTo(page, '/dashboard', { role: 'DEV' });
    await expect(page.locator('[data-testid="dashboard-customize-toggle"]')).toHaveCount(0);
  });

  // Le bouton de taille est vérifié sur `velocity-chart` (plusieurs tailles autorisées), pas
  // `kpi-done` : `kpi-done` est verrouillé sur une seule taille (`allowedSizes: ['S']`, voir
  // dashboardWidgets.ts) depuis le début du chantier Dashboard — DashboardWidgetGrid.tsx masque
  // volontairement ce bouton pour les widgets à valeur unique (`def.allowedSizes.length > 1`), il
  // n'existe donc jamais pour `kpi-done`. Le bouton de suppression, lui, existe pour tout widget
  // quelle que soit sa taille, vérifié sur `kpi-done` comme avant.
  test('le mode édition affiche les poignées, boutons de taille et de suppression', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await expect(page.locator('[data-testid="dashboard-widget-size-velocity-chart"]')).toHaveCount(0);

    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await expect(page.locator('[data-testid="dashboard-widget-size-velocity-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-widget-remove-kpi-done"]')).toBeVisible();
  });

  // Retour Julien (2026-08-03, après le 1er essai) : les widgets à valeur unique (dont kpi-done)
  // sont désormais verrouillés sur une seule taille (bouton de taille masqué) — le cycle de taille
  // se teste maintenant sur un widget à plusieurs infos (velocity-chart).
  // Valeurs corrigées (2026-08-06) : `DEFAULT_DASHBOARD_LAYOUT` place velocity-chart en 'L' par
  // défaut (pas 'M', voir dashboardWidgets.ts), et son `allowedSizes` est `['M', 'L', 'XL']` — le
  // test attendait encore un ancien cycle 'M' -> 'L' -> 'M' à 2 tailles, jamais mis à jour.
  test('changer la taille d\'un widget multi-infos cycle L -> XL -> M -> L', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await expect(page.locator('[data-testid="dashboard-widget-size-kpi-done"]')).toHaveCount(0);

    const sizeBtn = page.locator('[data-testid="dashboard-widget-size-velocity-chart"]');
    await expect(sizeBtn).toHaveText('L');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('XL');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('M');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('L');
  });

  // Suite (2026-08-03, retour Julien "il faut aussi retravailler et normaliser les tailles",
  // v0.97.2) — Burndown et Santé clients ont désormais chacun une taille dédiée (XL / XL Portrait)
  // en plus de L, à la place de leur ancien M/L. Voir data/dashboardWidgets.ts.
  // Cycle de Santé clients corrigé (2026-08-06) : `allowedSizes` élargi à `['M', 'L', 'XL', 'XLP']`
  // (était `['L', 'XLP']`, voir dashboardWidgets.ts) — depuis 'XLP' (dernière taille de la liste),
  // un clic boucle sur 'M' (première taille), pas 'L' comme l'ancien test à 2 tailles l'attendait.
  // Cycle complet vérifié plutôt qu'un aller-retour partiel, pour couvrir les 4 tailles.
  test('le Burndown passe de L à XL (taille pleine largeur), Santé clients cycle XLP -> M -> L -> XL -> XLP', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    const burndownSizeBtn = page.locator('[data-testid="dashboard-widget-size-burndown-chart"]');
    await expect(burndownSizeBtn).toHaveText('XL');
    await burndownSizeBtn.click();
    await expect(burndownSizeBtn).toHaveText('L');
    await burndownSizeBtn.click();
    await expect(burndownSizeBtn).toHaveText('XL');

    const clientRagSizeBtn = page.locator('[data-testid="dashboard-widget-size-client-rag"]');
    await expect(clientRagSizeBtn).toHaveText('XLP');
    await clientRagSizeBtn.click();
    await expect(clientRagSizeBtn).toHaveText('M');
    await clientRagSizeBtn.click();
    await expect(clientRagSizeBtn).toHaveText('L');
    await clientRagSizeBtn.click();
    await expect(clientRagSizeBtn).toHaveText('XL');
    await clientRagSizeBtn.click();
    await expect(clientRagSizeBtn).toHaveText('XLP');
  });

  // Réécrit (2026-08-06, retour Julien après correction de trajectoire) — l'ancien panneau
  // "+ Ajouter" par zone (DashboardWidgetGrid.tsx) a été remplacé par un bouton unique dans le
  // Header ("Ajouter un widget", visible en mode Réorganisation) ouvrant une modal
  // (AddWidgetModal.tsx). La nouvelle instance reçoit une `key` générée (doublons de widgets
  // autorisés), donc plus le même testid `dashboard-widget-kpi-blockers` qu'avant sa suppression —
  // recherché par préfixe (`^=`) plutôt qu'égalité exacte.
  test('retirer un widget le fait disparaître, le bouton "Ajouter un widget" du Header permet de le reposer', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-widget-remove-kpi-blockers"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-kpi-blockers"]')).toHaveCount(0);

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await expect(page.locator('[data-testid="dashboard-add-widget-modal"]')).toBeVisible();

    // Bouton "Ajouter" + menu déroulant (2026-08-06, retour Julien : "les boutons... prennent
    // beaucoup trop de place") — remplace les 2 boutons de zone pleine largeur visibles d'emblée,
    // voir AddWidgetModal.tsx.
    await page.locator('[data-testid="add-widget-kpi-blockers-toggle"]').click();
    await page.locator('[data-testid="add-widget-kpi-blockers-sprint"]').click();
    await expect(page.locator('[data-testid^="dashboard-widget-kpi-blockers"]')).toBeVisible();
  });

  test('sortir du mode édition masque les poignées et boutons', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-remove-kpi-done"]')).toBeVisible();

    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-remove-kpi-done"]')).toHaveCount(0);
  });
});

// Chantier "Dashboard widgets, suite" (roadmap v1, Phase 4, 2026-08-03, retour Julien après le 1er
// essai) — 2 zones séparées (Sprint en cours / Vue produit), orientation et partage de l'espace
// réglables. Voir DashboardZoneSplit.tsx, data/dashboardWidgets.ts (`scope`).
test.describe('Dashboard — 2 zones (Sprint en cours / Vue produit)', () => {

  test('les 2 zones sont affichées avec leurs libellés et leurs widgets respectifs', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });

    await expect(page.locator('[data-testid="dashboard-zone-sprint"]')).toContainText('Sprint en cours');
    await expect(page.locator('[data-testid="dashboard-zone-product"]')).toContainText('Vue produit');

    // Widgets scopés "sprint"
    for (const id of ['kpi-current-sprint', 'kpi-blockers', 'burndown-chart', 'recent-activity']) {
      await expect(page.locator(`[data-testid="dashboard-zone-sprint"] [data-testid="dashboard-widget-${id}"]`)).toBeVisible();
    }
    // Widgets scopés "product"
    for (const id of ['kpi-done', 'kpi-velocity', 'velocity-chart', 'client-rag']) {
      await expect(page.locator(`[data-testid="dashboard-zone-product"] [data-testid="dashboard-widget-${id}"]`)).toBeVisible();
    }
  });

  // Réécrit (2026-08-06, retour Julien : "Impossible de rajouter des widgets de l'autre zone" — un
  // vrai bug, pas un comportement voulu) — ce test vérifiait auparavant une LIMITATION du panneau
  // par zone. La modal d'ajout (AddWidgetModal.tsx) propose désormais explicitement les 2 zones
  // pour chaque widget, quel que soit son `scope` par défaut dans le catalogue : le test vérifie
  // maintenant que cette possibilité fonctionne bien, plutôt que son absence.
  test('un widget "sprint" peut être ajouté explicitement dans la zone "produit" via la modal', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-kpi-blockers-toggle"]').click();
    await page.locator('[data-testid="add-widget-kpi-blockers-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    await expect(
      page.locator('[data-testid="dashboard-zone-product"] [data-testid^="dashboard-widget-kpi-blockers"]')
    ).toBeVisible();
  });

  test('les boutons d\'orientation ne sont visibles qu\'en mode édition et changent la disposition', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await expect(page.locator('[data-testid="dashboard-zone-orientation-vertical"]')).toHaveCount(0);

    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await expect(page.locator('[data-testid="dashboard-zone-orientation-horizontal"]')).toBeVisible();

    await page.locator('[data-testid="dashboard-zone-orientation-vertical"]').click();
    await expect(page.locator('[data-testid="dashboard-zone-split"]')).toHaveClass(/dash-zone-split-vertical/);

    await page.locator('[data-testid="dashboard-zone-orientation-horizontal"]').click();
    await expect(page.locator('[data-testid="dashboard-zone-split"]')).toHaveClass(/dash-zone-split-horizontal/);
  });

  test('un Dev ne voit ni le bouton Personnaliser ni les contrôles d\'orientation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'DEV' });
    await expect(page.locator('[data-testid="dashboard-zone-orientation-horizontal"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="dashboard-zone-split"]')).toBeVisible();
  });
});

// Chantier "Face cachée des widgets" (v0.97.3, 2026-08-06, retour Julien) — FlipCard.tsx, câblé au
// départ sur "Sprint actuel" (SprintProgressCard.tsx) uniquement, puis étendu aux 7 autres widgets
// du Dashboard (v0.97.4). Le bouton Réglages n'apparaît qu'en mode "Personnaliser", comme le reste
// des contrôles d'édition d'un widget. Tests scopés sur le widget "Sprint actuel" (locator parent
// `dashboard-widget-kpi-current-sprint`) plutôt que sur le testid `dashboard-widget-flip-settings`
// seul — désormais partagé par 8 widgets simultanément affichés, une recherche non scopée
// déclenche une erreur de mode strict Playwright (plusieurs éléments correspondants). Les testids
// de réglages eux-mêmes (`dashboard-widget-emphasis-sp`, `dashboard-widget-sprint-total`) sont
// suffixés par la `key` du placement depuis le correctif des doublons de widgets (v0.97.4, voir
// SprintProgressCard.tsx) — `kpi-current-sprint` ici, `key` valant `id` par défaut.
test.describe('Dashboard — face cachée de réglages (v0.97.3)', () => {

  test('le bouton Réglages n\'apparaît qu\'en mode Personnaliser', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await expect(page.locator('[data-testid="dashboard-widget-flip-settings"]')).toHaveCount(0);

    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await expect(
      page.locator('[data-testid="dashboard-widget-kpi-current-sprint"] [data-testid="dashboard-widget-flip-settings"]')
    ).toBeVisible();
  });

  test('cliquer sur Réglages affiche le choix SP/%, Retour revient à la face visible', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    const sprintWidget = page.locator('[data-testid="dashboard-widget-kpi-current-sprint"]');
    await sprintWidget.locator('[data-testid="dashboard-widget-flip-settings"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-emphasis-sp-kpi-current-sprint"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-widget-emphasis-percent-kpi-current-sprint"]')).toBeVisible();

    await sprintWidget.locator('[data-testid="dashboard-widget-flip-back"]').click();
    await expect(sprintWidget.locator('[data-testid="dashboard-widget-flip-settings"]')).toBeVisible();
  });

  test('choisir "%" bascule le héros du widget et fait disparaître le total', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    const sprintWidget = page.locator('[data-testid="dashboard-widget-kpi-current-sprint"]');
    await sprintWidget.locator('[data-testid="dashboard-widget-flip-settings"]').click();

    await page.locator('[data-testid="dashboard-widget-emphasis-percent-kpi-current-sprint"]').click();
    await sprintWidget.locator('[data-testid="dashboard-widget-flip-back"]').click();

    // "/{totalSP}" (à côté du héros) disparaît en mode pourcentage — vérifié via son propre
    // data-testid plutôt qu'une recherche de "/" sur tout le widget : la légende reste
    // "{doneSP}/{totalSP} SP" en mode pourcentage, elle contient légitimement un "/".
    await expect(sprintWidget).toContainText('SP');
    await expect(page.locator('[data-testid="dashboard-widget-sprint-total-kpi-current-sprint"]')).toHaveCount(0);
  });

  test('sortir du mode édition revient automatiquement à la face visible', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    const sprintWidget = page.locator('[data-testid="dashboard-widget-kpi-current-sprint"]');
    await sprintWidget.locator('[data-testid="dashboard-widget-flip-settings"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-emphasis-sp-kpi-current-sprint"]')).toBeVisible();

    // Sort du mode édition (un seul clic, "Terminer") — `editable` passe à `false`, FlipCard
    // revient automatiquement sur la face visible (useEffect), les boutons de la face cachée
    // restent dans le DOM (contenu React normal) mais ne sont plus visibles (visibility: hidden).
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-emphasis-sp-kpi-current-sprint"]')).not.toBeVisible();
  });
});

// Chantier "Zones réordonnables + doublons de widgets" (v0.97.4, 2026-08-06, retour Julien après
// correction de trajectoire) — ordre des 2 zones interchangeable (bouton dédié, indépendant de la
// zone de chaque widget), et widgets duplicables via la modal d'ajout (voir AddWidgetModal.tsx).
test.describe('Dashboard — ordre des zones et doublons de widgets (v0.97.4)', () => {

  test('inverser l\'ordre des zones change laquelle est affichée en premier', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    // `.dash-zone` exclut le séparateur (`.dash-zone-splitter`, testid `dashboard-zone-splitter`,
    // qui correspondrait aussi au préfixe `dashboard-zone-` sans ce filtre de classe) — les 2
    // wrappers `display: contents` de DashboardZoneSplit.tsx ne comptent pas comme un niveau de
    // profondeur CSS, un sélecteur `>` direct ne les traverse donc pas, d'où un simple descendant.
    const zones = page.locator('[data-testid="dashboard-zone-split"] .dash-zone[data-testid^="dashboard-zone-"]');
    await expect(zones.first()).toHaveAttribute('data-testid', 'dashboard-zone-sprint');

    await page.locator('[data-testid="dashboard-zone-swap-order"]').click();
    await expect(zones.first()).toHaveAttribute('data-testid', 'dashboard-zone-product');

    await page.locator('[data-testid="dashboard-zone-swap-order"]').click();
    await expect(zones.first()).toHaveAttribute('data-testid', 'dashboard-zone-sprint');
  });

  // Retour Julien : "J'ai fait un doublon du RAG Client... les inputs radio ne se sont pas cochés
  // comme il faut" — bug de collision de `name` HTML entre 2 instances du même widget, corrigé en
  // suffixant `name`/`data-testid` par la `key` (unique par placement) de chaque instance.
  //
  // Sélecteur restreint à `.dash-widget` (2026-08-06) — `[data-testid^="dashboard-widget-client-rag"]`
  // seul remonte aussi les 4 boutons radio de la face cachée de CE widget, eux-mêmes suffixés
  // `dashboard-widget-client-rag-gauge-<key>`/`-dot-`/`-product-`/`-sprint-` (voir ClientRAG.tsx) —
  // même préfixe, ce ne sont pourtant pas des tuiles. `.dash-widget` (classe posée uniquement sur le
  // conteneur de tuile dans DashboardWidgetGrid.tsx) exclut ces éléments internes.
  test('dupliquer un widget via la modal pose une 2e instance indépendante de la 1ère', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    const tiles = page.locator('.dash-widget[data-testid^="dashboard-widget-client-rag"]');
    await expect(tiles).toHaveCount(1);

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-client-rag-toggle"]').click();
    await page.locator('[data-testid="add-widget-client-rag-sprint"]').click();

    // Toast de confirmation (2026-08-06, retour Julien) — vérifié avant de fermer la modal, le
    // toast se referme automatiquement après 2,8s (voir ToastContext.tsx).
    await expect(page.getByRole('status')).toContainText('Santé clients (RAG)');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    await expect(tiles).toHaveCount(2);
  });
});
