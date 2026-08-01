// Phase 2.5 (roadmap v1), Onboarding — brique "création de compte" : auto-inscription libre
// (rôle choisi par la personne parmi PO/Scrum Master/Dev, décision Julien 2026-08-01) et
// invitation Admin réservée aux Stakeholders (lien à usage unique, pas d'email dans ce
// prototype). Contrairement aux autres specs, ces tests naviguent directement sur /login sans
// passer par goTo() (qui injecte un token et bypass la page) : c'est justement cette page qui est
// testée ici, à l'état "pas encore connecté".
const { test, expect } = require('@playwright/test');
const { goTo, BASE_URL } = require('./helpers');

async function gotoLogin(page, query = '') {
  await page.goto(BASE_URL + '/login' + query);
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Phase 2.5 — Onboarding : auto-inscription libre', () => {

  test('l\'onglet "Créer un compte" propose uniquement PO/Scrum Master/Dev (pas Stakeholder ni Admin)', async ({ page }) => {
    await gotoLogin(page);
    await page.locator('[data-testid="tab-signup"]').click();
    await expect(page.locator('[data-testid="signup-form"]')).toBeVisible();
    const roleOptions = await page.locator('[data-testid="signup-role"] option').allTextContents();
    expect(roleOptions).toEqual(['Product Owner', 'Scrum Master', 'Développeur']);
  });

  test('créer un compte connecte automatiquement et quitte la page de login', async ({ page }) => {
    await gotoLogin(page);
    // Le reste de l'app (StateProvider) appellera GET /api/state une fois connecté — mock
    // générique enregistré en premier, le mock spécifique ci-dessous (enregistré après) prend le
    // dessus pour /api/auth/signup (même convention que tests/users-roles.spec.js).
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) }));
    await page.route('**/api/auth/signup', r => r.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ token: 'fake-jwt', user: { id: 'u-new', email: 'nouvelle@cadence.local', name: 'Nouvelle Recrue', role: 'DEV' } }),
    }));

    await page.locator('[data-testid="tab-signup"]').click();
    await page.locator('[data-testid="signup-name"]').fill('Nouvelle Recrue');
    await page.locator('[data-testid="signup-email"]').fill('nouvelle@cadence.local');
    await page.locator('[data-testid="signup-password"]').fill('motdepasse123');
    await page.locator('[data-testid="signup-role"]').selectOption('DEV');
    await page.locator('[data-testid="signup-submit"]').click();

    await page.waitForURL(u => !u.pathname.startsWith('/login'));
    const token = await page.evaluate(() => localStorage.getItem('cadence_token'));
    expect(token).toBe('fake-jwt');
  });

  test('un email déjà utilisé affiche une erreur (pas de redirection)', async ({ page }) => {
    await gotoLogin(page);
    await page.route('**/api/auth/signup', r => r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Un compte existe déjà avec cet email' }) }));

    await page.locator('[data-testid="tab-signup"]').click();
    await page.locator('[data-testid="signup-name"]').fill('Doublon');
    await page.locator('[data-testid="signup-email"]').fill('deja@cadence.local');
    await page.locator('[data-testid="signup-password"]').fill('motdepasse123');
    await page.locator('[data-testid="signup-submit"]').click();

    await expect(page.locator('[data-testid="login-error"]')).toContainText('existe déjà');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Phase 2.5 — Onboarding : invitation Stakeholder', () => {

  test('un lien d\'invitation affiche un formulaire dédié, sans choix de rôle', async ({ page }) => {
    await gotoLogin(page, '?invite=tok-abc123');
    await expect(page.locator('[data-testid="invite-form"]')).toBeVisible();
    // "Stakeholder" est annoncé dans le paragraphe d'intro juste au-dessus du <form>, pas dans le
    // <form> lui-même (qui ne contient que les champs et le bouton) — d'où la portée sur la page.
    await expect(page.getByText('Stakeholder')).toBeVisible();
    await expect(page.locator('[data-testid="tab-signup"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="signup-role"]')).toHaveCount(0);
  });

  test('compléter une invitation valide connecte automatiquement', async ({ page }) => {
    await gotoLogin(page, '?invite=tok-abc123');
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) }));
    await page.route('**/api/auth/accept-invite', r => r.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ token: 'fake-jwt-invite', user: { id: 'u-stake', email: 'client@dehors.com', name: 'Client Externe', role: 'STAKEHOLDER' } }),
    }));

    await page.locator('[data-testid="invite-name"]').fill('Client Externe');
    await page.locator('[data-testid="invite-email"]').fill('client@dehors.com');
    await page.locator('[data-testid="invite-password"]').fill('motdepasse123');
    await page.locator('[data-testid="invite-submit"]').click();

    await page.waitForURL(u => !u.pathname.startsWith('/login'));
    const token = await page.evaluate(() => localStorage.getItem('cadence_token'));
    expect(token).toBe('fake-jwt-invite');
  });

  test('une invitation invalide ou déjà utilisée affiche une erreur', async ({ page }) => {
    await gotoLogin(page, '?invite=tok-expired');
    await page.route('**/api/auth/accept-invite', r => r.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: 'Ce lien d\'invitation n\'est plus valide' }) }));

    await page.locator('[data-testid="invite-name"]').fill('Client Externe');
    await page.locator('[data-testid="invite-email"]').fill('client@dehors.com');
    await page.locator('[data-testid="invite-password"]').fill('motdepasse123');
    await page.locator('[data-testid="invite-submit"]').click();

    await expect(page.locator('[data-testid="login-error"]')).toContainText('n\'est plus valide');
  });
});

