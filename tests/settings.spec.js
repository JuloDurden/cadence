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

  // ── Données & Export (v0.46) ──────────────────────────────────────────────

  test('la section Données & Export est presente dans les Réglages', async ({ page }) => {
    await openSettings(page);
    const tabText = await page.locator('#tab-settings').innerText();
    expect(tabText).toMatch(/Données|Export/i);
  });

  test('le bouton Sauvegarder (JSON) est present', async ({ page }) => {
    await openSettings(page);
    const btn = page.locator('button[onclick="exportStateJSON()"]');
    await expect(btn).toBeVisible();
  });

  test('le bouton Restaurer (JSON) est present', async ({ page }) => {
    await openSettings(page);
    const btn = page.locator('button[onclick="triggerImportJSON()"]');
    await expect(btn).toBeVisible();
  });

  test('le bouton Exporter CSV est present', async ({ page }) => {
    await openSettings(page);
    const btn = page.locator('button[onclick="exportBacklogCSV()"]');
    await expect(btn).toBeVisible();
  });

  test('le bouton Exporter Excel est present dans les Réglages', async ({ page }) => {
    await openSettings(page);
    const btn = page.locator('button[onclick="exportBacklogExcel()"]');
    await expect(btn).toBeVisible();
  });

  test('le bouton Importer Excel/CSV est present dans les Réglages', async ({ page }) => {
    await openSettings(page);
    const btn = page.locator('button[onclick="openImportModal()"]');
    await expect(btn).toBeVisible();
  });

  test('exportStateJSON ne genere pas d\'erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openSettings(page);
    // Intercepter le telechargement pour eviter un dialog
    await page.evaluate(() => {
      // Monkey-patch pour eviter le vrai telechargement dans les tests
      window._exportCalled = false;
      const orig = URL.createObjectURL;
      URL.createObjectURL = (b) => { window._exportCalled = true; return orig(b); };
    });
    await page.click('button[onclick="exportStateJSON()"]');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('exportBacklogCSV ne genere pas d\'erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openSettings(page);
    await page.click('button[onclick="exportBacklogCSV()"]');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('la toolbar Backlog ne contient plus les boutons Export/Import', async ({ page }) => {
    await loadWithState(page);
    await page.click('[onclick*="switchTab(\'backlog\')"]');
    await page.waitForTimeout(300);
    // Les boutons d'export/import ne doivent plus etre dans la toolbar backlog
    const exportBtn = page.locator('#tab-backlog button[onclick="exportBacklogExcel()"]');
    const importBtn = page.locator('#tab-backlog button[onclick="openImportModal()"]');
    expect(await exportBtn.count()).toBe(0);
    expect(await importBtn.count()).toBe(0);
  });

});
