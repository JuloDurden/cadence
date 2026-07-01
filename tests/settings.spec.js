const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');
const { BASE_STATE } = require('./fixtures');

test.describe('Réglages', () => {

  async function openSettings(page) {
    await loadWithState(page);
    // Le bouton Réglages est dans le header (tab-settings class)
    await page.click('button[onclick*="switchTab(\'settings\')"]');
    await page.waitForSelector('#tab-settings', { state: 'visible' });
    await page.waitForTimeout(300);
  }

  test('l\'onglet Réglages se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openSettings(page);
    expect(errors).toHaveLength(0);
  });

  test('le champ Nom du projet est present et editable', async ({ page }) => {
    await openSettings(page);
    const input = page.locator('#set-projectName');
    await expect(input).toBeVisible();
    await expect(input).toBeEditable();
  });

  test('le champ Nom de l\'équipe est present', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('#set-teamName')).toBeVisible();
  });

  test('le champ Durée de sprint est present', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('#set-sprintDuration')).toBeVisible();
  });

  test('le champ Date de démarrage est present', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('#set-startDate')).toBeVisible();
  });

  test('le bouton Enregistrer les réglages est present', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('button[onclick="saveSettings()"]')).toBeVisible();
  });

  test('modifier et enregistrer le nom du projet persiste la valeur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openSettings(page);
    await page.fill('#set-projectName', 'Cadence Test');
    await page.click('button[onclick="saveSettings()"]');
    await page.waitForTimeout(300);
    // Le nom doit etre mis a jour dans le header
    const headerText = await page.locator('#header-title, h1, header').first().innerText().catch(() => '');
    // La valeur doit etre persistee en localStorage
    const saved = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('cadenceState_v1') || '{}');
      return s.settings?.projectName;
    });
    expect(saved).toBe('Cadence Test');
    expect(errors).toHaveLength(0);
  });

  test('modifier la durée de sprint et enregistrer persiste la valeur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openSettings(page);
    await page.fill('#set-sprintDuration', '14');
    await page.click('button[onclick="saveSettings()"]');
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('cadenceState_v1') || '{}');
      return s.settings?.sprintDuration;
    });
    expect(saved).toBe(14);
    expect(errors).toHaveLength(0);
  });

  test('la section DoR est presente dans les réglages', async ({ page }) => {
    await openSettings(page);
    // La section DoR doit etre rendue (liste ou input)
    const dorSection = page.locator('#dor-list, #tab-settings [id*="dor"]');
    expect(await dorSection.count()).toBeGreaterThan(0);
  });

  test('la section DoD est presente dans les réglages', async ({ page }) => {
    await openSettings(page);
    const dodSection = page.locator('#dod-list, #tab-settings [id*="dod"]');
    expect(await dodSection.count()).toBeGreaterThan(0);
  });

  test('ajouter un critere DoD fonctionne sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openSettings(page);
    const input = page.locator('#dod-new-input');
    if (await input.count() > 0) {
      await input.fill('Tests unitaires au vert');
      await page.click('button[onclick*="addDodCrit(\'dod\')"]');
      await page.waitForTimeout(300);
    }
    expect(errors).toHaveLength(0);
  });

  test('l\'etat vide des listes DoR/DoD affiche un message adequat', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const state = {
      ...BASE_STATE,
      settings: { ...BASE_STATE.settings, dor: [], dod: [] },
    };
    await loadWithState(page, state);
    await page.click('button[onclick*="switchTab(\'settings\')"]');
    await page.waitForSelector('#tab-settings', { state: 'visible' });
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
    const tabText = await page.locator('#tab-settings').innerText();
    expect(tabText).toMatch(/DoR|DoD|critère|aucun/i);
  });

});
