const { test, expect } = require('@playwright/test');
const { goTo, BASE_URL } = require('./helpers');

test.describe('Daily Standup', () => {

  test('affiche le sélecteur de durée et le timer mm:ss', async ({ page }) => {
    await goTo(page, '/daily');
    await expect(page.locator('.page-content')).toBeVisible();
    // Sélecteur de durée (5 / 10 / 15 / 20 / 30 min)
    await expect(page.locator('select.hdr-select')).toBeVisible();
    // Affichage mm:ss
    await expect(page.getByText(/^\d{2}:\d{2}$/).first()).toBeVisible();
  });

  // Bouton Archiver réservé Scrum Master (+ Admin) depuis v0.93.2 (canArchiveDaily,
  // utils/permissions.ts) — role explicite pour ce test antérieur au système de rôles.
  test('affiche les boutons de contrôle du timer et les actions', async ({ page }) => {
    await goTo(page, '/daily', { role: 'SCRUM_MASTER' });
    // Barre de progression timer
    await expect(page.locator('.timer-bar-wrap')).toBeVisible();
    // Bouton play/pause (title Démarrer au départ)
    await expect(page.locator('button[title="Démarrer"]')).toBeVisible();
    // Bouton réinitialiser
    await expect(page.locator('button[title="Réinitialiser"]')).toBeVisible();
    // Bouton copier résumé
    await expect(page.locator('button[title="Copier le résumé du jour"]')).toBeVisible();
    // Bouton archiver (archive + vide les saisies en une seule action atomique,
    // ancien bouton "Effacer" séparé supprimé/fusionné — voir commit 7fc628e)
    await expect(page.locator('button[title="Archiver ce daily (et vider les saisies du jour)"]')).toBeVisible();
  });

  test('affiche les cartes des membres du DEMO_STATE', async ({ page }) => {
    await goTo(page, '/daily');
    await expect(page.locator('[data-testid="daily-member-card"]').first()).toBeVisible();
    await expect(page.locator('text=Aldo Raines')).toBeVisible();
  });

  test('la section Aujourd\'hui est collapsible', async ({ page }) => {
    await goTo(page, '/daily');
    // Section ouverte par défaut — les cartes sont visibles
    await expect(page.locator('[data-testid="daily-member-card"]').first()).toBeVisible();
    // Cliquer sur le bouton de section pour fermer
    await page.locator('.daily-section-btn').first().click();
    await expect(page.locator('[data-testid="daily-member-card"]').first()).not.toBeVisible();
    // Rouvrir
    await page.locator('.daily-section-btn').first().click();
    await expect(page.locator('[data-testid="daily-member-card"]').first()).toBeVisible();
  });

  test('affiche la section Archives (vide par défaut)', async ({ page }) => {
    await goTo(page, '/daily');
    // La section Archives doit être visible
    await expect(page.locator('.daily-section-btn').filter({ hasText: 'Archives' })).toBeVisible();
    // Message vide
    await expect(page.locator('text=Aucune archive')).toBeVisible();
  });

  // Remplir la carte d'un membre est réservé au Dev lié (TeamMember.linkedUserId) depuis v0.93.3
  // (canEditDailyCard) — DEMO_STATE ne lie aucun membre par défaut, donc seul Admin (qui passe
  // toujours, quel que soit le lien) peut éditer n'importe quelle carte sans setup supplémentaire.
  test('peut saisir une entrée daily pour un membre', async ({ page }) => {
    await goTo(page, '/daily', { role: 'ADMIN' });
    const card = page.locator('[data-testid="daily-member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('textarea').first().fill('Travail sur la feature X');
    await expect(card.locator('textarea').first()).toHaveValue('Travail sur la feature X');
  });

  test('les labels Hier/Aujourd\'hui/Blocages s\'affichent sur les cartes', async ({ page }) => {
    await goTo(page, '/daily');
    const card = page.locator('[data-testid="daily-member-card"]').first();
    await expect(card.getByText('Hier', { exact: true })).toBeVisible();
    await expect(card.getByText("Aujourd'hui", { exact: true })).toBeVisible();
    await expect(card.getByText('Blocages', { exact: true })).toBeVisible();
  });

  // "+ Absence" réservé PO/Scrum Master (+ Admin) depuis la Phase 2 (canManageAbsences,
  // utils/permissions.ts) — role explicite pour ce test antérieur au système de rôles.
  test('les membres absents apparaissent dans l\'encadré et pas dans les cartes', async ({ page }) => {
    await goTo(page, '/team', { role: 'PO' });
    const today = new Date().toISOString().slice(0, 10);
    // Crée une absence pour Aldo Raines couvrant aujourd'hui
    await page.click('button:has-text("+ Absence")');
    await page.fill('input[placeholder="Congés été…"]', 'Congé test');
    await page.locator('input[type="date"]').first().fill(today);
    await page.locator('input[type="date"]').nth(1).fill(today);
    await page.locator('.modal-footer .btn-primary').click();
    await expect(page.locator('text=Congé test').first()).toBeVisible();
    // Navigation React Router via sidebar (préserve le state)
    await page.click('a[href="/daily"]');
    await page.waitForURL('**/daily');
    // L'encadré absents doit être visible
    await expect(page.locator("text=Absents aujourd'hui")).toBeVisible();
    // Aldo Raines ne doit pas avoir de carte membre (absent)
    await expect(
      page.locator('[data-testid="daily-member-card"]').filter({ hasText: 'Aldo Raines' })
    ).not.toBeVisible();
  });

});

// Bouton "Envoyer sur Slack" (v0.97.12, 2026-08-08, Phase 5 roadmap v1) : réservé Scrum Master/Admin
// comme le bouton Archiver (canArchiveDaily), envoi manuel plutôt qu'automatique à chaque saisie
// (décision Julien, AskUserQuestion). `POST /api/slack-config/notify/daily-summary` mocké après
// `goTo()`, pas besoin de `page.reload()` (l'appel ne part qu'au clic, pas au montage de la page).
test.describe('Résumé Daily sur Slack (v0.97.12)', () => {

  test('le bouton est visible pour un Scrum Master, pas pour un rôle sans droit d\'archivage (Dev)', async ({ page }) => {
    await goTo(page, '/daily', { role: 'SCRUM_MASTER' });
    await expect(page.locator('[data-testid="btn-send-daily-slack"]')).toBeVisible();
    await goTo(page, '/daily', { role: 'DEV' });
    await expect(page.locator('[data-testid="btn-send-daily-slack"]')).toHaveCount(0);
  });

  test('un envoi réussi affiche un toast de confirmation', async ({ page }) => {
    await goTo(page, '/daily', { role: 'SCRUM_MASTER' });
    await page.route('**/api/slack-config/notify/daily-summary', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent: true }) })
    );
    await page.locator('[data-testid="btn-send-daily-slack"]').click();
    await expect(page.getByRole('status')).toContainText('envoyé');
  });

  test('un envoi vers une intégration non configurée affiche un message d\'information', async ({ page }) => {
    await goTo(page, '/daily', { role: 'SCRUM_MASTER' });
    await page.route('**/api/slack-config/notify/daily-summary', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent: false }) })
    );
    await page.locator('[data-testid="btn-send-daily-slack"]').click();
    await expect(page.getByRole('status')).toContainText('non configurée');
  });

  test('une erreur Slack renvoyée par le serveur est affichée dans le toast', async ({ page }) => {
    await goTo(page, '/daily', { role: 'SCRUM_MASTER' });
    await page.route('**/api/slack-config/notify/daily-summary', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent: false, error: 'Le bot n\'est pas membre de ce canal' }) })
    );
    await page.locator('[data-testid="btn-send-daily-slack"]').click();
    await expect(page.getByRole('status')).toContainText('Le bot n\'est pas membre de ce canal');
  });

});

