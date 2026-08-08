-- Phase 5 (roadmap v1), Integration Jira, 2026-08-08 : cadenceClientId devient obligatoire (voir
-- schema.prisma), suite a une question de Julien sur le comportement d'un import Jira sans Client
-- Cadence selectionne. Supprime toute config existante incomplete (cadenceClientId NULL) plutot que
-- de lui inventer une valeur : un Admin devra reconfigurer, acceptable dans ce prototype (config
-- singleton, aucune perte de donnees du Backlog).
DELETE FROM "jira_config" WHERE "cadenceClientId" IS NULL;

-- AlterTable
ALTER TABLE "jira_config" ALTER COLUMN "cadenceClientId" SET NOT NULL;
