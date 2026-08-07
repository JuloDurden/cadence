const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

const ROUTES = [
  ['/backlog',    'Backlog'],
  ['/kanban',     'Kanban'],
  ['/planning',         'Planning'],
  ['/sprint-planning', 'Sprint Planning'],
  ['/dashboard',  'Dashboard'],
  ['/daily',      'Daily'],
  ['/retro',      'Rétrospective'],
  ['/clients',    'Clients'],
  ['/team',       'Équipe'],
  ['/auto',       'Auto-planning'],
  ['/historique', 'Historique'],
  ['/settings',   'Réglages'],
  ['/roadmap',    'Roadmap'],
];

test.describe('Smoke — toutes les routes React', () => {
  for (const [route, label] of ROUTES) {
    test(`${label} se charge sans erreur JS`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await goTo(page, route);
      await page.waitForTimeout(300);
      expect(errors, `Erreurs JS sur ${route}: ${errors.join(', ')}`).toHaveLength(0);
    });
  }
});

// Sidebar (v0.97.7, 2026-08-07, retour Julien : "si on collapse la sidebar avant de refresh, elle
// réapparaît uncollapsed") — état purement en mémoire jusqu'ici (`useState(false)`, jamais lu ni
// écrit nulle part), corrigé en `localStorage` (préférence d'écran/utilisateur, pas un réglage de
// workspace partagé) — même convention que le mode d'affichage de la modale d'item (`modal-view`)
// ou l'orientation de la toolbar NNL. Voir Sidebar.tsx.
test.describe('Sidebar — collapse persistant (v0.97.7)', () => {
  test('l\'état réduit de la sidebar persiste après un refresh', async ({ page }) => {
    await goTo(page, '/dashboard');
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).not.toHaveClass(/collapsed/);

    await page.locator('[data-testid="sidebar-collapse-toggle"]').click();
    await expect(sidebar).toHaveClass(/collapsed/);

    await page.reload();
    await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
  });

  test('réétendre la sidebar persiste aussi après un refresh', async ({ page }) => {
    await goTo(page, '/dashboard');
    await page.locator('[data-testid="sidebar-collapse-toggle"]').click();
    await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);

    await page.locator('[data-testid="sidebar-collapse-toggle"]').click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);

    await page.reload();
    await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
  });
});
