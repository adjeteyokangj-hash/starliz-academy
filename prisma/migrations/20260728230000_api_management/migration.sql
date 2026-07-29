-- API Management: external connections + generated outbound keys (additive only).

CREATE TABLE IF NOT EXISTS "ExternalApiConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseUrl" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "encryptedCredential" TEXT,
    "credentialHint" TEXT,
    "headerName" TEXT,
    "encryptedHeaders" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "status" TEXT NOT NULL DEFAULT 'not_tested',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAdminId" TEXT,
    CONSTRAINT "ExternalApiConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExternalApiConnection_enabled_idx" ON "ExternalApiConnection"("enabled");
CREATE INDEX IF NOT EXISTS "ExternalApiConnection_environment_idx" ON "ExternalApiConnection"("environment");
CREATE INDEX IF NOT EXISTS "ExternalApiConnection_createdByAdminId_idx" ON "ExternalApiConnection"("createdByAdminId");

CREATE TABLE IF NOT EXISTS "GeneratedApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "scopesJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAdminId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByAdminId" TEXT,
    "rotationOfId" TEXT,
    "rateLimit" INTEGER NOT NULL DEFAULT 60,
    CONSTRAINT "GeneratedApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedApiKey_keyHash_key" ON "GeneratedApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "GeneratedApiKey_keyPrefix_idx" ON "GeneratedApiKey"("keyPrefix");
CREATE INDEX IF NOT EXISTS "GeneratedApiKey_status_idx" ON "GeneratedApiKey"("status");
CREATE INDEX IF NOT EXISTS "GeneratedApiKey_environment_idx" ON "GeneratedApiKey"("environment");
CREATE INDEX IF NOT EXISTS "GeneratedApiKey_createdByAdminId_idx" ON "GeneratedApiKey"("createdByAdminId");

DO $$ BEGIN
  ALTER TABLE "GeneratedApiKey"
    ADD CONSTRAINT "GeneratedApiKey_rotationOfId_fkey"
    FOREIGN KEY ("rotationOfId") REFERENCES "GeneratedApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
