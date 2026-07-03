const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('DoR / DoD (via modal)', () => {

  test('l'onglet DoR/DoD est accessible depuis la modale d'une Story', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-new-item"]');
    const modal = page.locator('[data-testid="item-modal"]');
    await expect(modal).toContainText('DoD / DoR');
    await modal.getByText('DoD / DoR').click();
    await expect(modal).toContainText('Definition of');
  });

});
