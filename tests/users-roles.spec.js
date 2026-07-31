// Phase 2 (roadmap v1), sous-chantier 1 : gestion des comptes + roles (PO/SCRUM_MASTER/DEV/
// STAKEHOLDER/ADMIN). Couvre : visibilite de la section "Utilisateurs" des Reglages selon le
// role simule (cadence_user_role, voir tests/helpers.js), creation d'un utilisateur, changement
// de role, et l'affichage du vrai nom/role dans le panneau profil du Header (auparavant "Admin"
// en dur, voir docs/corrections.md).
const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

const MOCK_USERS = [
  { id: 'u-admin', email: 'admin@cadence.local', name: 'Admin', role: 'ADMIN', createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 'u-po', email: 'po@cadence.local', name: 'Julien PO', role: 'PO', createdAt: '2026-07-15T00:00:00.000Z' },
];

async function mockUsersApi(page, users = MOCK_USERS) {
  // Enregistre apres goTo() : le mock generique **/api/** de helpers.js repond deja {data:null}
  // a tout, ce mock plus specifique (enregistre en dernier) prend le dessus pour /api/users.
  await page.route('**/api/users', async r => {
    if (r.request().method() === 'GET') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users }) });
    }
    if (r.request().method() === 'POST') {
      const body = JSON.parse(r.request().postData() || '{}');
      const created = { id: 'u-new', email: body.email, name: body.name, role: body.role, createdAt: '2026-07-31T00:00:00.000Z' };
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ user: created }) });
    }
    return r.continue();
  });
  await page.route('**/api/users/*', async r => {
    if (r.request().method() === 'PATCH') {
      const id = r.request().url().split('/').pop();
      const body = JSON.parse(r.request().postData() || '{}');
      const base = users.find(u => u.id === id) ?? users[0];
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { ...base, ...body } }) });
    }
    return r.continue();
  });
}

test.describe('Phase 2 — rôles & gestion des utilisateurs', () => {

  test('la section "Utilisateurs" est visible dans les Réglages pour le rôle Admin', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await mockUsersApi(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="users-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-row-u-admin"]')).toContainText('Admin');
    await expect(page.locator('[data-testid="user-row-u-po"]')).toContainText('Julien PO');
  });

  test('la section "Utilisateurs" est absente pour un rôle non-Admin', async ({ page }) => {
    await goTo(page, '/settings', { role: 'DEV' });
    await mockUsersApi(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="users-section"]')).toHaveCount(0);
  });

  test('créer un utilisateur ajoute une ligne à la liste', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await mockUsersApi(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="new-user-name"]').fill('Nouvelle Recrue');
    await page.locator('[data-testid="new-user-email"]').fill('recrue@cadence.local');
    await page.locator('[data-testid="new-user-password"]').fill('motdepasse123');
    await page.locator('[data-testid="new-user-role"]').selectOption('STAKEHOLDER');
    await page.locator('[data-testid="create-user-submit"]').click();

    await expect(page.locator('[data-testid="user-row-u-new"]')).toContainText('Nouvelle Recrue');
    await expect(page.locator('[data-testid="user-row-u-new"]')).toContainText('recrue@cadence.local');
  });

  test('changer le rôle d\'un utilisateur met à jour son select', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await mockUsersApi(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="user-role-u-po"]').selectOption('SCRUM_MASTER');
    await expect(page.locator('[data-testid="user-role-u-po"]')).toHaveValue('SCRUM_MASTER');
  });

  test('le panneau profil du Header affiche le vrai nom et le rôle du compte connecté', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO', name: 'Julien' });

    await page.locator('.hdr-profile-btn').click();
    await expect(page.locator('.hdr-profile-user')).toContainText('Julien');
    await expect(page.locator('.hdr-profile-user')).toContainText('Product Owner');
  });
});
