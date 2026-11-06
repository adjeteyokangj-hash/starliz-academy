import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDisposableDatabase } from "../scripts/ci/disposable-db";
import { normalizePrismaDatabaseUrl } from "../src/lib/prisma-database-url";

const url = "postgresql://starliz_ci:fixture@127.0.0.1:5432/starliz_ci?sslmode=disable";
const env = { CI: "true", CI_DISPOSABLE_DATABASE: "true", AUTH_SECRET: "starliz-ci-only-test", DATABASE_URL: url, DIRECT_URL: url };
test("disposable setup accepts only explicit loopback CI configuration", (t) => {
  const checkout = mkdtempSync(join(tmpdir(), "starliz-ci-guard-"));
  t.after(() => rmSync(checkout, { recursive: true }));
  assert.doesNotThrow(() => assertDisposableDatabase(env, checkout));
  for (const patch of [{ CI: "" }, { CI_DISPOSABLE_DATABASE: "" }, { AUTH_SECRET: "hosted-secret" }, { DATABASE_URL: url.replace("127.0.0.1", "db.example.supabase.co") }, { DATABASE_URL: url.replace("starliz_ci?", "other_db?") }, { DIRECT_URL: url.replace("disable", "require") }]) assert.throws(() => assertDisposableDatabase({ ...env, ...patch }, checkout));
  writeFileSync(join(checkout, ".env.local"), "synthetic test fixture");
  assert.throws(() => assertDisposableDatabase(env, checkout), /developer environment files/);
});
test("CI non-TLS URL remains explicit while hosted SSL defaults are preserved", () => {
  assert.equal(new URL(normalizePrismaDatabaseUrl(url)!).searchParams.get("sslmode"), "disable");
  assert.equal(new URL(normalizePrismaDatabaseUrl("postgresql://fictional:fixture@db.example.test/fixture")!).searchParams.get("sslmode"), "require");
});
test("workflow keeps disposable configuration before install and services in all three jobs", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  assert(workflow.indexOf("DATABASE_URL:") < workflow.indexOf("jobs:"));
  assert.equal((workflow.match(/image: postgres:16-alpine/g) ?? []).length, 3);
  assert.equal((workflow.match(/pg_isready -U starliz_ci -d starliz_ci/g) ?? []).length, 3);
  assert.equal((workflow.match(/scripts\/ci\/bootstrap-disposable-db.ts/g) ?? []).length, 3);
  assert(!workflow.includes("PLAYWRIGHT_BASE_URL:"));
  assert(workflow.includes("shell: bash --noprofile --norc -e -o pipefail {0}"));
  assert(workflow.includes("if: github.event_name == 'workflow_dispatch' || vars.CI_RELEASE_PROFILE == 'true'"));
});
