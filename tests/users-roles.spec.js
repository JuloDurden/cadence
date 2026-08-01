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
  // État mutable local, pas juste une réponse figée : nécessaire dès qu'un test navigue hors de
  // /settings puis y revient (SPA, sans reload) — UsersSettingsSection refait alors un vrai GET
  // /api/users au remontage, qui doit refléter les créations/suppressions faites entre-temps
  // (2026-08-01, corrige un compte créé en cours de test qui "disparaissait" après un aller-retour
  // /team → /settings, la 1re version de ce mock renvoyant toujours la liste figée d'origine).
  let currentUsers = users.map(u => ({ ...u }));

  // Enregistre apres goTo() : le mock generique **/api/** de helpers.js repond deja {data:null}
  // a tout, ce mock plus specifique (enregistre en dernier) prend le dessus pour /api/users.
  await page.route('**/api/users', async r => {
    if (r.request().method() === 'GET') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: currentUsers }) });
    }
    if (r.request().method() === 'POST') {
      const body = JSON.parse(r.request().postData() || '{}');
      const created = { id: 'u-new', email: body.email, name: body.name, role: body.role, createdAt: '2026-07-31T00:00:00.000Z' };
      currentUsers = [...currentUsers, created];
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ user: created }) });
    }
    return r.continue();
  });
  await page.route('**/api/users/*', async r => {
    const id = r.request().url().split('/').pop();
    if (r.request().method() === 'PATCH') {
      const body = JSON.parse(r.request().postData() || '{}');
      const base = currentUsers.find(u => u.id === id) ?? currentUsers[0];
      const updated = { ...base, ...body };
      currentUsers = currentUsers.map(u => u.id === id ? updated : u);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: updated }) });
    }
    // Retour Julien (2026-08-01) : suppression de compte (voir backend/src/routes/users.ts).
    if (r.request().method() === 'DELETE') {
      currentUsers = currentUsers.filter(u => u.id !== id);
      return r.fulfill({ status: 204 });
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
    // Verrouillage Stakeholder (2026-08-01) : STAKEHOLDER a été retiré de ce select (ce
    // formulaire crée une fiche Équipe, jamais adaptée à un Stakeholder — voir
    // UsersSettingsSection.tsx et tests/signup-invite.spec.js pour le chemin dédié).
    await page.locator('[data-testid="new-user-role"]').selectOption('DEV');
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

// Phase 2.5 (roadmap v1), Onboarding — suppression de compte (2026-08-01, retour Julien : "je
// pensais que supprimer la fiche Équipe supprimait aussi le compte, ce n'est pas le cas"). Voir
// backend/src/routes/users.ts (DELETE /api/users/:id, Admin uniquement, jamais un compte Admin)
// et UsersSettingsSection.tsx (nettoyage de la fiche Équipe ou du Contact lié côté client).
test.describe('Phase 2.5 — suppression d\'un compte utilisateur (Admin)', () => {

  test('aucun bouton "Supprimer" sur la ligne d\'un compte Admin', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await mockUsersApi(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="user-delete-u-admin"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="user-delete-u-po"]')).toBeVisible();
  });

  test('annuler la confirmation ne supprime pas le compte', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await mockUsersApi(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="user-delete-u-po"]').click();
    await page.locator('[data-testid="dialog-cancel"]').click();
    await expect(page.locator('[data-testid="user-row-u-po"]')).toBeVisible();
  });

  test('confirmer la suppression retire la ligne', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await mockUsersApi(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="user-delete-u-po"]').click();
    await page.locator('[data-testid="dialog-confirm"]').click();
    await expect(page.locator('[data-testid="user-row-u-po"]')).toHaveCount(0);
  });

  test('supprimer un compte créé avec une fiche Équipe liée supprime aussi la fiche', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await mockUsersApi(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Créer un compte crée automatiquement une fiche Équipe liée (voir handleCreate,
    // UsersSettingsSection.tsx) — le chemin le plus simple pour obtenir un compte réellement lié
    // sans dépendre du vrai backend.
    await page.locator('[data-testid="new-user-name"]').fill('Compte À Supprimer');
    await page.locator('[data-testid="new-user-email"]').fill('a-supprimer@cadence.local');
    await page.locator('[data-testid="new-user-password"]').fill('motdepasse123');
    await page.locator('[data-testid="new-user-role"]').selectOption('DEV');
    await page.locator('[data-testid="create-user-submit"]').click();
    await expect(page.locator('[data-testid="user-row-u-new"]')).toBeVisible();

    // Navigation cliente (lien de Sidebar), pas un `page.goto` complet : un rechargement complet
    // perdrait l'état en mémoire (le mock générique de `/api/state` renvoie `{data: null}`, donc
    // un rechargement retomberait sur DEMO_STATE et perdrait la fiche Équipe qu'on vient de créer
    // côté client, jamais réellement persistée par le mock).
    await page.locator('a[href="/team"]').click();
    await expect(page.getByText('Compte À Supprimer')).toBeVisible();

    // Pas de lien Sidebar vers /settings (raccourci Header uniquement, bouton avec navigate()
    // programmatique — voir Header.tsx) : `a[href="/settings"]` n'a jamais existé dans le DOM,
    // corrigé pour cibler le vrai bouton (2026-08-01, test qui n'avait encore jamais tourné).
    await page.locator('[data-testid="settings-shortcut"]').click();
    await page.locator('[data-testid="user-delete-u-new"]').click();
    await page.locator('[data-testid="dialog-confirm"]').click();
    await expect(page.locator('[data-testid="user-row-u-new"]')).toHaveCount(0);

    await page.locator('a[href="/team"]').click();
    await expect(page.getByText('Compte À Supprimer')).toHaveCount(0);
  });
});

// Phase 2 (roadmap v1), sous-chantier 2 : suppression d'un tag de base (des suggestions
// uniquement, un item qui l'a déjà n'est pas affecté) réintroduite, réservée au rôle Admin —
// voir docs/corrections.md, Chantier M pour le pourquoi de la réintroduction tardive.
test.describe('Phase 2 — suppression d\'un tag de base (rôle Admin)', () => {

  test('le bouton de retrait d\'un tag de base est visible pour Admin, absent sinon', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="remove-base-tag-Sécurité"]')).toBeVisible();

    await goTo(page, '/settings', { role: 'DEV' });
    await expect(page.locator('[data-testid="remove-base-tag-Sécurité"]')).toHaveCount(0);
  });

  test('retirer un tag de base le fait disparaître de la liste', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="remove-base-tag-Sécurité"]')).toBeVisible();

    await page.locator('[data-testid="remove-base-tag-Sécurité"]').click();
    await expect(page.locator('[data-testid="remove-base-tag-Sécurité"]')).toHaveCount(0);
  });
});
