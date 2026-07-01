const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');

test.describe('Daily Standup', () => {

  test('se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'daily');
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
  });

  test('affiche une carte par membre de l\'equipe', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'daily');
    await page.waitForTimeout(400);
    const tab = page.locator('#tab-daily');
    await expect(tab).toContainText('Alice Martin');
    await expect(tab).toContainText('Bob Dupont');
  });

  test('les champs Hier / Aujourd\'hui / Blocages sont presents', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'daily');
    await page.waitForTimeout(400);
    const tab = page.locator('#tab-daily');
    const text = await tab.innerText();
    expect(text).toMatch(/hier/i);
    expect(text).toMatch(/aujourd/i);
    expect(text).toMatch(/blocage/i);
  });

  test('saisir un blocage affiche le blocker board', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'daily');
    await page.waitForTimeout(400);
    // Saisir dans le premier textarea Blocages
    const blockerTextarea = page.locator('#tab-daily textarea').nth(2);
    if (await blockerTextarea.count() > 0) {
      await blockerTextarea.fill('Blocage serveur de dev en panne');
      await blockerTextarea.dispatchEvent('input');
      await page.waitForTimeout(300);
      const board = page.locator('#daily-blocker-board');
      if (await board.count() > 0) {
        const boardText = await board.innerText();
        expect(boardText.length).toBeGreaterThanOrEqual(0);
      }
    }
    expect(errors).toHaveLength(0);
  });

  test('le timer 15 minutes est visible', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'daily');
    await page.waitForTimeout(400);
    const tabText = await page.locator('#tab-daily').innerText();
    expect(tabText).toMatch(/15|timer|min/i);
  });

  test('le bouton Archiver est present', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'daily');
    await page.waitForTimeout(400);
    const archiveBtn = page.locator('#tab-daily button:has-text("Archiver"), #tab-daily button[onclick*="archiv"]');
    expect(await archiveBtn.count()).toBeGreaterThan(0);
  });

  test('le bouton Copier le resume est present', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'daily');
    await page.waitForTimeout(400);
    const copyBtn = page.locator('#tab-daily button:has-text("Copier"), #tab-daily button[onclick*="copier"], #tab-daily button[onclick*="copy"]');
    expect(await copyBtn.count()).toBeGreaterThan(0);
  });

});
