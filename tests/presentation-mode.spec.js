// Phase 3 (roadmap v1), Mode présentation — deux points d'entrée : (1) un compte déjà connecté
// lance le mode depuis un bouton "Présenter" (Dashboard/Roadmap/Vision/Sprint Review, sidebar
// masquée, navigation clavier ← →) ; (2) un lien public sans compte (Réglages > Mode présentation,
// réservé Admin + PO), qui ouvre directement le même mode d'affichage pour un visiteur externe. Ce
// 2e point est venu remplacer l'idée initiale d'un "mode lecture seule via token" générique
// (roadmap-v1.md) après que Julien a fait remarquer que le compte Stakeholder couvre déjà ce besoin
// (voir docs/corrections.md).
const { test, expect } = require('@playwright/test');
const { goTo, BASE_URL } = require('./helpers');

async function mockPresentationLinkApi(page, initialLink = null) {
  let currentLink = initialLink;
  await page.route('**/api/presentation-link', async r => {
    if (r.request().method() === 'GET') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ link: currentLink }) });
    }
    if (r.request().method() === 'POST') {
      currentLink = { id: 'pl-1', token: 'tok-present-1', createdBy: 'u-admin', createdAt: '2026-08-01T00:00:00.000Z' };
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ link: currentLink }) });
    }
    if (r.request().method() === 'DELETE') {
      currentLink = null;
      return r.fulfill({ status: 204 });
    }
    return r.continue();
  });
}

test.describe('Phase 3 — Mode présentation, lien public (Réglages, Admin + PO)', () => {

  test('un Admin voit la section "Mode présentation" et peut générer un lien', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await mockPresentationLinkApi(page, null);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="presentation-link-section"]')).toBeVisible();
    await page.locator('[data-testid="presentation-link-generate"]').click();
    await expect(page.locator('[data-testid="presentation-link-active"]')).toBeVisible();
    await expect(page.locator('[data-testid="presentation-link-active"] input')).toHaveValue(/\/present\/tok-present-1$/);
  });

  test('un PO voit aussi la section "Mode présentation"', async ({ page }) => {
    await goTo(page, '/settings', { role: 'PO' });
    await mockPresentationLinkApi(page, null);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="presentation-link-section"]')).toBeVisible();
  });

  test('un Dev ne voit pas la section "Mode présentation"', async ({ page }) => {
    await goTo(page, '/settings', { role: 'DEV' });
    await expect(page.locator('[data-testid="presentation-link-section"]')).toHaveCount(0);
  });

  test('révoquer le lien actif le retire après confirmation', async ({ page }) => {
    const existing = { id: 'pl-2', token: 'tok-present-2', createdBy: 'u-admin', createdAt: '2026-08-01T00:00:00.000Z' };
    await goTo(page, '/settings', { role: 'ADMIN' });
    await mockPresentationLinkApi(page, existing);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="presentation-link-active"]')).toBeVisible();
    await page.locator('[data-testid="presentation-link-revoke"]').click();
    await page.locator('[data-testid="dialog-confirm"]').click();
    await expect(page.locator('[data-testid="presentation-link-active"]')).toHaveCount(0);
  });
});

