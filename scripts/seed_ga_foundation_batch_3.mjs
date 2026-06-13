#!/usr/bin/env node
/**
 * Seed: Ga Foundation Batch 3
 * Source: Kasahorow Ga Children's Dictionary + Ga language reference sources
 *
 * Usage (load .env.local automatically):
 *   node --env-file=.env.local scripts/seed_ga_foundation_batch_3.mjs
 *
 * Or if Node < 20:
 *   set env vars manually, then: node scripts/seed_ga_foundation_batch_3.mjs
 *
 * Safe to re-run: upserts keyed on (englishWord, gaWord, category).
 * Words with "Reviewed" status cover thin categories: Food, Actions, Places,
 * School, Transport, Sports, Body, Feelings, Health, People, Greetings (extra),
 * Family (core members), Animals, Home.
 * All require admin page-confirmation before upgrading to Approved.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, "ga-foundation-batch-3.csv");
const SOURCE_NAME = "Kasahorow Ga Children's Dictionary";

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    // Basic split — fields in this CSV do not contain commas
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

function boolFromCsv(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

const prisma = new PrismaClient();

try {
  const csv = readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(csv);

  let source = await prisma.gaSource.findFirst({
    where: { sourceName: SOURCE_NAME },
    select: { id: true, sourceName: true },
  });

  if (!source) {
    source = await prisma.gaSource.create({
      data: {
        sourceName: SOURCE_NAME,
        sourceYear: 2025,
        section: "English-Ga",
        notes: "Seeded from batch 3 import script",
      },
      select: { id: true, sourceName: true },
    });
    console.log(`Source created: ${source.sourceName} (${source.id})`);
  } else {
    console.log(`Source found:   ${source.sourceName} (${source.id})`);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let approved = 0;
  let reviewed = 0;
  let pending = 0;

  for (const row of rows) {
    const englishWord = row.englishWord;
    const gaWord = row.gaWord;
    const category = row.category;

    if (!englishWord || !gaWord || !category) {
      skipped += 1;
      console.warn(`  skipped: missing required field — ${JSON.stringify(row)}`);
      continue;
    }

    const desiredReviewStatus = row.reviewStatus || "Reviewed";

    // Upsert keyed on (englishWord, gaWord, category) — same logic as batch 2
    const existing = await prisma.gaWord.findFirst({
      where: {
        englishWord: { equals: englishWord, mode: "insensitive" },
        gaWord,
        category,
      },
      select: { id: true, reviewStatus: true },
    });

    // Never downgrade an already-Approved word
    const finalReviewStatus =
      existing?.reviewStatus === "Approved" && desiredReviewStatus !== "Approved"
        ? "Approved"
        : desiredReviewStatus;

    const data = {
      englishWord,
      gaWord,
      wordType: row.wordType || "noun",
      category,
      level: row.level || "Foundation",
      sourceId: source.id,
      sourcePage: row.sourcePage ? Number(row.sourcePage) : null,
      reviewStatus: finalReviewStatus,
      audioStatus: row.audioStatus || "Not Started",
      quizReady: boolFromCsv(row.quizReady),
      storyReady: boolFromCsv(row.storyReady),
      notes: row.notes || null,
    };

    if (existing) {
      await prisma.gaWord.update({ where: { id: existing.id }, data });
      updated += 1;
      console.log(`  updated: ${englishWord} / ${gaWord} [${finalReviewStatus}]`);
    } else {
      await prisma.gaWord.create({ data });
      inserted += 1;
      console.log(`  created: ${englishWord} / ${gaWord} [${finalReviewStatus}]`);
    }

    if (finalReviewStatus === "Approved") approved += 1;
    else if (finalReviewStatus === "Reviewed") reviewed += 1;
    else pending += 1;
  }

  console.log("");
  console.log(`Inserted : ${inserted}`);
  console.log(`Updated  : ${updated}`);
  console.log(`Skipped  : ${skipped}`);
  console.log(`─────────────────`);
  console.log(`Approved : ${approved}`);
  console.log(`Reviewed : ${reviewed}  ← require admin page confirmation to upgrade`);
  console.log(`Pending  : ${pending}`);
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
