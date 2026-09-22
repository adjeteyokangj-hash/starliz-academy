import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("schema adds nullable unique User.username for child login identity", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model User \{[\s\S]*?username\s+String\?\s+@unique/);
});

test("schema links ChildProfile to parent ownership and child account with named relations", () => {
  const schema = read("prisma/schema.prisma");

  assert.match(schema, /children\s+ChildProfile\[\]\s+@relation\("ChildProfileParent"\)/);
  assert.match(schema, /studentChildProfile\s+ChildProfile\?\s+@relation\("ChildProfileAccount"\)/);
  assert.match(
    schema,
    /parent\s+User\s+@relation\("ChildProfileParent",\s*fields:\s*\[parentId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
  );
  assert.match(schema, /userId\s+String\?\s+@unique/);
  assert.match(
    schema,
    /account\s+User\?\s+@relation\("ChildProfileAccount",\s*fields:\s*\[userId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/,
  );
});

test("child account identity migration is additive and uses SetNull for student User FK", () => {
  const sql = read("prisma/migrations/20260920104500_add_child_account_identity/migration.sql");

  assert.match(sql, /ALTER TABLE "User" ADD COLUMN "username" TEXT/);
  assert.match(sql, /ALTER TABLE "ChildProfile" ADD COLUMN "userId" TEXT/);
  assert.match(sql, /CREATE UNIQUE INDEX "User_username_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX "ChildProfile_userId_key"/);
  assert.match(sql, /ChildProfile_userId_fkey[\s\S]*ON DELETE SET NULL ON UPDATE CASCADE/);

  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.doesNotMatch(sql, /DROP COLUMN/i);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/);
});
