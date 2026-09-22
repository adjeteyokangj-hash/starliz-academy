import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("accounts route rejects non-parent roles in handler source", () => {
  const route = read("src/app/api/parent/children/accounts/route.ts");
  assert.match(route, /Only parent accounts can create child login accounts/);
  assert.match(route, /status:\s*403/);
  assert.match(route, /parentScope\.parentId !== session\.userId/);
});

test("existing-child account route rejects non-parent and scopes by owned childId", () => {
  const route = read("src/app/api/parent/children/[childId]/account/route.ts");
  assert.match(route, /Only parent accounts can create child logins/);
  assert.match(route, /status:\s*403/);
  assert.match(route, /parentScope\.parentId !== session\.userId/);
  assert.match(route, /linkExistingChildLoginAccount/);
  assert.doesNotMatch(route, /parentId:\s*body/);
  assert.doesNotMatch(route, /userId:\s*body/);
});

test("reset account route rejects non-parent and scopes by owned childId", () => {
  const route = read("src/app/api/parent/children/[childId]/account/reset/route.ts");
  assert.match(route, /Only parent accounts can reset child logins/);
  assert.match(route, /status:\s*403/);
  assert.match(route, /parentScope\.parentId !== session\.userId/);
  assert.match(route, /resetChildLoginCredentials/);
  assert.doesNotMatch(route, /parentId:\s*body/);
  assert.doesNotMatch(route, /userId:\s*body/);
});

test("create helper never accepts caller-supplied role email domain or passwordHash", () => {
  const lib = read("src/lib/child-account-create.ts");
  assert.match(lib, /role:\s*"student"/);
  assert.match(lib, /buildChildSyntheticEmail/);
  assert.match(lib, /hashPassword/);
  assert.match(lib, /prisma\.\$transaction/);

  const inputType = lib.match(
    /export type CreateChildAccountInput = \{([\s\S]*?)\};/,
  )?.[1];
  assert.ok(inputType, "CreateChildAccountInput type missing");
  assert.match(inputType, /parentId:/);
  assert.match(inputType, /password\?:/);
  assert.doesNotMatch(inputType, /\brole\b/);
  assert.doesNotMatch(inputType, /passwordHash/);
  assert.doesNotMatch(inputType, /\bemail\b/);

  const linkInputType = lib.match(
    /export type LinkExistingChildLoginInput = \{([\s\S]*?)\};/,
  )?.[1];
  assert.ok(linkInputType, "LinkExistingChildLoginInput type missing");
  assert.match(linkInputType, /parentId:/);
  assert.match(linkInputType, /childId:/);
  assert.doesNotMatch(linkInputType, /\brole\b/);
  assert.doesNotMatch(linkInputType, /passwordHash/);
  assert.doesNotMatch(linkInputType, /\bemail\b/);
});
