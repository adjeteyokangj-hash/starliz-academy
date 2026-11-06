-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "itemId" TEXT,
    "reason" TEXT,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletTransaction_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
CREATE TABLE IF NOT EXISTS "StoreItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

ALTER TABLE "StoreItem" ADD COLUMN "minAge" INTEGER;
ALTER TABLE "StoreItem" ADD COLUMN "maxAge" INTEGER;
ALTER TABLE "StoreItem" ADD COLUMN "requiredLevel" INTEGER;

-- CreateIndex
CREATE INDEX "WalletTransaction_childId_createdAt_idx" ON "WalletTransaction"("childId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_source_idx" ON "WalletTransaction"("type", "source");
