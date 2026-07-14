-- CreateTable
CREATE TABLE "public"."OpsWatchIntegration" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT,
    "projectSlug" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "apiKeyEncrypted" TEXT,
    "signingSecretEncrypted" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastHeartbeatStatus" TEXT,
    "lastHeartbeatMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsWatchIntegration_pkey" PRIMARY KEY ("id")
);
