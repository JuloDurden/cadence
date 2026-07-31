const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

// Phase 0 de la roadmap v1 (docs/roadmap-v1.md, 2026-07-28) : système de boîte de dialogue propre
// à l'outil (DialogContext.tsx), qui remplace les confirm()/alert() natifs du navigateur. Les
// scénarios de confirmation "Confirmer" sont déjà couverts par les tests métier existants
// (team.spec.js, roadmap.spec.js, planning.spec.js) — ce fichier couvre le comportement générique
// de la boîte elle-même : titre, style danger, annulation.
// role: 'ADMIN' sur les goTo('/team') : "+ Membre" et "Supprimer" un membre réservés Admin
// depuis la Phase 2 (canEditTeamMember, utils/permissions.ts).

test.describe('DialogContext — boîte de dialogue propre à l\'outil', () => {

  test('la confirmation de suppression affiche un titre et un bouton de confirmation en rouge (danger)', async ({ page }) => {
    await goTo(page, '/team', { role: 'ADMIN' });
    await page.click('button:has-text("+ Membre")');
    await page.fill('input[placeholder="Prénom Nom"]', 'Dialog Test');
    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=Dialog Test')).toBeVisible();

    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Dialog Test' });
    await card.locator('button[title="Supprimer"]').click();

    await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
    await expect(page.locator('.modal-title')).toContainText('Supprimer ce membre');
    await expect(page.locator('[data-testid="dialog-confirm"]')).toHaveClass(/btn-danger/);
    await expect(page.locator('[data-testid="dialog-confirm"]')).toContainText('Supprimer');

    // Nettoyage : on confirme pour ne pas laisser le membre de test dans le state
    await page.locator('[data-testid="dialog-confirm"]').click();
    await expect(page.locator('text=Dialog Test')).not.toBeVisible();
  });

  test('cliquer sur Annuler referme la boîte sans effectuer l\'action', async ({ page }) => {
    await goTo(page, '/team', { role: 'ADMIN' });
    await page.click('button:has-text("+ Membre")');
    await page.fill('input[placeholder="Prénom Nom"]', 'Dialog Cancel Test');
    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=Dialog Cancel Test')).toBeVisible();

    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Dialog Cancel Test' });
    await card.locator('button[title="Supprimer"]').click();
    await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();

    await page.locator('[data-testid="dialog-cancel"]').click();
    await expect(page.locator('[data-testid="dialog-overlay"]')).not.toBeVisible();
    // Le membre existe toujours : Annuler n'a pas déclenché la suppression
    await expect(page.locator('text=Dialog Cancel Test')).toBeVisible();
  });

  test('cliquer en dehors de la boîte équivaut à Annuler', async ({ page }) => {
    await goTo(page, '/team', { role: 'ADMIN' });
    await page.click('button:has-text("+ Membre")');
    await page.fill('input[placeholder="Prénom Nom"]', 'Dialog Overlay Test');
    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=Dialog Overlay Test')).toBeVisible();

    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Dialog Overlay Test' });
    await card.locator('button[title="Supprimer"]').click();
    await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();

    // Clic sur l'overlay lui-même (en dehors de la carte .modal), pas sur son contenu
    await page.locator('[data-testid="dialog-overlay"]').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('[data-testid="dialog-overlay"]')).not.toBeVisible();
    await expect(page.locator('text=Dialog Overlay Test')).toBeVisible();
  });

});
