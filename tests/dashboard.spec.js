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

  // Correctif (v0.97.6, 2026-08-07, retour Julien : "quand on agrandit une zone, elle ne gagne pas
  // d'autres emplacements en largeur... on a maximum 4 emplacements de taille S" même zone pleine
  // largeur) — la grille de chaque zone (DashboardWidgetGrid.tsx) mesure désormais sa largeur RÉELLE
  // via un `ResizeObserver` pour calculer son nombre de colonnes, au lieu d'une largeur/un nombre de
  // colonnes toujours fixes (12 colonnes = 748px, quelle que soit la zone). Zones empilées + grand
  // viewport → chaque zone approche la pleine largeur de la fenêtre, largement au-delà de 748px :
  // la grille doit suivre, pas rester figée à sa largeur minimale. `expect.poll` plutôt qu'une
  // lecture unique de `boundingBox()` : le premier rendu utilise la largeur de repli
  // (`DASHBOARD_GRID_WIDTH_PX`) avant que le `ResizeObserver` ne déclenche son 1er callback.
  test('une zone empilée en plein écran gagne des colonnes au-delà de la largeur minimale (748px)', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await page.locator('[data-testid="dashboard-zone-orientation-vertical"]').click();

    const grid = page.locator('[data-testid="dashboard-zone-sprint"] .dash-widget-grid');
    await expect.poll(async () => (await grid.boundingBox())?.width ?? 0).toBeGreaterThan(748);
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

// Chantier "Vélocité par membre" (v0.97.5, 2026-08-06) — 9e widget Dashboard, disponible
// uniquement via la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir
// TeamVelocityChart.tsx. Ajouté via la modal, sa `key` est générée (`team-velocity-<uid>`), donc
// pas de testid fixe `dashboard-widget-team-velocity` : la tuile et ses réglages sont recherchés
// par préfixe (`^=`), même convention que le test de duplication de "Santé clients (RAG)" ci-dessus.
test.describe('Dashboard — widget "Vélocité par membre" (v0.97.5)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Vue produit avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-team-velocity-toggle"]').click();
    await page.locator('[data-testid="add-widget-team-velocity-product"]').click();

    await expect(page.getByRole('status')).toContainText('Vélocité par membre');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    await expect(
      page.locator('[data-testid="dashboard-zone-product"] .dash-widget[data-testid^="dashboard-widget-team-velocity"]')
    ).toBeVisible();
  });

  test('la face cachée bascule entre SP terminés (par défaut) et nombre d\'US terminées', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-team-velocity-toggle"]').click();
    await page.locator('[data-testid="add-widget-team-velocity-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-team-velocity"]');
    await tile.locator('[data-testid="dashboard-widget-flip-settings"]').click();

    const spRadio = tile.locator('[data-testid^="dashboard-widget-team-velocity-sp-"]');
    const countRadio = tile.locator('[data-testid^="dashboard-widget-team-velocity-count-"]');
    await expect(spRadio).toBeChecked();
    await expect(countRadio).not.toBeChecked();

    await countRadio.click();
    await expect(countRadio).toBeChecked();
    await expect(spRadio).not.toBeChecked();

    await tile.locator('[data-testid="dashboard-widget-flip-back"]').click();
    await expect(tile.locator('[data-testid="dashboard-widget-flip-settings"]')).toBeVisible();
  });

  // Widget dupliquable comme les 8 autres depuis le correctif v0.97.4 (collision de `name` HTML) —
  // vérifie que ce widget-là suit bien la même règle : 2 exemplaires, chacun son propre réglage.
  test('2 exemplaires du widget gardent chacun leur propre réglage SP/US', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();

    await page.locator('[data-testid="add-widget-team-velocity-toggle"]').click();
    await page.locator('[data-testid="add-widget-team-velocity-product"]').click();
    await page.locator('[data-testid="add-widget-team-velocity-toggle"]').click();
    await page.locator('[data-testid="add-widget-team-velocity-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tiles = page.locator('.dash-widget[data-testid^="dashboard-widget-team-velocity"]');
    await expect(tiles).toHaveCount(2);

    const first = tiles.nth(0);
    await first.locator('[data-testid="dashboard-widget-flip-settings"]').click();
    await first.locator('[data-testid^="dashboard-widget-team-velocity-count-"]').click();
    await first.locator('[data-testid="dashboard-widget-flip-back"]').click();

    const second = tiles.nth(1);
    await second.locator('[data-testid="dashboard-widget-flip-settings"]').click();
    await expect(second.locator('[data-testid^="dashboard-widget-team-velocity-sp-"]')).toBeChecked();
  });
});

