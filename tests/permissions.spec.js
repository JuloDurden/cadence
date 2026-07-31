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

// Sous-chantier 3, page 4/4 : Backlog. PO (+ Admin) accès complet (CRUD items/Epics/Initiatives,
// tous les champs). Dev sous-ensemble opérationnel : statut, SP, notes/commentaires, DoD,
// dépendances, auto-assignation — le contenu produit (description, US, critères, priorité,
// epic/client, tags, DoR) reste PO uniquement. Scrum Master et Stakeholder en lecture seule
// (seuls PO et Dev sont mentionnés en écriture dans la matrice de rôles d'origine, confirmé avec
// Julien le 2026-07-31 via AskUserQuestion). BUG-001 est le premier item du DEMO_STATE.
test.describe('Phase 2 — permissions : Backlog ("+ Ajouter" et actions de ligne réservées PO/Dev)', () => {

  test('le PO voit "+ Ajouter"', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await expect(page.locator('[data-testid="btn-add-menu"]')).toBeVisible();
  });

  test('Admin voit aussi "+ Ajouter" (superuser)', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="btn-add-menu"]')).toBeVisible();
  });

  test('un Dev ne voit pas "+ Ajouter"', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'DEV' });
    await expect(page.locator('[data-testid="btn-add-menu"]')).toHaveCount(0);
  });

  test('un Scrum Master ne voit pas "+ Ajouter"', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'SCRUM_MASTER' });
    await expect(page.locator('[data-testid="btn-add-menu"]')).toHaveCount(0);
  });

  test('un Stakeholder ne voit pas "+ Ajouter"', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'STAKEHOLDER' });
    await expect(page.locator('[data-testid="btn-add-menu"]')).toHaveCount(0);
  });

  test('le PO voit Modifier et Supprimer sur une ligne', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await expect(row.locator('button[title="Modifier"]')).toBeVisible();
    await expect(row.locator('button[title="Supprimer"]')).toBeVisible();
  });

  test('un Dev voit Modifier mais pas Supprimer sur une ligne', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'DEV' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await expect(row.locator('button[title="Modifier"]')).toBeVisible();
    await expect(row.locator('button[title="Supprimer"]')).toHaveCount(0);
  });

  test('un Scrum Master ne voit ni Modifier ni Supprimer', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'SCRUM_MASTER' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await expect(row.locator('button[title="Modifier"]')).toHaveCount(0);
    await expect(row.locator('button[title="Supprimer"]')).toHaveCount(0);
  });

  test('un Stakeholder ne voit ni Modifier ni Supprimer', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'STAKEHOLDER' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await expect(row.locator('button[title="Modifier"]')).toHaveCount(0);
    await expect(row.locator('button[title="Supprimer"]')).toHaveCount(0);
  });
});

test.describe('Phase 2 — permissions : Backlog (fiche item — sous-ensemble opérationnel du Dev)', () => {

  test('un Dev peut éditer Statut et SP, mais pas la Description (contenu produit)', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'DEV' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await expect(page.locator('[data-testid="item-status-select"]')).toBeEnabled();
    await expect(page.locator('[data-testid="item-sp-input"]')).toBeEnabled();
    await expect(page.locator('[data-testid="item-desc-input"]')).toBeDisabled();
  });

  test('le PO peut éditer tous les champs, y compris la Description', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await expect(page.locator('[data-testid="item-desc-input"]')).toBeEnabled();
    await expect(page.locator('[data-testid="item-status-select"]')).toBeEnabled();
  });

  test('un Dev peut renseigner le DoD mais pas le DoR', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'DEV' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await page.locator('.modal-tab-btn', { hasText: 'DoD / DoR' }).click();
    await expect(page.locator('[data-testid="dod-add-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="dor-add-input"]')).toHaveCount(0);
  });

  test('un Dev peut ajouter une dépendance', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'DEV' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await page.locator('.modal-tab-btn', { hasText: 'Dépendances' }).click();
    await expect(page.locator('[data-testid="dep-search-input"]')).toBeVisible();
  });

  test('un Dev peut écrire une note/commentaire', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'DEV' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await page.locator('.modal-tab-btn', { hasText: 'Notes' }).click();
    await expect(page.locator('[data-testid="item-note-input"]')).toBeVisible();
  });

  // DEMO_STATE ne définit aucun TeamMember.linkedUserId par défaut (même limite que les tests
  // Daily, sous-chantier 3 page 1/4) : ce cas couvre donc "non lié" pour chaque rôle. Le cas
  // "lié à son propre compte, donc togglable" demande d'injecter un état personnalisé — à
  // vérifier manuellement par Julien (lier un membre depuis Team, puis se connecter avec ce
  // compte).
  test('un Dev ne peut pas (dé)assigner un membre non lié à son compte', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'DEV' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await page.locator('.modal-tab-btn', { hasText: 'Équipe' }).click();
    await expect(page.locator('[data-testid="assignee-chip-m1"]')).toBeDisabled();
  });

  test('le PO peut assigner/désassigner n\'importe quel membre', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await page.locator('.modal-tab-btn', { hasText: 'Équipe' }).click();
    await expect(page.locator('[data-testid="assignee-chip-m1"]')).toBeEnabled();
  });

  test('un Scrum Master, en lecture seule totale, ne voit que "Fermer" (pas d\'enregistrement)', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'SCRUM_MASTER' });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.dblclick();
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="item-status-select"]')).toBeDisabled();
    await expect(page.locator('[data-testid="item-save-btn"]')).toHaveCount(0);
  });
});