test.describe('Phase 3 — Mode présentation, vue publique (lien sans compte)', () => {

  // `valid: true` → GET /api/presentation/state/:token répond {data: null} (comme le mock
  // générique de goTo() pour toutes les autres specs) : SET_STATE n'est jamais dispatché,
  // DEMO_STATE reste affiché — inutile de reconstruire un état complet pour ces tests.
  // `valid: false` → 404, reproduit un lien jamais généré ou révoqué/régénéré depuis.
  async function gotoPresent(page, token, { valid }) {
    await page.route('**/api/presentation/state/**', r => r.fulfill({
      status: valid ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(valid ? { data: null } : { error: 'Lien de présentation invalide' }),
    }));
    await page.goto(`${BASE_URL}/present/${token}`);
    await page.waitForLoadState('networkidle');
  }

  test('un lien valide affiche le Dashboard en mode présentation, sans Sidebar', async ({ page }) => {
    await gotoPresent(page, 'tok-valid', { valid: true });

    await expect(page.locator('[data-testid="presentation-public-view"]')).toBeVisible();
    await expect(page.locator('.hdr-page-title')).toContainText('Dashboard');
    await expect(page.locator('.sidebar')).toHaveCount(0);
  });

  test('la flèche droite passe du Dashboard à la Roadmap', async ({ page }) => {
    await gotoPresent(page, 'tok-valid', { valid: true });
    await expect(page.locator('.hdr-page-title')).toContainText('Dashboard');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.hdr-page-title')).toContainText('Roadmap');
  });

  // Backlog ajouté au périmètre le 2026-08-01 (retour Julien) — devenu la dernière page de la
  // sélection par défaut (voir data/presentablePages.ts), donc la cible du bouclage vers la gauche.
  test('la flèche gauche depuis le Dashboard boucle sur la dernière page (Backlog)', async ({ page }) => {
    await gotoPresent(page, 'tok-valid', { valid: true });
    await expect(page.locator('.hdr-page-title')).toContainText('Dashboard');

    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.hdr-page-title')).toContainText('Product Backlog');
  });

  test('un lien invalide ou révoqué affiche un message d\'erreur, pas le workspace', async ({ page }) => {
    await gotoPresent(page, 'tok-revoked', { valid: false });

    await expect(page.locator('[data-testid="presentation-invalid"]')).toBeVisible();
    await expect(page.locator('[data-testid="presentation-public-view"]')).toHaveCount(0);
  });
});

test.describe('Phase 3 — Mode présentation, compte connecté', () => {

  test('le bouton "Présenter" est visible sur le Dashboard et masque la Sidebar une fois cliqué', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });

    await expect(page.locator('[data-testid="presentation-enter"]')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();

    await page.locator('[data-testid="presentation-enter"]').click();
    await expect(page.locator('.sidebar')).toHaveCount(0);
    await expect(page.locator('[data-testid="presentation-bar"]')).toBeVisible();
  });

  // Backlog ajouté au périmètre le 2026-08-01 (retour Julien) — Kanban reste un bon exemple de
  // page volontairement hors périmètre (jamais listée dans docs/roadmap-v1.md).
  test('le bouton "Présenter" est présent sur le Backlog, absent sur une page hors du périmètre (Kanban)', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await expect(page.locator('[data-testid="presentation-enter"]')).toBeVisible();

    await page.locator('a[href="/kanban"]').click();
    await expect(page.locator('[data-testid="presentation-enter"]')).toHaveCount(0);
  });

  test('Echap quitte le mode présentation et réaffiche la Sidebar', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="presentation-enter"]').click();
    await expect(page.locator('.sidebar')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('[data-testid="presentation-bar"]')).toHaveCount(0);
  });

  test('la flèche droite navigue du Dashboard vers la Roadmap en mode présentation', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="presentation-enter"]').click();

    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/roadmap$/);
    await expect(page.locator('.hdr-page-title')).toContainText('Roadmap');
  });

  test('la flèche gauche depuis le Dashboard boucle sur la dernière page (Backlog)', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="presentation-enter"]').click();

    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/backlog$/);
    await expect(page.locator('.hdr-page-title')).toContainText('Product Backlog');
  });

  // Retour Julien (2026-08-01, capture d'écran) : la Sidebar masquée ne suffisait pas, une page hors
  // périmètre restait atteignable (URL tapée directement, ou un lien resté cliquable ailleurs).
  test('une navigation vers une page hors périmètre pendant le mode présentation redirige vers la 1re page présentable', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="presentation-enter"]').click();

    await page.goto(page.url().replace(/\/dashboard.*$/, '/settings'));
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('[data-testid="presentation-bar"]')).toBeVisible();
  });
});

