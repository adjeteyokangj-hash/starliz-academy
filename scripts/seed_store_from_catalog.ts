/**
 * One-shot upsert of FLAT_REWARD_CATALOG into StoreItem (stable catalog ids).
 * Usage: npx tsx scripts/seed_store_from_catalog.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { FLAT_REWARD_CATALOG } from "../src/lib/reward_catalog";

function loadEnvLocal() {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // rely on process env
  }
}

loadEnvLocal();

const prisma = new PrismaClient();

async function main() {
  let count = 0;
  for (const item of FLAT_REWARD_CATALOG) {
    const description = item.description ?? `${item.category} reward`;
    await prisma.storeItem.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        name: item.name,
        category: item.category,
        description,
        price: item.cost,
        requiredLevel: item.unlockLevel,
        rewardType: "digital",
        approvalMode: "none",
        stockTotal: null,
        isActive: true,
      },
      update: {
        name: item.name,
        category: item.category,
        price: item.cost,
        requiredLevel: item.unlockLevel,
      },
    });
    count += 1;
  }
  console.log(`Seeded/updated ${count} StoreItem rows from reward catalog.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
