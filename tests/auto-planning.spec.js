const { test, expect } = require('@playwright/test');
const { goTo, BASE_URL } = require('./helpers');

// Bouton "Annuler" de la proposition (pas le bouton undo global qui a aria-label="Annuler")
const proposalAnnuler = (page) =>
  page.locator('button:not([aria-label="Annuler"])').filter({ hasText: 'Annuler' });

test.describe('Auto-planning', () => {

  test('affiche les stats dans le header (items, SP, sprints)', async ({ page }) => {
    await goTo(page, '/auto');
    await expect(page.getByText(/\d+ items/)).toBeVisible();
    await expect(page.getByText(/\d+ SP en attente/)).toBeVisible();
    await expect(page.getByText(/\d+ sprints ouverts/)).toBeVisible();
  });

  test('affiche les 4 critères par défaut', async ({ page }) => {
    await goTo(page, '/auto');
    // { exact: true } pour éviter les faux positifs sur les descriptions contenant "priorité"
    await expect(page.getByText('Priorité', { exact: true })).toBeVisible();
    await expect(page.getByText('Importance client', { exact: true })).toBeVisible();
    await expect(page.getByText('Socle commun en tête', { exact: true })).toBeVisible();
    await expect(page.getByText('Dette technique', { exact: true })).toBeVisible();
  });

  test('le critère Priorité est actif par défaut', async ({ page }) => {
    await goTo(page, '/auto');
    const checkbox = page.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeChecked();
  });

  test('affiche le panneau Règles', async ({ page }) => {
    await goTo(page, '/auto');
    await expect(page.getByText('Règles', { exact: true })).toBeVisible();
    await expect(page.getByText('Dépendances', { exact: true })).toBeVisible();
    await expect(page.getByText('Deadlines', { exact: true })).toBeVisible();
    await expect(page.getByText('Chaînes', { exact: true })).toBeVisible();
  });

  test('le bouton Générer est visible', async ({ page }) => {
    await goTo(page, '/auto');
    await expect(page.getByRole('button', { name: 'Générer la proposition' })).toBeVisible();
  });

  test('les boutons Appliquer et Annuler ne sont pas visibles avant génération', async ({ page }) => {
    await goTo(page, '/auto');
    await expect(page.getByRole('button', { name: 'Appliquer' })).not.toBeVisible();
    // Le bouton Annuler de la proposition (hors bouton undo global)
    await expect(proposalAnnuler(page)).not.toBeVisible();
  });

  test('générer affiche une proposition avec au moins un sprint', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.locator('.page-content').getByText(/Sprint \d+/).first()).toBeVisible();
  });

  test('générer affiche les boutons Appliquer et Annuler', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.getByRole('button', { name: 'Appliquer' })).toBeVisible();
    await expect(proposalAnnuler(page)).toBeVisible();
  });

  test('chaque sprint de la proposition affiche SP utilisés / capacité', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.locator('.page-content').getByText(/\d+\/\d+ SP/).first()).toBeVisible();
  });

  test('Annuler masque la proposition', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.locator('.page-content').getByText(/Sprint \d+/).first()).toBeVisible();
    await proposalAnnuler(page).click();
    await expect(page.getByRole('button', { name: 'Appliquer' })).not.toBeVisible();
  });

  test('activer le critère client affiche l\'ordre des clients', async ({ page }) => {
    await goTo(page, '/auto');
    // Activate client criterion (second checkbox)
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.nth(1).check();
    await expect(page.getByText('Ordre des clients')).toBeVisible();
  });

  test('appliquer la proposition ne génère pas d\'erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await page.getByRole('button', { name: 'Appliquer' }).click();
    expect(errors).toHaveLength(0);
  });

  test('le premier sprint ouvert conserve son thème dans la proposition', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    // Sprint 2 est le premier sprint ouvert dans DEMO_STATE, label "Sprint 2 - MODERNISATION"
    await expect(page.locator('.page-content').getByText(/Sprint 2\s*[–-]\s*Sprint 2 - MODERNISATION/).first()).toBeVisible();
  });

  test('les sprints suivants n\'affichent pas de thème dans la proposition', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    // Sprint 3 ne doit pas afficher son thème "INTELLIGENCE" dans la proposition
    await expect(page.locator('.page-content').getByText(/Sprint 3\s*[–-]\s*Sprint 3 - INTELLIGENCE/)).toHaveCount(0);
    // Il apparaît juste comme "Sprint 3"
    await expect(page.locator('.page-content').getByText(/^Sprint 3$/).first()).toBeVisible();
  });

  test('la bannière de nouveaux sprints utilise la bonne grammaire', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    const content = page.locator('.page-content');
    // Vérifie la forme correcte si des nouveaux sprints sont proposés
    const hasBanner = await content.getByText(/nouveau.* sprint/i).count() > 0;
    if (hasBanner) {
      // Forme correcte : "sera créé" (singulier) ou "seront créés" (pluriel)
      // getByText partial évite les problèmes de textContent() avec les SVG enfants
      const hasSingular = await content.getByText('sera créé', { exact: false }).count() > 0;
      const hasPlural   = await content.getByText('seront créés', { exact: false }).count() > 0;
      expect(hasSingular || hasPlural).toBe(true);
    }
  });

  test('la proposition est persistée après navigation React Router', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Générer la proposition' }).click();
    await expect(page.getByRole('button', { name: 'Appliquer' })).toBeVisible();
    // Navigation React Router vers Backlog (pas de rechargement de page)
    await page.getByRole('link', { name: /backlog/i }).first().click();
    await page.waitForTimeout(300);
    // Retour vers Auto-planning
    await page.getByRole('link', { name: /auto.planning/i }).first().click();
    await page.waitForTimeout(300);
    // La proposition doit être toujours présente
    await expect(page.getByRole('button', { name: 'Appliquer' })).toBeVisible();
  });

  test('les critères sont draggables', async ({ page }) => {
    await goTo(page, '/auto');
    // Chaque critère doit avoir l'attribut draggable
    const criteriaItems = page.locator('[draggable="true"]');
    await expect(criteriaItems.first()).toBeAttached();
  });

});
