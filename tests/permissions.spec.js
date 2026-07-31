// Phase 2 (roadmap v1), sous-chantier 3 : permissions fines par page. Un seul fichier, complété
// page par page (Daily, Rétrospective, Auto-planning/What-if, Backlog — voir docs/roadmap-v1.md
// pour la matrice complète). Convention actée avec Julien avant de commencer (2026-07-31) : le
// rôle Admin passe toujours, même quand une action est réservée à un autre rôle (voir
// `utils/permissions.ts`, `hasRole()`).
const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Phase 2 — permissions : Daily (archivage réservé Scrum Master)', () => {

  test('le Scrum Master voit les boutons d\'archivage', async ({ page }) => {
    await goTo(page, '/daily', { role: 'SCRUM_MASTER' });
    await expect(page.locator('[data-testid="btn-archive-daily"]')).toBeVisible();
  });

  test('Admin voit aussi les boutons d\'archivage (superuser)', async ({ page }) => {
    await goTo(page, '/daily', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="btn-archive-daily"]')).toBeVisible();
  });

  test('un Dev ne voit pas le bouton d\'archivage', async ({ page }) => {
    await goTo(page, '/daily', { role: 'DEV' });
    await expect(page.locator('[data-testid="btn-archive-daily"]')).toHaveCount(0);
  });

  test('un PO ne voit pas le bouton d\'archivage', async ({ page }) => {
    await goTo(page, '/daily', { role: 'PO' });
    await expect(page.locator('[data-testid="btn-archive-daily"]')).toHaveCount(0);
  });
});

// Sous-chantier 3 : seul le Dev lié à une carte (TeamMember.linkedUserId) peut la remplir, les
// autres rôles restent en lecture seule. Aucun membre de DEMO_STATE n'est lié par défaut (aucun
// TeamMember.linkedUserId défini) — ces tests couvrent donc le cas par défaut "non lié" pour
// chaque rôle. Le cas "lié et donc éditable pour son propre compte" demande d'injecter un état
// personnalisé (hors de portée ici, à vérifier manuellement par Julien : lier un membre depuis
// Team en tant qu'Admin, puis se connecter avec ce compte).
test.describe('Phase 2 — permissions : Daily (remplir sa propre carte, Dev uniquement)', () => {
  const FIELD = '[data-testid="daily-field-yesterday-m1"]';

  test('un Dev non lié ne peut pas éditer la carte (lecture seule par défaut)', async ({ page }) => {
    await goTo(page, '/daily', { role: 'DEV' });
    await expect(page.locator(FIELD)).toHaveAttribute('readonly', '');
  });

  test('un PO ne peut éditer aucune carte', async ({ page }) => {
    await goTo(page, '/daily', { role: 'PO' });
    await expect(page.locator(FIELD)).toHaveAttribute('readonly', '');
  });

  test('un Scrum Master ne peut éditer aucune carte', async ({ page }) => {
    await goTo(page, '/daily', { role: 'SCRUM_MASTER' });
    await expect(page.locator(FIELD)).toHaveAttribute('readonly', '');
  });

  test('Admin peut éditer n\'importe quelle carte (superuser)', async ({ page }) => {
    await goTo(page, '/daily', { role: 'ADMIN' });
    await expect(page.locator(FIELD)).not.toHaveAttribute('readonly', '');
  });
});

