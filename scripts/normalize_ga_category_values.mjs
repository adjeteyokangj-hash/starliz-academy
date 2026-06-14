#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { normalizeGaCategory } from "../src/lib/ga-word-categories.ts";

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
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore missing local env file
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Run with node --env-file=.env.local scripts/normalize_ga_category_values.mjs or export DATABASE_URL first.");
  process.exit(1);
}

const prisma = new PrismaClient();

function canonicalCategory(raw) {
  return String(normalizeGaCategory(String(raw ?? ""))).trim();
}

async function normalizeTable({ label, rows, update }) {
  let changed = 0;
  for (const row of rows) {
    const nextCategory = canonicalCategory(row.category);
    if (!nextCategory || nextCategory === row.category) continue;
    await update(row.id, nextCategory);
    changed += 1;
    console.log(`${label}: ${row.category} -> ${nextCategory} (${row.id})`);
  }
  return changed;
}

async function main() {
  const [words, lessons] = await Promise.all([
    prisma.gaWord.findMany({ select: { id: true, category: true } }),
    prisma.gaLesson.findMany({ select: { id: true, category: true } }),
  ]);

  const [wordChanges, lessonChanges] = await Promise.all([
    normalizeTable({
      label: "GaWord",
      rows: words,
      update: (id, category) => prisma.gaWord.update({ where: { id }, data: { category } }),
    }),
    normalizeTable({
      label: "GaLesson",
      rows: lessons,
      update: (id, category) => prisma.gaLesson.update({ where: { id }, data: { category } }),
    }),
  ]);

  console.log(`Normalization complete. Updated ${wordChanges} GaWord rows and ${lessonChanges} GaLesson rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });