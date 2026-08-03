const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Dashboard', () => {

  test('affiche les KPI StatCards', async ({ page }) => {
    await goTo(page, '/dashboard');
    await expect(page.getByText('US terminées')).toBeVisible();
    await expect(page.getByText('Sprint actuel')).toBeVisible();
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

  test('le mode édition affiche les poignées, boutons de taille et de suppression', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await expect(page.locator('[data-testid="dashboard-widget-size-kpi-done"]')).toHaveCount(0);

    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await expect(page.locator('[data-testid="dashboard-widget-size-kpi-done"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-widget-remove-kpi-done"]')).toBeVisible();
  });

  // Retour Julien (2026-08-03, après le 1er essai) : les widgets à valeur unique (dont kpi-done)
  // sont désormais verrouillés sur une seule taille (bouton de taille masqué) — le cycle de taille
  // se teste maintenant sur un widget à plusieurs infos (velocity-chart, M -> L -> M).
  test('changer la taille d\'un widget multi-infos fait passer M -> L -> M', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await expect(page.locator('[data-testid="dashboard-widget-size-kpi-done"]')).toHaveCount(0);

    const sizeBtn = page.locator('[data-testid="dashboard-widget-size-velocity-chart"]');
    await expect(sizeBtn).toHaveText('M');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('L');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('M');
  });

  // Suite (2026-08-03, retour Julien "il faut aussi retravailler et normaliser les tailles",
  // v0.97.2) — Burndown et Santé clients ont désormais chacun une taille dédiée (XL / XL Portrait)
  // en plus de L, à la place de leur ancien M/L. Voir data/dashboardWidgets.ts.
  test('le Burndown passe de L à XL (taille pleine largeur), Santé clients de L à XL Portrait', async ({ page }) => {
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
    await expect(clientRagSizeBtn).toHaveText('L');
    await clientRagSizeBtn.click();
    await expect(clientRagSizeBtn).toHaveText('XLP');
  });

  test('retirer un widget le fait disparaître et le remet disponible pour être rajouté', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-widget-remove-kpi-blockers"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-kpi-blockers"]')).toHaveCount(0);

    // kpi-blockers est un widget de la zone "Sprint en cours" — le panneau d'ajout est maintenant
    // scopé par zone (data-testid namespacé), voir DashboardWidgetGrid.tsx.
    await page.locator('[data-testid="dashboard-add-widget-toggle-sprint"]').click();
    await expect(page.locator('[data-testid="dashboard-add-widget-kpi-blockers"]')).toBeVisible();

    await page.locator('[data-testid="dashboard-add-widget-kpi-blockers"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-kpi-blockers"]')).toBeVisible();
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

  test('un widget "sprint" ne peut être rajouté que dans le panneau de la zone "sprint"', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-widget-remove-kpi-blockers"]').click();

    // Le panneau "+ Ajouter" de la zone produit ne doit pas proposer kpi-blockers (widget sprint).
    await page.locator('[data-testid="dashboard-add-widget-toggle-product"]').click();
    await expect(page.locator('[data-testid="dashboard-add-widget-kpi-blockers"]')).toHaveCount(0);
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