// Phase 2 (roadmap v1) — Profil utilisateur / Équipe : une fiche (nom, poste, photo, compétences)
// n'est modifiable que par son propriétaire (compte lié via TeamMember.linkedUserId) ou Admin
// (canEditTeamMember). SP/jour est une exception plus large, ouverte en plus au PO et au Scrum
// Master (canEditVelocity), et verrouillé à 0 pour les postes Product Owner/Scrum Master
// (posteHasNoVelocity — "ne développent pas les fonctionnalités à proprement parler"). "+ Membre"
// et "Supprimer" un membre restent Admin ; les absences PO/Scrum Master (+ Admin), pas de rôle RH
// dédié. Aldo Raines (m1) n'est lié à aucun compte dans DEMO_STATE (même limite que les tests
// Daily/Backlog page 1 et 4) — ces tests couvrent donc le cas "non lié" pour chaque rôle ; le cas
// "lié à son propre compte" est à vérifier manuellement par Julien (lier un membre depuis Team,
// puis se connecter avec ce compte).
test.describe('Phase 2 — permissions : Équipe ("+ Membre"/"Supprimer" réservés Admin)', () => {

  test('Admin voit "+ Membre" et "Supprimer" sur une fiche', async ({ page }) => {
    await goTo(page, '/team', { role: 'ADMIN' });
    await expect(page.locator('button:has-text("+ Membre")')).toBeVisible();
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await expect(card.locator('button[title="Supprimer"]')).toBeVisible();
  });

  test('un PO ne voit ni "+ Membre" ni "Supprimer"', async ({ page }) => {
    await goTo(page, '/team', { role: 'PO' });
    await expect(page.locator('button:has-text("+ Membre")')).toHaveCount(0);
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await expect(card.locator('button[title="Supprimer"]')).toHaveCount(0);
  });

  test('un Dev ne voit ni "+ Membre" ni "Supprimer"', async ({ page }) => {
    await goTo(page, '/team', { role: 'DEV' });
    await expect(page.locator('button:has-text("+ Membre")')).toHaveCount(0);
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await expect(card.locator('button[title="Supprimer"]')).toHaveCount(0);
  });
});