// Chantier "Santé du sprint" (v0.97.5, 2026-08-06) — 10e widget Dashboard, disponible uniquement
// via la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir SprintHealthCard.tsx. Ajouté via
// la modal, sa `key` est générée (`sprint-health-<uid>`) — même convention de recherche par préfixe
// que le bloc "Vélocité par membre" ci-dessus. Scope 'sprint' (pas 'product') : ajouté dans la zone
// "Sprint en cours" via `add-widget-sprint-health-sprint`.
test.describe('Dashboard — widget "Santé du sprint" (v0.97.5)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Sprint en cours avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-sprint-health-toggle"]').click();
    await page.locator('[data-testid="add-widget-sprint-health-sprint"]').click();

    await expect(page.getByRole('status')).toContainText('Santé du sprint');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    await expect(
      page.locator('[data-testid="dashboard-zone-sprint"] .dash-widget[data-testid^="dashboard-widget-sprint-health"]')
    ).toBeVisible();
  });

  test('la face cachée bascule entre Story Points (par défaut) et nombre d\'US', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-sprint-health-toggle"]').click();
    await page.locator('[data-testid="add-widget-sprint-health-sprint"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-sprint-health"]');
    await tile.locator('[data-testid="dashboard-widget-flip-settings"]').click();

    const spRadio = tile.locator('[data-testid^="dashboard-widget-sprint-health-sp-"]');
    const itemsRadio = tile.locator('[data-testid^="dashboard-widget-sprint-health-items-"]');
    await expect(spRadio).toBeChecked();
    await expect(itemsRadio).not.toBeChecked();

    await itemsRadio.click();
    await expect(itemsRadio).toBeChecked();
    await expect(spRadio).not.toBeChecked();

    await tile.locator('[data-testid="dashboard-widget-flip-back"]').click();
    await expect(tile.locator('[data-testid="dashboard-widget-flip-settings"]')).toBeVisible();
  });

  // Seul widget du catalogue limité à L/XL (retour Julien, après le 1er essai en M/L : "la taille
  // est trop petite pour le nombre d'informations") — cycle à 2 tailles, pas 3+ comme les autres
  // widgets à plusieurs tailles.
  test('changer la taille cycle L -> XL -> L', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-sprint-health-toggle"]').click();
    await page.locator('[data-testid="add-widget-sprint-health-sprint"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-sprint-health"]');
    const sizeBtn = tile.locator('[data-testid^="dashboard-widget-size-sprint-health"]');
    await expect(sizeBtn).toHaveText('L');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('XL');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('L');
  });

  // 5e statistique ajoutée (2026-08-07, retour Julien : "il faut que la jauge affiche les items
  // bloqués") — présente en L comme en XL, seule la disposition change (2 lignes 3+2 en L, 1 ligne
  // de 5 en XL), le libellé lui-même est toujours affiché dans les 2 tailles.
  test('affiche la statistique "Items bloqués" en L comme en XL', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-sprint-health-toggle"]').click();
    await page.locator('[data-testid="add-widget-sprint-health-sprint"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-sprint-health"]');
    await expect(tile).toContainText('Items bloqués');

    await tile.locator('[data-testid^="dashboard-widget-size-sprint-health"]').click();
    await expect(tile).toContainText('Items bloqués');
  });
});

