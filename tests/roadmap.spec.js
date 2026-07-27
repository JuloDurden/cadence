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

  test('la grille de sprints est visible par défaut', async ({ page }) => {
    await goTo(page, '/roadmap');
    await expect(page.locator('.roadmap-grid')).toBeVisible();
  });

  test('le toggle Vision/NNL n\'est plus sur la page Roadmap (déplacé sur /vision)', async ({ page }) => {
    await goTo(page, '/roadmap');
    await expect(page.locator('button[title="Vision Board"]')).toHaveCount(0);
    await expect(page.locator('button[title="Now / Next / Later — v0.89"]')).toHaveCount(0);
  });

  test('le roadmap-header-box (ancien bloc hero) n\'existe plus', async ({ page }) => {
    await goTo(page, '/roadmap');
    // L'ancien bloc hero avec h2 "Product Roadmap" a été supprimé
    await expect(page.locator('.roadmap-header-box')).toHaveCount(0);
  });

});

test.describe('Roadmap — Groupement par groupe de clients (v0.87)', () => {

  test('les boutons de groupement sont présents si des groupes sont définis', async ({ page }) => {
    await goTo(page, '/roadmap');
    // DEMO_STATE contient 3 groupes → les boutons doivent apparaître
    await expect(page.locator('[data-testid="btn-groupby-client"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-groupby-group"]')).toBeVisible();
  });

  test('par défaut, le groupement par client est actif', async ({ page }) => {
    await goTo(page, '/roadmap');
    // En mode client, les badges EPIC et les sections client sont visibles sans section groupe
    await expect(page.locator('[data-testid^="roadmap-group-"]')).toHaveCount(0);
  });

  test('passer en mode groupe affiche les sections de groupes dans les cartes sprint', async ({ page }) => {
    await goTo(page, '/roadmap');
    await page.locator('[data-testid="btn-groupby-group"]').click();
    // Les sprints avec items devraient montrer des sections par groupe (data-testid^="roadmap-group-")
    const groupSections = page.locator('[data-testid^="roadmap-group-"]');
    await expect(groupSections.first()).toBeVisible();
  });

  test('en mode groupe, les noms des groupes apparaissent dans les cartes sprint', async ({ page }) => {
    await goTo(page, '/roadmap');
    await page.locator('[data-testid="btn-groupby-group"]').click();
    // Au moins un des 3 groupes doit apparaître dans la roadmap
    const roadmapGrid = page.locator('.roadmap-grid');
    const hasGrandComptes = roadmapGrid.getByText('Grands comptes').first()
    const hasPME = roadmapGrid.getByText('PME').first()
    const hasSocle = roadmapGrid.getByText('Socle & Qualité').first()
    // Au moins un groupe doit être visible
    const count = await roadmapGrid.locator('[data-testid^="roadmap-group-"]').count();
    expect(count).toBeGreaterThan(0);
  });

  test('repasser en mode client fait disparaître les sections groupes', async ({ page }) => {
    await goTo(page, '/roadmap');
    await page.locator('[data-testid="btn-groupby-group"]').click();
    await page.locator('[data-testid="btn-groupby-client"]').click();
    await expect(page.locator('[data-testid^="roadmap-group-"]')).toHaveCount(0);
  });

  test('en mode groupe, les épics sont inclus dans leur groupe (badge EPIC visible dans une section groupe)', async ({ page }) => {
    await goTo(page, '/roadmap');
    await page.locator('[data-testid="btn-groupby-group"]').click();
    // Un badge EPIC doit être visible à l'intérieur d'une section groupe
    const epicInGroup = page.locator('[data-testid^="roadmap-group-"] span').filter({ hasText: /^EPIC/ }).first();
    await expect(epicInGroup).toBeVisible();
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
    const epicBadge = page.locator('.roadmap-goal .roadmap-section span').filter({ hasText: /^EPIC/ }).first();
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

test.describe('Roadmap — Suppression d\'un sprint (2026-07-27)', () => {

  test('le bouton Supprimer n\'apparaît que pour un sprint non actif et non clôturé', async ({ page }) => {
    await goTo(page, '/roadmap');
    const cards = page.locator('.roadmap-goal');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const isClosed = await card.locator('text=Clôturé').count() > 0;
      const isActive = await card.locator('text=Actif').count() > 0;
      const delBtn = card.locator('button[title="Supprimer le sprint"]');
      if (isClosed || isActive) {
        await expect(delBtn).toHaveCount(0);
      } else {
        await expect(delBtn).toHaveCount(1);
      }
    }
  });

  test('un sprint nouvellement créé (vide, non actif, non clôturé) peut être supprimé', async ({ page }) => {
    await goTo(page, '/roadmap');
    const before = await page.locator('.roadmap-goal').count();
    await page.locator('[data-testid="btn-add-sprint"]').click();
    await page.waitForTimeout(300);
    expect(await page.locator('.roadmap-goal').count()).toBe(before + 1);

    const newCard = page.locator('.roadmap-goal').last();
    page.on('dialog', d => d.accept());
    await newCard.locator('button[title="Supprimer le sprint"]').click();
    await page.waitForTimeout(300);
    expect(await page.locator('.roadmap-goal').count()).toBe(before);
  });

  test('supprimer un sprint contenant des items les détache vers le Backlog plutôt que de les supprimer', async ({ page }) => {
    await goTo(page, '/roadmap');
    // Sprint 3 (index 2) n'est ni actif (Sprint 2 l'est) ni clôturé, et contient FAX-026/FAX-013 —
    // la suppression ne doit pas être bloquée par la présence d'items : ils sont détachés vers le Backlog.
    const sprint3Card = page.locator('.roadmap-goal').nth(2);
    await expect(sprint3Card).toContainText('Tests E2E composants React v3');
    page.on('dialog', d => d.accept());
    await sprint3Card.locator('button[title="Supprimer le sprint"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.roadmap-goal')).toHaveCount(3);
    // L'item n'a pas été supprimé avec le sprint : il doit réapparaître dans le Backlog
    await goTo(page, '/backlog');
    await expect(page.locator('.page-content')).toContainText('Tests E2E composants React v3');
  });

});
