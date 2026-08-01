// Phase 2.5 (roadmap v1), Onboarding, points 2-4 (2026-08-01, v0.95) — tooltips progressifs,
// checklist, démo interactive, traités comme un seul système (voir context/OnboardingContext.tsx,
// data/onboardingChecklist.ts). `goTo()` (tests/helpers.js) répond par défaut "compte déjà vu" à
// GET /api/onboarding — sans lien avec ce fichier, la très grande majorité des tests n'a pas à se
// soucier d'un panneau qui s'ouvrirait tout seul. Les tests ci-dessous passent explicitement
// `onboardingSeenAt` pour simuler un compte neuf le cas échéant.
//
// Retouché suite au 1er retour de Julien (2026-08-01) : le panneau reste désormais ouvert entre
// les étapes (plus de fermeture automatique au clic sur une ligne), et chaque ligne lance un
// tunnel de plusieurs tooltips (Suivant/Précédent), pas un seul tooltip "Compris".
const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Guide de démarrage — ouverture automatique et bouton Aide', () => {

  test('un compte réellement neuf voit le panneau s\'ouvrir automatiquement', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO', onboardingSeenAt: null });
    await expect(page.locator('[data-testid="onboarding-panel"]')).toBeVisible();
  });

  test('un compte déjà vu ne voit pas le panneau s\'ouvrir tout seul', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await expect(page.locator('[data-testid="onboarding-panel"]')).toHaveCount(0);
  });

  test('le bouton Aide du Header rouvre le panneau à tout moment', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await expect(page.locator('[data-testid="onboarding-panel"]')).toHaveCount(0);
    await page.locator('[title="Aide"]').click();
    await expect(page.locator('[data-testid="onboarding-panel"]')).toBeVisible();
  });

  test('le bouton Aide reste visible pour un Stakeholder', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'STAKEHOLDER' });
    await expect(page.locator('[title="Aide"]')).toBeVisible();
  });

  test('fermer le panneau (croix) le fait disparaître', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[title="Aide"]').click();
    await expect(page.locator('[data-testid="onboarding-panel"]')).toBeVisible();
    await page.locator('[data-testid="onboarding-panel"] button[aria-label="Fermer"]').click();
    await expect(page.locator('[data-testid="onboarding-panel"]')).toHaveCount(0);
  });

  test('le panneau reste ouvert après avoir activé une ligne', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[title="Aide"]').click();
    await page.locator('[data-testid="onboarding-item-discover-roadmap"]').click();
    await expect(page).toHaveURL(/\/roadmap/);
    await expect(page.locator('[data-testid="onboarding-panel"]')).toBeVisible();
  });
});

test.describe('Guide de démarrage — checklist adaptée au rôle', () => {

  test('un PO voit la ligne "Créer votre première US"', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[title="Aide"]').click();
    await expect(page.locator('[data-testid="onboarding-item-create-item"]')).toBeVisible();
    await expect(page.locator('[data-testid="onboarding-item-discover-backlog"]')).toHaveCount(0);
  });

  test('un Dev voit "Découvrir le Backlog" à la place', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'DEV' });
    await page.locator('[title="Aide"]').click();
    await expect(page.locator('[data-testid="onboarding-item-discover-backlog"]')).toBeVisible();
    await expect(page.locator('[data-testid="onboarding-item-create-item"]')).toHaveCount(0);
  });

  test('un Stakeholder voit "Découvrir le Backlog" à la place', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'STAKEHOLDER' });
    await page.locator('[title="Aide"]').click();
    await expect(page.locator('[data-testid="onboarding-item-discover-backlog"]')).toBeVisible();
  });
});

test.describe('Guide de démarrage — tunnel manuel sur une ligne "découverte"', () => {

  test('cliquer "Explorer la Roadmap" navigue et lance un tunnel Suivant/Précédent', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[title="Aide"]').click();
    await page.locator('[data-testid="onboarding-item-discover-roadmap"]').click();
    await expect(page).toHaveURL(/\/roadmap/);

    // Étape 1/2 : pas de bouton Précédent sur la 1re étape.
    await expect(page.getByText('1 / 2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Précédent' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Étape 2/2 : "Terminer" plutôt que "Suivant", "Précédent" redonne l'étape 1.
    await expect(page.getByText('2 / 2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminer' })).toBeVisible();
    await page.getByRole('button', { name: 'Précédent' }).click();
    await expect(page.getByText('1 / 2')).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Terminer' }).click();

    // Le tunnel terminé (bouton "Terminer" cliqué) coche la ligne.
    await expect(page.getByText('2 / 2')).toHaveCount(0);
    const row = page.locator('[data-testid="onboarding-item-discover-roadmap"]');
    await expect(row.getByText('✓')).toBeVisible();
  });

  test('fermer le tunnel avant la fin (croix) ne coche pas la ligne', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[title="Aide"]').click();
    await page.locator('[data-testid="onboarding-item-discover-kanban"]').click();
    await expect(page).toHaveURL(/\/kanban/);
    await page.locator('[data-testid="onboarding-spotlight"] button[aria-label="Fermer"]').click();
    const row = page.locator('[data-testid="onboarding-item-discover-kanban"]');
    await expect(row.getByText('✓')).toHaveCount(0);
  });
});

test.describe('Guide de démarrage — démo interactive (création de la 1re US)', () => {

  test('le tunnel piloté par la page accompagne la création réelle d\'un item et coche la ligne', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[title="Aide"]').click();
    await page.locator('[data-testid="onboarding-item-create-item"]').click();
    await expect(page).toHaveURL(/\/backlog/);

    // Étape 1 : le tooltip pointe sur "Ajouter" (piloté par la page, pas de Suivant).
    await expect(page.getByText('Cliquez sur "Ajouter"')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suivant' })).toHaveCount(0);
    await page.locator('[data-testid="btn-add-menu"]').click();

    // Étape 2 : le tooltip pointe sur "Nouvel Item".
    await expect(page.getByText('Choisissez "Nouvel Item"')).toBeVisible();
    await page.locator('[data-testid="menu-new-item"]').click();

    // La modale ouverte : bascule sur le tunnel manuel des champs clés (7 étapes).
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
    await expect(page.getByText('1 / 7')).toBeVisible();
    await expect(page.getByText('Choisissez le type d\'item')).toBeVisible();

    // Remplissage réel, indépendant de l'étape affichée dans la bulle.
    await page.locator('[data-testid="item-desc-input"]').fill('Ma première US de démo');
    await page.locator('[data-testid="item-save-btn"]').click();

    // La création réelle coche automatiquement la ligne et referme le tunnel.
    await expect(page.locator('[data-testid="item-modal"]')).toHaveCount(0);
    await expect(page.getByText('Cliquez sur "Ajouter"')).toHaveCount(0);
    await expect(page.getByText(/\d \/ 7/)).toHaveCount(0);
    const row = page.locator('[data-testid="onboarding-item-create-item"]');
    await expect(row).toContainText('Créer votre première US');
    await expect(row.getByText('✓')).toBeVisible();
  });
});

test.describe('Guide de démarrage — réinitialisation', () => {

  test('le bouton Réinitialiser remet la checklist à zéro après confirmation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[title="Aide"]').click();
    await page.locator('[data-testid="onboarding-item-discover-roadmap"]').click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Terminer' }).click();
    const row = page.locator('[data-testid="onboarding-item-discover-roadmap"]');
    await expect(row.getByText('✓')).toBeVisible();

    await page.locator('[data-testid="onboarding-reset-btn"]').click();
    await page.locator('[data-testid="dialog-confirm"]').click();
    await expect(row.getByText('✓')).toHaveCount(0);
  });
});
