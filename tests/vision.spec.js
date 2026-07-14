const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Vision Board — Page /vision (v0.88)', () => {

  test('la page Vision se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/vision');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('le header affiche "Vision Board"', async ({ page }) => {
    await goTo(page, '/vision');
    await expect(page.locator('.app-header')).toContainText('Vision Board');
  });

  test('le champ nom du produit est pré-rempli avec "AutoClaimsTech"', async ({ page }) => {
    await goTo(page, '/vision');
    const input = page.locator('.vb-product-name-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('AutoClaimsTech');
  });

  test('le bouton Vision Board est actif dans le toggle', async ({ page }) => {
    await goTo(page, '/vision');
    const visionBtn = page.locator('.app-header button[title="Vision Board"]');
    await expect(visionBtn).toBeVisible();
  });

  test('le bouton NNL est désactivé dans le toggle', async ({ page }) => {
    await goTo(page, '/vision');
    const nnlBtn = page.locator('.app-header button[title="Now / Next / Later — v0.89"]');
    await expect(nnlBtn).toBeVisible();
    await expect(nnlBtn).toBeDisabled();
  });

  test('le bouton Exporter PDF est présent', async ({ page }) => {
    await goTo(page, '/vision');
    await expect(page.getByRole('button', { name: /Exporter PDF/i })).toBeVisible();
  });

  test('le Vision Board affiche les 5 sections avec leurs titres', async ({ page }) => {
    await goTo(page, '/vision');
    const board = page.locator('.vision-board');
    await expect(board).toBeVisible();
    await expect(board).toContainText('Vision');
    await expect(board).toContainText('Groupe cible');
    await expect(board).toContainText('Besoins');
    await expect(board).toContainText('Produit');
    await expect(board).toContainText('Objectifs business');
  });

  test('les textareas sont pré-remplis avec le contenu AutoClaimsTech', async ({ page }) => {
    await goTo(page, '/vision');
    const textareas = page.locator('.vb-textarea');
    await expect(textareas).toHaveCount(5); // Vision + 4 colonnes
    // La section Vision contient du texte de démo
    const visionTA = textareas.first();
    const value = await visionTA.inputValue();
    expect(value.length).toBeGreaterThan(10);
  });

  test('la grille 4 colonnes est présente', async ({ page }) => {
    await goTo(page, '/vision');
    const grid = page.locator('.vb-grid');
    await expect(grid).toBeVisible();
    // 4 sections dans la grille
    await expect(grid.locator('.vb-section')).toHaveCount(4);
  });

  test('modifier un textarea déclenche la sauvegarde et affiche un toast', async ({ page }) => {
    await goTo(page, '/vision');
    // Modifier la section Vision
    const visionTA = page.locator('.vb-textarea').first();
    await visionTA.click();
    await visionTA.fill('Test de modification Vision Board');
    await visionTA.blur();
    // Toast de confirmation
    const toast = page.locator('[role="status"]').filter({ hasText: /enregistr/i });
    await expect(toast).toBeVisible({ timeout: 2000 });
  });

  test('la page Vision est accessible depuis la sidebar', async ({ page }) => {
    await goTo(page, '/backlog');
    // Le lien Vision est dans la sidebar
    const visionLink = page.locator('.sidebar-nav a[href="/vision"]');
    await expect(visionLink).toBeVisible();
    await visionLink.click();
    await expect(page).toHaveURL(/\/vision/);
    await expect(page.locator('.vision-board')).toBeVisible();
  });

});