test.describe('Phase 2.5 — Onboarding : génération des invitations (Réglages, Admin)', () => {

  test('un Admin voit la section "Inviter un Stakeholder" et peut générer un lien', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await page.route('**/api/invitations', r => {
      if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invitations: [] }) });
      if (r.request().method() === 'POST') return r.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ invitation: { id: 'inv-1', token: 'tok-xyz', createdBy: 'u-admin', usedAt: null, createdAt: '2026-08-01T09:00:00.000Z', clientId: 'cl1' } }),
      });
      return r.continue();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="invitations-section"]')).toBeVisible();
    // Verrouillage Stakeholder (2026-08-01) : le client (rattachement comme Contact, pas fiche
    // Équipe) est requis avant de pouvoir générer le lien — voir UsersSettingsSection.tsx.
    // "FAXFA" (cl1) vient de DEMO_STATE, chargé côté client puisque GET /api/state répond
    // {data: null} (mock générique de goTo()).
    await page.locator('[data-testid="invite-client-select"]').selectOption('cl1');
    await page.locator('[data-testid="create-invitation"]').click();
    await expect(page.locator('[data-testid="invitation-row-inv-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="invitation-status-inv-1"]')).toContainText('En attente');
    await expect(page.locator('[data-testid="invitation-row-inv-1"]')).toContainText('FAXFA');
  });

  test('révoquer une invitation en attente la retire de la liste', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await page.route('**/api/invitations', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ invitations: [{ id: 'inv-2', token: 'tok-def', createdBy: 'u-admin', usedAt: null, createdAt: '2026-08-01T09:00:00.000Z', clientId: 'cl1' }] }),
    }));
    await page.route('**/api/invitations/inv-2', r => r.fulfill({ status: 204, body: '' }));
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="invitation-row-inv-2"]')).toBeVisible();
    await page.locator('[data-testid="invitation-revoke-inv-2"]').click();
    await expect(page.locator('[data-testid="invitation-row-inv-2"]')).toHaveCount(0);
  });

  test('un non-Admin ne voit pas la section "Inviter un Stakeholder"', async ({ page }) => {
    await goTo(page, '/settings', { role: 'DEV' });
    await expect(page.locator('[data-testid="invitations-section"]')).toHaveCount(0);
  });

  test('le bouton "Inviter un Stakeholder" reste désactivé tant qu\'aucun client n\'est choisi', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await page.route('**/api/invitations', r => {
      if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invitations: [] }) });
      return r.continue();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="create-invitation"]')).toBeDisabled();
    await page.locator('[data-testid="invite-client-select"]').selectOption('cl1');
    await expect(page.locator('[data-testid="create-invitation"]')).toBeEnabled();
  });
});
