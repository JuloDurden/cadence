// Phase 2.5 (roadmap v1), verrouillage Stakeholder (2026-08-01) — un Stakeholder invité n'a plus
// accès à certaines pages du tout (Historique, Daily, Retro, Clients, Équipe, Réglages) et voit
// les autres pages "sensibles" (Roadmap, Release Planning, Sprint Planning, Kanban, Sprint
// Review, Vision/NNL) en lecture seule : consultables, mais sans aucune action de mutation
// (créer/modifier/supprimer/déplacer). Voir utils/permissions.ts (canAccessRoute,
// isReadOnlyForRole), App.tsx (garde de route) et Sidebar.tsx (filtrage du menu).
const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

const BLOCKED_ROUTES = ['/historique', '/daily', '/retro', '/clients', '/team', '/settings'];

test.describe('Verrouillage Stakeholder — pages sans accès', () => {

  for (const route of BLOCKED_ROUTES) {
    test(`un Stakeholder naviguant vers ${route} est redirigé vers /dashboard`, async ({ page }) => {
      await goTo(page, route, { role: 'STAKEHOLDER' });
      await expect(page).toHaveURL(/\/dashboard/);
    });
  }

  test('le menu ne propose aucun des liens interdits au Stakeholder', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'STAKEHOLDER' });
    // "/settings" n'est pas un lien de la Sidebar (contrairement aux 5 autres routes bloquées) —
    // c'est un bouton icône du Header ("Reglages"), vérifié séparément juste après.
    for (const route of BLOCKED_ROUTES.filter(r => r !== '/settings')) {
      await expect(page.locator(`a[href="${route}"]`)).toHaveCount(0);
    }
    await expect(page.locator('[title="Reglages"]')).toHaveCount(0);
  });

  test('un Admin garde accès à ces pages et à leurs liens de menu', async ({ page }) => {
    await goTo(page, '/clients', { role: 'ADMIN' });
    await expect(page).toHaveURL(/\/clients/);
    await expect(page.locator('a[href="/team"]')).toBeVisible();
    await expect(page.locator('[title="Reglages"]')).toBeVisible();
  });
});

test.describe('Verrouillage Stakeholder — Roadmap en lecture seule', () => {

  test('un Stakeholder ne voit ni "+ Sprint" ni les actions sur les cartes', async ({ page }) => {
    await goTo(page, '/roadmap', { role: 'STAKEHOLDER' });
    await expect(page.locator('[data-testid="btn-add-sprint"]')).toHaveCount(0);
    await expect(page.locator('button[title="Modifier l\'objectif"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="btn-delete-sprint-s4"]')).toHaveCount(0);
  });

  test('un PO voit "+ Sprint" et les actions sur les cartes', async ({ page }) => {
    await goTo(page, '/roadmap', { role: 'PO' });
    await expect(page.locator('[data-testid="btn-add-sprint"]')).toBeVisible();
    await expect(page.locator('button[title="Modifier l\'objectif"]').first()).toBeVisible();
  });
});

test.describe('Verrouillage Stakeholder — Release Planning en lecture seule', () => {

  test('un Stakeholder ne voit pas le bouton de suppression d\'un sprint à venir', async ({ page }) => {
    await goTo(page, '/planning', { role: 'STAKEHOLDER' });
    await expect(page.locator('[data-testid="btn-delete-sprint-s4"]')).toHaveCount(0);
  });

  test('un PO voit le bouton de suppression d\'un sprint à venir', async ({ page }) => {
    await goTo(page, '/planning', { role: 'PO' });
    await expect(page.locator('[data-testid="btn-delete-sprint-s4"]')).toBeVisible();
  });
});

test.describe('Verrouillage Stakeholder — Sprint Planning en lecture seule', () => {

  test('un Stakeholder ne voit ni "Auto-attribuer" ni "Effacer toutes les attributions"', async ({ page }) => {
    await goTo(page, '/sprint-planning', { role: 'STAKEHOLDER' });
    await expect(page.getByRole('button', { name: 'Auto-attribuer' })).toHaveCount(0);
    await expect(page.locator('[title="Effacer toutes les attributions"]')).toHaveCount(0);
  });

  test('un PO voit "Auto-attribuer"', async ({ page }) => {
    await goTo(page, '/sprint-planning', { role: 'PO' });
    await expect(page.getByRole('button', { name: 'Auto-attribuer' })).toBeVisible();
  });
});

test.describe('Verrouillage Stakeholder — Kanban en lecture seule', () => {

  test('un Stakeholder ne voit ni "Réorganiser" ni "Colonne"', async ({ page }) => {
    await goTo(page, '/kanban', { role: 'STAKEHOLDER' });
    await expect(page.getByRole('button', { name: 'Réorganiser' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Colonne' })).toHaveCount(0);
  });

  test('un PO voit "Réorganiser" et "Colonne"', async ({ page }) => {
    await goTo(page, '/kanban', { role: 'PO' });
    await expect(page.getByRole('button', { name: 'Réorganiser' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Colonne' })).toBeVisible();
  });
});

test.describe('Verrouillage Stakeholder — Sprint Review en lecture seule', () => {

  test('un Stakeholder ne voit ni "Archiver" ni "Ajouter une décision" ni "Ajouter une note"', async ({ page }) => {
    await goTo(page, '/sprint-review', { role: 'STAKEHOLDER' });
    await expect(page.locator('[title="Archiver cette Sprint Review"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajouter une décision' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajouter une note' })).toHaveCount(0);
  });

  test('un PO voit "Archiver", "Ajouter une décision" et "Ajouter une note"', async ({ page }) => {
    await goTo(page, '/sprint-review', { role: 'PO' });
    await expect(page.locator('[title="Archiver cette Sprint Review"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter une décision' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter une note' })).toBeVisible();
  });
});

test.describe('Verrouillage Stakeholder — Vision / NNL en lecture seule', () => {

  test('un Stakeholder a le Vision Board en lecture seule', async ({ page }) => {
    await goTo(page, '/vision', { role: 'STAKEHOLDER' });
    await expect(page.locator('.vb-textarea').first()).toBeDisabled();
  });

  test('un PO peut éditer le Vision Board', async ({ page }) => {
    await goTo(page, '/vision', { role: 'PO' });
    await expect(page.locator('.vb-textarea').first()).toBeEnabled();
  });

  test('un Stakeholder ne voit ni "+ Post-it" ni la barre d\'outils NNL', async ({ page }) => {
    await goTo(page, '/vision', { role: 'STAKEHOLDER' });
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await expect(page.locator('[data-testid="btn-add-postit"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="nnl-toolbar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="nnl-layers-panel"]')).toHaveCount(0);
  });

  test('un PO voit "+ Post-it" et la barre d\'outils NNL', async ({ page }) => {
    await goTo(page, '/vision', { role: 'PO' });
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await expect(page.locator('[data-testid="btn-add-postit"]')).toBeVisible();
    await expect(page.locator('[data-testid="nnl-toolbar"]')).toBeVisible();
  });
});
