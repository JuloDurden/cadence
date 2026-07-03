const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Modal item — User Story', () => {

  test('la modale Nouvel Item contient l'onglet User Story par défaut (type Story)', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    const modal = page.locator('[data-testid="item-modal"]');
    // Le type par défaut est Story → onglet User Story visible
    await expect(modal).toContainText('User Story');
  });

  test('changer le type en Bug masque l'onglet User Story', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    const modal = page.locator('[data-testid="item-modal"]');
    // Sélectionner Bug dans le select Type
    await modal.locator('select').first().selectOption('bug');
    // L'onglet devient "Critères"
    await expect(modal).toContainText('Critères');
  });

  test('changer le type en Tâche masque les onglets Priorité et DoD/DoR', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    const modal = page.locator('[data-testid="item-modal"]');
    await modal.locator('select').first().selectOption('task');
    await expect(modal).not.toContainText('Priorité');
    await expect(modal).not.toContainText('DoD / DoR');
  });

});
