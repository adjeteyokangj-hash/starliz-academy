#!/usr/bin/env tsx

import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { exportMigrationDump } from "../src/lib/migration/pipeline";

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
    console.log("Usage: npm run migration:export -- --out ./tmp/migration.json [--database-url <url>] [--note <text>]");
    process.exit(0);
  }

  const databaseUrl = getArg("--database-url") ?? process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing source database URL. Provide --database-url or SOURCE_DATABASE_URL.");
  }

  const outArg = getArg("--out");
  const outputPath = outArg
    ? path.resolve(outArg)
    : path.resolve("tmp", `migration-dump-${timestampForFile(new Date())}.json`);

  const note = getArg("--note") ?? "manual export";
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const dump = await exportMigrationDump(client);
    const enrichedDump = {
      ...dump,
      source: {
        environment: dump.source?.environment,
        note,
      },
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(enrichedDump, null, 2), "utf8");

    const counts = {
      parents: enrichedDump.data.parents.length,
      children: enrichedDump.data.parents.reduce((total, parent) => total + parent.children.length, 0),
      lessons: enrichedDump.data.lessons.length,
      contentLibrary: enrichedDump.data.contentLibrary.length,
      assignments: enrichedDump.data.assignments.length,
    };

    console.log("Migration dump created.");
    console.log(`File: ${outputPath}`);
    console.log(`Counts: ${JSON.stringify(counts)}`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
