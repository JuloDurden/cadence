const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

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

});
