/**
 * Launch verification: Short Learning reminder cron wiring.
 *
 * Always checks vercel.json + in-process 401 rejection (sets a temporary
 * CRON_SECRET in this process only — never writes secrets to disk).
 *
 * Usage: npm run verify:short-learning-cron
 * Generated: artifacts/uat/cron/short-learning-reminders.json
 * Summary: docs/assurance/uat/cron-verification-summary.md
 *
 * Env (names only): UAT_BASE_URL, CRON_SECRET (optional for live HTTP)
 * Never run prisma migrate reset.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./uat/load-env-local";
import { ARTIFACTS_UAT_ROOT, UAT_FIXTURES } from "./uat/local-fixtures";

loadEnvLocal();

const BASE = UAT_FIXTURES.baseUrl;
const PATH = "/api/cron/short-learning-reminders";
const EVIDENCE_DIR = resolve(ARTIFACTS_UAT_ROOT, "cron");
const EVIDENCE = resolve(EVIDENCE_DIR, "short-learning-reminders.json");
const SUMMARY = resolve("docs/assurance/uat/cron-verification-summary.md");

type Check = { name: string; ok: boolean; detail?: string };

async function hit(method: string, headers?: Record<string, string>) {
  const res = await fetch(`${BASE}${PATH}`, {
    method,
    headers,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json, text };
}

async function main() {
  const checks: Check[] = [];

  const vercelRaw = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");
  const vercel = JSON.parse(vercelRaw) as { crons?: Array<{ path: string; schedule: string }> };
  const cron = vercel.crons?.find((c) => c.path === PATH);
  checks.push({
    name: "vercel.json cron entry present",
    ok: Boolean(cron?.schedule === "*/10 * * * *"),
    detail: cron ? `schedule=${cron.schedule}` : "missing",
  });

  // In-process auth (does not require .env.local or a running server)
  const { handleShortLearningRemindersCron } = await import(
    "../src/app/api/cron/short-learning-reminders/route"
  );
  const prevSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "verify-in-process-secret";
  try {
    const missing = await handleShortLearningRemindersCron(
      new Request(`http://localhost${PATH}`, { method: "GET" }),
    );
    checks.push({
      name: "in-process GET without secret returns 401",
      ok: missing.status === 401,
      detail: `status=${missing.status}`,
    });

    const invalid = await handleShortLearningRemindersCron(
      new Request(`http://localhost${PATH}`, {
        method: "GET",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    checks.push({
      name: "in-process GET invalid Bearer returns 401",
      ok: invalid.status === 401,
      detail: `status=${invalid.status}`,
    });

    const invalidPost = await handleShortLearningRemindersCron(
      new Request(`http://localhost${PATH}`, {
        method: "POST",
        headers: { "x-cron-secret": "wrong" },
      }),
    );
    checks.push({
      name: "in-process POST invalid x-cron-secret returns 401",
      ok: invalidPost.status === 401,
      detail: `status=${invalidPost.status}`,
    });
  } finally {
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
  }

  const secret = process.env.CRON_SECRET?.trim();
  const home = await fetch(BASE, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  checks.push({
    name: "dev server reachable (optional live HTTP)",
    ok: Boolean(home?.ok),
    detail: home ? `status=${home.status}` : "unreachable — skipped live HTTP",
  });

  if (home?.ok && secret) {
    const noAuth = await hit("GET");
    checks.push({
      name: "live GET without secret returns 401",
      ok: noAuth.status === 401,
      detail: `status=${noAuth.status}`,
    });

    const badAuth = await hit("GET", { authorization: "Bearer wrong-secret" });
    checks.push({
      name: "live GET with invalid secret returns 401",
      ok: badAuth.status === 401,
      detail: `status=${badAuth.status}`,
    });

    const goodGet = await hit("GET", { authorization: `Bearer ${secret}` });
    checks.push({
      name: "live GET with Bearer CRON_SECRET returns 200 (Vercel Cron method)",
      ok: goodGet.status === 200 && Boolean((goodGet.json as { ok?: boolean } | null)?.ok),
      detail: `status=${goodGet.status} body=${JSON.stringify(goodGet.json).slice(0, 200)}`,
    });

    const goodPost = await hit("POST", { authorization: `Bearer ${secret}` });
    checks.push({
      name: "live POST with Bearer CRON_SECRET returns 200",
      ok: goodPost.status === 200 && Boolean((goodPost.json as { ok?: boolean } | null)?.ok),
      detail: `status=${goodPost.status}`,
    });
  } else if (home?.ok && !secret) {
    checks.push({
      name: "live HTTP auth skipped",
      ok: true,
      detail: "CRON_SECRET not set in env — in-process 401 checks already covered; set CRON_SECRET in .env.local and restart dev for live HTTP",
    });
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);
  const report = {
    at: new Date().toISOString(),
    baseUrl: BASE,
    path: PATH,
    methodMatch: "Vercel Cron uses GET; route also accepts POST",
    schedule: "*/10 * * * *",
    migrationReset: false,
    committed: false,
    summary: { passed, failed: failed.length, total: checks.length },
    checks,
    failures: failed.map((f) => `${f.name}: ${f.detail ?? ""}`),
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(resolve("docs/assurance/uat"), { recursive: true });
  writeFileSync(EVIDENCE, JSON.stringify(report, null, 2));
  writeFileSync(
    SUMMARY,
    [
      `# Short Learning cron verification`,
      ``,
      `- Passed: **${passed}/${checks.length}**`,
      `- Path: \`${PATH}\``,
      `- Schedule: \`*/10 * * * *\``,
      `- Generated evidence: \`artifacts/uat/cron/short-learning-reminders.json\``,
      ``,
      `## Failures`,
      ...(failed.length ? failed.map((f) => `- ${f.name}: ${f.detail}`) : ["- none"]),
      ``,
      `_Generated by \`npm run verify:short-learning-cron\`. Never use prisma migrate reset._`,
      ``,
    ].join("\n"),
  );
  console.log(JSON.stringify(report.summary, null, 2));
  for (const f of failed) console.error("FAIL:", f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
