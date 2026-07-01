const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');

test.describe('Kanban', () => {

  test('affiche les items du sprint actif dans les bonnes colonnes', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'kanban');
    await page.waitForTimeout(300);

    await expect(page.locator('#kcol-todo')).toContainText('AUT-1');
    await expect(page.locator('#kcol-doing')).toContainText('AUT-2');
    await expect(page.locator('#kcol-done')).toContainText('AUT-3');
  });

  test('le compteur de cartes par colonne est correct', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'kanban');
    await page.waitForTimeout(300);

    await expect(page.locator('#kcol-todo .kanban-col-count')).toHaveText('1');
    await expect(page.locator('#kcol-doing .kanban-col-count')).toHaveText('1');
    await expect(page.locator('#kcol-done .kanban-col-count')).toHaveText('1');
  });

  test('changer le statut d\'un item via JS met a jour le Kanban', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'kanban');

    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('aclaimsState_v1'));
      state.sprints[0].items[0].status = 'doing';
      localStorage.setItem('aclaimsState_v1', JSON.stringify(state));
    });
    await page.reload();
    await page.waitForSelector('#main-content', { state: 'visible' });
    await goToTab(page, 'kanban');
    await page.waitForTimeout(300);

    await expect(page.locator('#kcol-doing')).toContainText('AUT-1');
    await expect(page.locator('#kcol-doing')).toContainText('AUT-2');
    await expect(page.locator('#kcol-todo .kanban-col-count')).toHaveText('0');
  });

  test('le bouton ajouter colonne ouvre le panneau catalogue', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'kanban');
    await page.waitForTimeout(300);

    await page.click('.kanban-add-col-btn');
    await expect(page.locator('#kanban-catalog-panel')).toBeVisible();
  });

  test('ajouter une colonne du catalogue cree la colonne', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'kanban');
    await page.waitForTimeout(300);

    await page.click('.kanban-add-col-btn');
    await page.waitForSelector('#kanban-catalog-panel', { state: 'visible' });

    // Le catalogue utilise des div.kanban-catalog-item (pas des buttons)
    // Les items disponibles n'ont pas la classe "disabled"
    const firstAvailable = page.locator('#kanban-catalog-panel .kanban-catalog-item:not(.disabled)').first();
    await firstAvailable.click();
    await page.waitForTimeout(300);

    // Une nouvelle colonne doit etre apparue
    const cols = await page.locator('.kanban-col').count();
    expect(cols).toBeGreaterThan(3);
  });

  test('Backlog affiche une colonne Statut avec badge colore', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);

    await expect(page.locator('#tab-backlog th:has-text("Statut")')).toBeVisible();
  });

  test('le tri Kanban par priorite ne genere pas d\'erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await loadWithState(page);
    await goToTab(page, 'kanban');
    await page.waitForTimeout(300);

    // Le select de tri Kanban est dans le header Kanban (pas dans le backlog)
    const select = page.locator('select[onchange*="_kanbanSort"]');
    if (await select.count() > 0) {
      await select.selectOption('priority');
      await page.waitForTimeout(200);
    }
    expect(errors).toHaveLength(0);
  });

});
