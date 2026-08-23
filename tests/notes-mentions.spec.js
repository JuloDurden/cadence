// Phase 2 (roadmap v1), sous-chantier 5 : interactions nominatives — attribution réelle des
// notes/réponses d'item au compte connecté (Note.authorId, résolu via TeamMember.linkedUserId,
// voir utils ItemModal.tsx), et @mentions dans le texte (autocomplete "@", token littéral
// `@[Label]` inséré puis stylé en chip à l'affichage — purement visuel, décision Julien via
// AskUserQuestion le 2026-07-31 : pas de notification, pas de filtre "notes qui me mentionnent").
// Portée : uniquement les notes d'item (Backlog/Kanban/Planning/...), pas Retro/Sprint Review.
//
// Limite assumée (même famille que canEditDailyCard/canEditTeamMember, voir docs/corrections.md) :
// DEMO_STATE ne lie aucun TeamMember à un compte par défaut, et lier un compte à une fiche depuis
// la page Team ne persiste qu'en mémoire (PUT /api/state mocké) — impossible de "rester connecté"
// avec ce compte après un rechargement dans un test Playwright en boîte noire. Le cas "auteur lié
// à sa fiche → nom réel + avatar affichés" n'est donc pas couvert ici et reste à vérifier
// manuellement par Julien (lier Aldo Raines à un compte depuis Team, se connecter avec ce compte,
// écrire une note, confirmer que son nom/avatar réel apparaît au lieu d'"Invité").
const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

async function openBugNotes(page, opts) {
  await goTo(page, '/backlog', opts);
  const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
  await row.locator('button[title="Modifier"]').click();
  await page.locator('.modal-tab-btn', { hasText: 'Notes' }).click();
}

test.describe('Phase 2 — interactions nominatives : attribution des notes', () => {

  test('une note écrite par un compte non lié à une fiche Équipe est attribuée à son propre nom (pas "Invité", pas de crash)', async ({ page }) => {
    // Comportement corrigé le 2026-08-23 (voir docs/corrections.md, "Bug : auteur 'Invité' sur les
    // notes de l'ItemModal") : sa PROPRE note affiche désormais le nom du compte connecté
    // (currentUserName), même si ce compte n'est lié à aucune fiche Équipe : "Invité" ne doit
    // apparaître que pour la note d'un AUTRE compte non lié (non couvert ici, voir limite ci-dessus).
    await openBugNotes(page, { role: 'PO', userId: 'u-po-not-linked', name: 'PO Sans Fiche' });
    await page.locator('[data-testid="item-note-input"]').fill('Une première note de test.');
    // Scopé à la modale : le header Backlog a aussi un bouton "Ajouter" (data-testid="btn-add-menu")
    // avec le même nom accessible, resté dans le DOM derrière la modale (mode strict Playwright).
    await page.locator('[data-testid="item-modal"]').getByRole('button', { name: 'Ajouter', exact: true }).click();
    const note = page.locator('.note-item').filter({ hasText: 'Une première note de test.' });
    await expect(note).toContainText('PO Sans Fiche');
    await expect(note).not.toContainText('Invité');
  });
});

test.describe('Phase 2 — interactions nominatives : @mentions dans une note', () => {

  test('taper "@" ouvre l\'autocomplete avec "Toute l\'équipe", "Devs" et les membres', async ({ page }) => {
    await openBugNotes(page, { role: 'PO', userId: 'u-po' });
    await page.locator('[data-testid="item-note-input"]').pressSequentially('Salut @');
    await expect(page.locator('[data-testid="mention-dropdown"]')).toBeVisible();
    await expect(page.locator('[data-testid="mention-option-__team__"]')).toContainText('Toute l\'équipe');
    await expect(page.locator('[data-testid="mention-option-__devs__"]')).toContainText('Devs');
    await expect(page.locator('[data-testid="mention-option-m1"]')).toContainText('Aldo Raines');
  });

  test('l\'autocomplete filtre les membres selon le texte tapé après "@"', async ({ page }) => {
    await openBugNotes(page, { role: 'PO', userId: 'u-po' });
    await page.locator('[data-testid="item-note-input"]').pressSequentially('@ald');
    await expect(page.locator('[data-testid="mention-option-m1"]')).toBeVisible();
    await expect(page.locator('[data-testid="mention-option-__team__"]')).toHaveCount(0);
  });

  test('sélectionner un membre insère un token et s\'affiche en chip une fois la note ajoutée', async ({ page }) => {
    await openBugNotes(page, { role: 'PO', userId: 'u-po' });
    await page.locator('[data-testid="item-note-input"]').pressSequentially('Merci @ald');
    await page.locator('[data-testid="mention-option-m1"]').click();
    await expect(page.locator('[data-testid="item-note-input"]')).toHaveValue('Merci @[Aldo Raines] ');
    // Scopé à la modale : le header Backlog a aussi un bouton "Ajouter" (data-testid="btn-add-menu")
    // avec le même nom accessible, resté dans le DOM derrière la modale (mode strict Playwright).
    await page.locator('[data-testid="item-modal"]').getByRole('button', { name: 'Ajouter', exact: true }).click();
    const note = page.locator('.note-item').filter({ hasText: 'Merci' });
    await expect(note.locator('.note-mention')).toHaveText('@Aldo Raines');
  });

  test('"Toute l\'équipe" et "Devs" s\'insèrent comme des mentions de groupe', async ({ page }) => {
    await openBugNotes(page, { role: 'PO', userId: 'u-po' });
    await page.locator('[data-testid="item-note-input"]').pressSequentially('@');
    await page.locator('[data-testid="mention-option-__devs__"]').click();
    await expect(page.locator('[data-testid="item-note-input"]')).toHaveValue('@[Devs] ');
    // Scopé à la modale : le header Backlog a aussi un bouton "Ajouter" (data-testid="btn-add-menu")
    // avec le même nom accessible, resté dans le DOM derrière la modale (mode strict Playwright).
    await page.locator('[data-testid="item-modal"]').getByRole('button', { name: 'Ajouter', exact: true }).click();
    const note = page.locator('.note-item').filter({ hasText: 'Devs' });
    await expect(note.locator('.note-mention')).toHaveText('@Devs');
  });

  test('l\'autocomplete fonctionne aussi dans le formulaire de réponse', async ({ page }) => {
    await openBugNotes(page, { role: 'PO', userId: 'u-po' });
    await page.locator('[data-testid="item-note-input"]').fill('Note parente pour tester la réponse.');
    // Scopé à la modale : le header Backlog a aussi un bouton "Ajouter" (data-testid="btn-add-menu")
    // avec le même nom accessible, resté dans le DOM derrière la modale (mode strict Playwright).
    await page.locator('[data-testid="item-modal"]').getByRole('button', { name: 'Ajouter', exact: true }).click();
    const note = page.locator('.note-item').filter({ hasText: 'Note parente pour tester la réponse.' });
    await note.locator('.note-reply-btn').click();
    await note.locator('.note-reply-form textarea').pressSequentially('@ald');
    await expect(page.locator('[data-testid="mention-option-m1"]')).toBeVisible();
    await page.locator('[data-testid="mention-option-m1"]').click();
    await note.getByRole('button', { name: 'Répondre' }).click();
    await expect(note.locator('.note-reply .note-mention')).toHaveText('@Aldo Raines');
  });
});
