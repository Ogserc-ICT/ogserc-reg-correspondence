-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REGISTRY_OFFICER', 'HEAD_OF_REGISTRY', 'UNIT_OFFICER', 'SECRETARY', 'ADMIN');

-- CreateEnum
CREATE TYPE "Series" AS ENUM ('ACK', 'OUT');

-- CreateEnum
CREATE TYPE "ListKind" AS ENUM ('RECEIPT_MODE', 'LGA', 'ACK_VIA', 'PARTY_CATEGORY', 'ACTION_REQUIRED', 'PRIORITY', 'FILE_CLASS', 'FILE_SECURITY', 'FILE_STATUS');

-- CreateEnum
CREATE TYPE "HolidayStatus" AS ENUM ('FIXED', 'PROVISIONAL', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "SlipFooter" AS ENUM ('REGISTRATION', 'PARA103', 'GENERAL');

-- CreateEnum
CREATE TYPE "InwardStatus" AS ENUM ('VOID', 'CLOSED', 'OVERDUE', 'AWAITING_FORWARDING', 'NOTED_FILED', 'OPEN');

-- CreateEnum
CREATE TYPE "OutwardStatus" AS ENUM ('VOID', 'NOT_YET_DISPATCHED', 'RESPONSE_RECEIVED', 'RESPONSE_OVERDUE', 'AWAITING_RESPONSE', 'DELIVERED', 'DISPATCHED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL,
    "unitId" UUID,
    "isSignatory" BOOLEAN NOT NULL DEFAULT false,
    "designation" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListItem" (
    "id" UUID NOT NULL,
    "list" "ListKind" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "systemKey" TEXT,
    "afterHoursCutoff" BOOLEAN NOT NULL DEFAULT false,
    "noDeliveryConfirmation" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingType" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultUnitId" UUID NOT NULL,
    "orderRef" TEXT,
    "responseTargetDays" INTEGER NOT NULL,
    "para103SlipWording" BOOLEAN NOT NULL,
    "slipFooter" "SlipFooter" NOT NULL,
    "isRegistration" BOOLEAN NOT NULL DEFAULT false,
    "requiresRelatedOgsercNo" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IncomingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingType" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "responseExpected" BOOLEAN NOT NULL,
    "responseWindowDays" INTEGER NOT NULL,
    "closesInwardItem" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OutgoingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "status" "HolidayStatus" NOT NULL,
    "note" TEXT,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrySettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ackPrefix" TEXT NOT NULL,
    "outPrefix" TEXT NOT NULL,
    "officeClosingTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "registryForwardingTargetDays" INTEGER NOT NULL,
    "dispatchTargetDays" INTEGER NOT NULL,
    "chaseProofOfDeliveryAfterDays" INTEGER NOT NULL,
    "urgentResponseTargetDays" INTEGER NOT NULL,
    "defaultResponseTargetDays" INTEGER NOT NULL,
    "fileReturnTargetDays" INTEGER NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "effectiveDateIsPlaceholder" BOOLEAN NOT NULL,
    "registrationDeadlineDays" INTEGER NOT NULL,
    "deadlineRollsToNextWorkingDay" BOOLEAN NOT NULL DEFAULT false,
    "dashboardFirstMonth" DATE NOT NULL,
    "registryAddress" TEXT NOT NULL,
    "schedule2RequiredDocs" INTEGER NOT NULL DEFAULT 12,
    "schedule2RequiredDocsMultiState" INTEGER NOT NULL DEFAULT 13,
    "slipFooterRegistration" TEXT NOT NULL,
    "slipFooterPara103" TEXT NOT NULL,
    "slipFooterGeneral" TEXT NOT NULL,
    "secretaryName" TEXT NOT NULL DEFAULT '',
    "headMayVoidOwnItems" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "RegistrySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberCounter" (
    "series" "Series" NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL,

    CONSTRAINT "NumberCounter_pkey" PRIMARY KEY ("series","year")
);

-- CreateTable
CREATE TABLE "InwardItem" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "numberYear" INTEGER NOT NULL,
    "serial" INTEGER NOT NULL,
    "receivedAt" TIMESTAMPTZ NOT NULL,
    "modeId" UUID NOT NULL,
    "typeId" UUID NOT NULL,
    "sender" TEXT NOT NULL,
    "senderCategoryId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "senderRef" TEXT,
    "documentDate" DATE,
    "relatedOgsercNo" TEXT,
    "inResponseToOutwardId" UUID,
    "cacNo" TEXT,
    "principalLgaId" UUID,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "deliveredBy" TEXT,
    "volumes" INTEGER,
    "schedule2DocsAttached" INTEGER,
    "feeEvidenceAttached" BOOLEAN,
    "paymentRef" TEXT,
    "amountShownKobo" BIGINT,
    "receivedById" UUID NOT NULL,
    "fileId" UUID,
    "unitOverrideId" UUID,
    "ackIssuedViaId" UUID NOT NULL,
    "actionRequiredId" UUID NOT NULL,
    "priorityId" UUID,
    "actionOfficer" TEXT,
    "responseDueOverride" DATE,
    "remarks" TEXT,
    "multiState" BOOLEAN,
    "registrationDeadlineOverride" DATE,
    "dateForwarded" DATE,
    "receivedByUnitOfficer" TEXT,
    "dateClosedManual" DATE,
    "closingNote" TEXT,
    "snapTypeName" TEXT NOT NULL,
    "snapCategory" TEXT NOT NULL,
    "snapOrderRef" TEXT,
    "snapDefaultUnitId" UUID NOT NULL,
    "snapResponseTargetDays" INTEGER NOT NULL,
    "snapPara103SlipWording" BOOLEAN NOT NULL,
    "snapSlipFooter" "SlipFooter" NOT NULL,
    "snapIsRegistration" BOOLEAN NOT NULL,
    "snapRequiresRelatedOgsercNo" BOOLEAN NOT NULL,
    "snapClosingTime" TEXT NOT NULL,
    "deemedReceiptDate" DATE NOT NULL,
    "routedUnitId" UUID NOT NULL,
    "statusCache" "InwardStatus",
    "statusCachedOn" DATE,
    "voidedAt" TIMESTAMPTZ,
    "voidedById" UUID,
    "voidReason" TEXT,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "InwardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutwardItem" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "numberYear" INTEGER NOT NULL,
    "serial" INTEGER NOT NULL,
    "documentDate" DATE NOT NULL,
    "typeId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "addressee" TEXT NOT NULL,
    "recipientCategoryId" UUID NOT NULL,
    "recipientContact" TEXT,
    "inReplyToInwardId" UUID,
    "relatedOgsercNo" TEXT,
    "fileId" UUID,
    "originatingUnitId" UUID NOT NULL,
    "preparedBy" TEXT,
    "signedById" UUID,
    "signedByText" TEXT,
    "signatoryDesignation" TEXT NOT NULL,
    "dispatchModeId" UUID NOT NULL,
    "dateDispatched" DATE,
    "dispatchedById" UUID,
    "trackingRef" TEXT,
    "responseExpectedOverride" BOOLEAN,
    "responseDueOverride" DATE,
    "remarks" TEXT,
    "deliveryConfirmed" BOOLEAN,
    "dateDelivered" DATE,
    "receivedByRecipient" TEXT,
    "snapTypeName" TEXT NOT NULL,
    "snapResponseExpected" BOOLEAN NOT NULL,
    "snapResponseWindowDays" INTEGER NOT NULL,
    "snapClosesInwardItem" BOOLEAN NOT NULL,
    "statusCache" "OutwardStatus",
    "statusCachedOn" DATE,
    "voidedAt" TIMESTAMPTZ,
    "voidedById" UUID,
    "voidReason" TEXT,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "OutwardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryFile" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileClassId" UUID,
    "owningUnitId" UUID,
    "dateOpened" DATE NOT NULL,
    "currentVolume" INTEGER NOT NULL DEFAULT 1,
    "securityId" UUID NOT NULL,
    "fileStatusId" UUID NOT NULL,
    "dateClosedOrArchived" DATE,
    "remarks" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "RegistryFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileMovement" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "outAt" TIMESTAMPTZ NOT NULL,
    "volume" INTEGER,
    "releasedById" UUID NOT NULL,
    "issuedTo" TEXT NOT NULL,
    "issuedToUserId" UUID,
    "unitId" UUID,
    "purpose" TEXT,
    "returnByOverride" DATE,
    "dateReturned" DATE,
    "receivedBackById" UUID,
    "issuedWhileOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "FileMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ListItem_list_label_key" ON "ListItem"("list", "label");

-- CreateIndex
CREATE UNIQUE INDEX "ListItem_list_systemKey_key" ON "ListItem"("list", "systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingType_name_key" ON "IncomingType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingType_name_key" ON "OutgoingType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_date_key" ON "PublicHoliday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "InwardItem_number_key" ON "InwardItem"("number");

-- CreateIndex
CREATE INDEX "InwardItem_routedUnitId_idx" ON "InwardItem"("routedUnitId");

-- CreateIndex
CREATE INDEX "InwardItem_deemedReceiptDate_idx" ON "InwardItem"("deemedReceiptDate");

-- CreateIndex
CREATE INDEX "InwardItem_receivedAt_idx" ON "InwardItem"("receivedAt");

-- CreateIndex
CREATE INDEX "InwardItem_cacNo_idx" ON "InwardItem"("cacNo");

-- CreateIndex
CREATE INDEX "InwardItem_inResponseToOutwardId_idx" ON "InwardItem"("inResponseToOutwardId");

-- CreateIndex
CREATE INDEX "InwardItem_fileId_idx" ON "InwardItem"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "InwardItem_numberYear_serial_key" ON "InwardItem"("numberYear", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "OutwardItem_number_key" ON "OutwardItem"("number");

-- CreateIndex
CREATE INDEX "OutwardItem_originatingUnitId_idx" ON "OutwardItem"("originatingUnitId");

-- CreateIndex
CREATE INDEX "OutwardItem_documentDate_idx" ON "OutwardItem"("documentDate");

-- CreateIndex
CREATE INDEX "OutwardItem_dateDispatched_idx" ON "OutwardItem"("dateDispatched");

-- CreateIndex
CREATE INDEX "OutwardItem_inReplyToInwardId_idx" ON "OutwardItem"("inReplyToInwardId");

-- CreateIndex
CREATE INDEX "OutwardItem_fileId_idx" ON "OutwardItem"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "OutwardItem_numberYear_serial_key" ON "OutwardItem"("numberYear", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "RegistryFile_reference_key" ON "RegistryFile"("reference");

-- CreateIndex
CREATE INDEX "FileMovement_fileId_outAt_idx" ON "FileMovement"("fileId", "outAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingType" ADD CONSTRAINT "IncomingType_defaultUnitId_fkey" FOREIGN KEY ("defaultUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrySettings" ADD CONSTRAINT "RegistrySettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "IncomingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_senderCategoryId_fkey" FOREIGN KEY ("senderCategoryId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_inResponseToOutwardId_fkey" FOREIGN KEY ("inResponseToOutwardId") REFERENCES "OutwardItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_principalLgaId_fkey" FOREIGN KEY ("principalLgaId") REFERENCES "ListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "RegistryFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_unitOverrideId_fkey" FOREIGN KEY ("unitOverrideId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_ackIssuedViaId_fkey" FOREIGN KEY ("ackIssuedViaId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_actionRequiredId_fkey" FOREIGN KEY ("actionRequiredId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "ListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_snapDefaultUnitId_fkey" FOREIGN KEY ("snapDefaultUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_routedUnitId_fkey" FOREIGN KEY ("routedUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "OutgoingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_recipientCategoryId_fkey" FOREIGN KEY ("recipientCategoryId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_inReplyToInwardId_fkey" FOREIGN KEY ("inReplyToInwardId") REFERENCES "InwardItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "RegistryFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_originatingUnitId_fkey" FOREIGN KEY ("originatingUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_dispatchModeId_fkey" FOREIGN KEY ("dispatchModeId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryFile" ADD CONSTRAINT "RegistryFile_fileClassId_fkey" FOREIGN KEY ("fileClassId") REFERENCES "ListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryFile" ADD CONSTRAINT "RegistryFile_owningUnitId_fkey" FOREIGN KEY ("owningUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryFile" ADD CONSTRAINT "RegistryFile_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryFile" ADD CONSTRAINT "RegistryFile_fileStatusId_fkey" FOREIGN KEY ("fileStatusId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryFile" ADD CONSTRAINT "RegistryFile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileMovement" ADD CONSTRAINT "FileMovement_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "RegistryFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileMovement" ADD CONSTRAINT "FileMovement_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileMovement" ADD CONSTRAINT "FileMovement_issuedToUserId_fkey" FOREIGN KEY ("issuedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileMovement" ADD CONSTRAINT "FileMovement_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileMovement" ADD CONSTRAINT "FileMovement_receivedBackById_fkey" FOREIGN KEY ("receivedBackById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Database-level protections (STACK rule 9, SPEC §3.2). Hand-written: Prisma
-- does not generate these. TRUNCATE is not blocked so test databases can reset.
-- ---------------------------------------------------------------------------

-- Exactly one settings row, and it cannot be deleted.
ALTER TABLE "RegistrySettings" ADD CONSTRAINT "RegistrySettings_single_row" CHECK ("id" = 1);

-- Serials are positive; a void has a time, a user and a non-blank reason, or none of them.
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_serial_positive" CHECK ("serial" > 0);
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_serial_positive" CHECK ("serial" > 0);
ALTER TABLE "InwardItem" ADD CONSTRAINT "InwardItem_void_complete" CHECK (
  ("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL)
  OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND btrim("voidReason") <> '')
);
ALTER TABLE "OutwardItem" ADD CONSTRAINT "OutwardItem_void_complete" CHECK (
  ("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL)
  OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND btrim("voidReason") <> '')
);
ALTER TABLE "NumberCounter" ADD CONSTRAINT "NumberCounter_lastValue_nonnegative" CHECK ("lastValue" >= 0);

-- Inward/outward items: never deleted, number never changed, a void never undone.
CREATE FUNCTION registry_protect_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% % cannot be deleted; void it instead', TG_TABLE_NAME, OLD."number";
  END IF;
  IF NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."numberYear" IS DISTINCT FROM OLD."numberYear"
     OR NEW."serial" IS DISTINCT FROM OLD."serial" THEN
    RAISE EXCEPTION 'The number of % % cannot be changed', TG_TABLE_NAME, OLD."number";
  END IF;
  IF OLD."voidedAt" IS NOT NULL AND (
       NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt"
       OR NEW."voidedById" IS DISTINCT FROM OLD."voidedById"
       OR NEW."voidReason" IS DISTINCT FROM OLD."voidReason") THEN
    RAISE EXCEPTION '% % is void; the void cannot be undone or changed', TG_TABLE_NAME, OLD."number";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "InwardItem_protect" BEFORE UPDATE OR DELETE ON "InwardItem"
  FOR EACH ROW EXECUTE FUNCTION registry_protect_item();
CREATE TRIGGER "OutwardItem_protect" BEFORE UPDATE OR DELETE ON "OutwardItem"
  FOR EACH ROW EXECUTE FUNCTION registry_protect_item();

-- Counters only go up and are never deleted, so a number is never reissued.
CREATE FUNCTION registry_protect_counter() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Number counters cannot be deleted';
  END IF;
  IF NEW."series" IS DISTINCT FROM OLD."series" OR NEW."year" IS DISTINCT FROM OLD."year"
     OR NEW."lastValue" < OLD."lastValue" THEN
    RAISE EXCEPTION 'Number counters only move forward';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "NumberCounter_protect" BEFORE UPDATE OR DELETE ON "NumberCounter"
  FOR EACH ROW EXECUTE FUNCTION registry_protect_counter();

-- The audit log and the settings row are never deleted; the audit log is never updated.
CREATE FUNCTION registry_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%: % is not allowed', TG_TABLE_NAME, TG_OP;
END $$;

CREATE TRIGGER "AuditLog_append_only" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION registry_reject_change();
CREATE TRIGGER "RegistrySettings_no_delete" BEFORE DELETE ON "RegistrySettings"
  FOR EACH ROW EXECUTE FUNCTION registry_reject_change();
