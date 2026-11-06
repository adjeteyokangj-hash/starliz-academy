CREATE TABLE IF NOT EXISTS "Subscription" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"parentId" TEXT NOT NULL,
	"provider" TEXT NOT NULL DEFAULT 'manual',
	"providerCustomerId" TEXT,
	"providerSubId" TEXT,
	"planKey" TEXT NOT NULL DEFAULT 'trial',
	"status" TEXT NOT NULL DEFAULT 'trialing',
	"trialEndsAt" DATETIME,
	"currentPeriodEnd" DATETIME,
	"graceEndsAt" DATETIME,
	"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" DATETIME NOT NULL,
	CONSTRAINT "Subscription_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Subscription_parentId_idx" ON "Subscription"("parentId");
CREATE INDEX IF NOT EXISTS "Subscription_providerCustomerId_idx" ON "Subscription"("providerCustomerId");
CREATE INDEX IF NOT EXISTS "Subscription_providerSubId_idx" ON "Subscription"("providerSubId");

ALTER TABLE "Subscription" ADD COLUMN "pricingPlanId" TEXT;

CREATE INDEX "Subscription_pricingPlanId_idx" ON "Subscription"("pricingPlanId");