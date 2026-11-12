-- PREPARED ONLY. Requires separate authorisation together with the held Content Studio migration. No database connection or migration application was performed.
-- AlterTable
ALTER TABLE "CodingWorldContentVersion" ADD COLUMN     "metadataJson" TEXT NOT NULL DEFAULT '{}';