// Synchronisation temps réel (2026-08-18, retour Julien : "seule page du projet censée être vue
// et remplie par plusieurs personnes en même temps"). Canal WebSocket dédié à /api/ws/daily,
// séparé du PUT /api/state (voir backend/src/routes/dailyWs.ts, hooks/useDailyRealtime.ts). Aucun
// vrai backend WebSocket n'est démarré dans cet environnement de test (seules les routes HTTP sont
// mockées via page.route) : la synchronisation effective entre 2 sessions réelles n'est donc pas
// vérifiable ici, seulement la tentative de connexion et la tolérance à son échec, voir
// docs/corrections.md pour le détail et ce qui reste à vérifier manuellement.
test.describe('Daily Standup, synchronisation temps réel (2026-08-18)', () => {

  test('la page ouvre une connexion WebSocket vers /api/ws/daily à son montage', async ({ page }) => {
    const wsPromise = page.waitForEvent('websocket', ws => ws.url().includes('/api/ws/daily'));
    await goTo(page, '/daily', { role: 'ADMIN' });
    const ws = await wsPromise;
    expect(ws.url()).toContain('/api/ws/daily');
  });

  test('la page ne lève aucune erreur si la connexion WebSocket échoue (aucun serveur WS réel ici)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/daily', { role: 'ADMIN' });
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

  // Aldo Raines = m1 (demo.ts) : testid stable posé sur chaque champ (MemberCard.tsx,
  // data-testid="daily-field-<champ>-<memberId>"), plus fiable que .locator('textarea').first()
  // qui dépend de l'ordre d'affichage des membres.
  test('plusieurs frappes rapprochées dans un même champ ne déclenchent qu\'une seule sauvegarde (anti-rebond 400ms)', async ({ page }) => {
    await goTo(page, '/daily', { role: 'ADMIN' });
    let putCount = 0;
    page.on('request', r => {
      if (r.url().includes('/api/state') && r.method() === 'PUT') putCount++;
    });
    const field = page.locator('[data-testid="daily-field-today-m1"]');
    await field.fill('T');
    await field.fill('Tr');
    await field.fill('Tra');
    await field.fill('Trav');
    await page.waitForTimeout(600);
    expect(putCount).toBe(1);
  });

});
