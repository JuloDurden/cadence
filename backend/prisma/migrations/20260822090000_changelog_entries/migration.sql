-- Reforme du Changelog (2026-08-22, decision Julien) : l'historique quitte le fichier en dur
-- frontend/src/data/changelog.ts pour cette table, alimentee par un nouvel outil de publication
-- reserve Admin (voir schema.prisma pour le detail des choix).

-- CreateTable
CREATE TABLE "changelog_entries" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "dateISO" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "changes" JSONB NOT NULL,
    "order" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "changelog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "changelog_entries_version_key" ON "changelog_entries"("version");

-- CreateIndex
CREATE UNIQUE INDEX "changelog_entries_order_key" ON "changelog_entries"("order");
