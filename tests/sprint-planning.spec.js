const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Sprint Planning - page /sprint-planning', () => {

  // Navigation & structure de base

  test('la page Sprint Planning est accessible et affiche .sp-view', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-view')).toBeVisible();
  });

  test('le lien Sprint Planning est dans la sidebar', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.locator('a[href="/sprint-planning"]')).toBeVisible();
  });

  test('pas d erreur JS sur la page Sprint Planning', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/sprint-planning');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  // Header

  test('le selecteur de sprint est dans le header', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-sprint-select')).toBeVisible();
  });

  test('les stats items assignes et SP assignes sont dans le header', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.hdr-ctx-stat').first()).toBeVisible();
    await expect(page.locator('text=/items assign/i')).toBeVisible();
    await expect(page.locator('text=/SP assign/i')).toBeVisible();
  });

  test('le bouton Auto-attribuer est visible dans le header', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('button', { hasText: 'Auto-attribuer' })).toBeVisible();
  });

  test('le bouton Effacer toutes les attributions est visible dans le header', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('button[title="Effacer toutes les attributions"]')).toBeVisible();
  });

  // Panneau gauche

  test('le panneau gauche Non attribue est present', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-left')).toBeVisible();
    await expect(page.locator('.sp-left')).toContainText('Non attribu');
  });

  // Grille membres

  test('10 cards membres sont presentes', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-member-card')).toHaveCount(10);
  });

  test('le nom du premier membre est affiche (Aldo Raines)', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-member-card').first()).toContainText('Aldo Raines');
  });

  test('la grille membres est presente', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-members-wrap')).toBeVisible();
  });

  // Modal Auto-attribution

  test('clic sur Auto-attribuer ouvre la modal', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await page.locator('button', { hasText: 'Auto-attribuer' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-title', { hasText: 'Auto-attribution' })).toBeVisible();
  });

  test('la modal affiche les stats items non attribues et capacite', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await page.locator('button', { hasText: 'Auto-attribuer' }).click();
    await expect(page.locator('text=/Items non attribu/i')).toBeVisible();
    await expect(page.locator('text=Capacité disponible')).toBeVisible();
  });

  test('la modal affiche les 3 boutons solo duo trio', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await page.locator('button', { hasText: 'Auto-attribuer' }).click();
    await expect(page.locator('button', { hasText: /solo/i })).toBeVisible();
    await expect(page.locator('button', { hasText: /duo/i })).toBeVisible();
    await expect(page.locator('button', { hasText: /trio/i })).toBeVisible();
  });

  test('la modal affiche le bouton Appliquer', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await page.locator('button', { hasText: 'Auto-attribuer' }).click();
    await expect(page.locator('button', { hasText: /Appliquer/i })).toBeVisible();
  });

  test('le bouton Annuler ferme la modal', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await page.locator('button', { hasText: 'Auto-attribuer' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('button', { hasText: 'Annuler' }).click();
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('clic en dehors de la modal la ferme', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await page.locator('button', { hasText: 'Auto-attribuer' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('.modal-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  // Qualite des donnees

  test('"Invalid Date" n est jamais affiche dans le panneau Non attribue', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    await expect(page.locator('.sp-left')).not.toContainText('Invalid Date');
  });

});

test.describe('Sprint Planning - regroupement par Epic (docs/corrections futures.md, 2026-08-17)', () => {

  // Sprint actif par défaut (s2 - MODERNISATION) : FAX-024 attitré à Aldo Raines (m1), rattaché
  // à l'Epic FAX-007 ; MAN-025 attitré à Brienne de Torth (m2), rattaché à l'Epic MAN-008 ; et
  // BUG-006 (sans Epic) également attitré à Brienne de Torth, dans la même carte. Voir
  // frontend/src/data/demo.ts. Retour Julien (2026-08-17) : regroupement "partout, y compris
  // les cartes membre" mais sans drag ici (contrairement au Kanban).

  test('un item rattaché à un Epic est groupé dans la carte du membre attitré', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    const card = page.locator('.sp-member-card').filter({ hasText: 'Aldo Raines' });
    await expect(card.locator('[data-testid="epic-group-toggle-m1-i7"]')).toBeVisible();
    await expect(card.locator('[data-testid="epic-group-stories-m1-i7"]')).toContainText('FAX-024');
  });

  test('le groupe affiche le nom de l\'Epic dans la carte membre', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    const card = page.locator('.sp-member-card').filter({ hasText: 'Aldo Raines' });
    const group = card.locator('.epic-group').filter({ has: page.locator('[data-testid="epic-group-toggle-m1-i7"]') });
    await expect(group).toContainText('EPIC IA Prédiction accidents & CA');
  });

  test('un membre peut avoir un item groupé et un item orphelin côte à côte', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    const card = page.locator('.sp-member-card').filter({ hasText: 'Brienne de Torth' });
    await expect(card.locator('[data-testid="epic-group-toggle-m2-i8"]')).toBeVisible();
    await expect(card).toContainText('BUG-006');
  });

  test('replier le groupe Epic d\'une carte membre masque son item', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    const card = page.locator('.sp-member-card').filter({ hasText: 'Aldo Raines' });
    const stories = card.locator('[data-testid="epic-group-stories-m1-i7"]');
    const toggle  = card.locator('[data-testid="epic-group-toggle-m1-i7"]');
    await expect(stories).toBeVisible();
    await toggle.click();
    await expect(stories).not.toBeVisible();
  });

  test('le groupe Epic d\'une carte membre n\'est pas draggable (pas de drag de groupe hors Kanban)', async ({ page }) => {
    await goTo(page, '/sprint-planning');
    const card = page.locator('.sp-member-card').filter({ hasText: 'Aldo Raines' });
    const header = card.locator('.epic-group-header').filter({ has: page.locator('[data-testid="epic-group-toggle-m1-i7"]') });
    await expect(header).not.toHaveAttribute('draggable', 'true');
  });

});
