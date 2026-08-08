-- Phase 5 (roadmap v1), Integration Jira -- config d'un seul projet Jira lie au workspace Cadence
-- (singleton), voir schema.prisma pour le detail des choix (connexion API directe, jeton en clair,
-- gestion reservee Admin, storyPointsFieldId auto-detecte, cadenceClientId de rattachement).

-- CreateTable
CREATE TABLE "jira_config" (
    "id" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "storyPointsFieldId" TEXT,
    "epicLinkFieldId" TEXT,
    "cadenceClientId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jira_config_pkey" PRIMARY KEY ("id")
);
