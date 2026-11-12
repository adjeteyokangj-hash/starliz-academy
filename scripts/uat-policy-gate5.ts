/**
 * Gate 5 — Policy & Knowledge Centre authenticated UAT.
 * Additive fixtures only. No migration reset / commit / push / deploy.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith("#")) continue;
  const i = s.indexOf("=");
  if (i < 1) continue;
  let v = s.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  const key = s.slice(0, i).trim();
  if (process.env[key] === undefined) process.env[key] = v;
}

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  const { prisma } = await import("../src/lib/db");
  const auth = await import("../src/lib/auth");
  const { hashPassword } = auth;
  const {
    createPolicyDraft,
    submitPolicyForReview,
    approvePolicy,
    publishPolicy,
    getPublishedPublicPolicy,
    editPolicyDraft,
  } = await import("../src/lib/policies/cms");
  const { upsertHelpArticleDraft, publishHelpArticle, listPublishedPublicHelpArticles } = await import(
    "../src/lib/policies/help-cms"
  );
  const { SHORT_LEARNING_FACTS } = await import("../src/lib/policies/locked-facts");

  const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
  const stamp = Date.now().toString(36);
  const checks: Check[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupRoleIds: string[] = [];

  function record(name: string, ok: boolean, detail?: string) {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  }

  async function cookieFor(user: { id: string; email: string; role: string }) {
    const token = await auth.createSessionToken({ userId: user.id, email: user.email, role: user.role }, 900);
    return `${auth.getAuthCookieName()}=${token}`;
  }

  async function jsonFetch(path: string, cookie: string | null, init?: RequestInit) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(45_000),
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { res, body, text };
  }

  // Schema presence
  const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('PolicyDocumentRecord','PolicyVersion','HelpArticleRecord')`,
  );
  record("PolicyDocumentRecord exists", tables.some((t) => t.table_name === "PolicyDocumentRecord"));
  record("PolicyVersion exists", tables.some((t) => t.table_name === "PolicyVersion"));
  record("HelpArticleRecord exists", tables.some((t) => t.table_name === "HelpArticleRecord"));

  const superAdmin = await prisma.user.findFirst({
    where: { role: "admin", adminProfile: { active: true, role: { name: "SUPER_ADMIN" } } },
    select: { id: true, email: true, role: true },
  });
  if (!superAdmin) throw new Error("Need Super Admin");
  record("Super Admin available for Gate 5 UAT", Boolean(superAdmin.id));

  async function makeAdmin(label: string, permissions: string[]) {
    const email = `uat-g5-${label}-${stamp}@starliz.dev`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(`UatG5#${randomBytes(4).toString("hex")}`),
        role: "admin",
        name: `Gate5 ${label}`,
      },
    });
    cleanupUserIds.push(user.id);
    const role = await prisma.adminRole.create({
      data: {
        name: `UAT_G5_${label.toUpperCase()}_${stamp}`,
        description: `Gate 5 ${label}`,
        permissions: JSON.stringify(permissions),
      },
    });
    cleanupRoleIds.push(role.id);
    await prisma.adminUser.create({
      data: { userId: user.id, roleId: role.id, title: `uat-g5-${label}-${stamp}`, active: true },
    });
    return { user, cookie: await cookieFor({ id: user.id, email: user.email, role: "admin" }) };
  }

  const editor = await makeAdmin("editor", ["MANAGE_POLICIES", "VIEW_POLICIES"]);
  const approver = await makeAdmin("approver", ["APPROVE_POLICIES", "PUBLISH_POLICIES", "VIEW_POLICIES"]);
  const restricted = await makeAdmin("restricted", ["MANAGE_CONTENT"]);

  const parent = await prisma.user.create({
    data: {
      email: `uat-g5-parent-${stamp}@starliz.dev`,
      passwordHash: await hashPassword("Parent#2026"),
      role: "parent",
      name: "Gate5 Parent",
      parentProfile: { create: { phone: "Not set", status: "inactive", country: "UK" } },
    },
  });
  cleanupUserIds.push(parent.id);
  const parentCookie = await cookieFor({ id: parent.id, email: parent.email, role: "parent" });

  const slug = `g5-launch-${stamp}`;
  const draftBody = {
    id: slug,
    slug,
    title: `Gate 5 Launch Policy ${stamp}`,
    version: "1.0.0-draft",
    status: "Draft" as const,
    effectiveDate: "2026-07-26",
    lastReviewed: "2026-07-26",
    nextReview: "2027-01-26",
    owner: "StarLiz Compliance",
    audience: ["Public", "Parent"] as const,
    category: "legal" as const,
    purpose: "UAT policy",
    scope: "Gate 5",
    legalReviewRequired: true,
    summary: "Short Learning is AI-led. Human support is not guaranteed. Sessions are 90 or 120 minutes; 105 is unavailable.",
    sections: [
      {
        heading: "Locked facts",
        body: [...SHORT_LEARNING_FACTS.slice(0, 5)],
      },
    ],
    changeHistory: [],
  };

  // Editor creates draft
  const created = await createPolicyDraft({
    actorUserId: editor.user.id,
    slug,
    title: draftBody.title,
    category: "legal",
    visibility: "public",
    audience: ["Public", "Parent"],
    body: draftBody,
    changeLog: "Gate 5 UAT draft",
  });
  record("Editor creates draft", Boolean(created.id));

  const publicBefore = await getPublishedPublicPolicy(slug);
  record("Draft is not public via CMS", publicBefore === null);

  const publicPage = await jsonFetch(`/policies/${slug}`, null);
  record(
    "Draft slug not served as published CMS page (registry miss or not published)",
    publicPage.res.status === 404 || !(publicPage.text ?? "").includes("Gate 5 Launch Policy"),
    `status=${publicPage.res.status}`,
  );

  await submitPolicyForReview({ actorUserId: editor.user.id, slug });
  record("Editor submits for review", true);

  const deniedApprove = await jsonFetch(`/api/admin/policies/${slug}`, restricted.cookie, {
    method: "PATCH",
    body: JSON.stringify({ action: "approve" }),
  });
  record("Restricted Admin cannot approve via API", deniedApprove.res.status === 403, `status=${deniedApprove.res.status}`);

  await approvePolicy({ actorUserId: approver.user.id, slug });
  record("Approver approves", true);

  const published = await publishPolicy({ actorUserId: approver.user.id, slug });
  record("Publisher publishes", published.version.status === "published", published.version.status);

  const publicAfter = await getPublishedPublicPolicy(slug);
  record(
    "Public CMS page available with version/effective date",
    Boolean(publicAfter?.version.version && publicAfter.version.effectiveDate),
    publicAfter?.version.version,
  );

  // Edit published → new draft
  const branched = await editPolicyDraft({
    actorUserId: editor.user.id,
    slug,
    body: { ...draftBody, summary: "Updated draft after publish", version: "1.1.0-draft" },
    changeLog: "Branch after publish",
  });
  record("Editing published creates new draft version", branched.status === "draft", branched.status);

  const stillPublished = await getPublishedPublicPolicy(slug);
  record(
    "Previous published version remains current publicly until new publish",
    stillPublished?.version.status === "published",
  );

  // Internal policy never public
  const internalSlug = `g5-internal-${stamp}`;
  await createPolicyDraft({
    actorUserId: editor.user.id,
    slug: internalSlug,
    title: "Internal Staff Ops",
    category: "runbook",
    visibility: "internal",
    audience: ["Platform Admin"],
    body: { ...draftBody, id: internalSlug, slug: internalSlug, title: "Internal Staff Ops" },
  });
  await submitPolicyForReview({ actorUserId: editor.user.id, slug: internalSlug });
  await approvePolicy({ actorUserId: approver.user.id, slug: internalSlug });
  await publishPolicy({ actorUserId: approver.user.id, slug: internalSlug });
  const internalPublic = await getPublishedPublicPolicy(internalSlug);
  record("Internal published policy never returned as public CMS", internalPublic === null);

  // Help article
  const helpSlug = `g5-help-${stamp}`;
  await upsertHelpArticleDraft({
    actorUserId: editor.user.id,
    slug: helpSlug,
    title: "What is Short Learning?",
    summary: "AI-led 90 or 120 minute sessions. 105 unavailable. Human support not guaranteed.",
    category: "Short Learning",
    audience: "Parent",
    visibility: "public",
    body: ["Short Learning is AI-led.", "Human tutors are availability-based only."],
    keywords: ["short learning", "90", "120"],
    relatedPolicySlug: "short-learning-policy",
  });
  await publishHelpArticle({ actorUserId: approver.user.id, slug: helpSlug });
  const help = await listPublishedPublicHelpArticles("Short Learning");
  record("Help Centre search finds article", help.some((a) => a.slug === helpSlug), `count=${help.length}`);

  // Cross-role tampering
  const parentCreate = await jsonFetch("/api/admin/policies", parentCookie, {
    method: "POST",
    body: JSON.stringify({ slug: "parent-tamper", title: "Nope", category: "legal", body: draftBody }),
  });
  record("Parent denied Admin policy API", parentCreate.res.status === 401 || parentCreate.res.status === 403, `status=${parentCreate.res.status}`);

  const publicHelp = await jsonFetch("/api/help?q=Short", null);
  record("Unauthenticated help API works", publicHelp.res.status === 200);

  const audits = await prisma.auditLog.findMany({
    where: {
      action: { in: ["policy_created", "policy_approved", "policy_published", "help_article_published"] },
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    take: 20,
  });
  record(
    "Audits contain real actor IDs",
    audits.some((a) => a.actorUserId === editor.user.id) && audits.some((a) => a.actorUserId === approver.user.id),
    `audits=${audits.length}`,
  );

  record("105-minute locked fact present", SHORT_LEARNING_FACTS.some((f) => f.includes("105")));

  // Cleanup UAT docs (additive delete of UAT-only rows)
  await prisma.policyVersion.deleteMany({
    where: { document: { slug: { in: [slug, internalSlug] } } },
  });
  await prisma.policyDocumentRecord.deleteMany({ where: { slug: { in: [slug, internalSlug] } } });
  await prisma.helpArticleRecord.deleteMany({ where: { slug: helpSlug } });
  await prisma.adminUser.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.parentProfile.deleteMany({ where: { userId: { in: cleanupUserIds } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await prisma.adminRole.deleteMany({ where: { id: { in: cleanupRoleIds } } });

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\nGate 5 UAT: ${passed}/${checks.length} passed, ${failed} failed`);
  if (failed > 0) {
    for (const c of checks.filter((x) => !x.ok)) console.log(`  FAIL: ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  try {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});
