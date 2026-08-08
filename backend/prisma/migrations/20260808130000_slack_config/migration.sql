-- Phase 5 (roadmap v1), Integration Slack -- config d'un seul workspace Slack lie au workspace
-- Cadence (singleton), voir schema.prisma pour le detail des choix (jeton Bot en clair, gestion
-- reservee Admin, 3 notifications independantes chacune avec son canal/interrupteur propre).

-- CreateTable
CREATE TABLE "slack_config" (
    "id" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "teamName" TEXT,
    "sprintCloseChannelId" TEXT,
    "sprintCloseChannelName" TEXT,
    "sprintCloseEnabled" BOOLEAN NOT NULL DEFAULT false,
    "blockedChannelId" TEXT,
    "blockedChannelName" TEXT,
    "blockedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyChannelId" TEXT,
    "dailyChannelName" TEXT,
    "dailyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_config_pkey" PRIMARY KEY ("id")
);
