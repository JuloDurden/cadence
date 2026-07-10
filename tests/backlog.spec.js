const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Backlog', () => {

  test('affiche le tableau et les items DEMO_STATE', async ({ page }) => {
    await goTo(page, '/backlog');
    await expect(page.locator('[data-testid="backlog-table"]')).toBeVisible();
    // BUG-001 est le premier item du DEMO_STATE
    await expect(page.locator('[data-testid="backlog-table"]')).toContainText('BUG-001');
  });

  test('affiche plusieurs clients du DEMO_STATE', async ({ page }) => {
    await goTo(page, '/backlog');
    const table = page.locator('[data-testid="backlog-table"]');
    await expect(table).toContainText('FAX-002');
    await expect(table).toContainText('MAN-003');
    await expect(table).toContainText('AGA-004');
  });

  test('le bouton Nouvel Item ouvre la modale', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('la modale contient les onglets Général et Dépendances', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toContainText('Général');
    await expect(page.locator('[data-testid="item-modal"]')).toContainText('Dépendances');
  });

  test('fermer la modale la masque', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
    await page.click('[data-testid="item-modal"] button[aria-label="Fermer"]');
    await expect(page.locator('[data-testid="item-modal"]')).not.toBeVisible();
  });

});