// Sous-chantier 3 : le champ "Compte utilisateur lié" (page Team, modale membre) qui permet de
// faire le lien TeamMember <-> User n'est visible que pour un Admin (c'est lui qui décide qui a
// le droit d'éditer sa carte Daily).
test.describe('Phase 2 — permissions : Team (lien compte utilisateur, réservé Admin)', () => {

  test('Admin voit le champ "Compte utilisateur lié"', async ({ page }) => {
    await goTo(page, '/team', { role: 'ADMIN' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await expect(page.locator('text=Compte utilisateur lié')).toBeVisible();
  });

  test('un Dev ne voit pas le champ "Compte utilisateur lié"', async ({ page }) => {
    await goTo(page, '/team', { role: 'DEV' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await expect(page.locator('text=Compte utilisateur lié')).toHaveCount(0);
  });
});

// Sous-chantier 3, page 2/4 : Rétrospective — export réservé Scrum Master, votes anonymisables
// (réglage de session, réservé Scrum Master). DEMO_STATE n'a ni session ni archive de retro par
// défaut : chaque test crée les siennes (archiver, ajouter un item) plutôt que de dépendre d'un
// état pré-rempli.
test.describe('Phase 2 — permissions : Rétrospective (export réservé Scrum Master)', () => {

  test('le Scrum Master voit les boutons d\'export sur une archive', async ({ page }) => {
    await goTo(page, '/retro', { role: 'SCRUM_MASTER' });
    await page.locator('button[title="Archiver cette rétrospective"]').click();
    await expect(page.locator('[data-testid^="retro-export-md-"]').first()).toBeVisible();
  });

  test('Admin voit aussi les boutons d\'export (superuser)', async ({ page }) => {
    await goTo(page, '/retro', { role: 'ADMIN' });
    await page.locator('button[title="Archiver cette rétrospective"]').click();
    await expect(page.locator('[data-testid^="retro-export-md-"]').first()).toBeVisible();
  });

  test('un Dev ne voit pas les boutons d\'export', async ({ page }) => {
    await goTo(page, '/retro', { role: 'DEV' });
    await page.locator('button[title="Archiver cette rétrospective"]').click();
    await expect(page.locator('[data-testid^="retro-export-md-"]')).toHaveCount(0);
  });
});

test.describe('Phase 2 — permissions : Rétrospective (votes anonymisables, réservé Scrum Master)', () => {

  test('le bouton "votes anonymes" est visible pour SM/Admin, absent pour Dev/PO', async ({ page }) => {
    await goTo(page, '/retro', { role: 'SCRUM_MASTER' });
    await expect(page.locator('[data-testid="btn-toggle-anonymous-votes"]')).toBeVisible();

    await goTo(page, '/retro', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="btn-toggle-anonymous-votes"]')).toBeVisible();

    await goTo(page, '/retro', { role: 'DEV' });
    await expect(page.locator('[data-testid="btn-toggle-anonymous-votes"]')).toHaveCount(0);

    await goTo(page, '/retro', { role: 'PO' });
    await expect(page.locator('[data-testid="btn-toggle-anonymous-votes"]')).toHaveCount(0);
  });

  test('activer les votes anonymes masque le highlight "vous avez déjà voté"', async ({ page }) => {
    await goTo(page, '/retro', { role: 'SCRUM_MASTER' });

    const input = page.locator('input[placeholder="Ajouter..."]').first();
    await input.fill('Item test anonymisation');
    await input.press('Enter');

    const voteBtn = page.locator('[data-testid^="retro-vote-"]').first();
    await voteBtn.click();
    await expect(voteBtn).toHaveAttribute('data-liked', 'true');

    await page.locator('[data-testid="btn-toggle-anonymous-votes"]').click();
    await expect(voteBtn).toHaveAttribute('data-liked', 'false');
  });
});

// Sous-chantier 3, page 3/4 : Auto-planning/What-if. Les scénarios sont un brouillon personnel en
// localStorage (jamais partagé entre utilisateurs, voir utils/permissions.ts) — donc ouverts à
// PO/Scrum Master/Dev (+ Admin) pour explorer/argumenter en sprint planning. Seul "Appliquer"
// (qui écrit réellement dans le planning partagé) est réservé PO (+ Admin). Le Stakeholder reste
// en lecture seule : il voit l'État actuel mais ne peut pas créer de scénario — décision actée
// avec Julien le 2026-07-31.
test.describe('Phase 2 — permissions : Auto-planning/What-if (exploration réservée PO/Scrum Master/Dev, lecture seule Stakeholder)', () => {

  test('le PO peut créer un scénario', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await expect(page.locator('[data-testid="btn-new-scenario"]')).toBeVisible();
  });

  test('le Scrum Master peut créer un scénario', async ({ page }) => {
    await goTo(page, '/auto', { role: 'SCRUM_MASTER' });
    await expect(page.locator('[data-testid="btn-new-scenario"]')).toBeVisible();
  });

  test('un Dev peut créer un scénario', async ({ page }) => {
    await goTo(page, '/auto', { role: 'DEV' });
    await expect(page.locator('[data-testid="btn-new-scenario"]')).toBeVisible();
  });

  test('Admin peut aussi créer un scénario (superuser)', async ({ page }) => {
    await goTo(page, '/auto', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="btn-new-scenario"]')).toBeVisible();
  });

  test('le Stakeholder ne peut pas créer de scénario, mais voit l\'État actuel', async ({ page }) => {
    await goTo(page, '/auto', { role: 'STAKEHOLDER' });
    await expect(page.locator('[data-testid="btn-new-scenario"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="btn-generate-current"]')).toBeVisible();
  });
});

test.describe('Phase 2 — permissions : Auto-planning/What-if (Appliquer réservé PO)', () => {

  test('le PO voit le bouton Appliquer après avoir généré un scénario', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.locator('[data-testid="btn-new-scenario"]').click();
    await page.locator('[data-testid^="btn-generate-"]').click();
    await expect(page.locator('[data-testid^="btn-apply-"]')).toBeVisible();
  });

  test('Admin voit aussi le bouton Appliquer (superuser)', async ({ page }) => {
    await goTo(page, '/auto', { role: 'ADMIN' });
    await page.locator('[data-testid="btn-new-scenario"]').click();
    await page.locator('[data-testid^="btn-generate-"]').click();
    await expect(page.locator('[data-testid^="btn-apply-"]')).toBeVisible();
  });

  test('un Scrum Master peut générer un scénario mais ne voit pas Appliquer', async ({ page }) => {
    await goTo(page, '/auto', { role: 'SCRUM_MASTER' });
    await page.locator('[data-testid="btn-new-scenario"]').click();
    await page.locator('[data-testid^="btn-generate-"]').click();
    await expect(page.locator('[data-testid^="btn-apply-"]')).toHaveCount(0);
  });

  test('un Dev peut générer un scénario mais ne voit pas Appliquer', async ({ page }) => {
    await goTo(page, '/auto', { role: 'DEV' });
    await page.locator('[data-testid="btn-new-scenario"]').click();
    await page.locator('[data-testid^="btn-generate-"]').click();
    await expect(page.locator('[data-testid^="btn-apply-"]')).toHaveCount(0);
  });
});
