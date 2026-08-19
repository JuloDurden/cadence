/**
 * Tests E2E — Raccourcis clavier Ctrl+Z / Ctrl+Y du undo/redo global (2026-07-28)
 * Phase 0 de docs/roadmap-v1.md. Le stack global (StateContext.tsx, boutons du Header)
 * reste volontairement isolé du stack NNL (voir tests/nnl.spec.js, suite "Undo / Redo") :
 * décision explicite de l'utilisateur de ne pas les unifier.
 */
const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Raccourcis clavier Ctrl+Z / Ctrl+Y (undo/redo global)', () => {

  test('Ctrl+Z annule la création d\'un sprint, Ctrl+Y la rétablit', async ({ page }) => {
    // role: 'PO' (2026-08-19) : ces 3 tests créent un sprint via le bouton "+ Sprint", désormais
    // réservé PO/Scrum Master/Admin (canManageSprintLifecycle, utils/permissions.ts).
    await goTo(page, '/planning', { role: 'PO' });
    const before = await page.locator('.planning-col').count();

    await page.getByRole('button', { name: 'Sprint', exact: true }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.planning-col').count()).toBe(before + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    expect(await page.locator('.planning-col').count()).toBe(before);

    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);
    expect(await page.locator('.planning-col').count()).toBe(before + 1);
  });

  test('Ctrl+Z ne fait rien quand le focus est dans un champ de saisie', async ({ page }) => {
    // role: 'PO' (2026-08-19) : ces 3 tests créent un sprint via le bouton "+ Sprint", désormais
    // réservé PO/Scrum Master/Admin (canManageSprintLifecycle, utils/permissions.ts).
    await goTo(page, '/planning', { role: 'PO' });
    const before = await page.locator('.planning-col').count();

    await page.getByRole('button', { name: 'Sprint', exact: true }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.planning-col').count()).toBe(before + 1);

    // Focus dans le champ de date du nouveau sprint plutôt que sur un bouton.
    const newCol = page.locator('.planning-col').last();
    await newCol.locator('[title="Cliquer pour modifier les dates"]').first().click();
    await newCol.locator('input[type="date"]').first().focus();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    // Le sprint créé doit toujours être là : le raccourci global ne doit pas
    // s'être déclenché pendant que le focus est dans un <input>.
    expect(await page.locator('.planning-col').count()).toBe(before + 1);
  });

  test('Ctrl+Z est inactif pendant que le canevas NNL est affiché (pas de double stack)', async ({ page }) => {
    // role: 'PO' (2026-08-19) : ces 3 tests créent un sprint via le bouton "+ Sprint", désormais
    // réservé PO/Scrum Master/Admin (canManageSprintLifecycle, utils/permissions.ts).
    await goTo(page, '/planning', { role: 'PO' });
    const before = await page.locator('.planning-col').count();

    await page.getByRole('button', { name: 'Sprint', exact: true }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.planning-col').count()).toBe(before + 1);

    // Navigation cote client (liens de la Sidebar), pas goTo() : goTo() fait un
    // rechargement complet de page qui remonte l'app sur DEMO_STATE et effacerait
    // a la fois le sprint cree et le stack undo global, faussant le test.
    await page.getByRole('link', { name: 'Vision' }).click();
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="nnl-canvas"]')).toBeVisible();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    await page.getByRole('link', { name: 'Release Planning' }).click();
    await page.waitForTimeout(300);
    // Le sprint créé avant de passer sur NNL doit toujours être là : le Ctrl+Z pressé
    // pendant que NNL était affiché ne doit pas avoir dépilé le stack global.
    expect(await page.locator('.planning-col').count()).toBe(before + 1);
  });

});