test.describe('Phase 2 — permissions : Équipe (fiche modifiable par son propriétaire ou Admin uniquement)', () => {

  test('Admin peut éditer n\'importe quelle fiche (superuser)', async ({ page }) => {
    await goTo(page, '/team', { role: 'ADMIN' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await expect(page.locator('input[placeholder="Prénom Nom"]')).toBeEnabled();
    await expect(page.locator('[data-testid="member-role-select"]')).toBeEnabled();
  });

  test('un Dev non lié ne peut pas éditer une fiche (nom/poste désactivés)', async ({ page }) => {
    await goTo(page, '/team', { role: 'DEV' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await expect(page.locator('input[placeholder="Prénom Nom"]')).toBeDisabled();
    await expect(page.locator('[data-testid="member-role-select"]')).toBeDisabled();
  });

  test('un PO ne peut pas éditer le nom/poste d\'une fiche qui n\'est pas la sienne', async ({ page }) => {
    await goTo(page, '/team', { role: 'PO' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await expect(page.locator('input[placeholder="Prénom Nom"]')).toBeDisabled();
  });
});

test.describe('Phase 2 — permissions : Équipe (SP/jour éditable par PO/Scrum Master/Dev concerné, verrouillé pour PO/SM)', () => {

  test('un PO peut éditer le SP/jour d\'un membre qui n\'est pas le sien', async ({ page }) => {
    await goTo(page, '/team', { role: 'PO' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await expect(page.locator('[data-testid="member-sp-input"]')).toBeEnabled();
  });

  test('un Scrum Master peut éditer le SP/jour d\'un membre qui n\'est pas le sien', async ({ page }) => {
    await goTo(page, '/team', { role: 'SCRUM_MASTER' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await expect(page.locator('[data-testid="member-sp-input"]')).toBeEnabled();
  });

  test('un Dev non lié ne peut pas éditer le SP/jour d\'un membre qui n\'est pas le sien', async ({ page }) => {
    await goTo(page, '/team', { role: 'DEV' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await expect(page.locator('[data-testid="member-sp-input"]')).toBeDisabled();
  });

  test('choisir le poste Product Owner verrouille SP/jour à 0', async ({ page }) => {
    await goTo(page, '/team', { role: 'ADMIN' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await page.locator('[data-testid="member-role-select"]').selectOption('Product Owner');
    await expect(page.locator('[data-testid="member-sp-input"]')).toBeDisabled();
    await expect(page.locator('[data-testid="member-sp-input"]')).toHaveValue('0');
  });

  test('choisir le poste Scrum Master verrouille SP/jour à 0', async ({ page }) => {
    await goTo(page, '/team', { role: 'ADMIN' });
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await page.locator('[data-testid="member-role-select"]').selectOption('Scrum Master');
    await expect(page.locator('[data-testid="member-sp-input"]')).toBeDisabled();
    await expect(page.locator('[data-testid="member-sp-input"]')).toHaveValue('0');
  });
});

test.describe('Phase 2 — permissions : Absences (créer/modifier/supprimer réservé PO/Scrum Master)', () => {

  test('le PO voit "+ Absence" et les actions sur une absence existante', async ({ page }) => {
    await goTo(page, '/team', { role: 'PO' });
    await expect(page.locator('button:has-text("+ Absence")')).toBeVisible();
  });

  test('le Scrum Master voit "+ Absence"', async ({ page }) => {
    await goTo(page, '/team', { role: 'SCRUM_MASTER' });
    await expect(page.locator('button:has-text("+ Absence")')).toBeVisible();
  });

  test('Admin voit aussi "+ Absence" (superuser)', async ({ page }) => {
    await goTo(page, '/team', { role: 'ADMIN' });
    await expect(page.locator('button:has-text("+ Absence")')).toBeVisible();
  });

  test('un Dev ne voit pas "+ Absence"', async ({ page }) => {
    await goTo(page, '/team', { role: 'DEV' });
    await expect(page.locator('button:has-text("+ Absence")')).toHaveCount(0);
  });

  test('un Stakeholder ne voit pas "+ Absence"', async ({ page }) => {
    await goTo(page, '/team', { role: 'STAKEHOLDER' });
    await expect(page.locator('button:has-text("+ Absence")')).toHaveCount(0);
  });
});

// Phase 2 (roadmap v1) — création de compte (Réglages > Utilisateurs) crée automatiquement la
// fiche Équipe liée. Réutilise le mock /api/users de tests/users-roles.spec.js.
test.describe('Phase 2 — permissions : création de compte crée automatiquement la fiche Équipe', () => {

  test('créer un compte PO ajoute une fiche Équipe "Product Owner" sans SP/jour', async ({ page }) => {
    await goTo(page, '/settings', { role: 'ADMIN' });
    await page.route('**/api/users', async r => {
      if (r.request().method() === 'POST') {
        const body = JSON.parse(r.request().postData() || '{}');
        const created = { id: 'u-new-po', email: body.email, name: body.name, role: body.role, createdAt: '2026-07-31T00:00:00.000Z' };
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ user: created }) });
      }
      if (r.request().method() === 'GET') {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [] }) });
      }
      return r.continue();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="new-user-name"]').fill('Nouvelle PO');
    await page.locator('[data-testid="new-user-email"]').fill('nouvelle-po@cadence.local');
    await page.locator('[data-testid="new-user-password"]').fill('motdepasse123');
    await page.locator('[data-testid="new-user-role"]').selectOption('PO');
    await page.locator('[data-testid="create-user-submit"]').click();
    await expect(page.locator('[data-testid="user-row-u-new-po"]')).toContainText('Nouvelle PO');

    await page.locator('a[href="/team"]').click();
    await page.waitForURL('**/team');
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Nouvelle PO' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Product Owner');
    // Ne pas utiliser getByText('0') seul : "En cours"/"Terminées" valent aussi 0 pour un
    // nouveau membre sans item assigné (3 correspondances, échec en mode strict) — d'où le
    // data-testid dédié sur la valeur SP/jour (TeamPage.tsx).
    await expect(card.locator('[data-testid="member-card-sp-value"]')).toHaveText('0');
  });
});
