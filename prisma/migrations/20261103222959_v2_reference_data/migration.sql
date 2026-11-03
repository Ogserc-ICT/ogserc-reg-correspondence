-- CreateEnum
CREATE TYPE "AckEmailMode" AS ENUM ('OFF', 'REVIEW', 'SEND');

-- AlterTable
ALTER TABLE "ListItem" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "RegistrySettings" ADD COLUMN     "ackEmailCc" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ackEmailMode" "AckEmailMode" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "filePrefix" TEXT NOT NULL DEFAULT 'OGSERC',
ADD COLUMN     "fileRefSerialDigits" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "frontDeskPrefix" TEXT NOT NULL DEFAULT 'OGSERC/FD';

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "divisionId" UUID,
ADD COLUMN     "emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unitGroup" TEXT;

-- CreateTable
CREATE TABLE "Division" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signatory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Signatory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Division_name_key" ON "Division"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Signatory_name_key" ON "Signatory"("name");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one default signatory (SPEC-v2 C7).
CREATE UNIQUE INDEX "Signatory_one_default" ON "Signatory"("isDefault") WHERE "isDefault";

-- File class codes are unique, ignoring case (SPEC-v2 C8).
CREATE UNIQUE INDEX "ListItem_list_code_key" ON "ListItem"("list", upper("code")) WHERE "code" IS NOT NULL;
