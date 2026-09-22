import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("ParentCollapsibleCard toggles with aria-expanded and optional storage key", () => {
  const source = readFileSync(join(process.cwd(), "src/components/parent/ParentCollapsibleCard.tsx"), "utf8");
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-controls=\{panelId\}/);
  assert.match(source, /localStorage\.setItem\(resolvedKey/);
  assert.match(source, /storageKey/);
  assert.match(source, /headerExtra/);
});

test("ParentPortalShell Panel uses ParentCollapsibleCard", () => {
  const source = readFileSync(join(process.cwd(), "src/components/parent/ParentPortalShell.tsx"), "utf8");
  assert.match(source, /import ParentCollapsibleCard from "\.\/ParentCollapsibleCard"/);
  assert.match(source, /function Panel\(/);
  assert.match(source, /<ParentCollapsibleCard title=\{title\} description=\{description\}/);
  assert.match(source, /storageKey=\{`parent-portal-panel:\$\{title\}`\}/);
});

test("ConsentAuditView wraps sections in ParentCollapsibleCard", () => {
  const source = readFileSync(join(process.cwd(), "src/components/parent/ConsentAuditView.tsx"), "utf8");
  assert.match(source, /import ParentCollapsibleCard from/);
  assert.match(source, /storageKey="parent-consent:status"/);
  assert.match(source, /onAccept/);
  assert.match(source, /onWithdraw/);
});