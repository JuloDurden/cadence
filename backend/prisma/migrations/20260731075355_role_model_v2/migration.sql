-- Phase 2 (roadmap v1), sous-chantier 1 : remplace l'enum Role generique (ADMIN/MEMBER/VIEWER)
-- par les roles specifiques Cadence (ADMIN/PO/SCRUM_MASTER/DEV/STAKEHOLDER).
-- MEMBER -> DEV et VIEWER -> STAKEHOLDER par defaut pour les eventuelles lignes existantes
-- (seul un compte admin@cadence.local, role ADMIN, existe a ce jour via le seed).
BEGIN;

CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'PO', 'SCRUM_MASTER', 'DEV', 'STAKEHOLDER');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'ADMIN'  THEN 'ADMIN'
    WHEN 'MEMBER' THEN 'DEV'
    WHEN 'VIEWER' THEN 'STAKEHOLDER'
    ELSE 'DEV'
  END
)::"Role_new";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'DEV';

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

COMMIT;
