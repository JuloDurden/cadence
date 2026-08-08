-- Phase 6 (roadmap v1), Compagnon IA -- cle API Anthropic (Claude), singleton lie au workspace
-- Cadence, voir schema.prisma pour le detail des choix (gestion reservee Admin, modele editable,
-- cle en clair en base comme les autres integrations de la Phase 5).

-- CreateTable
CREATE TABLE "ai_config" (
    "id" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_config_pkey" PRIMARY KEY ("id")
);