// Chantier "Absences du sprint" (v0.97.5, 2026-08-06) — 11e widget Dashboard, disponible
// uniquement via la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir
// SprintAbsencesCard.tsx. Pas de face cachée de réglages (aucun réglage demandé), donc pas de test
// de bascule ici, contrairement aux 2 blocs précédents. `DEMO_STATE.absences` est vide (voir
// data/demo.ts) : le widget affiche systématiquement son état vide dans ces tests, ce qui permet
// de vérifier ce message de façon déterministe sans dépendre du contenu changeant du jeu de
// données de démo.
test.describe('Dashboard — widget "Absences du sprint" (v0.97.5)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Sprint en cours avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-sprint-absences-toggle"]').click();
    await page.locator('[data-testid="add-widget-sprint-absences-sprint"]').click();

    await expect(page.getByRole('status')).toContainText('Absences du sprint');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    const tile = page.locator('[data-testid="dashboard-zone-sprint"] .dash-widget[data-testid^="dashboard-widget-sprint-absences"]');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('Aucune absence sur ce sprint');
  });

  // Seul widget du catalogue en S/M (pas L/XL comme Santé du sprint) — maquette validée avant
  // développement (retour Julien : "Je vois bien un widget soit en taille S ou M... Avant de le
  // développer, fais-moi un mockup"), taille S jugée trop petite pour le détail par personne
  // (période, compte à rebours), retenue quand même pour un résumé (total + avatars empilés).
  test('changer la taille cycle S -> M -> S', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-sprint-absences-toggle"]').click();
    await page.locator('[data-testid="add-widget-sprint-absences-sprint"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-sprint-absences"]');
    const sizeBtn = tile.locator('[data-testid^="dashboard-widget-size-sprint-absences"]');
    await expect(sizeBtn).toHaveText('S');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('M');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('S');
  });
});

// Chantier "Progression par Epic" (v0.97.6, 2026-08-07) — 12e widget Dashboard, disponible
// uniquement via la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir
// EpicProgressCard.tsx. Scope 'product' par défaut (contrairement aux 3 widgets précédents, tous
// scope 'sprint') — ajouté dans la zone "Vue produit" via `add-widget-epic-progress-product`.
// `DEMO_STATE` contient plusieurs Epics (voir data/demo.ts) : le widget affiche donc des lignes
// dès l'ajout, pas l'état vide.
test.describe('Dashboard — widget "Progression par Epic" (v0.97.6)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Vue produit avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-epic-progress-toggle"]').click();
    await page.locator('[data-testid="add-widget-epic-progress-product"]').click();

    await expect(page.getByRole('status')).toContainText('Progression par Epic');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    await expect(
      page.locator('[data-testid="dashboard-zone-product"] .dash-widget[data-testid^="dashboard-widget-epic-progress"]')
    ).toBeVisible();
  });

  test('la face cachée bascule indépendamment le périmètre (Produit/Sprint) et la métrique (SP/US)', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-epic-progress-toggle"]').click();
    await page.locator('[data-testid="add-widget-epic-progress-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-epic-progress"]');
    await tile.locator('[data-testid="dashboard-widget-flip-settings"]').click();

    const productRadio = tile.locator('[data-testid^="dashboard-widget-epic-progress-product-"]');
    const sprintRadio = tile.locator('[data-testid^="dashboard-widget-epic-progress-sprint-"]');
    const spRadio = tile.locator('[data-testid^="dashboard-widget-epic-progress-sp-"]');
    const itemsRadio = tile.locator('[data-testid^="dashboard-widget-epic-progress-items-"]');

    await expect(productRadio).toBeChecked();
    await expect(spRadio).toBeChecked();

    await sprintRadio.click();
    await expect(sprintRadio).toBeChecked();
    await expect(productRadio).not.toBeChecked();
    // Le réglage de métrique n'est pas affecté par celui de périmètre — 2 groupes indépendants.
    await expect(spRadio).toBeChecked();

    await itemsRadio.click();
    await expect(itemsRadio).toBeChecked();
    await expect(spRadio).not.toBeChecked();

    await tile.locator('[data-testid="dashboard-widget-flip-back"]').click();
    await expect(tile.locator('[data-testid="dashboard-widget-flip-settings"]')).toBeVisible();
  });

  test('changer la taille cycle L -> XLP -> L', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-epic-progress-toggle"]').click();
    await page.locator('[data-testid="add-widget-epic-progress-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-epic-progress"]');
    const sizeBtn = tile.locator('[data-testid^="dashboard-widget-size-epic-progress"]');
    await expect(sizeBtn).toHaveText('L');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('XLP');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('L');
  });
});

