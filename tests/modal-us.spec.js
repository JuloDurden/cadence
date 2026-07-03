const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Modal item - User Story', () => {

  test("la modale Nouvel Item contient l'onglet User Story par defaut (type Story)", async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    const modal = page.locator('[data-testid="item-modal"]');
    await expect(modal).toContainText('User Story');
  });

  test("changer le type en Bug remplace l'onglet User Story par Criteres", async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    const modal = page.locator('[data-testid="item-modal"]');
    await modal.locator('select').first().selectOption('bug');
    await expect(modal).toContainText('Critères');
  });

  test("changer le type en Tache masque les onglets Priorite et DoD/DoR", async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    const modal = page.locator('[data-testid="item-modal"]');
    await modal.locator('select').first().selectOption('task');
    await expect(modal).not.toContainText('Priorité');
    await expect(modal).not.toContainText('DoD / DoR');
  });

});
