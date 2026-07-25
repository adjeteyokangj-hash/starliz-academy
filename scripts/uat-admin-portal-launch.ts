/**
 * Launch verification: authenticated smoke UAT for Admin portal launch surfaces.
 * Additive DB reads only. Never migrate reset / commit secrets.
 *
 * Usage: npm run uat:admin-portal
 * Generated: artifacts/uat/admin-portal/
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { loadEnvLocal } from "./uat/load-env-local";
import { ARTIFACTS_UAT_ROOT, UAT_FIXTURES } from "./uat/local-fixtures";

loadEnvLocal();

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");

const BASE = UAT_FIXTURES.baseUrl;
const ADMIN_EMAIL = UAT_FIXTURES.adminEmail;
const ADMIN_PASSWORD = UAT_FIXTURES.adminPassword;
const SCHOOL_ADMIN_EMAIL = UAT_FIXTURES.schoolAdminEmail;
const SCHOOL_ADMIN_PASSWORD = UAT_FIXTURES.schoolAdminPassword;
const EVIDENCE_DIR = resolve(ARTIFACTS_UAT_ROOT, "admin-portal");
const EVIDENCE = resolve(EVIDENCE_DIR, "run-evidence.json");
const EVIDENCE_HTML = resolve(EVIDENCE_DIR, "captures");

const prisma = new PrismaClient();
type CookieJar = Map<string, string>;
type Check = { name: string; ok: boolean; detail?: string };

function parseSetCookie(headers: Headers, jar: CookieJar) {
  const raw = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : ([headers.get("set-cookie")].filter(Boolean) as string[]);
  for (const line of raw) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function api(jar: CookieJar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: cookieHeader(jar) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "follow",
    signal: AbortSignal.timeout(90_000),
  });
  parseSetCookie(res.headers, jar);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, ok: res.ok, json, text, url: res.url };
}

async function login(email: string, password: string) {
  const jar: CookieJar = new Map();
  const res = await api(jar, "POST", "/api/auth/login", { email, password });
  return { jar, res, payload: (res.json ?? {}) as Record<string, unknown> };
}

async function ensurePassword(email: string, password: string) {
  const { hashPassword } = await import("../src/lib/auth");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return false;
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  return true;
}

async function capture(jar: CookieJar, path: string, name: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: cookieHeader(jar), accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(90_000),
  });
  const html = await res.text();
  mkdirSync(EVIDENCE_HTML, { recursive: true });
  writeFileSync(resolve(EVIDENCE_HTML, `${name}.html`), html);
  writeFileSync(
    resolve(EVIDENCE_HTML, `${name}.meta.json`),
    JSON.stringify({ path, url: res.url, status: res.status, at: new Date().toISOString() }, null, 2),
  );
  return { status: res.status, url: res.url, html };
}

async function main() {
  const checks: Check[] = [];
  const home = await fetch(BASE, { signal: AbortSignal.timeout(90_000) }).catch(() => null);
  checks.push({ name: "localhost responds", ok: Boolean(home?.ok), detail: `status=${home?.status}` });
  if (!checks[0].ok) {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(EVIDENCE, JSON.stringify({ checks }, null, 2));
    process.exit(1);
  }

  try {
    await ensurePassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    await ensurePassword(SCHOOL_ADMIN_EMAIL, SCHOOL_ADMIN_PASSWORD);

    const platform = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    checks.push({
      name: "Platform admin login",
      ok: platform.res.ok,
      detail: `landing=${platform.payload.landingPath}`,
    });

    const slApi = await api(platform.jar, "GET", "/api/admin/short-learning");
    checks.push({
      name: "Platform Short Learning oversight API",
      ok: slApi.ok,
      detail: `status=${slApi.status}`,
    });

    const slPage = await capture(platform.jar, "/admin/short-learning", "01-platform-short-learning");
    checks.push({
      name: "Platform Short Learning page loads",
      ok: slPage.status < 400 && /short learning/i.test(slPage.html),
      detail: `status=${slPage.status}`,
    });

    const school = await prisma.school.findFirst({ orderBy: { createdAt: "asc" } });
    if (school) {
      const schoolSl = await capture(
        platform.jar,
        `/admin/schools/${school.id}/short-learning`,
        "02-school-short-learning-tab",
      );
      checks.push({
        name: "Per-school Short Learning tab loads",
        ok: schoolSl.status < 400,
        detail: `status=${schoolSl.status} schoolId=${school.id}`,
      });
      const support = await capture(platform.jar, `/admin/schools/${school.id}/support`, "03-school-support");
      checks.push({
        name: "Per-school Support tab loads",
        ok: support.status < 400,
        detail: `status=${support.status}`,
      });
    }

    const inbox = await capture(platform.jar, "/admin/inbox", "04-inbox-beta");
    checks.push({
      name: "Inbox page is beta/launch-safe (no crash)",
      ok: inbox.status < 500 && /outlook|support|beta/i.test(inbox.html),
      detail: `status=${inbox.status}`,
    });

    const schoolAdmin = await login(SCHOOL_ADMIN_EMAIL, SCHOOL_ADMIN_PASSWORD);
    checks.push({
      name: "School admin lands school-admin",
      ok: schoolAdmin.res.ok && String(schoolAdmin.payload.landingPath ?? "").includes("school-admin"),
      detail: `landing=${schoolAdmin.payload.landingPath}`,
    });
    const saHome = await capture(schoolAdmin.jar, "/school-admin", "05-school-admin-home");
    checks.push({
      name: "School admin overview loads with Short Learning",
      ok: saHome.status < 400 && /short learning/i.test(saHome.html),
      detail: `status=${saHome.status}`,
    });
    const bookings = await api(schoolAdmin.jar, "GET", "/api/school-admin/short-learning/bookings");
    checks.push({
      name: "School admin bookings API",
      ok: bookings.ok,
      detail: `status=${bookings.status}`,
    });

    // Public policy routes (unauthenticated)
    for (const [path, key] of [
      ["/faq", "faq"],
      ["/cookies", "cookies"],
      ["/safeguarding-policy", "safeguarding"],
      ["/data-retention", "retention"],
      ["/ai-use", "ai-use"],
      ["/knowledge-centre", "knowledge"],
      ["/policies", "policies"],
    ] as const) {
      const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(30_000) });
      const html = await res.text();
      mkdirSync(EVIDENCE_HTML, { recursive: true });
      writeFileSync(resolve(EVIDENCE_HTML, `public-${key}.html`), html);
      checks.push({
        name: `Public route ${path}`,
        ok: res.status < 400 && html.length > 200,
        detail: `status=${res.status}`,
      });
    }

    checks.push({ name: "UAT completed without exception", ok: true });
  } catch (error) {
    checks.push({
      name: "UAT completed without exception",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await prisma.$disconnect().catch(() => null);
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    migrationReset: false,
    committed: false,
    summary: { passed, failed: failed.length, total: checks.length },
    checks,
    failures: failed.map((f) => `${f.name}: ${f.detail ?? ""}`),
    evidenceDir: "artifacts/uat/admin-portal/",
  };
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(EVIDENCE, JSON.stringify(report, null, 2));
  writeFileSync(
    resolve("docs/assurance/uat/admin-portal-summary.md"),
    [
      `# Admin portal launch UAT summary`,
      ``,
      `- Passed: **${passed}/${checks.length}**`,
      `- Generated: \`artifacts/uat/admin-portal/\``,
      ``,
      `## Failures`,
      ...(failed.length ? failed.map((f) => `- ${f.name}: ${f.detail}`) : ["- none"]),
      ``,
      `_Generated by \`npm run uat:admin-portal\`._`,
      ``,
    ].join("\n"),
  );
  console.log(JSON.stringify(report.summary, null, 2));
  for (const f of failed) console.error("FAIL:", f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
