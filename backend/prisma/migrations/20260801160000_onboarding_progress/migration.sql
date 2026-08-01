-- Phase 2.5 (roadmap v1), Onboarding, points 2-4 (tooltips progressifs, checklist, démo interactive).
-- onboardingSeenAt : null par défaut pour un compte nouvellement créé (déclenche l'ouverture
-- automatique du panneau "Guide de démarrage" une seule fois, voir routes/onboarding.ts). Les
-- comptes déjà existants sont backfillés avec leur createdAt juste après l'ALTER : sans ce
-- backfill, tous les comptes actuels (déjà rodés à l'outil) verraient le panneau s'ouvrir tout
-- seul à leur prochaine connexion, ce qui n'a de sens que pour un compte réellement nouveau.
ALTER TABLE "users" ADD COLUMN "onboardingSeenAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "onboardingCompletedItems" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "users" SET "onboardingSeenAt" = "createdAt" WHERE "onboardingSeenAt" IS NULL;
