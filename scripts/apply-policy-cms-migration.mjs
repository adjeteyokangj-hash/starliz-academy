/**
 * Apply Gate 5 policy CMS migration additively via pooler (IF NOT EXISTS).
 * Does not write _prisma_migrations. Does not reset.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith("#")) continue;
  const i = s.indexOf("=");
  if (i < 1) continue;
  let v = s.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  const key = s.slice(0, i).trim();
  if (process.env[key] === undefined) process.env[key] = v;
}

async function main() {
  const prisma = new PrismaClient();

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PolicyDocumentRecord" (
      "id" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'legal',
      "audienceJson" TEXT NOT NULL DEFAULT '["Public"]',
      "visibility" TEXT NOT NULL DEFAULT 'public',
      "currentVersionId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PolicyDocumentRecord_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PolicyDocumentRecord_slug_key" ON "PolicyDocumentRecord"("slug")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PolicyDocumentRecord_visibility_category_idx" ON "PolicyDocumentRecord"("visibility", "category")`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PolicyVersion" (
      "id" TEXT NOT NULL,
      "documentId" TEXT NOT NULL,
      "version" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "effectiveDate" TIMESTAMP(3),
      "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "authorId" TEXT,
      "approvedBy" TEXT,
      "approvedAt" TIMESTAMP(3),
      "publishedAt" TIMESTAMP(3),
      "archivedAt" TIMESTAMP(3),
      "supersedesId" TEXT,
      "contentJson" TEXT NOT NULL,
      "changeLog" TEXT,
      "approvalHistoryJson" TEXT NOT NULL DEFAULT '[]',
      "requiresAck" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PolicyVersion_documentId_version_key" ON "PolicyVersion"("documentId", "version")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PolicyVersion_documentId_status_idx" ON "PolicyVersion"("documentId", "status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PolicyVersion_status_publishedAt_idx" ON "PolicyVersion"("status", "publishedAt")`);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PolicyVersion_documentId_fkey') THEN
        ALTER TABLE "PolicyVersion"
          ADD CONSTRAINT "PolicyVersion_documentId_fkey"
          FOREIGN KEY ("documentId") REFERENCES "PolicyDocumentRecord"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "HelpArticleRecord" (
      "id" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "summary" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "audience" TEXT NOT NULL DEFAULT 'Parent',
      "visibility" TEXT NOT NULL DEFAULT 'public',
      "status" TEXT NOT NULL DEFAULT 'draft',
      "bodyJson" TEXT NOT NULL DEFAULT '[]',
      "keywordsJson" TEXT NOT NULL DEFAULT '[]',
      "relatedPolicySlug" TEXT,
      "version" TEXT NOT NULL DEFAULT '1.0.0',
      "authorId" TEXT,
      "publishedAt" TIMESTAMP(3),
      "archivedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "HelpArticleRecord_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "HelpArticleRecord_slug_key" ON "HelpArticleRecord"("slug")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "HelpArticleRecord_visibility_status_category_idx" ON "HelpArticleRecord"("visibility", "status", "category")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "HelpArticleRecord_status_publishedAt_idx" ON "HelpArticleRecord"("status", "publishedAt")`);

  const tables = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('PolicyDocumentRecord','PolicyVersion','HelpArticleRecord') ORDER BY table_name`,
  );
  console.log("Gate 5 tables:", tables);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
