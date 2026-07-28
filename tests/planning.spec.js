const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Planning', () => {

  test('affiche la page de planning', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.locator('.page-content')).toBeVisible();
  });

  test('affiche des items du backlog non assignes', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/planning');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('affiche les colonnes de sprint', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.locator('.planning-col').first()).toBeVisible();
  });

  test('affiche les dates des sprints au format JJ/MM', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    await expect(dateSpan).toBeVisible();
    await expect(dateSpan).toContainText(/\d{2}\/\d{2}/);
  });

  test('le bouton permet d ouvrir l edition des dates', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    await expect(dateSpan).toBeVisible();
    await dateSpan.click();
    await expect(page.locator('.planning-col').first().locator('input[type="date"]').first()).toBeVisible();
  });

  test('modifier la date de debut auto-calcule la date de fin', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    await dateSpan.click();
    const col = page.locator('.planning-col').first();
    const startInput = col.locator('input[type="date"]').first();
    const endInput   = col.locator('input[type="date"]').nth(1);
    await startInput.fill('2026-08-03');
    await expect(endInput).toHaveValue('2026-08-16');
  });

  test('annuler l edition ferme les inputs sans modifier les dates', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    const initialText = await dateSpan.innerText();
    await dateSpan.click();
    const col = page.locator('.planning-col').first();
    await col.getByRole('button', { name: 'X', exact: true }).click();
    await expect(dateSpan).toBeVisible();
    await expect(dateSpan).toContainText(initialText.slice(0, 5));
  });

  test('affiche le bouton + Sprint dans le header', async ({ page }) => {
    await goTo(page, '/planning');
    // exact:true pour ne pas matcher "dependances cross-sprint"
    await expect(page.getByRole('button', { name: 'Sprint', exact: true })).toBeVisible();
  });

});

test.describe('Planning — Suppression d\'un sprint (2026-07-27)', () => {

  test('un sprint nouvellement créé (vide, non actif, non clôturé) peut être supprimé', async ({ page }) => {
    await goTo(page, '/planning');
    const before = await page.locator('.planning-col').count();
    await page.getByRole('button', { name: 'Sprint', exact: true }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.planning-col').count()).toBe(before + 1);

    const newCol = page.locator('.planning-col').last();
    await expect(newCol.locator('button[title="Supprimer le sprint"]')).toBeVisible();
    await newCol.locator('button[title="Supprimer le sprint"]').click();
    await page.locator('[data-testid="dialog-confirm"]').click();
    await page.waitForTimeout(300);
    expect(await page.locator('.planning-col').count()).toBe(before);
  });

  test('supprimer un sprint contenant des items les détache vers le Backlog plutôt que de les supprimer', async ({ page }) => {
    await goTo(page, '/planning');
    // Sprint 3 (index 2) n'est ni actif ni clôturé, et contient des items (voir roadmap.spec.js) —
    // la suppression ne doit pas être bloquée par leur présence : ils sont détachés vers le Backlog.
    const sprint3Col = page.locator('.planning-col').nth(2);
    await expect(sprint3Col).toContainText('Tests E2E composants React v3');
    await sprint3Col.locator('button[title="Supprimer le sprint"]').click();
    await page.locator('[data-testid="dialog-confirm"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.planning-col')).toHaveCount(3);
    await goTo(page, '/backlog');
    await expect(page.locator('.page-content')).toContainText('Tests E2E composants React v3');
  });

});

test.describe('Release Planning — Epic repliable dans une carte de sprint (2026-07-28)', () => {

  test('un groupe Epic peut être replié puis déplié à nouveau', async ({ page }) => {
    await goTo(page, '/planning');
    const sprint2Col = page.locator('.planning-col').nth(1);
    const toggle = sprint2Col.locator('[data-testid^="epic-group-toggle-"]').first();
    await expect(toggle).toBeVisible();
    // Le testid du bouton et celui du bloc d'US partagent le même epicId : on le lit
    // pour cibler exactement ce groupe, plutôt que .first() sur les deux sélecteurs
    // indépendamment (qui re-cible le groupe suivant du sprint une fois celui-ci replié
    // et retiré du DOM, si le sprint contient plusieurs Epics).
    const toggleTestId = await toggle.getAttribute('data-testid');
    const epicId = toggleTestId.replace('epic-group-toggle-', '');
    const storiesBox = sprint2Col.locator(`[data-testid="epic-group-stories-${epicId}"]`);
    await expect(storiesBox).toBeVisible();

    await toggle.click();
    await expect(storiesBox).not.toBeVisible();

    await toggle.click();
    await expect(storiesBox).toBeVisible();
  });

  test('replier un groupe Epic ne modifie pas le nombre d\'US annoncé dans le badge', async ({ page }) => {
    await goTo(page, '/planning');
    const sprint2Col = page.locator('.planning-col').nth(1);
    const epicHeader = sprint2Col.locator('.epic-group-header').first();
    const badgeText = await epicHeader.locator('.epic-group-count').innerText();
    await sprint2Col.locator('[data-testid^="epic-group-toggle-"]').first().click();
    await expect(epicHeader.locator('.epic-group-count')).toHaveText(badgeText);
  });

  test('affiche le score arbitraire de l\'Epic quand il est renseigné (jamais additionné à ses US)', async ({ page }) => {
    await goTo(page, '/planning');
    const sprint2Col = page.locator('.planning-col').nth(1);
    // Jeu de données démo (demo.ts) : Sprint 2 (s2). i7 "FAX-007" a un score propre (sp:30)
    // ET une US rattachée (i24 "FAX-024", sp:8) -> le score arbitraire de l'Epic prime : 30 SP,
    // pas 38 (30+8), conformément à la correction du 2026-07-28.
    const epicI7 = sprint2Col.locator('.epic-group').filter({ has: page.locator('[data-testid="epic-group-toggle-i7"]') });
    await expect(epicI7.locator('.epic-group-count')).toContainText('1 US · 30 SP');
    // i8 "MAN-008" (epic, sp:20, arbitraire) + i25 "MAN-025" (story, sp:5) -> 20 SP, pas 25.
    const epicI8 = sprint2Col.locator('.epic-group').filter({ has: page.locator('[data-testid="epic-group-toggle-i8"]') });
    await expect(epicI8.locator('.epic-group-count')).toContainText('1 US · 20 SP');
  });

});

test.describe('Release Planning — groupe Epic non tronque en mode deplie (2026-07-28)', () => {

  test('le groupe Epic ne se fait pas ecraser par flexbox (flex-shrink: 0)', async ({ page }) => {
    await goTo(page, '/planning');
    const sprint2Col = page.locator('.planning-col').nth(1);
    const epicGroup = sprint2Col.locator('.epic-group').first();
    await expect(epicGroup).toBeVisible();
    const shrink = await epicGroup.evaluate(el => getComputedStyle(el).flexShrink);
    expect(shrink).toBe('0');
  });

  test('le contenu d\'un groupe Epic deplie n\'est jamais coupe (pas d\'overflow cache)', async ({ page }) => {
    await goTo(page, '/planning');
    const sprint2Col = page.locator('.planning-col').nth(1);
    const epicGroup = sprint2Col.locator('.epic-group').first();
    await expect(epicGroup).toBeVisible();
    // .epic-group a overflow:hidden : si flexbox le retrecit sous sa hauteur de contenu,
    // scrollHeight > clientHeight revele un contenu coupe et invisible pour l'utilisateur.
    const { scrollHeight, clientHeight } = await epicGroup.evaluate(el => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
  });

});
