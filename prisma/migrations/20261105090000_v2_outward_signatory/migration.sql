-- SPEC-v2 C7: the outward signatory comes from the Signatory list (or is
-- typed for someone not on it), no longer from a user flagged as signatory.

-- AlterTable
ALTER TABLE "OutwardItem" ADD COLUMN "signatoryId" UUID;

-- Existing rows keep their signer as typed text (the user's name). Production
-- holds no outward items at this point; dev and test data are seeded.
UPDATE "OutwardItem" o
SET "signedByText" = u."name"
FROM "User" u
WHERE o."signedById" = u."id" AND o."signedByText" IS NULL;

-- DropForeignKey
ALTER TABLE "OutwardItem" DROP CONSTRAINT "OutwardItem_signedById_fkey";

-- AlterTable
ALTER TABLE "OutwardItem" DROP COLUMN "signedById";

-- AddForeignKey: a signatory in use is never deleted (deactivate it instead).
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_signatoryId_fkey" FOREIGN KEY ("signatoryId") REFERENCES "Signatory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every outward item has a signer: chosen or typed.
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_signer_check"
  CHECK ("signatoryId" IS NOT NULL OR NULLIF(btrim("signedByText"), '') IS NOT NULL);
