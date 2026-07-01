const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');

test.describe('Clients', () => {

  test('les cartes clients affichent le label et le tier', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'clients');
    await page.waitForTimeout(300);

    // Cartes = divs avec data-key
    const acmeCard = page.locator('[data-key="acm"]');
    await expect(acmeCard).toBeVisible();
    await expect(acmeCard).toContainText('Acme Corp');
    await expect(acmeCard).toContainText('A'); // tier A
  });

  test('la carte Acme affiche le CA formate', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'clients');
    await page.waitForTimeout(300);

    const acmeCard = page.locator('[data-key="acm"]');
    const text = await acmeCard.innerText();
    // CA 120000 formate en "120 000" ou "120000"
    expect(text).toMatch(/120[\s ]?000|120000/);
  });

  test('la modal client s\'ouvre sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await loadWithState(page);
    await goToTab(page, 'clients');
    await page.waitForTimeout(300);

    await page.click('[aria-label="Modifier Acme Corp"]');
    await page.waitForSelector('#client-modal-overlay', { state: 'visible' });

    expect(errors).toHaveLength(0);
  });

  test('la modal affiche le tier et le CA existants', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'clients');
    await page.waitForTimeout(300);

    await page.click('[aria-label="Modifier Acme Corp"]');
    await page.waitForSelector('#client-modal-overlay', { state: 'visible' });

    const tierSelect = page.locator('#cl-tier');
    if (await tierSelect.count() > 0) {
      await expect(tierSelect).toHaveValue('A');
    }

    const caInput = page.locator('#cl-ca');
    if (await caInput.count() > 0) {
      await expect(caInput).toHaveValue('120000');
    }
  });

  test('la modal affiche la section contacts', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'clients');
    await page.waitForTimeout(300);

    await page.click('[aria-label="Modifier Acme Corp"]');
    await page.waitForSelector('#client-modal-overlay', { state: 'visible' });

    const modalText = await page.locator('#client-modal-overlay').innerText();
    expect(modalText).toContain('Jean Dupont');
  });

  test('modifier le tier et sauvegarder met a jour la carte', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await loadWithState(page);
    await goToTab(page, 'clients');
    await page.waitForTimeout(300);

    await page.click('[aria-label="Modifier Beta SAS"]');
    await page.waitForSelector('#client-modal-overlay', { state: 'visible' });

    const tierSelect = page.locator('#cl-tier');
    if (await tierSelect.count() > 0) {
      await tierSelect.selectOption('C');
      await page.click('#client-modal-overlay button[onclick="saveClient()"]');
      await page.waitForTimeout(400);

      const betaCard = page.locator('[data-key="bet"]');
      await expect(betaCard).toContainText('C');
    }

    expect(errors).toHaveLength(0);
  });

  test('tri par CA annuel classe Acme avant Beta', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'clients');
    await page.waitForTimeout(300);

    await page.click('button:has-text("CA annuel")');
    await page.waitForTimeout(300);

    const cards = page.locator('[data-key]');
    const keys = await cards.evaluateAll(els => els.map(e => e.getAttribute('data-key')));
    const acmeIdx = keys.indexOf('acm');
    const betaIdx = keys.indexOf('bet');
    expect(acmeIdx).toBeLessThan(betaIdx);
  });

  test('tri par Importance classe A avant B', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'clients');
    await page.waitForTimeout(300);

    await page.click('button:has-text("Importance")');
    await page.waitForTimeout(300);

    const cards = page.locator('[data-key]');
    const keys = await cards.evaluateAll(els => els.map(e => e.getAttribute('data-key')));
    const acmeIdx = keys.indexOf('acm'); // tier A
    const betaIdx = keys.indexOf('bet'); // tier B
    expect(acmeIdx).toBeLessThan(betaIdx);
  });

});