// Chantier "Forecast de livraison" (v0.97.6, 2026-08-07) — 13e widget Dashboard, disponible
// uniquement via la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir
// DeliveryForecastCard.tsx. Pas de face cachée de réglages (aucun réglage demandé), donc pas de
// test de bascule ici, comme le bloc "Absences du sprint". `DEMO_STATE` a un sprint clôturé
// (`closed: true`, voir data/demo.ts) et un backlog non entièrement terminé : le widget affiche
// donc ses 3 colonnes de dates, pas un des 2 messages d'état particulier (backlog fini / pas
// d'historique).
test.describe('Dashboard — widget "Forecast de livraison" (v0.97.6)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Vue produit avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-delivery-forecast-toggle"]').click();
    await page.locator('[data-testid="add-widget-delivery-forecast-product"]').click();

    await expect(page.getByRole('status')).toContainText('Forecast de livraison');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    const tile = page.locator('[data-testid="dashboard-zone-product"] .dash-widget[data-testid^="dashboard-widget-delivery-forecast"]');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('SP restants sur');
    await expect(tile).toContainText('Optimiste');
    await expect(tile).toContainText('Moyen');
    await expect(tile).toContainText('Pessimiste');
  });

  test('changer la taille cycle M -> L -> M', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-delivery-forecast-toggle"]').click();
    await page.locator('[data-testid="add-widget-delivery-forecast-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-delivery-forecast"]');
    const sizeBtn = tile.locator('[data-testid^="dashboard-widget-size-delivery-forecast"]');
    await expect(sizeBtn).toHaveText('M');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('L');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('M');
  });
});

// Chantier "Vue par client" (v0.97.6, 2026-08-07) — 14e widget Dashboard, disponible uniquement via
// la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir ClientViewCard.tsx. Scope 'product',
// ajouté dans la zone "Vue produit" via `add-widget-client-view-product`.
test.describe('Dashboard — widget "Vue par client" (v0.97.6)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Vue produit avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-client-view-toggle"]').click();
    await page.locator('[data-testid="add-widget-client-view-product"]').click();

    await expect(page.getByRole('status')).toContainText('Vue par client');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    await expect(
      page.locator('[data-testid="dashboard-zone-product"] .dash-widget[data-testid^="dashboard-widget-client-view"]')
    ).toBeVisible();
  });

  test('la face cachée bascule entre Courbes (par défaut) et Tableau chaleur', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-client-view-toggle"]').click();
    await page.locator('[data-testid="add-widget-client-view-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-client-view"]');
    await tile.locator('[data-testid="dashboard-widget-flip-settings"]').click();

    const linesRadio = tile.locator('[data-testid^="dashboard-widget-client-view-lines-"]');
    const heatmapRadio = tile.locator('[data-testid^="dashboard-widget-client-view-heatmap-"]');
    await expect(linesRadio).toBeChecked();
    await expect(heatmapRadio).not.toBeChecked();

    await heatmapRadio.click();
    await expect(heatmapRadio).toBeChecked();
    await expect(linesRadio).not.toBeChecked();

    await tile.locator('[data-testid="dashboard-widget-flip-back"]').click();
    await expect(tile.locator('[data-testid="dashboard-widget-flip-settings"]')).toBeVisible();
  });

  test('changer la taille cycle M -> L -> XL -> M', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-client-view-toggle"]').click();
    await page.locator('[data-testid="add-widget-client-view-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-client-view"]');
    const sizeBtn = tile.locator('[data-testid^="dashboard-widget-size-client-view"]');
    await expect(sizeBtn).toHaveText('M');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('L');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('XL');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('M');
  });
});

