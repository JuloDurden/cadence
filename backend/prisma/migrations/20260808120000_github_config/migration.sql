-- Phase 5 (roadmap v1), Integration GitHub -- config d'un seul depot lie au workspace (singleton),
-- voir schema.prisma pour le detail des choix (jeton en clair, gestion reservee Admin).

-- CreateTable
CREATE TABLE "github_config" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_config_pkey" PRIMARY KEY ("id")
);
