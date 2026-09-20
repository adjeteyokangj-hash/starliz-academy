import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("admin reset-pin route is retired rather than clearing parent PIN hashes", () => {
  const route = read("src/app/api/admin/parents/[id]/reset-pin/route.ts");
  assert.match(route, /parent-pin-retired/);
  assert.doesNotMatch(route, /clearParentPin/);
  assert.doesNotMatch(route, /pinHash:\s*null/);
});

test("admin parent detail UI no longer exposes Reset Parent PIN", () => {
  const page = read("src/app/admin/(secure)/parents/[id]/page.tsx");
  assert.doesNotMatch(page, /Reset Parent PIN/);
  assert.doesNotMatch(page, /handleResetParentPin/);
});
