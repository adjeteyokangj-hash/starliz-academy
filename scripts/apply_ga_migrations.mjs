#!/usr/bin/env node
/**
 * Apply Ga schema migrations via raw SQL through the Prisma pooler connection.
 * Use this when prisma migrate deploy is blocked (direct port 5432 unreachable).
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply_ga_migrations.mjs
 *
 * Safe to re-run: all DDL uses IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
 * Also registers the migrations in _prisma_migrations so Prisma CLI stays in sync.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  const envPath = resolve(__dirname, "../.env.local");
  try {
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let val = trimmed.slice(eqIndex + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore
  }
}

const prisma = new PrismaClient();

// All DDL uses IF NOT EXISTS guards so re-runs are safe
const MIGRATION_1 = {
  id: "20260606120000_add_ga_verified_word_bank",
  statements: [
    `CREATE TABLE IF NOT EXISTS "GaSource" ("id" TEXT NOT NULL, "sourceName" TEXT NOT NULL, "sourceYear" INTEGER, "fileName" TEXT, "fileReference" TEXT, "pageNumber" INTEGER, "section" TEXT, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GaSource_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "GaWord" ("id" TEXT NOT NULL, "englishWord" TEXT NOT NULL, "gaWord" TEXT NOT NULL, "wordType" TEXT NOT NULL, "category" TEXT NOT NULL, "level" TEXT NOT NULL, "sourceId" TEXT, "sourcePage" INTEGER, "reviewStatus" TEXT NOT NULL DEFAULT 'Pending', "audioStatus" TEXT NOT NULL DEFAULT 'Not Started', "quizReady" BOOLEAN NOT NULL DEFAULT false, "storyReady" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GaWord_pkey" PRIMARY KEY ("id"))`,
    `ALTER TABLE "GaWord" ADD CONSTRAINT "GaWord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "GaSource"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "GaWord_englishWord_gaWord_sourceId_key" ON "GaWord"("englishWord", "gaWord", "sourceId")`,
    `CREATE INDEX IF NOT EXISTS "GaSource_sourceName_idx" ON "GaSource"("sourceName")`,
    `CREATE INDEX IF NOT EXISTS "GaSource_sourceYear_idx" ON "GaSource"("sourceYear")`,
    `CREATE INDEX IF NOT EXISTS "GaSource_pageNumber_idx" ON "GaSource"("pageNumber")`,
    `CREATE INDEX IF NOT EXISTS "GaSource_section_idx" ON "GaSource"("section")`,
    `CREATE INDEX IF NOT EXISTS "GaWord_reviewStatus_idx" ON "GaWord"("reviewStatus")`,
    `CREATE INDEX IF NOT EXISTS "GaWord_category_idx" ON "GaWord"("category")`,
    `CREATE INDEX IF NOT EXISTS "GaWord_level_idx" ON "GaWord"("level")`,
    `CREATE INDEX IF NOT EXISTS "GaWord_wordType_idx" ON "GaWord"("wordType")`,
    `CREATE INDEX IF NOT EXISTS "GaWord_audioStatus_idx" ON "GaWord"("audioStatus")`,
    `CREATE INDEX IF NOT EXISTS "GaWord_quizReady_idx" ON "GaWord"("quizReady")`,
    `CREATE INDEX IF NOT EXISTS "GaWord_storyReady_idx" ON "GaWord"("storyReady")`,
    `CREATE INDEX IF NOT EXISTS "GaWord_sourcePage_idx" ON "GaWord"("sourcePage")`,
  ],
};

const MIGRATION_2 = {
  id: "20260606124500_add_ga_lessons_flashcards_quizzes",
  statements: [
    `CREATE TABLE IF NOT EXISTS "GaLesson" ("id" TEXT NOT NULL, "title" TEXT NOT NULL, "slug" TEXT NOT NULL, "description" TEXT, "level" TEXT NOT NULL, "category" TEXT NOT NULL, "objective" TEXT NOT NULL, "packKey" TEXT, "lessonOrder" INTEGER NOT NULL DEFAULT 0, "publishStatus" TEXT NOT NULL DEFAULT 'Draft', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GaLesson_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "GaLessonWord" ("id" TEXT NOT NULL, "lessonId" TEXT NOT NULL, "wordId" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GaLessonWord_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "GaLessonActivity" ("id" TEXT NOT NULL, "lessonId" TEXT NOT NULL, "activityType" TEXT NOT NULL, "title" TEXT NOT NULL, "instructions" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GaLessonActivity_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "GaQuizQuestion" ("id" TEXT NOT NULL, "lessonId" TEXT NOT NULL, "wordId" TEXT, "questionType" TEXT NOT NULL, "prompt" TEXT NOT NULL, "optionsJson" TEXT NOT NULL, "correctAnswer" TEXT NOT NULL, "explanation" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GaQuizQuestion_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "GaStudentLessonProgress" ("id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "lessonId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'started', "score" INTEGER NOT NULL DEFAULT 0, "totalQuestions" INTEGER NOT NULL DEFAULT 0, "correctAnswers" INTEGER NOT NULL DEFAULT 0, "completedAt" TIMESTAMP(3), "metadataJson" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GaStudentLessonProgress_pkey" PRIMARY KEY ("id"))`,
    `ALTER TABLE "GaLessonWord" ADD CONSTRAINT "GaLessonWord_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "GaLessonWord" ADD CONSTRAINT "GaLessonWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "GaWord"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    `ALTER TABLE "GaLessonActivity" ADD CONSTRAINT "GaLessonActivity_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "GaQuizQuestion" ADD CONSTRAINT "GaQuizQuestion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "GaQuizQuestion" ADD CONSTRAINT "GaQuizQuestion_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "GaWord"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    `ALTER TABLE "GaStudentLessonProgress" ADD CONSTRAINT "GaStudentLessonProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "GaStudentLessonProgress" ADD CONSTRAINT "GaStudentLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "GaLesson_slug_key" ON "GaLesson"("slug")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "GaLessonWord_lessonId_wordId_key" ON "GaLessonWord"("lessonId", "wordId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "GaStudentLessonProgress_studentId_lessonId_key" ON "GaStudentLessonProgress"("studentId", "lessonId")`,
    `CREATE INDEX IF NOT EXISTS "GaLesson_publishStatus_idx" ON "GaLesson"("publishStatus")`,
    `CREATE INDEX IF NOT EXISTS "GaLesson_level_idx" ON "GaLesson"("level")`,
    `CREATE INDEX IF NOT EXISTS "GaLesson_category_idx" ON "GaLesson"("category")`,
    `CREATE INDEX IF NOT EXISTS "GaLesson_packKey_lessonOrder_idx" ON "GaLesson"("packKey", "lessonOrder")`,
    `CREATE INDEX IF NOT EXISTS "GaLessonWord_lessonId_sortOrder_idx" ON "GaLessonWord"("lessonId", "sortOrder")`,
    `CREATE INDEX IF NOT EXISTS "GaLessonWord_wordId_idx" ON "GaLessonWord"("wordId")`,
    `CREATE INDEX IF NOT EXISTS "GaLessonActivity_lessonId_sortOrder_idx" ON "GaLessonActivity"("lessonId", "sortOrder")`,
    `CREATE INDEX IF NOT EXISTS "GaLessonActivity_activityType_idx" ON "GaLessonActivity"("activityType")`,
    `CREATE INDEX IF NOT EXISTS "GaQuizQuestion_lessonId_sortOrder_idx" ON "GaQuizQuestion"("lessonId", "sortOrder")`,
    `CREATE INDEX IF NOT EXISTS "GaQuizQuestion_wordId_idx" ON "GaQuizQuestion"("wordId")`,
    `CREATE INDEX IF NOT EXISTS "GaQuizQuestion_questionType_idx" ON "GaQuizQuestion"("questionType")`,
    `CREATE INDEX IF NOT EXISTS "GaStudentLessonProgress_studentId_idx" ON "GaStudentLessonProgress"("studentId")`,
    `CREATE INDEX IF NOT EXISTS "GaStudentLessonProgress_lessonId_idx" ON "GaStudentLessonProgress"("lessonId")`,
    `CREATE INDEX IF NOT EXISTS "GaStudentLessonProgress_status_idx" ON "GaStudentLessonProgress"("status")`,
  ],
};

async function tryExec(sql) {
  try {
    await prisma.$executeRawUnsafe(sql);
    return true;
  } catch (err) {
    // Silently ignore "already exists" class errors (42710 duplicate_object, 42P07 duplicate_table, 42P16 invalid_table_definition)
    const code = err?.meta?.code ?? "";
    const msg = (err?.message ?? "").toLowerCase();
    if (["42710", "42P07", "42P16"].includes(code) || msg.includes("already exists")) return false;
    throw err;
  }
}

async function applyMigration(migration) {
  // Check if already in _prisma_migrations
  const existing = await prisma.$queryRaw`
    SELECT id FROM "_prisma_migrations" WHERE migration_name = ${migration.id} LIMIT 1
  `.catch(() => null);

  if (existing && existing.length > 0) {
    console.log(`  [skip] ${migration.id} — already applied`);
    return false;
  }

  // Run each statement individually (avoids DO $$ block semicolon splitting issues)
  for (const stmt of migration.statements) {
    await tryExec(stmt);
  }

  // Mark as applied in _prisma_migrations
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "_prisma_migrations" (id, checksum, started_at, finished_at, migration_name, logs, rolled_back_at, applied_steps_count)
    VALUES (
      gen_random_uuid()::text,
      'manual',
      ${now},
      ${now},
      ${migration.id},
      NULL,
      NULL,
      1
    )
    ON CONFLICT DO NOTHING
  `;
  console.log(`  [done] ${migration.id}`);
  return true;
}

try {
  console.log("Applying Ga migrations via pooler connection...\n");
  const r1 = await applyMigration(MIGRATION_1);
  const r2 = await applyMigration(MIGRATION_2);

  if (!r1 && !r2) {
    console.log("\nAll migrations already applied. Tables exist.");
  } else {
    console.log("\nMigrations applied. Running seed next...");
  }

  // Quick verification
  const sourceCount = await prisma.gaSource.count();
  const wordCount = await prisma.gaWord.count();
  console.log(`\nVerification: GaSource rows=${sourceCount}  GaWord rows=${wordCount}`);
} catch (error) {
  console.error("Migration failed:", error.message ?? error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
