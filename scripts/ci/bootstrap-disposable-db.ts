import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabase } from "./disposable-db";

async function main() {
  assertDisposableDatabase();
  const db = new PrismaClient();
  try {
    const [identity] = await db.$queryRaw<Array<{ name: string; owner: string }>>`SELECT current_database()::text AS name, current_user::text AS owner`;
    assert.equal(identity?.name, "starliz_ci"); assert.equal(identity?.owner, "starliz_ci");
    const [state] = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    assert.equal(Number(state?.count), 0, "Refusing schema bootstrap: disposable database is not empty");
  } finally { await db.$disconnect(); }
  const require = createRequire(resolve("package.json"));
  const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate"], { stdio: "inherit", env: process.env });
  assert.equal(result.status, 0, "Fresh CI schema creation failed");
  const verified = new PrismaClient();
  try { await verified.$queryRaw`SELECT 1`; console.log("Fresh disposable schema ready; auth specs seed independent fixture identities. Historical migrations and hosted RLS acceptance were not tested."); }
  finally { await verified.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "CI bootstrap failed"); process.exitCode = 1; });
