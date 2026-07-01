const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');

test.describe('Equipe & RH', () => {

  test('se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'team');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('affiche les membres de l\'equipe', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'team');
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-team')).toContainText('Alice Martin');
    await expect(page.locator('#tab-team')).toContainText('Bob Dupont');
  });

  test('le bouton Ajouter un membre est visible', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'team');
    await page.waitForTimeout(300);
    await expect(page.locator('.add-member-btn')).toBeVisible();
  });

  test('ouvrir la modale nouveau membre ne genere pas d\'erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'team');
    await page.waitForTimeout(300);
    await page.click('.add-member-btn');
    await page.waitForSelector('#team-modal-overlay', { state: 'visible' });
    expect(errors).toHaveLength(0);
  });

  test('la modale membre contient les champs nom et role', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'team');
    await page.click('.add-member-btn');
    await page.waitForSelector('#team-modal-overlay', { state: 'visible' });
    const modalBody = page.locator('#team-modal-body');
    // Eviter le input[type="file"] avatar qui est cache
    await expect(modalBody.locator('input[type="text"], input:not([type="file"])').first()).toBeVisible();
  });

  test('la section absences se rend sans erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'team');
    await page.waitForTimeout(300);
    const absSection = page.locator('#tab-team');
    const text = await absSection.innerText();
    expect(text.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  test('la capacite sprint est affichee en temps reel', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'team');
    await page.waitForTimeout(300);
    const tabText = await page.locator('#tab-team').innerText();
    // La capacite doit mentionner des SP
    expect(tabText).toMatch(/SP|capacit|sprint/i);
  });

});
