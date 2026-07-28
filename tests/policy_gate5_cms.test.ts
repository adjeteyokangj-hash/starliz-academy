import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SHORT_LEARNING_FACTS, COMPLAINT_SLA_COMMERCIAL_FACTS, SUBSCRIPTION_COMMERCIAL_FACTS } from "../src/lib/policies/locked-facts";
import { ALL_POLICY_DOCUMENTS, getPolicyBySlug } from "../src/lib/policies/registry";
import { PRODUCT_ADMIN_PERMISSIONS } from "../src/lib/admin-permissions";

const ROOT = process.cwd();
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("Gate 5 CMS migration is additive", () => {
  const sql = read("prisma/migrations/20260726180000_policy_knowledge_cms/migration.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "PolicyDocumentRecord"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "PolicyVersion"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "HelpArticleRecord"/);
  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("Policy CMS service enforces approval before publish", () => {
  const cms = read("src/lib/policies/cms.ts");
  assert.match(cms, /Publication requires an approved version/);
  assert.match(cms, /policy_publish_rejected/);
  assert.match(cms, /policy_published/);
  assert.match(cms, /policy_superseded/);
  assert.match(cms, /idempotent/);
});

test("Policy permissions are product-scoped", () => {
  assert.ok(PRODUCT_ADMIN_PERMISSIONS.includes("VIEW_POLICIES"));
  assert.ok(PRODUCT_ADMIN_PERMISSIONS.includes("MANAGE_POLICIES"));
  assert.ok(PRODUCT_ADMIN_PERMISSIONS.includes("APPROVE_POLICIES"));
  assert.ok(PRODUCT_ADMIN_PERMISSIONS.includes("PUBLISH_POLICIES"));
  const aliases = read("src/lib/admin-permissions.ts");
  assert.doesNotMatch(aliases, /MANAGE_POLICIES:\s*"MANAGE_SETTINGS"/);
});

test("Locked launch facts remain present", () => {
  assert.ok(SHORT_LEARNING_FACTS.some((f) => f.includes("105-minute")));
  assert.ok(SHORT_LEARNING_FACTS.some((f) => f.includes("90 or 120")));
  assert.ok(SHORT_LEARNING_FACTS.some((f) => /not guaranteed|availability/i.test(f)));
  assert.ok(SUBSCRIPTION_COMMERCIAL_FACTS.some((f) => /end of the current billing period/i.test(f)));
  assert.ok(COMPLAINT_SLA_COMMERCIAL_FACTS.some((f) => /2 working days/i.test(f)));
  assert.ok(COMPLAINT_SLA_COMMERCIAL_FACTS.some((f) => /10 working days/i.test(f)));
  assert.ok(COMPLAINT_SLA_COMMERCIAL_FACTS.some((f) => /service targets, not guaranteed/i.test(f)));
});

test("Missing Communications and Security policies now exist in registry", () => {
  assert.ok(getPolicyBySlug("communications-policy"));
  assert.ok(getPolicyBySlug("security-incident-response"));
  assert.ok(ALL_POLICY_DOCUMENTS.length >= 48);
});

test("Public policy resolve prefers CMS published and never drafts by design", () => {
  const resolve = read("src/lib/policies/resolve-public.ts");
  assert.match(resolve, /getPublishedPublicPolicy/);
  assert.match(resolve, /never expose drafts|Drafts never|source: "cms"/);
});

test("Admin policy APIs gate approve and publish separately", () => {
  const route = read("src/app/api/admin/policies/[slug]/route.ts");
  assert.match(route, /APPROVE_POLICIES/);
  assert.match(route, /PUBLISH_POLICIES/);
  assert.match(route, /MANAGE_POLICIES/);
});

test("Help public API serves published public only", () => {
  assert.match(read("src/app/api/help/route.ts"), /listPublishedPublicHelpArticles/);
  assert.match(read("src/lib/policies/help-cms.ts"), /visibility: "public"/);
  assert.match(read("src/lib/policies/help-cms.ts"), /status: "published"/);
});
