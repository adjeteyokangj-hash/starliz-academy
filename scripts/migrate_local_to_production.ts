#!/usr/bin/env tsx

import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { exportMigrationDump, importMigrationDump } from "../src/lib/migration/pipeline";

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function main() {
  if (hasFlag("--help")) {
    console.log("Usage: npm run migration:sync:prod -- [--dump ./tmp/file.json] [--apply --confirm-live YES_I_UNDERSTAND]");
    process.exit(0);
  }

  const localUrl = process.env.LOCAL_DATABASE_URL;
  const productionUrl = process.env.PRODUCTION_DATABASE_URL;

  if (!localUrl || !productionUrl) {
    throw new Error("LOCAL_DATABASE_URL and PRODUCTION_DATABASE_URL must both be set.");
  }
  if (localUrl === productionUrl) {
    throw new Error("Refusing to run: local and production URLs are identical.");
  }

  const dumpPathArg = getArg("--dump");
  const dumpPath = dumpPathArg
    ? path.resolve(dumpPathArg)
    : path.resolve("tmp", `prod-sync-dump-${timestampForFile(new Date())}.json`);

  const localClient = new PrismaClient({ datasources: { db: { url: localUrl } } });
  const productionClient = new PrismaClient({ datasources: { db: { url: productionUrl } } });

  try {
    console.log("Step 1/4: Exporting migration dump from local database...");
    const dump = await exportMigrationDump(localClient);
    await fs.mkdir(path.dirname(dumpPath), { recursive: true });
    await fs.writeFile(dumpPath, JSON.stringify(dump, null, 2), "utf8");
    console.log(`Dump written to: ${dumpPath}`);

    console.log("Step 2/4: Running dry-run against production...");
    const dryRun = await importMigrationDump({ dump, dryRun: true, client: productionClient });
    console.log(JSON.stringify(dryRun.report.summary, null, 2));
    if (dryRun.report.errors.length) {
      console.log(`Dry-run reported ${dryRun.report.errors.length} issue(s).`);
    }

    if (!hasFlag("--apply")) {
      console.log("Dry-run complete. Re-run with --apply --confirm-live YES_I_UNDERSTAND to apply.");
      return;
    }

    const confirmation = getArg("--confirm-live");
    if (confirmation !== "YES_I_UNDERSTAND") {
      throw new Error("Production apply requires --confirm-live YES_I_UNDERSTAND");
    }

    console.log("Step 3/4: Applying import to production...");
    const applied = await importMigrationDump({ dump, dryRun: false, client: productionClient });
    console.log(JSON.stringify(applied.report.summary, null, 2));
    if (applied.report.errors.length) {
      console.log(`Apply completed with ${applied.report.errors.length} issue(s). Review output.`);
    }

    console.log("Step 4/4: Done. Run smoke checks and keep the dump file for rollback support.");
  } finally {
    await Promise.all([localClient.$disconnect(), productionClient.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
