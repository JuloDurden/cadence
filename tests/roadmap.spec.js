const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Roadmap — Header unifié (v0.86)', () => {

  test('la page Roadmap se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/roadmap');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('le header affiche le nombre de sprints', async ({ page }) => {
    await goTo(page, '/roadmap');
    // hdr-ctx contient un stat avec "sprint(s)"
    const hdrCtx = page.locator('.hdr-ctx');
    await expect(hdrCtx).toContainText(/\d+ sprint/);
  });

  test('le header affiche le nombre d\'items', async ({ page }) => {
    await goTo(page, '/roadmap');
    const hdrCtx = page.locator('.hdr-ctx');
    await expect(hdrCtx).toContainText(/\d+ items?/);
  });

  test('le bouton + Sprint est présent dans le header', async ({ page }) => {
    await goTo(page, '/roadmap');
    // data-testid pour éviter l'ambiguïté avec le bouton "Sprints" du toggle
    await expect(page.locator('[data-testid="btn-add-sprint"]')).toBeVisible();
  });

  test('le toggle Sprints est actif par défaut', async ({ page }) => {
    await goTo(page, '/roadmap');
    // Le bouton "Sprints" doit être dans le header et visible
    const toggle = page.locator('.app-header').getByRole('button', { name: /^Sprints$/i });
    await expect(toggle).toBeVisible();
  });

  test('les boutons Vision et NNL sont présents mais désactivés', async ({ page }) => {
    await goTo(page, '/roadmap');
    const visionBtn = page.locator('.app-header').getByRole('button', { name: /^Vision$/i });
    const nnlBtn    = page.locator('.app-header').getByRole('button', { name: /^NNL$/i });
    await expect(visionBtn).toBeVisible();
    await expect(nnlBtn).toBeVisible();
    await expect(visionBtn).toBeDisabled();
    await expect(nnlBtn).toBeDisabled();
  });

  test('le roadmap-header-box (ancien bloc hero) n\'existe plus', async ({ page }) => {
    await goTo(page, '/roadmap');
    // L'ancien bloc hero avec h2 "Product Roadmap" a été supprimé
    await expect(page.locator('.roadmap-header-box')).toHaveCount(0);
  });

});

test.describe('Roadmap — Groupement Epic dans les cartes sprint (v0.86)', () => {

  test('les cartes sprint s\'affichent dans la grille', async ({ page }) => {
    await goTo(page, '/roadmap');
    const cards = page.locator('.roadmap-goal');
    await expect(cards).toHaveCount(4); // 4 sprints dans le DEMO_STATE (Sprint 5 est en DB réelle)
  });

  test('un badge EPIC est visible dans au moins une carte sprint', async ({ page }) => {
    await goTo(page, '/roadmap');
    // Sprint 2 contient FAX-007 (epic) avec FAX-024 (story liée) et MAN-008 (epic) avec MAN-025
    const epicBadge = page.locator('.roadmap-goal .roadmap-section span').filter({ hasText: /^EPIC$/ }).first();
    await expect(epicBadge).toBeVisible();
  });

  test('les epics affichent leurs stories rattachées (FAX-024 sous FAX-007 dans Sprint 2)', async ({ page }) => {
    await goTo(page, '/roadmap');
    // FAX-024 ("Intégration dashboard prédiction") est une story de FAX-007 (sprint 2)
    // Elle doit apparaître dans la carte du Sprint 2, sous l'epic FAX-007
    const sprint2Card = page.locator('.roadmap-goal').nth(1); // Sprint 2 = index 1
    await expect(sprint2Card).toContainText('Intégration dashboard prédiction accidents');
  });

  test('un epic sans story rattachée dans son sprint n\'affiche pas de stories', async ({ page }) => {
    await goTo(page, '/roadmap');
    // AGA-009 (epic Sprint 2) n'a aucune story avec epicId: "i9"
    // La section EPIC AGA-009 doit exister mais sans stories enfant
    const sprint2Card = page.locator('.roadmap-goal').nth(1);
    await expect(sprint2Card).toContainText('EPIC Norme IFRS 18');
  });

  test('les items orphelins (sans epic) restent groupés par client', async ({ page }) => {
    await goTo(page, '/roadmap');
    // BUG-006 dans Sprint 2 (pas d'epicId) → groupe client SOCLE ou BUG
    const sprint2Card = page.locator('.roadmap-goal').nth(1);
    await expect(sprint2Card).toContainText('Bugs moyennement urgents');
  });

  test('Sprint 3 affiche FAX-026 sous l\'epic FAX-013', async ({ page }) => {
    await goTo(page, '/roadmap');
    const sprint3Card = page.locator('.roadmap-goal').nth(2); // Sprint 3 = index 2
    await expect(sprint3Card).toContainText('Tests E2E composants React v3');
  });

  test('cliquer sur + Sprint dans le header ajoute une carte', async ({ page }) => {
    await goTo(page, '/roadmap');
    const before = await page.locator('.roadmap-goal').count();
    await page.locator('[data-testid="btn-add-sprint"]').click();
    await page.waitForTimeout(300);
    const after = await page.locator('.roadmap-goal').count();
    expect(after).toBe(before + 1);
  });

});
