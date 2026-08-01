-- Phase 3 (roadmap v1), Mode presentation -- ajoute la table du lien de partage public (sans
-- authentification), reutilisable, un seul actif a la fois (voir backend/src/routes/
-- presentation.ts). Meme structure qu'"invitations" sans usedAt (pas a usage unique).

-- CreateTable
CREATE TABLE "presentation_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presentation_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "presentation_links_token_key" ON "presentation_links"("token");
