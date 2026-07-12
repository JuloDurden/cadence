const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('ItemModal — modes d\'affichage', () => {

  const openModal = async (page) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
  };

  test('le picker de mode est visible dans le header de la modal', async ({ page }) => {
    await openModal(page);
    await expect(page.locator('[title="Mode d\'affichage"]')).toBeVisible();
  });

  test('cliquer sur le picker ouvre le dropdown avec les 3 options', async ({ page }) => {
    await openModal(page);
    await page.locator('[title="Mode d\'affichage"]').click();
    await expect(page.locator('button', { hasText: 'Fenêtre centrée' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Volet latéral' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Pleine page' })).toBeVisible();
  });

  test('le mode par défaut est fenêtre centrée (.modal-overlay)', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.evaluate(() => localStorage.removeItem('modal-view'));
    await page.click('[data-testid="btn-new-item"]');
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-side-overlay')).not.toBeVisible();
    await expect(page.locator('.modal-fullpage')).not.toBeVisible();
  });

  test('sélectionner "Volet latéral" affiche .modal-side-overlay', async ({ page }) => {
    await openModal(page);
    await page.locator('[title="Mode d\'affichage"]').click();
    await page.locator('button', { hasText: 'Volet latéral' }).click();
    await expect(page.locator('.modal-side-overlay')).toBeVisible();
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('sélectionner "Pleine page" affiche .modal-fullpage', async ({ page }) => {
    await openModal(page);
    await page.locator('[title="Mode d\'affichage"]').click();
    await page.locator('button', { hasText: 'Pleine page' }).click();
    await expect(page.locator('.modal-fullpage')).toBeVisible();
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('revenir à "Fenêtre centrée" depuis le volet rétablit .modal-overlay', async ({ page }) => {
    await openModal(page);
    await page.locator('[title="Mode d\'affichage"]').click();
    await page.locator('button', { hasText: 'Volet latéral' }).click();
    await expect(page.locator('.modal-side-overlay')).toBeVisible();
    await page.locator('[title="Mode d\'affichage"]').click();
    await page.locator('button', { hasText: 'Fenêtre centrée' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-side-overlay')).not.toBeVisible();
  });

  test('en mode volet, cliquer en dehors du volet ferme le volet', async ({ page }) => {
    await openModal(page);
    await page.locator('[title="Mode d\'affichage"]').click();
    await page.locator('button', { hasText: 'Volet latéral' }).click();
    await expect(page.locator('.modal-side-overlay')).toBeVisible();
    await page.locator('.modal-side-overlay').click({ position: { x: 10, y: 200 } });
    await expect(page.locator('.modal-side-overlay')).not.toBeVisible();
  });

  test('le mode est persisté dans localStorage', async ({ page }) => {
    await openModal(page);
    await page.locator('[title="Mode d\'affichage"]').click();
    await page.locator('button', { hasText: 'Volet latéral' }).click();
    await page.locator('[data-testid="item-modal"] button', { hasText: 'Annuler' }).click();
    await expect(page.locator('[data-testid="item-modal"]')).not.toBeVisible();
    await page.click('[data-testid="btn-new-item"]');
    await expect(page.locator('.modal-side-overlay')).toBeVisible();
  });

  test('pas d\'erreur JS en changeant de mode', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openModal(page);
    await page.locator('[title="Mode d\'affichage"]').click();
    await page.locator('button', { hasText: 'Volet latéral' }).click();
    await page.locator('[title="Mode d\'affichage"]').click();
    await page.locator('button', { hasText: 'Pleine page' }).click();
    await page.locator('[title="Mode d\'affichage"]').click();
    await page.locator('button', { hasText: 'Fenêtre centrée' }).click();
    expect(errors).toHaveLength(0);
  });

});
