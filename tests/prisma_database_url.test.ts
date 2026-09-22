import test from "node:test";
import assert from "node:assert/strict";

import { encodePostgresUserinfo, normalizePrismaDatabaseUrl } from "../src/lib/prisma-database-url";

test("encodePostgresUserinfo percent-encodes a password that contains @", () => {
  const encoded = encodePostgresUserinfo(
    "postgresql://postgres.abc:secret@@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
  );
  const parsed = new URL(encoded);
  assert.equal(parsed.hostname, "aws-0-eu-west-1.pooler.supabase.com");
  assert.equal(parsed.port, "6543");
  assert.equal(decodeURIComponent(parsed.password), "secret@");
});

test("encodePostgresUserinfo is stable when the password is already encoded", () => {
  const first = encodePostgresUserinfo(
    "postgresql://postgres.abc:p%40ss@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
  );
  const second = encodePostgresUserinfo(first);
  assert.equal(first, second);
});

test("normalizePrismaDatabaseUrl raises connect timeout and local pool size", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL;
  try {
    const normalized = normalizePrismaDatabaseUrl(
      "postgresql://postgres.abc:secret@@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1",
    );
    assert.ok(normalized);
    const parsed = new URL(normalized as string);
    assert.equal(parsed.searchParams.get("connect_timeout"), "30");
    assert.equal(parsed.searchParams.get("connection_limit"), "10");
    assert.equal(parsed.searchParams.get("pgbouncer"), "true");
    assert.equal(parsed.searchParams.get("sslmode"), "require");
    assert.equal(parsed.hostname, "aws-0-eu-west-1.pooler.supabase.com");
  } finally {
    process.env.NODE_ENV = previous;
  }
});
