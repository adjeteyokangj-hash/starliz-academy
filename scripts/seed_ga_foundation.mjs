#!/usr/bin/env node
/**
 * Seed: Ga Foundation Batch 1
 * Source: Kasahorow Ga Children's Dictionary
 *
 * Usage (load .env.local automatically):
 *   node --env-file=.env.local scripts/seed_ga_foundation.mjs
 *
 * Or if Node < 20:
 *   set env vars manually, then: node scripts/seed_ga_foundation.mjs
 *
 * Safe to re-run: uses upsert keyed on (englishWord, gaWord, sourcePage).
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Manually load .env.local if DATABASE_URL not already set (Node < 20 fallback)
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
    console.log("Loaded .env.local");
  } catch {
    console.warn("Could not load .env.local — ensure DATABASE_URL is set.");
  }
}

const SOURCE_NAME = "Kasahorow Ga Children's Dictionary";

/** @type {{ englishWord: string; gaWord: string; wordType: string; category: string; level: string; sourcePage: number; reviewStatus: string; audioStatus: string; quizReady: boolean; storyReady: boolean; notes: string }[]} */
const WORDS = [
  // Greetings — page 7
  { englishWord: "Hello",     gaWord: "Helo",    wordType: "expression", category: "Greetings", level: "Foundation", sourcePage: 7,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 7" },
  { englishWord: "Yes",       gaWord: "Yoo",     wordType: "expression", category: "Greetings", level: "Foundation", sourcePage: 7,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 7" },
  { englishWord: "No",        gaWord: "Daabi",   wordType: "expression", category: "Greetings", level: "Foundation", sourcePage: 7,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 7" },
  // Time — page 7
  { englishWord: "Yesterday", gaWord: "Nye",     wordType: "noun",       category: "Time",      level: "Foundation", sourcePage: 7,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 7" },
  { englishWord: "Today",     gaWord: "Ŋmene",   wordType: "noun",       category: "Time",      level: "Foundation", sourcePage: 7,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 7" },
  { englishWord: "Tomorrow",  gaWord: "Wɔ",      wordType: "noun",       category: "Time",      level: "Foundation", sourcePage: 7,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 7" },
  // Days — page 8
  { englishWord: "Sunday",    gaWord: "Hɔgbaa",  wordType: "noun",       category: "Days",      level: "Foundation", sourcePage: 8,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 8" },
  { englishWord: "Monday",    gaWord: "Ju",      wordType: "noun",       category: "Days",      level: "Foundation", sourcePage: 8,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 8" },
  { englishWord: "Tuesday",   gaWord: "Jufɔ",    wordType: "noun",       category: "Days",      level: "Foundation", sourcePage: 8,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 8" },
  { englishWord: "Wednesday", gaWord: "Shɔ",     wordType: "noun",       category: "Days",      level: "Foundation", sourcePage: 8,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 8" },
  { englishWord: "Thursday",  gaWord: "Soo",     wordType: "noun",       category: "Days",      level: "Foundation", sourcePage: 8,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 8" },
  { englishWord: "Friday",    gaWord: "Sohaa",   wordType: "noun",       category: "Days",      level: "Foundation", sourcePage: 8,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 8" },
  { englishWord: "Saturday",  gaWord: "Hɔɔ",     wordType: "noun",       category: "Days",      level: "Foundation", sourcePage: 8,  reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 8" },
  // Numbers 1–8 (Approved — verified from dictionary pages 18 and 27)
  { englishWord: "one",       gaWord: "ekome",   wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 18, reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 18" },
  { englishWord: "two",       gaWord: "enyɔ",    wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 18, reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 18" },
  { englishWord: "three",     gaWord: "ete",     wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 18, reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 18" },
  { englishWord: "four",      gaWord: "ejwɛ",    wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 18, reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 18" },
  { englishWord: "five",      gaWord: "enumɔ",   wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 18, reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 18" },
  { englishWord: "six",       gaWord: "ekpaa",   wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 18, reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 18" },
  { englishWord: "seven",     gaWord: "kpawo",   wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 27, reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 27" },
  { englishWord: "eight",     gaWord: "kpaanyo", wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 27, reviewStatus: "Approved", audioStatus: "Not Started", quizReady: true,  storyReady: false, notes: "Verified page 27" },
  // Numbers 9–10 (Pending — source page unconfirmed; do NOT approve until verified)
  { englishWord: "nine",      gaWord: "nɛɛhu",   wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 0,  reviewStatus: "Pending",  audioStatus: "Not Started", quizReady: false, storyReady: false, notes: "Source page unconfirmed — do not approve until verified" },
  { englishWord: "ten",       gaWord: "nyɔŋma",  wordType: "adjective",  category: "Numbers",   level: "Foundation", sourcePage: 0,  reviewStatus: "Pending",  audioStatus: "Not Started", quizReady: false, storyReady: false, notes: "Source page unconfirmed — do not approve until verified" },
];

const prisma = new PrismaClient();

try {
  // Find or create the source (sourceName is not a unique index — use findFirst)
  let source = await prisma.gaSource.findFirst({
    where: { sourceName: SOURCE_NAME },
    select: { id: true, sourceName: true },
  });
  if (!source) {
    source = await prisma.gaSource.create({
      data: {
        sourceName: SOURCE_NAME,
        sourceYear: 2025,
        fileName: null,
        fileReference: null,
        pageNumber: null,
        section: "English-Ga",
        notes: "Verified dictionary scan source",
      },
      select: { id: true, sourceName: true },
    });
    console.log(`Source created: ${source.sourceName} (${source.id})`);
  } else {
    console.log(`Source found:   ${source.sourceName} (${source.id})`);
  }

  let created = 0;
  let updated = 0;

  for (const word of WORDS) {
    // Upsert keyed on englishWord + gaWord + sourcePage — same dedup logic as bulk import
    const existing = await prisma.gaWord.findFirst({
      where: {
        englishWord: { equals: word.englishWord, mode: "insensitive" },
        gaWord: word.gaWord,
        sourcePage: word.sourcePage,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.gaWord.update({
        where: { id: existing.id },
        data: { ...word, sourceId: source.id },
      });
      updated += 1;
      console.log(`  updated: ${word.englishWord} / ${word.gaWord}`);
    } else {
      await prisma.gaWord.create({
        data: { ...word, sourceId: source.id },
      });
      created += 1;
      console.log(`  created: ${word.englishWord} / ${word.gaWord} [${word.reviewStatus}]`);
    }
  }

  const metrics = await prisma.gaWord.aggregate({
    _count: { id: true },
    where: { reviewStatus: "Approved" },
  });
  const total = await prisma.gaWord.count();

  console.log(`\nDone. Created: ${created}  Updated: ${updated}`);
  console.log(`Total words in DB: ${total}  (Approved: ${metrics._count.id})`);
} catch (error) {
  console.error("Seed failed:", error.message ?? error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
