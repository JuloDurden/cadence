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
    // role: 'PO' (2026-08-19) : le bouton "+ Sprint" est désormais réservé PO/Scrum Master/Admin
    // (voir canManageSprintLifecycle, utils/permissions.ts) ; sans rôle explicite, goTo() ne pose
    // aucun `cadence_user_role`, ce qui équivaut à un rôle vide et masque le bouton.
    await goTo(page, '/planning', { role: 'PO' });
    // exact:true pour ne pas matcher "dependances cross-sprint"
    await expect(page.getByRole('button', { name: 'Sprint', exact: true })).toBeVisible();
  });

});

test.describe('Planning — Suppression d\'un sprint (2026-07-27)', () => {

  test('un sprint nouvellement créé (vide, non actif, non clôturé) peut être supprimé', async ({ page }) => {
    // role: 'PO' : ce test crée un sprint via le bouton "+ Sprint" (restriction Dev, 2026-08-19).
    await goTo(page, '/planning', { role: 'PO' });
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

test.describe('Release Planning — Epic vide compte dans la capacite du sprint (retour Julien, 2026-07-29)', () => {

  test('un Epic sans US mais avec un SP fixe et un sprint assigne apparait comme une carte', async ({ page }) => {
    // AGA-009 (i9, demo.ts) : Epic sp:10, sprintId:"s2", aucune US rattachee. Avant le
    // correctif du 2026-07-29, un tel Epic n'apparaissait pas du tout en Release Planning
    // (attachItemsToEpics() n'existait pas encore côté SprintColumn/SwimlanesView, seul un
    // Epic avec au moins une US était affiché).
    await goTo(page, '/planning');
    const sprint2Col = page.locator('.planning-col').nth(1);
    const epicAGA009 = sprint2Col.locator('.epic-group').filter({ has: page.locator('[data-testid="epic-group-toggle-i9"]') });
    await expect(epicAGA009).toBeVisible();
    await expect(epicAGA009.locator('.epic-group-count')).toContainText('0 US · 10 SP');
  });

  test('le SP de cet Epic vide est compte dans le total "SP utilises" du sprint', async ({ page }) => {
    // Sprint 2 (s2, demo.ts) : items propres au sprint = BUG-006 (15) + SOC-010 (15) +
    // PME-011 (10) + FAX-024 (8, rattaché à l'Epic FAX-007) + MAN-025 (5, rattaché à
    // l'Epic MAN-008) = 53 SP, + AGA-009 (Epic vide, 10 SP fixes) = 63 SP au total.
    await goTo(page, '/planning');
    const sprint2Col = page.locator('.planning-col').nth(1);
    await expect(sprint2Col).toContainText('63 SP utilisés');
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

test.describe('Release Planning, décrochage automatique d\'un Epic (retour Julien, 2026-08-17)', () => {

  // FAX-024 (i24) est la seule US du sprint 2 rattachée à l'Epic FAX-007 (i7) ; sa 2e US
  // (FAX-019) est planifiée au sprint 4. Avant ce correctif, un Epic assigné directement à un
  // sprint via son propre sprintId restait affiché comme un conteneur vide dans ce sprint même
  // après le départ de sa dernière US vers un autre sprint, sans qu'aucune de ses US n'y soit
  // plus prévue (retour Julien, bug constaté avec un Epic à 5 items dont aucun au sprint 3).

  test('un Epic disparaît du sprint qu\'il vient de quitter au glisser-déposer de sa dernière US', async ({ page }) => {
    await goTo(page, '/planning');
    const sprint2Col = page.locator('.planning-col').nth(1);
    const sprint3Col = page.locator('.planning-col').nth(2);
    await expect(sprint2Col.locator('[data-testid="epic-group-toggle-i7"]')).toBeVisible();

    await page.locator('[data-item-id="i24"]').dragTo(sprint3Col);
    await page.waitForTimeout(300);

    await expect(sprint2Col.locator('[data-testid="epic-group-toggle-i7"]')).toHaveCount(0);
  });

  test('cet Epic décroché ne réapparaît pas comme conteneur vide dans "Non assigné"', async ({ page }) => {
    await goTo(page, '/planning');
    const sprint3Col = page.locator('.planning-col').nth(2);
    await page.locator('[data-item-id="i24"]').dragTo(sprint3Col);
    await page.waitForTimeout(300);

    // FAX-019 (l'autre US de cet Epic) reste planifiée au sprint 4 : aucune de ses US n'est
    // réellement non-assignée, l'Epic ne doit donc pas s'afficher comme un conteneur vide ici.
    const unassignedPanel = page.locator('.planning-unassigned-items');
    await expect(unassignedPanel.locator('[data-testid="epic-group-toggle-i7"]')).toHaveCount(0);
  });

  test('un Epic sans aucune US reste affiché comme placeholder dans son sprint (non-régression)', async ({ page }) => {
    // AGA-009 (i9, demo.ts) n'a jamais eu d'US rattachée (voir describe "Epic vide compte dans
    // la capacite du sprint" ci-dessus) : le décrochage automatique ne le concerne pas, il ne se
    // déclenche que pour un Epic ayant réellement des US ailleurs.
    await goTo(page, '/planning');
    const sprint2Col = page.locator('.planning-col').nth(1);
    await expect(sprint2Col.locator('[data-testid="epic-group-toggle-i9"]')).toBeVisible();
  });

});

// Restriction Dev (2026-08-19, décision Julien : "Un compte Dev ne devrait pas pouvoir clôturer/
// rouvrir/créer un sprint"), voir utils/permissions.ts, `canManageSprintLifecycle`. Activer et
// Supprimer un sprint, ainsi que le drag&drop et l'édition opérationnelle des items, restent
// ouverts au Dev (non testés ici, déjà couverts ailleurs) : seul le cycle de vie structurel
// (créer/clôturer/rouvrir) est concerné.
test.describe('Planning - restriction Dev sur le cycle de vie des sprints (2026-08-19)', () => {

  test('un compte Dev ne voit pas le bouton "+ Sprint"', async ({ page }) => {
    await goTo(page, '/planning', { role: 'DEV' });
    await expect(page.locator('[data-testid="btn-add-sprint"]')).toHaveCount(0);
  });

  test('un compte Dev ne voit pas "Rouvrir" sur le sprint clôturé (Sprint 1, demo.ts)', async ({ page }) => {
    await goTo(page, '/planning', { role: 'DEV' });
    const closedCol = page.locator('.planning-col.planning-col-closed').first();
    await expect(closedCol).toBeVisible();
    await expect(closedCol.getByText('Rouvrir', { exact: true })).toHaveCount(0);
  });

  test('un PO voit toujours "+ Sprint" et "Rouvrir"', async ({ page }) => {
    await goTo(page, '/planning', { role: 'PO' });
    await expect(page.locator('[data-testid="btn-add-sprint"]')).toBeVisible();
    const closedCol = page.locator('.planning-col.planning-col-closed').first();
    await expect(closedCol.getByText('Rouvrir', { exact: true })).toBeVisible();
  });

});
