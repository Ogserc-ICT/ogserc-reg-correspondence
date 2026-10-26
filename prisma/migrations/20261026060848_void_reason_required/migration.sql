-- A void must have a non-blank reason. The init check let a NULL reason
-- through: btrim(NULL) <> '' is NULL, and a CHECK passes on NULL.
ALTER TABLE "InwardItem" DROP CONSTRAINT "InwardItem_void_complete";
ALTER TABLE "OutwardItem" DROP CONSTRAINT "OutwardItem_void_complete";

ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_void_complete" CHECK (
  ("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL)
  OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND coalesce(btrim("voidReason"), '') <> '')
);
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_void_complete" CHECK (
  ("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL)
  OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND coalesce(btrim("voidReason"), '') <> '')
);
