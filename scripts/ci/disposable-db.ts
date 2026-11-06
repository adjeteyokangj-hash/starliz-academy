import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Guard every CI bootstrap/fixture writer before constructing a DB client. */
export function assertDisposableDatabase(env: NodeJS.ProcessEnv = process.env, checkoutDir = process.cwd()) {
  assert.equal(env.CI_DISPOSABLE_DATABASE, "true", "Disposable CI database opt-in is required");
  assert.equal(env.CI, "true", "This bootstrap is CI-only");
  assert(!existsSync(resolve(checkoutDir, ".env.local")) && !existsSync(resolve(checkoutDir, ".env")), "CI checkout must not contain developer environment files");
  assert(env.AUTH_SECRET && env.AUTH_SECRET.startsWith("starliz-ci-only-"), "CI-only auth secret required");
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const url = new URL(env[key] ?? "");
    assert(["postgres:", "postgresql:"].includes(url.protocol));
    assert(["127.0.0.1", "localhost"].includes(url.hostname), "Hosted database targets are forbidden");
    assert.equal(url.pathname, "/starliz_ci");
    assert.equal(url.username, "starliz_ci");
    assert.equal(url.searchParams.get("sslmode"), "disable", "Disposable non-TLS PostgreSQL requires explicit sslmode=disable");
  }
  assert.equal(env.DATABASE_URL, env.DIRECT_URL, "Server and fixture workers must use the same disposable database");
}