// Chantier "Config pages présentables" (2026-08-02, retour Julien du 2026-08-01) : sélection +
// ordre des pages du mode présentation, éditables Admin + PO en Réglages
// (PresentationPagesSection.tsx), catalogue étendu à 10 pages/sous-vues (Dashboard, Vision, NNL,
// Backlog, Roadmap, Release Planning, Auto-planning, Sprint Planning, Kanban, Sprint Review).
test.describe('Phase 3 — Mode présentation, choix et ordre des pages (Réglages)', () => {

  test('la sélection par défaut liste les 5 pages d\'origine, dans l\'ordre d\'origine', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="presentation-pages-section"]')).toBeVisible();

    const rows = page.locator('[data-testid^="presentation-page-row-"]');
    await expect(rows).toHaveCount(5);
    await expect(page.locator('[data-testid="presentation-page-row-dashboard"]')).toContainText('1. Dashboard');
    await expect(page.locator('[data-testid="presentation-page-row-roadmap"]')).toContainText('2. Roadmap');
    await expect(page.locator('[data-testid="presentation-page-row-vision"]')).toContainText('3. Vision');
    await expect(page.locator('[data-testid="presentation-page-row-sprint-review"]')).toContainText('4. Sprint Review');
    await expect(page.locator('[data-testid="presentation-page-row-backlog"]')).toContainText('5. Backlog');
  });

  test('ajouter une page la fait apparaître en dernière position, puis la retirer la fait disparaître', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });

    await expect(page.locator('[data-testid="presentation-page-add-kanban"]')).toBeVisible();
    await page.locator('[data-testid="presentation-page-add-kanban"]').click();

    await expect(page.locator('[data-testid="presentation-page-row-kanban"]')).toContainText('6. Kanban');
    await expect(page.locator('[data-testid="presentation-page-add-kanban"]')).toHaveCount(0);

    await page.locator('[data-testid="presentation-page-remove-kanban"]').click();
    await expect(page.locator('[data-testid="presentation-page-row-kanban"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="presentation-page-add-kanban"]')).toBeVisible();
  });

  test('descendre le Dashboard le place après la Roadmap', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });

    await page.locator('[data-testid="presentation-page-down-dashboard"]').click();
    await expect(page.locator('[data-testid="presentation-page-row-roadmap"]')).toContainText('1. Roadmap');
    await expect(page.locator('[data-testid="presentation-page-row-dashboard"]')).toContainText('2. Dashboard');
  });

  test('retirer est désactivé quand une seule page reste sélectionnée', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });

    for (const id of ['roadmap', 'vision', 'sprint-review', 'backlog']) {
      await page.locator(`[data-testid="presentation-page-remove-${id}"]`).click();
    }
    await expect(page.locator('[data-testid^="presentation-page-row-"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="presentation-page-remove-dashboard"]')).toBeDisabled();
  });

  test('réinitialiser restaure la sélection et l\'ordre par défaut', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });

    await page.locator('[data-testid="presentation-page-add-kanban"]').click();
    await page.locator('[data-testid="presentation-page-down-dashboard"]').click();
    await page.locator('[data-testid="presentation-pages-reset"]').click();

    const rows = page.locator('[data-testid^="presentation-page-row-"]');
    await expect(rows).toHaveCount(5);
    await expect(page.locator('[data-testid="presentation-page-row-dashboard"]')).toContainText('1. Dashboard');
    await expect(page.locator('[data-testid="presentation-page-row-kanban"]')).toHaveCount(0);
  });

  test('un Dev ne voit pas la section "Pages du mode présentation"', async ({ page }) => {
    await goTo(page, '/settings', { role: 'DEV' });
    await expect(page.locator('[data-testid="presentation-pages-section"]')).toHaveCount(0);
  });

  test('une page ajoutée en Réglages devient atteignable en mode présentation (compte connecté)', async ({ page }) => {
    await goTo(page, '/settings', { role: 'PO' });
    // Kanban ajouté en dernier : dashboard, roadmap, vision, sprint-review, backlog, kanban.
    await page.locator('[data-testid="presentation-page-add-kanban"]').click();

    // Navigation SPA (pas de rechargement) vers le Dashboard : le réglage vient d'être mis à jour
    // en mémoire côté client, pas besoin de re-mocker /api/state pour que ça se reflète.
    await page.locator('a[href="/dashboard"]').click();
    await page.locator('[data-testid="presentation-enter"]').click();

    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.hdr-page-title')).toContainText('Kanban');
  });
});
