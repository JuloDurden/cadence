const { test, expect } = require('@playwright/test');
const { goTo, BASE_URL } = require('./helpers');

test.describe('Auto-planning', () => {

  test('affiche les stats dans le header (items, SP, sprints)', async ({ page }) => {
    await goTo(page, '/auto');
    await expect(page.getByText(/\d+ items/)).toBeVisible();
    await expect(page.getByText(/\d+ SP en attente/)).toBeVisible();
    await expect(page.getByText(/\d+ sprints ouverts/)).toBeVisible();
  });

  test('affiche les 4 critères dans un nouveau scénario', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    // .first() car État actuel a aussi un label "Priorité" dans son panneau de filtres
    await expect(page.getByText('Priorité', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Importance client', { exact: true })).toBeVisible();
    await expect(page.getByText('Socle commun en tête', { exact: true })).toBeVisible();
    await expect(page.getByText('Dette technique', { exact: true })).toBeVisible();
  });

  test('le critère Priorité est actif par défaut', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    // Les critères sont [draggable="true"] — évite de cibler les checkboxes de l'État actuel
    const checkbox = page.locator('[draggable="true"]').filter({ hasText: 'Priorité' }).locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeChecked();
  });

  test('affiche le panneau Règles dans un nouveau scénario', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    // La section Règles est collapsée par défaut — cliquer pour l'ouvrir
    await page.getByRole('button', { name: 'Règles' }).first().click();
    await expect(page.getByText('Dépendances', { exact: true })).toBeVisible();
    await expect(page.getByText('Deadlines', { exact: true })).toBeVisible();
  });

  test('le bouton Générer est visible dans un nouveau scénario', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await expect(page.getByRole('button', { name: 'Générer' }).first()).toBeVisible();
  });

  test('le bouton Appliquer n\'est pas visible avant génération', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await expect(page.getByRole('button', { name: 'Appliquer' })).not.toBeVisible();
  });

  test('générer affiche une proposition avec au moins un sprint', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    // /\d+\/\d+ SP/ est unique aux en-têtes de slots (pas dans le SVG du graphe)
    await expect(page.locator('.page-content').getByText(/\d+\/\d+ SP/).first()).toBeVisible();
  });

  test('générer affiche le bouton Appliquer', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    await expect(page.getByRole('button', { name: 'Appliquer' }).first()).toBeVisible();
  });

  test('chaque sprint de la proposition affiche SP utilisés / capacité', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    await expect(page.locator('.page-content').getByText(/\d+\/\d+ SP/).first()).toBeVisible();
  });

  test('Regénérer conserve le bouton Appliquer', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    await expect(page.getByRole('button', { name: 'Appliquer' }).first()).toBeVisible();
    // Regénérer = cliquer à nouveau sur Générer — Appliquer reste visible
    await page.getByRole('button', { name: 'Générer' }).first().click();
    await expect(page.getByRole('button', { name: 'Appliquer' }).first()).toBeVisible();
  });

  test('activer le critère client affiche l\'ordre des clients', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    // Scoper aux critères draggable pour éviter les checkboxes des filtres de l'État actuel
    const criteriaCheckboxes = page.locator('[draggable="true"] input[type="checkbox"]');
    await criteriaCheckboxes.nth(1).check();
    await expect(page.getByText('Ordre des clients')).toBeVisible();
  });

  test('appliquer la proposition ne génère pas d\'erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    await page.getByRole('button', { name: 'Appliquer' }).first().click();
    expect(errors).toHaveLength(0);
  });

  test('le premier sprint ouvert conserve son thème dans la proposition', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    // Sprint 2 est le premier sprint ouvert dans DEMO_STATE, label "Sprint 2 - MODERNISATION"
    await expect(page.locator('.page-content').getByText(/Sprint 2\s*[–-]\s*Sprint 2 - MODERNISATION/).first()).toBeVisible();
  });

  test('les sprints suivants n\'affichent pas de thème dans la proposition', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    // Sprint 3 ne doit pas afficher son thème "INTELLIGENCE" dans la proposition
    await expect(page.locator('.page-content').getByText(/Sprint 3\s*[–-]\s*Sprint 3 - INTELLIGENCE/)).toHaveCount(0);
    // Il apparaît juste comme "Sprint 3"
    await expect(page.locator('.page-content').getByText(/^Sprint 3$/).first()).toBeVisible();
  });

  test('la bannière de nouveaux sprints utilise la bonne grammaire', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    const content = page.locator('.page-content');
    // Vérifie la forme correcte si des nouveaux sprints sont proposés
    const hasBanner = await content.getByText(/nouveau.* sprint/i).count() > 0;
    if (hasBanner) {
      // Forme correcte : "sera créé" (singulier) ou "seront créés" (pluriel)
      const hasSingular = await content.getByText('sera créé', { exact: false }).count() > 0;
      const hasPlural   = await content.getByText('seront créés', { exact: false }).count() > 0;
      expect(hasSingular || hasPlural).toBe(true);
    }
  });

  test('la proposition est persistée après navigation React Router', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    await expect(page.getByRole('button', { name: 'Appliquer' }).first()).toBeVisible();
    // Navigation React Router vers Backlog (pas de rechargement de page)
    await page.getByRole('link', { name: /backlog/i }).first().click();
    await page.waitForTimeout(300);
    // Retour vers Auto-planning
    await page.getByRole('link', { name: /auto.planning/i }).first().click();
    await page.waitForTimeout(300);
    // La proposition doit être toujours présente
    await expect(page.getByRole('button', { name: 'Appliquer' }).first()).toBeVisible();
  });

  test('les critères sont draggables', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    // Chaque critère doit avoir l'attribut draggable
    const criteriaItems = page.locator('[draggable="true"]');
    await expect(criteriaItems.first()).toBeAttached();
  });

});
