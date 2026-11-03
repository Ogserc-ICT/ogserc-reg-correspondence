-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('ACK', 'ROUTING', 'RESEND');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'PENDING_REVIEW', 'SENT', 'FAILED', 'DISCARDED', 'SUPERSEDED');

-- AlterEnum
ALTER TYPE "InwardStatus" ADD VALUE 'AWAITING_ROUTING';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'FRONT_DESK_OFFICER';

-- AlterEnum
ALTER TYPE "Series" ADD VALUE 'FD';

-- DropForeignKey
ALTER TABLE "InwardItem" DROP CONSTRAINT "InwardItem_actionRequiredId_fkey";

-- AlterTable
ALTER TABLE "InwardItem" ADD COLUMN     "ackEmailedAt" TIMESTAMPTZ,
ADD COLUMN     "ackEmailedTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "forwardedBeforeRouting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "frontDeskIntakeId" UUID,
ADD COLUMN     "routedAt" TIMESTAMPTZ,
ADD COLUMN     "routedById" UUID,
ALTER COLUMN "actionRequiredId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RegistrySettings" ADD COLUMN     "frontDeskAnyMode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyPreviousUnitOnReroute" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "routingRequiresPassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canRoute" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FrontDeskIntake" (
    "id" UUID NOT NULL,
    "intakeNo" TEXT NOT NULL,
    "intakeYear" INTEGER NOT NULL,
    "serial" INTEGER NOT NULL,
    "receivedAt" TIMESTAMPTZ NOT NULL,
    "sender" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "typeId" UUID,
    "modeId" UUID NOT NULL,
    "deliveredBy" TEXT,
    "phone" TEXT,
    "volumes" INTEGER,
    "receivedById" UUID NOT NULL,
    "remarks" TEXT,
    "registeredAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "FrontDeskIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingEvent" (
    "id" UUID NOT NULL,
    "inwardItemId" UUID NOT NULL,
    "routedById" UUID NOT NULL,
    "routedAt" TIMESTAMPTZ NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,

    CONSTRAINT "RoutingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" UUID NOT NULL,
    "inwardItemId" UUID NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "to" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ,
    "error" TEXT,
    "sentAt" TIMESTAMPTZ,
    "createdById" UUID,
    "reviewedById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FrontDeskIntake_intakeNo_key" ON "FrontDeskIntake"("intakeNo");

-- CreateIndex
CREATE INDEX "FrontDeskIntake_registeredAt_idx" ON "FrontDeskIntake"("registeredAt");

-- CreateIndex
CREATE INDEX "FrontDeskIntake_receivedAt_idx" ON "FrontDeskIntake"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FrontDeskIntake_intakeYear_serial_key" ON "FrontDeskIntake"("intakeYear", "serial");

-- CreateIndex
CREATE INDEX "RoutingEvent_inwardItemId_routedAt_idx" ON "RoutingEvent"("inwardItemId", "routedAt");

-- CreateIndex
CREATE INDEX "EmailLog_inwardItemId_createdAt_idx" ON "EmailLog"("inwardItemId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_status_nextAttemptAt_idx" ON "EmailLog"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "InwardItem_frontDeskIntakeId_key" ON "InwardItem"("frontDeskIntakeId");

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_actionRequiredId_fkey" FOREIGN KEY ("actionRequiredId") REFERENCES "ListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_routedById_fkey" FOREIGN KEY ("routedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_frontDeskIntakeId_fkey" FOREIGN KEY ("frontDeskIntakeId") REFERENCES "FrontDeskIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrontDeskIntake" ADD CONSTRAINT "FrontDeskIntake_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "IncomingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrontDeskIntake" ADD CONSTRAINT "FrontDeskIntake_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrontDeskIntake" ADD CONSTRAINT "FrontDeskIntake_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingEvent" ADD CONSTRAINT "RoutingEvent_inwardItemId_fkey" FOREIGN KEY ("inwardItemId") REFERENCES "InwardItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingEvent" ADD CONSTRAINT "RoutingEvent_routedById_fkey" FOREIGN KEY ("routedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_inwardItemId_fkey" FOREIGN KEY ("inwardItemId") REFERENCES "InwardItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Database-level protections for v2 (hand-written; see the init migration).
-- ---------------------------------------------------------------------------

ALTER TABLE "FrontDeskIntake" ADD CONSTRAINT "FrontDeskIntake_serial_positive" CHECK ("serial" > 0);

-- Front desk intakes: never deleted; the number never changes; once
-- registered, the registration time never changes (SPEC-v2 C3).
CREATE FUNCTION registry_protect_intake() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Front desk intake % cannot be deleted', OLD."intakeNo";
  END IF;
  IF NEW."intakeNo" IS DISTINCT FROM OLD."intakeNo"
     OR NEW."intakeYear" IS DISTINCT FROM OLD."intakeYear"
     OR NEW."serial" IS DISTINCT FROM OLD."serial" THEN
    RAISE EXCEPTION 'The number of front desk intake % cannot be changed', OLD."intakeNo";
  END IF;
  IF OLD."registeredAt" IS NOT NULL AND NEW."registeredAt" IS DISTINCT FROM OLD."registeredAt" THEN
    RAISE EXCEPTION 'Front desk intake % is already registered', OLD."intakeNo";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "FrontDeskIntake_protect" BEFORE UPDATE OR DELETE ON "FrontDeskIntake"
  FOR EACH ROW EXECUTE FUNCTION registry_protect_intake();

-- An inward item's front desk intake, once set, never changes (E8: with the
-- unique key, one intake is registered exactly once).
CREATE FUNCTION registry_protect_intake_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."frontDeskIntakeId" IS NOT NULL
     AND NEW."frontDeskIntakeId" IS DISTINCT FROM OLD."frontDeskIntakeId" THEN
    RAISE EXCEPTION 'The front desk intake of % cannot be changed', OLD."number";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "InwardItem_protect_intake_link" BEFORE UPDATE ON "InwardItem"
  FOR EACH ROW EXECUTE FUNCTION registry_protect_intake_link();

-- Routing history is append-only (E4); emails are never deleted (C6.5).
CREATE TRIGGER "RoutingEvent_append_only" BEFORE UPDATE OR DELETE ON "RoutingEvent"
  FOR EACH ROW EXECUTE FUNCTION registry_reject_change();
CREATE TRIGGER "EmailLog_no_delete" BEFORE DELETE ON "EmailLog"
  FOR EACH ROW EXECUTE FUNCTION registry_reject_change();

-- File references are unique ignoring case (SPEC-v2 C8, V9).
CREATE UNIQUE INDEX "RegistryFile_reference_ci_key" ON "RegistryFile"(upper(btrim("reference")));

-- Note: existing items' cached status is refreshed by the refresh-status job
-- (a new enum value cannot be used in the migration that adds it).
