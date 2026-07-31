const { test, expect } = require('@playwright/test');
const { goTo, setBacklogFilter, toggleBacklogReadyFilter } = require('./helpers');

test.describe('DoR / DoD (via modal)', () => {

  // "+ Ajouter" réservé PO/Admin (Phase 2, canManageBacklog) — role: 'PO' pour ce test antérieur
  // au système de rôles.
  test("l'onglet DoR/DoD est accessible depuis la modale d'une Story", async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-item"]');
    const modal = page.locator('[data-testid="item-modal"]');
    await expect(modal).toContainText('DoD / DoR');
    await modal.getByText('DoD / DoR').click();
    await expect(modal).toContainText('Definition of');
  });

});

test.describe('DoR / DoD — colonnes Backlog', () => {

  test('les colonnes DoR et DoD sont présentes dans le tableau backlog', async ({ page }) => {
    await goTo(page, '/backlog');
    const thead = page.locator('.backlog-table thead');
    await expect(thead).toContainText('DoR');
    await expect(thead).toContainText('DoD');
  });

  test('les items avec DoR 100% affichent une encoche SVG (ex : BUG-001 Sprint 1)', async ({ page }) => {
    await goTo(page, '/backlog');
    // BUG-001 (i1) : DoR tous done=true → encoche verte
    const dorCells = page.locator('[data-testid="dor-cell"]');
    // Au moins une cellule DoR doit contenir un SVG (encoche) — pas juste du texte
    await expect(dorCells.locator('svg').first()).toBeVisible();
  });

  test('les items avec DoR partielle affichent un compteur X/N (ex : SOC-010)', async ({ page }) => {
    await goTo(page, '/backlog');
    // SOC-010 (i10) : DoR[3].done=false, DoR[4].done=false → compteur "3/5". FAX-007 n'est
    // plus un exemple valide depuis la Phase 1 (sous-chantier 1) : c'est un HierarchyNode
    // (Epic), qui n'a pas de champ `dor`.
    // On cherche une cellule DoR avec un span contenant le pattern X/N
    const partialSpans = page.locator('[data-testid="dor-cell"] span').filter({ hasText: /^\d+\/\d+$/ });
    await expect(partialSpans.first()).toBeVisible();
  });

  test('les items avec DoD partielle affichent un compteur X/N en DoD', async ({ page }) => {
    await goTo(page, '/backlog');
    // BUG-001 (i1) DoD : tous done=true → encoche
    // FAX-002 (i2) DoD : certains done=false → compteur
    const partialSpans = page.locator('[data-testid="dod-cell"] span').filter({ hasText: /^\d+\/\d+$/ });
    await expect(partialSpans.first()).toBeVisible();
  });

  test('le filtre "Prêt" est visible dans le dropdown "Filtrer" (header Backlog, 2026-07-29)', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.locator('[data-testid="btn-filter"]').click();
    await expect(page.locator('[data-testid="filter-ready"]')).toBeVisible();
  });

  test('le filtre "Prêt" n\'affiche que des items avec DoR complète', async ({ page }) => {
    await goTo(page, '/backlog');
    await toggleBacklogReadyFilter(page);
    await page.waitForTimeout(200);
    // Après filtre, aucune cellule DoR ne doit afficher un compteur partiel
    const partialSpans = page.locator('[data-testid="dor-cell"] span').filter({ hasText: /^\d+\/\d+$/ });
    await expect(partialSpans).toHaveCount(0);
    // Et au moins une encoche SVG est visible (des items Prêt existent dans la démo)
    await expect(page.locator('[data-testid="dor-cell"] svg').first()).toBeVisible();
  });

  test('le select Statut est présent dans le dropdown "Filtrer" avec des options dynamiques', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.locator('[data-testid="btn-filter"]').click();
    const statusSelect = page.locator('[data-testid="filter-status"]');
    await expect(statusSelect).toBeVisible();
    // Placeholder "Tous" + au moins un statut réel de la démo
    const optCount = await statusSelect.locator('option').count();
    expect(optCount).toBeGreaterThan(1);
  });

  test('le filtre Statut réduit les résultats', async ({ page }) => {
    await goTo(page, '/backlog');
    const table = page.locator('.backlog-table tbody');
    // Compter les lignes item avant filtre (exclure les lignes de groupe .sprint-row)
    const rowsBefore = await table.locator('tr:not(.sprint-row)').count();

    // Sélectionner le statut "done" (Terminé) — présent dans la démo (Sprint 1)
    await setBacklogFilter(page, 'status', 'done');
    await page.waitForTimeout(200);

    const rowsAfter = await table.locator('tr:not(.sprint-row)').count();
    expect(rowsAfter).toBeLessThan(rowsBefore);
    expect(rowsAfter).toBeGreaterThan(0);
  });

});

test.describe('DoR — bandeau Sprint Planning', () => {

  test('la page Sprint Planning se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/sprint-planning');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('le bandeau DoR est visible dans Sprint 2 (SOC-010 a une DoR incomplète)', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    // Sprint 2 est sélectionné par défaut (premier sprint non clôturé)
    // FAX-007 était l'ancien Epic-Item de référence (avant Phase 1, sous-chantier 1) : un
    // Epic est depuis un HierarchyNode sans champ `dor`, il ne compte donc plus dans ce
    // bandeau qui ne porte que sur les vrais Items. Seul SOC-010 (dor[3,4].done=false)
    // compte désormais dans Sprint 2.
    const banner = page.locator('[data-testid="dor-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('SOC-010');
  });

  test('le bandeau indique le bon nombre d\'items non prêts', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    // Sprint 2 : SOC-010 → 1 item non prêt (FAX-007 est un Epic, sans DoR, voir test précédent)
    const banner = page.locator('[data-testid="dor-banner"]');
    await expect(banner).toContainText('1 item');
  });

});