// Chantier "Actions de rétro" (v0.97.6, 2026-08-07) — 15e widget Dashboard, disponible uniquement
// via la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir RetroActionsCard.tsx. Scope
// 'product', ajouté dans la zone "Vue produit" via `add-widget-retro-actions-product`. Pas de face
// cachée de réglages (aucun réglage demandé), donc pas de test de bascule ici, comme le bloc
// "Absences du sprint"/"Forecast de livraison". `DEMO_STATE.retroSessions` et `.retroArchives` sont
// tous deux vides (voir data/demo.ts) : le widget affiche donc systématiquement l'état vide.
test.describe('Dashboard — widget "Actions de rétro" (v0.97.6)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Vue produit avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-retro-actions-toggle"]').click();
    await page.locator('[data-testid="add-widget-retro-actions-product"]').click();

    await expect(page.getByRole('status')).toContainText('Actions de rétro');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    const tile = page.locator('[data-testid="dashboard-zone-product"] .dash-widget[data-testid^="dashboard-widget-retro-actions"]');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('Aucune action ouverte');
  });

  test('changer la taille cycle S -> M -> S', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-retro-actions-toggle"]').click();
    await page.locator('[data-testid="add-widget-retro-actions-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-retro-actions"]');
    const sizeBtn = tile.locator('[data-testid^="dashboard-widget-size-retro-actions"]');
    await expect(sizeBtn).toHaveText('S');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('M');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('S');
  });
});

// Chantier "Items bloqués par dépendance" (v0.97.6, 2026-08-07) — 16e widget Dashboard, disponible
// uniquement via la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir
// BlockedItemsCard.tsx. Scope 'sprint' par défaut, ajouté dans la zone "Sprint en cours" via
// `add-widget-blocked-items-sprint`. Pas d'assertion de contenu sur le test d'ajout (comme "Santé du
// sprint") : le résultat dépend du sprint en cours au moment de l'exécution (`Item.sprintId` vs la
// date du jour dans `DEMO_STATE.sprints`), pas une donnée figée comme les widgets à état vide
// garanti (Absences du sprint, Actions de rétro).
test.describe('Dashboard — widget "Items bloqués par dépendance" (v0.97.6)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Sprint en cours avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-blocked-items-toggle"]').click();
    await page.locator('[data-testid="add-widget-blocked-items-sprint"]').click();

    await expect(page.getByRole('status')).toContainText('Items bloqués par dépendance');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    await expect(
      page.locator('[data-testid="dashboard-zone-sprint"] .dash-widget[data-testid^="dashboard-widget-blocked-items"]')
    ).toBeVisible();
  });

  test('la face cachée bascule entre Sprint en cours (par défaut) et Tout le backlog', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-blocked-items-toggle"]').click();
    await page.locator('[data-testid="add-widget-blocked-items-sprint"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-blocked-items"]');
    await tile.locator('[data-testid="dashboard-widget-flip-settings"]').click();

    const sprintRadio = tile.locator('[data-testid^="dashboard-widget-blocked-items-sprint-"]');
    const productRadio = tile.locator('[data-testid^="dashboard-widget-blocked-items-product-"]');
    await expect(sprintRadio).toBeChecked();
    await expect(productRadio).not.toBeChecked();

    await productRadio.click();
    await expect(productRadio).toBeChecked();
    await expect(sprintRadio).not.toBeChecked();

    await tile.locator('[data-testid="dashboard-widget-flip-back"]').click();
    await expect(tile.locator('[data-testid="dashboard-widget-flip-settings"]')).toBeVisible();
  });

  test('changer la taille cycle S -> M -> S', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-blocked-items-toggle"]').click();
    await page.locator('[data-testid="add-widget-blocked-items-sprint"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-blocked-items"]');
    const sizeBtn = tile.locator('[data-testid^="dashboard-widget-size-blocked-items"]');
    await expect(sizeBtn).toHaveText('S');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('M');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('S');
  });
});

