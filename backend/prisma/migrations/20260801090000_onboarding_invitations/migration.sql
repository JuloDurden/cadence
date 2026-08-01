-- Phase 2.5 (roadmap v1), Onboarding — brique "creation de compte". Ajoute la table des
-- invitations (un Admin invite un Stakeholder via un lien a usage unique, pas d'email dans ce
-- prototype). Voir backend/src/routes/invitations.ts et backend/src/routes/auth.ts
-- (POST /api/auth/accept-invite).

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");
