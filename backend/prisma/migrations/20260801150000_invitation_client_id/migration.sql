-- Phase 2.5 (roadmap v1), verrouillage Stakeholder — rattache une invitation Stakeholder a un
-- Client (WorkspaceState.data.clients, pas de table dediee) plutot qu'a une fiche Equipe. Voir
-- backend/src/lib/teamState.ts (createLinkedClientContact) et backend/src/routes/invitations.ts.
-- Nullable : ne casse pas l'unique invitation deja en base avant ce changement (deja utilisee).

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN "clientId" TEXT;