// Chantier "Prêt pour planification" (v0.97.6, 2026-08-07) — 17e widget Dashboard, disponible
// uniquement via la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir
// ReadyForPlanningCard.tsx. Scope 'product', ajouté dans la zone "Vue produit" via
// `add-widget-ready-for-planning-product`. Pas de face cachée de réglages (aucun réglage demandé),
// donc pas de test de bascule ici, comme "Absences du sprint"/"Actions de rétro". Aucun item du
// backlog démo n'a de DoR renseignée (voir data/demo.ts) : le widget affiche donc systématiquement
// l'état vide, même principe que "Absences du sprint"/"Actions de rétro".
test.describe('Dashboard — widget "Prêt pour planification" (v0.97.6)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Vue produit avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-ready-for-planning-toggle"]').click();
    await page.locator('[data-testid="add-widget-ready-for-planning-product"]').click();

    await expect(page.getByRole('status')).toContainText('Prêt pour planification');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    const tile = page.locator('[data-testid="dashboard-zone-product"] .dash-widget[data-testid^="dashboard-widget-ready-for-planning"]');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('Aucun item prêt');
  });

  test('changer la taille cycle S -> M -> S', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-ready-for-planning-toggle"]').click();
    await page.locator('[data-testid="add-widget-ready-for-planning-product"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-ready-for-planning"]');
    const sizeBtn = tile.locator('[data-testid^="dashboard-widget-size-ready-for-planning"]');
    await expect(sizeBtn).toHaveText('S');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('M');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('S');
  });
});

// Chantier "Charge actuelle par membre" (v0.97.6, 2026-08-07) — 18e widget Dashboard, disponible
// uniquement via la modal d'ajout (pas dans `DEFAULT_DASHBOARD_LAYOUT`), voir
// MemberWorkloadCard.tsx. Scope 'sprint', ajouté dans la zone "Sprint en cours" via
// `add-widget-member-workload-sprint`. Pas de face cachée de réglages (aucun réglage demandé), donc
// pas de test de bascule ici, comme "Santé du sprint"/"Items bloqués par dépendance". Pas
// d'assertion de contenu sur le test d'ajout (comme "Santé du sprint") : le contenu dépend du sprint
// en cours et de la répartition SP par membre au moment de l'exécution, pas une donnée figée.
test.describe('Dashboard — widget "Charge actuelle par membre" (v0.97.6)', () => {

  test('ajouté depuis la modal, il s\'affiche dans la zone Sprint en cours avec un toast de confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-member-workload-toggle"]').click();
    await page.locator('[data-testid="add-widget-member-workload-sprint"]').click();

    await expect(page.getByRole('status')).toContainText('Charge actuelle par membre');

    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();
    await expect(
      page.locator('[data-testid="dashboard-zone-sprint"] .dash-widget[data-testid^="dashboard-widget-member-workload"]')
    ).toBeVisible();
  });

  test('changer la taille cycle L -> XLP -> L', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
    await page.locator('[data-testid="add-widget-member-workload-toggle"]').click();
    await page.locator('[data-testid="add-widget-member-workload-sprint"]').click();
    await page.locator('[data-testid="dashboard-add-widget-modal"] .modal-close').click();

    const tile = page.locator('.dash-widget[data-testid^="dashboard-widget-member-workload"]');
    const sizeBtn = tile.locator('[data-testid^="dashboard-widget-size-member-workload"]');
    await expect(sizeBtn).toHaveText('L');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('XLP');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('L');
  });
});

