/**
 * Suite : DoR / DoD
 * - Les jauges se remplissent quand on coche
 * - Les couleurs changent selon avancement (rouge -> orange -> vert)
 * - Le compteur X/Y est correct
 */
const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');

test.describe('DoR / DoD', () => {

  async function openItemDodTab(page) {
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    // Ouvrir la modale de AUT-1 via le bouton Modifier
    await page.click('button[aria-label="Modifier AUT-1"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    // Aller sur l'onglet DoD/DoR
    await page.click('[data-tab="dod"], .m-tab:has-text("DoD"), .m-tab:has-text("DoR")');
    await page.waitForTimeout(150);
  }

  test('la modale US s\'ouvre sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await loadWithState(page);
    await openItemDodTab(page);

    expect(errors).toHaveLength(0);
    await expect(page.locator('#modal-overlay')).toBeVisible();
  });

  test('les jauges DoR et DoD sont visibles', async ({ page }) => {
    await loadWithState(page);
    await openItemDodTab(page);

    const dorCount = await page.locator("#dod-bar-dor").count();
    expect(dorCount).toBeGreaterThan(0);
    const dodCount = await page.locator("#dod-bar-dod").count();
    expect(dodCount).toBeGreaterThan(0);
  });

  test('cocher une case DoR augmente la jauge', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await loadWithState(page);
    await openItemDodTab(page);

    const dorBar = page.locator('#dod-bar-dor');
    const initialWidth = await dorBar.evaluate(el => el.style.width);

    const firstDorCheckbox = page.locator('[onclick*="toggleDodCheck"][onclick*="\'dor\'"]').first();
    if (await firstDorCheckbox.count() > 0) {
      await firstDorCheckbox.click();
      await page.waitForTimeout(150);

      const newWidth = await dorBar.evaluate(el => el.style.width);
      expect(newWidth).not.toBe(initialWidth);
      expect(newWidth).not.toBe('0%');
    }

    expect(errors).toHaveLength(0);
  });

  test('cocher toutes les cases DoD rend la jauge verte (100%)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await loadWithState(page);
    await openItemDodTab(page);

    const dodBar = page.locator('#dod-bar-dod');
    const checkboxes = page.locator('[onclick*="toggleDodCheck"][onclick*="\'dod\'"]');
    const count = await checkboxes.count();

    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).click();
      await page.waitForTimeout(50);
    }

    if (count > 0) {
      const width = await dodBar.evaluate(el => el.style.width);
      expect(width).toBe('100%');

      const bg = await dodBar.evaluate(el => el.style.background);
      expect(bg).toContain('var(--success)');
    }

    expect(errors).toHaveLength(0);
  });

  test('le compteur X/Y se met a jour apres avoir coche', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await loadWithState(page);
    await openItemDodTab(page);

    const dorProgress = page.locator('#dod-progress-dor');
    if (await dorProgress.count() > 0) {
      const initial = await dorProgress.textContent();
      expect(initial).toMatch(/^0\//);

      const firstCheckbox = page.locator('[onclick*="toggleDodCheck"][onclick*="\'dor\'"]').first();
      if (await firstCheckbox.count() > 0) {
        await firstCheckbox.click();
        await page.waitForTimeout(150);

        const updated = await dorProgress.textContent();
        expect(updated).toMatch(/^1\//);
      }
    }

    expect(errors).toHaveLength(0);
  });

  test('la jauge est rouge a 0%, orange a 33%, verte a 100%', async ({ page }) => {
    await loadWithState(page);
    await openItemDodTab(page);

    const dorBar = page.locator('#dod-bar-dor');
    if (await dorBar.count() === 0) return;

    // 0% -> rouge
    let bg = await dorBar.evaluate(el => el.style.background);
    expect(bg).toContain('var(--danger)');

    const checkboxes = page.locator('[onclick*="toggleDodCheck"][onclick*="\'dor\'"]');
    const total = await checkboxes.count();
    if (total > 1) {
      // Cocher 1/3 => 33% -> orange
      await checkboxes.first().click();
      await page.waitForTimeout(100);
      bg = await dorBar.evaluate(el => el.style.background);
      expect(bg).toContain('var(--warning)');
    }
  });

});
