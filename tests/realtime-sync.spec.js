const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

// Synchronisation temps réel générale (2026-08-19, retour Julien : "quand plusieurs utilisateurs
// sont en même temps sur l'outil, si l'un d'eux met quelque chose à jour, personne ne voit la
// modification sauf en faisant un refresh"). Canal WebSocket dédié à /api/ws/sync, distinct de
// celui du Daily Standup (/api/ws/daily), établi une seule fois au niveau racine de l'app
// (StateContext.tsx) donc actif quelle que soit la page affichée. Aucun vrai backend WebSocket
// n'est démarré dans cet environnement de test (seules les routes HTTP sont mockées via
// page.route) : la synchronisation effective entre 2 sessions réelles n'est donc pas vérifiable
// ici, seulement la tentative de connexion (sur plusieurs pages différentes, pour confirmer que ce
// n'est pas propre à une page en particulier) et la tolérance à son échec.
test.describe('Synchronisation temps réel générale (2026-08-19)', () => {

  test('une connexion WebSocket vers /api/ws/sync s\'ouvre sur le Backlog', async ({ page }) => {
    const wsPromise = page.waitForEvent('websocket', ws => ws.url().includes('/api/ws/sync'));
    await goTo(page, '/backlog', { role: 'PO' });
    const ws = await wsPromise;
    expect(ws.url()).toContain('/api/ws/sync');
  });

  test('la même connexion s\'ouvre aussi sur le Kanban, page différente du Daily Standup', async ({ page }) => {
    const wsPromise = page.waitForEvent('websocket', ws => ws.url().includes('/api/ws/sync'));
    await goTo(page, '/kanban', { role: 'DEV' });
    const ws = await wsPromise;
    expect(ws.url()).toContain('/api/ws/sync');
  });

  test('la page ne lève aucune erreur si la connexion WebSocket échoue (aucun serveur WS réel ici)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/backlog', { role: 'PO' });
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

});
