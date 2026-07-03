const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

const ROUTES = [
  ['/backlog',    'Backlog'],
  ['/kanban',     'Kanban'],
  ['/planning',   'Planning'],
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
