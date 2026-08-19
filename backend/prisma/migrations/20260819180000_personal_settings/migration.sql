-- Préférences personnelles par compte (2026-08-19, décision Julien : thème/couleur principale/
-- densité d'affichage/page de démarrage deviennent propres à l'utilisateur, plus partagés au
-- niveau du workspace). Voir schema.prisma pour le détail des choix (blob JSON, même pattern que
-- workspace_state.data).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "personalSettings" JSONB;
