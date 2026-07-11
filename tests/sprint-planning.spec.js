const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Sprint Planning - page /sprint-planning', () => {

  test('la page Sprint Planning est accessible', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-view')).toBeVisible();
  });

  test('le selecteur de sprint est visible', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-sprint-select')).toBeVisible();
  });

  test('11 colonnes presentes (10 membres + Non attribue)', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-column')).toHaveCount(11);
  });

  test('la colonne Non attribue est presente', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-view')).toContainText('Non attribu');
  });

  test('le nom du premier membre est affiche (Aldo Raines)', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-col-header').nth(1)).toContainText('Aldo Raines');
  });

  test('les stats SP assignes sont affichees', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-top-bar')).toContainText('SP assignes');
  });

  test('le lien Sprint Planning est dans la sidebar', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.locator('.nav-item[href="/sprint-planning"]')).toBeVisible();
  });

  test('pas d erreur JS sur la page Sprint Planning', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/sprint-planning');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

});