// Chantier "Modal d'ajout de widget : recherche/tri/filtres/badges" (v0.97.6, 2026-08-07, retour
// Julien : "la modal propose pas loin de 20 widgets, il va falloir étoffer le choix") — catalogue
// passé à 18 entrées, voir AddWidgetModal.tsx (champ de recherche, boutons de tri A→Z/Z→A/Récents,
// filtres taille/zone, badges de taille par carte). État purement local à la modal, réinitialisé à
// chaque ouverture (pas de test de persistance ici).
test.describe('Dashboard — modal d\'ajout de widget : recherche/tri/filtres (v0.97.6)', () => {

  async function openModal(page) {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await page.locator('[data-testid="dashboard-add-widget-btn"]').click();
  }

  test('les 18 widgets du catalogue sont proposés par défaut, sans filtre actif', async ({ page }) => {
    await openModal(page);
    await expect(page.locator('[data-testid^="add-widget-card-"]')).toHaveCount(18);
  });

  test('le champ de recherche filtre par libellé, insensible aux accents et à la casse', async ({ page }) => {
    await openModal(page);
    await page.locator('[data-testid="add-widget-search"]').fill('RECENTE');

    await expect(page.locator('[data-testid^="add-widget-card-"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="add-widget-card-recent-activity"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-widget-card-kpi-done"]')).toHaveCount(0);
  });

  test('une recherche sans résultat affiche l\'état vide', async ({ page }) => {
    await openModal(page);
    await page.locator('[data-testid="add-widget-search"]').fill('zzzzz');

    await expect(page.locator('[data-testid="add-widget-empty"]')).toBeVisible();
    await expect(page.locator('[data-testid^="add-widget-card-"]')).toHaveCount(0);
  });

  test('le tri A→Z (par défaut) place "Absences du sprint" en premier, Z→A le place en dernier', async ({ page }) => {
    await openModal(page);
    const cards = page.locator('[data-testid^="add-widget-card-"]');
    await expect(cards.first()).toHaveAttribute('data-testid', 'add-widget-card-sprint-absences');

    await page.locator('[data-testid="add-widget-sort-za"]').click();
    await expect(cards.last()).toHaveAttribute('data-testid', 'add-widget-card-sprint-absences');
  });

  test('le tri "Récents" place le widget le plus récemment ajouté au catalogue en tête', async ({ page }) => {
    await openModal(page);
    await page.locator('[data-testid="add-widget-sort-recent"]').click();

    const cards = page.locator('[data-testid^="add-widget-card-"]');
    await expect(cards.first()).toHaveAttribute('data-testid', 'add-widget-card-member-workload');
  });

  test('le filtre de taille limite l\'affichage aux widgets disponibles dans cette taille', async ({ page }) => {
    await openModal(page);
    await page.locator('[data-testid="add-widget-filter-size-XLP"]').click();

    await expect(page.locator('[data-testid^="add-widget-card-"]')).toHaveCount(3);
    await expect(page.locator('[data-testid="add-widget-card-client-rag"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-widget-card-epic-progress"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-widget-card-member-workload"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-widget-card-kpi-done"]')).toHaveCount(0);
  });

  test('le filtre de zone limite l\'affichage aux widgets de cette zone par défaut', async ({ page }) => {
    await openModal(page);
    await page.locator('[data-testid="add-widget-filter-zone-sprint"]').click();

    await expect(page.locator('[data-testid^="add-widget-card-"]')).toHaveCount(8);
    await expect(page.locator('[data-testid="add-widget-card-member-workload"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-widget-card-kpi-done"]')).toHaveCount(0);
  });

  test('chaque carte affiche un badge par taille disponible du widget', async ({ page }) => {
    await openModal(page);

    const kpiDoneCard = page.locator('[data-testid="add-widget-card-kpi-done"]');
    await expect(kpiDoneCard.getByText('S', { exact: true })).toBeVisible();

    const clientRagCard = page.locator('[data-testid="add-widget-card-client-rag"]');
    await expect(clientRagCard.getByText('M', { exact: true })).toBeVisible();
    await expect(clientRagCard.getByText('L', { exact: true })).toBeVisible();
    await expect(clientRagCard.getByText('XL', { exact: true })).toBeVisible();
    await expect(clientRagCard.getByText('XLP', { exact: true })).toBeVisible();
  });
});
