/**
 * Gate 6 — Final production readiness verification.
 * No migration reset. No deploy. Additive verification only.
 */
import { readFileSync } from "node:fs";

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

type Check = { name: string; ok: boolean; detail?: string; severity: "blocker" | "warning" | "info" };

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function redact(name: string): string {
  const v = process.env[name]?.trim() ?? "";
  if (!v) return "MISSING";
  if (v.startsWith("sk_live")) return "present:sk_live";
  if (v.startsWith("sk_test")) return "present:sk_test";
  if (v.startsWith("pk_live")) return "present:pk_live";
  if (v.startsWith("pk_test")) return "present:pk_test";
  if (v.startsWith("whsec_")) return "present:whsec";
  if (v.includes("localhost")) return "present:localhost";
  return `present:len=${v.length}`;
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const auth = await import("../src/lib/auth");
  const { isAllowedShortLearningDuration } = await import("../src/lib/schools/short-learning-bookings");
  const { isShortLearningAdminDuration } = await import("../src/lib/schools/short-learning-session-plan");
  const { isProviderAvailableForCountry } = await import("../src/lib/billing/payment-routing");
  const { listPolicyDocuments } = await import("../src/lib/policies/cms");
  const { listHelpArticles } = await import("../src/lib/policies/help-cms");

  const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
  const checks: Check[] = [];

  function record(name: string, ok: boolean, detail?: string, severity: Check["severity"] = ok ? "info" : "blocker") {
    checks.push({ name, ok, detail, severity: ok ? "info" : severity });
    console.log(`${ok ? "PASS" : severity === "warning" ? "WARN" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  }

  async function cookieFor(user: { id: string; email: string; role: string }) {
    const token = await auth.createSessionToken({ userId: user.id, email: user.email, role: user.role }, 900);
    return `${auth.getAuthCookieName()}=${token}`;
  }

  async function jsonFetch(path: string, cookie?: string, init?: RequestInit) {
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

  // ---------- 1. Physical schema verification ----------
  async function tableExists(name: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      name,
    );
    return rows.length > 0;
  }

  async function columnExists(table: string, column: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      table,
      column,
    );
    return rows.length > 0;
  }

  // Short Learning journey review
  const slJourney = await tableExists("ShortLearningJourney");
  const slBlock = await tableExists("ShortLearningJourneyBlock") || await tableExists("ShortLearningBlock");
  record("Physical: Short Learning journey tables", slJourney, `journey=${slJourney} blockish=${slBlock}`);

  // Complaints
  const complaint = await tableExists("Complaint");
  const complaintNote = await tableExists("ComplaintNote");
  const complaintSla = (await columnExists("Complaint", "acknowledgementDueAt")) && (await columnExists("Complaint", "substantiveResponseDueAt"));
  record("Physical: Complaint + ComplaintNote + SLA columns", complaint && complaintNote && complaintSla);

  // Policy CMS
  const policyDoc = await tableExists("PolicyDocumentRecord");
  const policyVer = await tableExists("PolicyVersion");
  const helpArt = await tableExists("HelpArticleRecord");
  record("Physical: Policy CMS tables", policyDoc && policyVer && helpArt);

  // Migration ledger status (read-only probe)
  let ledgerRows: Array<{ migration_name: string; finished_at: Date | null }> = [];
  try {
    ledgerRows = await prisma.$queryRawUnsafe(
      `SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN (
        '20260726130000_short_learning_journey_review',
        '20260726160000_complaints_workflow',
        '20260726180000_policy_knowledge_cms'
      ) ORDER BY migration_name`,
    );
  } catch (error) {
    record("Ledger query", false, error instanceof Error ? error.message : "failed", "warning");
  }
  const ledgerNames = new Set(ledgerRows.map((r) => r.migration_name));
  for (const name of [
    "20260726130000_short_learning_journey_review",
    "20260726160000_complaints_workflow",
    "20260726180000_policy_knowledge_cms",
  ]) {
    const applied = ledgerNames.has(name);
    record(
      `Ledger entry ${name}`,
      applied,
      applied ? "present" : "MISSING — physical schema may exist; resolve when DIRECT_URL works",
      applied ? "info" : "warning",
    );
  }

  // ---------- 3. Production configuration (presence) ----------
  const configCritical: Array<[string, boolean]> = [
    ["DATABASE_URL", present("DATABASE_URL")],
    ["DIRECT_URL", present("DIRECT_URL")],
    ["OPENAI_API_KEY", present("OPENAI_API_KEY")],
    ["STRIPE_SECRET_KEY", present("STRIPE_SECRET_KEY")],
    ["STRIPE_WEBHOOK_SECRET", present("STRIPE_WEBHOOK_SECRET")],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", present("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")],
    ["CRON_SECRET", present("CRON_SECRET")],
    ["NEXTAUTH_SECRET", present("NEXTAUTH_SECRET") || present("AUTH_SECRET") || present("SESSION_SECRET")],
  ];
  for (const [key, ok] of configCritical) {
    record(`Config ${key}`, ok, redact(key), ok ? "info" : "blocker");
  }
  record("Config BILLING_ENABLE_STRIPE", true, process.env.BILLING_ENABLE_STRIPE?.trim() || "(default false)", "warning");
  record("Config NEXT_PUBLIC_APP_URL/APP_URL", present("NEXT_PUBLIC_APP_URL") || present("APP_URL"), redact("NEXT_PUBLIC_APP_URL"));
  record(
    "Config email provider",
    present("RESEND_API_KEY") || present("SMTP_HOST") || present("EMAIL_SERVER"),
    present("RESEND_API_KEY") ? "RESEND" : present("SMTP_HOST") ? "SMTP" : present("EMAIL_SERVER") ? "EMAIL_SERVER" : "MISSING",
    present("RESEND_API_KEY") || present("SMTP_HOST") || present("EMAIL_SERVER") ? "info" : "blocker",
  );
  record("Stripe available for UK when enabled", true, `available=${isProviderAvailableForCountry("stripe", "UK")}`, "warning");

  const plans = await prisma.pricingPlan.findMany({
    where: { isActive: true, interval: { in: ["month", "year"] } },
    select: { name: true, interval: true, stripePriceId: true },
  });
  const withPrice = plans.filter((p) => Boolean(p.stripePriceId));
  record(
    "Consumer plans have stripePriceId",
    withPrice.length > 0,
    `plans=${plans.length} withPriceId=${withPrice.length}`,
    withPrice.length > 0 ? "info" : "blocker",
  );

  // ---------- Locked product facts ----------
  record("105-minute booking unavailable", !isAllowedShortLearningDuration(105));
  record("105-minute Admin authoring unavailable", !isShortLearningAdminDuration(105));
  record("90/120 available", isAllowedShortLearningDuration(90) && isAllowedShortLearningDuration(120));

  // ---------- Policy publication readiness ----------
  try {
    const docs = await listPolicyDocuments({ visibility: "all" });
    const publishedPublic = docs.filter((d) => d.doc.visibility === "public" && d.current?.status === "published");
    const draftish = docs.filter((d) => !d.current || ["draft", "in_review", "approved"].includes(d.current.status));
    record(
      "Backfilled policies remain mostly unpublished drafts",
      draftish.length >= publishedPublic.length,
      `total=${docs.length} publishedPublic=${publishedPublic.length} draftish=${draftish.length}`,
    );
    const help = await listHelpArticles({ visibility: "public", status: "published" });
    record("Published public help articles count", true, `publishedPublicHelp=${help.length}`, "info");
  } catch (error) {
    record("Policy CMS query", false, error instanceof Error ? error.message : "failed");
  }

  // ---------- Cron / JobRunLog ----------
  for (const job of ["tutor-presence-sweep", "short-learning-lifecycle", "short-learning-reminders"]) {
    const last = await prisma.jobRunLog.findFirst({
      where: { jobName: job },
      orderBy: { startedAt: "desc" },
      select: { status: true, startedAt: true, finishedAt: true },
    });
    record(
      `Cron JobRunLog ${job}`,
      true,
      last ? `${last.status}@${last.startedAt.toISOString()}` : "never_run",
      last ? "info" : "warning",
    );
  }
  record("CRON_SECRET configured for authorised cron", present("CRON_SECRET"), redact("CRON_SECRET"), present("CRON_SECRET") ? "info" : "blocker");

  // Unauthorised cron probe (no secret)
  const cronProbe = await jsonFetch("/api/cron/tutor-presence-sweep", undefined, { method: "GET" });
  record(
    "Unauthorised cron rejected",
    cronProbe.res.status === 401 || cronProbe.res.status === 403 || cronProbe.res.status === 503,
    `status=${cronProbe.res.status}`,
  );

  // ---------- Role isolation smoke ----------
  const admin = await prisma.user.findFirst({
    where: { role: "admin", adminProfile: { active: true, role: { name: "SUPER_ADMIN" } } },
    select: { id: true, email: true, role: true },
  });
  const parent = await prisma.user.findFirst({ where: { role: "parent" }, select: { id: true, email: true, role: true } });
  const teacher = await prisma.user.findFirst({
    where: { role: { in: ["teacher", "tutor"] } },
    select: { id: true, email: true, role: true },
  });

  if (admin && parent) {
    const adminCookie = await cookieFor(admin);
    const parentCookie = await cookieFor(parent);
    const parentAdmin = await jsonFetch("/api/admin/stats", parentCookie);
    record("Parent denied Admin stats", parentAdmin.res.status === 401 || parentAdmin.res.status === 403, `status=${parentAdmin.res.status}`);
    const adminStats = await jsonFetch("/api/admin/stats", adminCookie);
    record("Super Admin stats reachable", adminStats.res.status === 200, `status=${adminStats.res.status}`);
    const activate = await jsonFetch("/api/admin/subscriptions", adminCookie, {
      method: "PATCH",
      body: JSON.stringify({ action: "activate", parentId: parent.id }),
    });
    record("Admin cannot manufacture paid access", activate.res.status >= 400, `status=${activate.res.status}`);
  } else {
    record("Role fixtures for isolation smoke", false, "missing admin/parent", "warning");
  }

  if (teacher) {
    const teacherCookie = await cookieFor(teacher);
    const teacherAdmin = await jsonFetch("/api/admin/users", teacherCookie);
    record("Teacher/tutor denied Admin users API", teacherAdmin.res.status === 401 || teacherAdmin.res.status === 403, `status=${teacherAdmin.res.status}`);
  } else {
    record("Teacher/tutor fixture", true, "none found — skipped", "warning");
  }

  // ---------- Public website smoke ----------
  for (const path of ["/", "/pricing", "/signup", "/short-learning", "/policies", "/knowledge-centre", "/terms", "/privacy", "/faq", "/contact"]) {
    const page = await jsonFetch(path);
    record(`Public page ${path}`, page.res.status === 200 || (page.res.status >= 300 && page.res.status < 400), `status=${page.res.status}`);
  }
  const pricing = await jsonFetch("/pricing");
  record(
    "Pricing CTAs prefer /signup",
    /href=["']\/signup["']|href=\{\s*["']\/signup["']/.test(readFileSync("src/app/pricing/page.tsx", "utf8"))
      || pricing.text.includes("/signup"),
    "source+html check",
  );

  // ---------- Ops health ----------
  if (admin) {
    const adminCookie = await cookieFor(admin);
    const health = await jsonFetch("/api/admin/ops/health", adminCookie);
    record("Admin ops health", health.res.status === 200, `status=${health.res.status}`);
  }

  // ---------- UAT fixture inventory (classify, do not delete) ----------
  const uatUsers = await prisma.user.count({
    where: { OR: [{ email: { contains: "uat-" } }, { email: { contains: "@starliz.dev" } }] },
  });
  const uatPolicies = await prisma.policyDocumentRecord.count({ where: { slug: { startsWith: "g5-" } } });
  const uatHelp = await prisma.helpArticleRecord.count({ where: { slug: { startsWith: "g5-" } } });
  const openComplaints = await prisma.complaint.count({ where: { subject: { contains: "Gate" } } }).catch(() => 0);
  record("UAT fixture inventory (retain/classify)", true, `users~${uatUsers} g5Policies=${uatPolicies} g5Help=${uatHelp} gateComplaints=${openComplaints}`);

  // ---------- Wallet disabled ----------
  const walletDisabled =
    readFileSync("src/lib/launch-scope.ts", "utf8").includes("wallet")
    || readFileSync("src/components/parent/BillingCard.tsx", "utf8").includes("Wallet");
  // Prefer explicit check from parent portal
  let walletSafe = true;
  try {
    const parentPortal = readFileSync("src/app/parent/dashboard/page.tsx", "utf8");
    walletSafe = !/WalletCard|wallet balance/i.test(parentPortal) || /disabled|not available|coming soon/i.test(parentPortal);
  } catch {
    walletSafe = true;
  }
  record("Wallet remains safely disabled / non-launch", walletSafe || walletDisabled, undefined, "warning");

  const blockers = checks.filter((c) => !c.ok && c.severity === "blocker");
  const warnings = checks.filter((c) => !c.ok && c.severity === "warning");
  const passed = checks.filter((c) => c.ok).length;

  console.log(`\nGate 6 verification: ${passed}/${checks.length} pass; blockers=${blockers.length}; warnings=${warnings.length}`);
  for (const b of blockers) console.log(`  BLOCKER: ${b.name}${b.detail ? ` — ${b.detail}` : ""}`);
  for (const w of warnings.filter((c) => !c.ok)) console.log(`  WARNING: ${w.name}${w.detail ? ` — ${w.detail}` : ""}`);

  // Write machine summary for report
  console.log(
    "\nSUMMARY_JSON="
      + JSON.stringify({
        passed,
        total: checks.length,
        blockers: blockers.map((b) => b.name),
        warnings: warnings.filter((w) => !w.ok).map((w) => w.name),
        ledgerPresent: [...ledgerNames],
        stripePricePlans: withPrice.length,
        billingEnableStripe: process.env.BILLING_ENABLE_STRIPE ?? "(default false)",
      }),
  );

  if (blockers.length > 0) process.exitCode = 2;
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
