#!/usr/bin/env tsx

import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { importMigrationDump } from "../src/lib/migration/pipeline";

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function printReport(report: Awaited<ReturnType<typeof importMigrationDump>>["report"]): void {
  console.log(`Dry run: ${report.dryRun}`);
  console.log("Summary:");
  console.log(JSON.stringify(report.summary, null, 2));
  if (report.warnings.length) {
    console.log("Warnings:");
    for (const warning of report.warnings) console.log(`- ${warning}`);
  }
  if (report.errors.length) {
    console.log("Errors:");
    for (const error of report.errors) {
      console.log(`- [${error.entity}] ${error.reason}${error.reference ? ` (${error.reference})` : ""}`);
    }
  }
}

async function main() {
  if (hasFlag("--help")) {
    console.log("Usage: npm run migration:import -- --in ./tmp/migration.json [--apply] [--database-url <url>]");
    process.exit(0);
  }

  const inputArg = getArg("--in");
  if (!inputArg) {
    throw new Error("Missing --in argument pointing to migration dump JSON.");
  }

  const inputPath = path.resolve(inputArg);
  const raw = await fs.readFile(inputPath, "utf8");
  const dump = JSON.parse(raw) as unknown;

  const databaseUrl = getArg("--database-url") ?? process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing target database URL. Provide --database-url or TARGET_DATABASE_URL.");
  }

  const dryRun = !hasFlag("--apply");
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const { report } = await importMigrationDump({
      dump,
      dryRun,
      client,
    });
    printReport(report);

    if (report.errors.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
