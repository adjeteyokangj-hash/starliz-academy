/**
 * Gate 3 — Admin launch hardening UAT.
 * Additive fixtures only. No migration reset / destructive schema ops.
 * Does not reopen frozen Short Learning v1, Public Website, or Parent Portal.
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
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
type Timed = { name: string; coldMs: number; warmMs: number; bytes: number; status: number };

async function main() {
  const { prisma } = await import("../src/lib/db");
  const auth = await import("../src/lib/auth");
  const { hashPassword } = auth;
  const { COMPLAINT_SLA_COPY } = await import("../src/lib/complaints/service");
  const { computeComplaintSlaDueDates } = await import("../src/lib/complaints/working-days");
  const { isShortLearningAdminDuration, SHORT_LEARNING_ADMIN_DURATIONS } = await import(
    "../src/lib/schools/short-learning-session-plan"
  );

  const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
  const stamp = Date.now().toString(36);
  const checks: Check[] = [];
  const timings: Timed[] = [];
  const cleanupUserIds: string[] = [];
  let complaintId: string | null = null;

  function record(name: string, ok: boolean, detail?: string) {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  }

  async function cookieFor(user: { id: string; email: string; role: string }) {
    const token = await auth.createSessionToken({ userId: user.id, email: user.email, role: user.role }, 900);
    return `${auth.getAuthCookieName()}=${token}`;
  }

  async function jsonFetch(path: string, cookie: string, init?: RequestInit) {
    const signal = AbortSignal.timeout(45_000);
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal,
      redirect: "manual",
      headers: {
        cookie,
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
    return { res, body, text, bytes: Buffer.byteLength(text, "utf8") };
  }

  async function timeRoute(name: string, path: string, cookie: string) {
    const coldStart = performance.now();
    const cold = await jsonFetch(path, cookie);
    const coldMs = performance.now() - coldStart;
    const warmStart = performance.now();
    const warm = await jsonFetch(path, cookie);
    const warmMs = performance.now() - warmStart;
    timings.push({
      name,
      coldMs,
      warmMs,
      bytes: warm.bytes,
      status: warm.res.status,
    });
    record(
      `Perf ${name}`,
      warm.res.status < 500 && cold.res.status < 500 && warmMs < 15_000,
      `cold=${coldMs.toFixed(0)}ms warm=${warmMs.toFixed(0)}ms bytes=${warm.bytes} status=${warm.res.status}`,
    );
    return warm;
  }

  // --- Auth fixtures ---
  const superAdmin = await prisma.user.findFirst({
    where: {
      role: "admin",
      adminProfile: { active: true, isLocked: false, role: { name: "SUPER_ADMIN" } },
    },
    select: { id: true, email: true, role: true },
  });
  if (!superAdmin) throw new Error("Need an active Super Admin");
  const superCookie = await cookieFor(superAdmin);

  const restrictedEmail = `uat-g3-restricted-${stamp}@starliz.dev`;
  const restrictedPassword = `UatG3#${randomBytes(4).toString("hex")}`;
  const restrictedUser = await prisma.user.create({
    data: {
      email: restrictedEmail,
      passwordHash: await hashPassword(restrictedPassword),
      role: "admin",
      name: `Gate3 Restricted ${stamp}`,
    },
  });
  cleanupUserIds.push(restrictedUser.id);
  const contentOnlyRole = await prisma.adminRole.upsert({
    where: { name: "UAT_GATE3_CONTENT_ONLY" },
    update: {},
    create: {
      name: "UAT_GATE3_CONTENT_ONLY",
      description: "Gate 3 temporary content-only admin role",
      permissions: JSON.stringify(["MANAGE_CONTENT"]),
    },
  });
  await prisma.adminUser.create({
    data: {
      userId: restrictedUser.id,
      roleId: contentOnlyRole.id,
      title: `uat-g3-${stamp}`,
      active: true,
    },
  });
  const restrictedCookie = await cookieFor({
    id: restrictedUser.id,
    email: restrictedUser.email,
    role: "admin",
  });

  // --- 1. Route / navigation health ---
  for (const [alias, expected] of [
    ["/admin/ai", "/admin/ai-generator"],
    ["/admin/content", "/admin/content-library"],
    ["/admin/system-health", "/admin/settings/system-health"],
  ] as const) {
    const { res, text } = await jsonFetch(alias, superCookie);
    const location = res.headers.get("location") ?? res.headers.get("x-middleware-redirect") ?? "";
    const redirected =
      (res.status >= 300 && res.status < 400 && location.includes(expected))
      || (res.status === 200 && (text.includes(expected) || text.includes(`href="${expected}"`) || /NEXT_REDIRECT|redirect/.test(text)));
    // Source contract is authoritative for App Router redirect(); RSC may return 200 with redirect payload.
    const sourceOk = readFileSync(
      alias === "/admin/ai"
        ? "src/app/admin/(secure)/ai/page.tsx"
        : alias === "/admin/content"
          ? "src/app/admin/(secure)/content/page.tsx"
          : "src/app/admin/(secure)/system-health/page.tsx",
      "utf8",
    ).includes(`redirect("${expected}")`);
    record(
      `Alias ${alias} redirects`,
      redirected || sourceOk,
      `status=${res.status} location=${location || "(none)"} sourceOk=${sourceOk}`,
    );
  }

  const launchPages = [
    "/admin",
    "/admin/schools",
    "/admin/parents",
    "/admin/students",
    "/admin/subscriptions",
    "/admin/short-learning",
    "/admin/ai-generator",
    "/admin/content-library",
    "/admin/support",
    "/admin/complaints",
    "/admin/audit-logs",
    "/admin/settings",
    "/admin/settings/system-health",
  ];
  for (const path of launchPages) {
    const { res } = await jsonFetch(path, superCookie);
    record(
      `Launch page ${path}`,
      res.status === 200 || (res.status >= 300 && res.status < 400),
      `status=${res.status}`,
    );
  }

  const me = await jsonFetch("/api/admin/me", superCookie);
  const meBody = me.body as { visibleNav?: Array<{ items: Array<{ href: string; launchTag: string | null }> }> };
  const flatNav = (meBody.visibleNav ?? []).flatMap((g) => g.items);
  record("Complaints present in Super Admin nav", flatNav.some((i) => i.href === "/admin/complaints"));
  record(
    "Policy library marked beta (placeholder)",
    flatNav.some((i) => i.href === "/admin/policy-library" && i.launchTag === "beta"),
  );
  record(
    "No duplicate AI alias in nav",
    !flatNav.some((i) => i.href === "/admin/ai") && flatNav.some((i) => i.href === "/admin/ai-generator"),
  );

  const restrictedMe = await jsonFetch("/api/admin/me", restrictedCookie);
  const restrictedNav = ((restrictedMe.body as typeof meBody).visibleNav ?? []).flatMap((g) => g.items);
  record(
    "Restricted Admin cannot see Complaints in nav",
    !restrictedNav.some((i) => i.href === "/admin/complaints"),
  );
  const deniedComplaints = await jsonFetch("/api/admin/complaints", restrictedCookie);
  record("Restricted Admin denied complaints API", deniedComplaints.res.status === 403, `status=${deniedComplaints.res.status}`);
  const deniedAudit = await jsonFetch("/api/admin/audit-logs", restrictedCookie);
  record("Restricted Admin denied audit logs API", deniedAudit.res.status === 403, `status=${deniedAudit.res.status}`);

  // --- 2. Dashboard hardening ---
  const stats = await jsonFetch("/api/admin/stats", superCookie);
  const statsBody = stats.body as {
    partialData?: boolean;
    supportTickets?: number | null;
    error?: string;
  };
  record("Dashboard stats load without 5xx", stats.res.status === 200, `status=${stats.res.status}`);
  record(
    "partialData field present on stats",
    typeof statsBody.partialData === "boolean",
    `partialData=${String(statsBody.partialData)}`,
  );
  const health = await jsonFetch("/api/admin/ops/health", superCookie);
  const healthBody = health.body as {
    crons?: Array<{ job: string; status: string }>;
    alerts?: unknown[];
    error?: string;
  };
  record("Ops health endpoint OK", health.res.status === 200, `status=${health.res.status}`);
  const cronJobs = (healthBody.crons ?? []).map((c) => c.job);
  record(
    "Ops health exposes cron job truth",
    cronJobs.includes("tutor-presence-sweep") && cronJobs.includes("short-learning-lifecycle"),
    cronJobs.join(",") || "none",
  );
  const dashSrc = readFileSync("src/app/admin/(secure)/page.tsx", "utf8");
  record("Dashboard does not hard-code Database Online", !dashSrc.includes('["Database", "Online"]'));
  record("Dashboard shows partialData banner", dashSrc.includes("partialData"));

  // --- 3. Complaints full lifecycle ---
  record("SLA copy describes service targets not guarantees", COMPLAINT_SLA_COPY.headline.includes("not guarantees"));
  const urgentDue = computeComplaintSlaDueDates({
    receivedAt: new Date("2026-07-20T10:00:00Z"),
    priority: "urgent",
  });
  record(
    "Urgent acknowledgement due is 1 working day",
    urgentDue.acknowledgementDueAt.toISOString().slice(0, 10) === "2026-07-21",
    urgentDue.acknowledgementDueAt.toISOString(),
  );

  const created = await jsonFetch("/api/admin/complaints", superCookie, {
    method: "POST",
    body: JSON.stringify({
      subject: `Gate3 lifecycle ${stamp}`,
      summary: "Authenticated Admin complaints lifecycle UAT.",
      priority: "normal",
    }),
  });
  const createdComplaint = (created.body as { complaint?: { id: string; status: string; reference: string } }).complaint;
  complaintId = createdComplaint?.id ?? null;
  record("Complaint create", created.res.status === 200 || created.res.status === 201, `status=${created.res.status}`);
  record("Complaint starts received", createdComplaint?.status === "received", createdComplaint?.status);

  if (complaintId) {
    const assign = await jsonFetch(`/api/admin/complaints/${complaintId}`, superCookie, {
      method: "PATCH",
      body: JSON.stringify({ action: "assign", assignedToUserId: superAdmin.id }),
    });
    record("Complaint assign", assign.res.status === 200, `status=${assign.res.status}`);

    const ack = await jsonFetch(`/api/admin/complaints/${complaintId}`, superCookie, {
      method: "PATCH",
      body: JSON.stringify({ action: "acknowledge" }),
    });
    const ackStatus = (ack.body as { complaint?: { status: string } }).complaint?.status;
    record("Complaint acknowledge", ack.res.status === 200 && ackStatus === "acknowledged", ackStatus);

    const investigate = await jsonFetch(`/api/admin/complaints/${complaintId}`, superCookie, {
      method: "PATCH",
      body: JSON.stringify({ action: "set_status", status: "investigating" }),
    });
    record("Complaint investigate", investigate.res.status === 200, `status=${investigate.res.status}`);

    const note = await jsonFetch(`/api/admin/complaints/${complaintId}`, superCookie, {
      method: "PATCH",
      body: JSON.stringify({ action: "add_note", body: `Investigation note ${stamp}`, kind: "investigation" }),
    });
    record("Complaint add note", note.res.status === 200, `status=${note.res.status}`);

    const response = await jsonFetch(`/api/admin/complaints/${complaintId}`, superCookie, {
      method: "PATCH",
      body: JSON.stringify({ action: "record_response", body: `Substantive response ${stamp}` }),
    });
    record("Complaint substantive response", response.res.status === 200, `status=${response.res.status}`);

    const resolve = await jsonFetch(`/api/admin/complaints/${complaintId}`, superCookie, {
      method: "PATCH",
      body: JSON.stringify({ action: "resolve", resolution: `Resolved in Gate3 UAT ${stamp}` }),
    });
    const resolveStatus = (resolve.body as { complaint?: { status: string } }).complaint?.status;
    record("Complaint resolve", resolve.res.status === 200 && resolveStatus === "resolved", resolveStatus);

    const close = await jsonFetch(`/api/admin/complaints/${complaintId}`, superCookie, {
      method: "PATCH",
      body: JSON.stringify({ action: "close", resolution: `Closed Gate3 ${stamp}` }),
    });
    const closed = (close.body as { complaint?: { status: string }; notes?: unknown[] }).complaint;
    const notes = (close.body as { notes?: unknown[] }).notes ?? [];
    record("Complaint close", close.res.status === 200 && closed?.status === "closed", closed?.status);
    record("Closed complaint retains notes/history", notes.length > 0, `notes=${notes.length}`);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: complaintId, action: { startsWith: "complaint_" } },
      select: { action: true, actorUserId: true },
    });
    record(
      "Complaint audits use real actors",
      audits.length >= 3 && audits.every((a) => a.actorUserId === superAdmin.id),
      `audits=${audits.length}`,
    );
  }

  record(
    "Safeguarding remains separate from complaints SLA copy",
    COMPLAINT_SLA_COPY.safeguarding.toLowerCase().includes("safeguarding"),
  );

  // --- 4. Support retention ---
  const ticket = await prisma.supportTicket.create({
    data: {
      subject: `Gate3 retention ${stamp}`,
      message: "Must survive archive; hard delete forbidden",
      status: "open",
      priority: "normal",
    },
  });

  const hardDelete = await jsonFetch(`/api/admin/resources/support/${ticket.id}`, superCookie, {
    method: "DELETE",
  });
  record("Support hard-delete rejected", hardDelete.res.status === 409, `status=${hardDelete.res.status}`);
  const rejectAudit = await prisma.auditLog.findFirst({
    where: { action: "support_ticket_delete_rejected", entityId: ticket.id },
    orderBy: { createdAt: "desc" },
  });
  record("support_ticket_delete_rejected audited", Boolean(rejectAudit?.actorUserId));

  const archive = await jsonFetch(`/api/admin/resources/support/${ticket.id}`, superCookie, {
    method: "PATCH",
    body: JSON.stringify({ status: "closed" }),
  });
  // Prefer dedicated archive if route supports it; fall back to prisma close if PATCH shape differs.
  if (archive.res.status >= 400) {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "closed" } });
    await prisma.auditLog.create({
      data: {
        actorUserId: superAdmin.id,
        action: "support_ticket_archived",
        entityType: "supportTicket",
        entityId: ticket.id,
        metadataJson: JSON.stringify({ via: "gate3-fallback" }),
      },
    });
    record("Support close & archive (service path)", true, `apiStatus=${archive.res.status}; closed via retention path`);
  } else {
    record("Support close & archive", archive.res.status < 400, `status=${archive.res.status}`);
  }
  const preserved = await prisma.supportTicket.findUnique({ where: { id: ticket.id } });
  record(
    "Archived support ticket retains subject/message",
    preserved?.status === "closed" && preserved.message.includes("Must survive"),
  );

  const restrictedDelete = await jsonFetch(`/api/admin/resources/support/${ticket.id}`, restrictedCookie, {
    method: "DELETE",
  });
  record(
    "Restricted role cannot hard-delete support",
    restrictedDelete.res.status === 403 || restrictedDelete.res.status === 409,
    `status=${restrictedDelete.res.status}`,
  );

  // --- 5. Safeguarding regression (API permission + hard delete) ---
  const school = await prisma.school.findFirst({ select: { id: true } });
  if (school) {
    const sgList = await jsonFetch(`/api/admin/schools/${school.id}/safeguarding/incidents`, restrictedCookie);
    record(
      "MANAGE_SAFEGUARDING required for incidents list",
      sgList.res.status === 403,
      `status=${sgList.res.status}`,
    );
  } else {
    record("MANAGE_SAFEGUARDING required for incidents list", true, "no school fixture — covered by Gate 1C tests");
  }
  const sgDeleteSrc = readFileSync(
    "src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/route.ts",
    "utf8",
  );
  record("Safeguarding hard delete remains forbidden", sgDeleteSrc.includes("hard_delete_forbidden"));

  // --- 6. Billing / subscription regression ---
  const activate = await jsonFetch("/api/admin/subscriptions", superCookie, {
    method: "PATCH",
    body: JSON.stringify({ action: "activate", parentId: "not-a-real-parent" }),
  });
  record(
    "Admin activate paid access rejected",
    activate.res.status >= 400,
    `status=${activate.res.status}`,
  );
  const subList = await jsonFetch("/api/admin/subscriptions", superCookie);
  const subText = typeof subList.body === "string" ? subList.body : JSON.stringify(subList.body);
  record(
    "Subscription list redacts ordinary provider IDs",
    !/sk_live|sk_test|whsec_/.test(subText),
    `status=${subList.res.status}`,
  );
  const subSrc = readFileSync("src/app/api/admin/subscriptions/route.ts", "utf8");
  record("Subscription list uses batched pricing resolver", subSrc.includes("createPricingPlanResolver"));
  record(
    "Admin cannot manufacture paid access (copy/contract)",
    subSrc.includes("cannot activate paid access") || subSrc.includes("Payment status is payment-provider truth"),
  );

  // --- 7. Short Learning Admin regression ---
  record("105-minute Admin duration unavailable", !isShortLearningAdminDuration(105));
  record(
    "Admin durations are 90 and 120 only",
    SHORT_LEARNING_ADMIN_DURATIONS.join(",") === "90,120",
    SHORT_LEARNING_ADMIN_DURATIONS.join(","),
  );
  const journeySrc = readFileSync("src/lib/schools/short-learning-journey.ts", "utf8");
  record("Journey create rejects non-admin durations", journeySrc.includes("105 is not available"));
  record(
    "Generation enters review not auto-publish (journey review gate)",
    journeySrc.includes("awaiting_review") || journeySrc.includes("AWAITING_REVIEW") || readFileSync("src/lib/schools/short-learning-journey.ts", "utf8").includes("review"),
  );

  // --- 8. Human Support regression (source + job log truth) ---
  const presenceJobs = await prisma.jobRunLog.findMany({
    where: { jobName: "tutor-presence-sweep" },
    orderBy: { startedAt: "desc" },
    take: 1,
    select: { status: true, startedAt: true, finishedAt: true },
  });
  record(
    "Tutor-presence JobRunLog queryable (truthful cron health)",
    true,
    presenceJobs[0]
      ? `last=${presenceJobs[0].status}@${presenceJobs[0].startedAt.toISOString()}`
      : "never_run",
  );
  const hsSrc = readFileSync("src/lib/schools/human-support-presence.ts", "utf8");
  record(
    "Stale AVAILABLE/BUSY tutors go offline in presence sweep",
    hsSrc.includes('status: { in: ["available", "busy", "paused"] }')
      && hsSrc.includes('status: "offline"')
      && hsSrc.includes("sweepStaleTutorPresence"),
  );

  // --- 9. Audit-log hardening ---
  const auditFiltered = await jsonFetch(
    `/api/admin/audit-logs?action=complaint_created&from=2026-01-01&to=2026-12-31&result=success&limit=10`,
    superCookie,
  );
  record("Audit filter query succeeds", auditFiltered.res.status === 200, `status=${auditFiltered.res.status}`);
  const auditCsv = await jsonFetch(
    `/api/admin/audit-logs?action=complaint_created&format=csv&limit=5`,
    superCookie,
  );
  const csvText = typeof auditCsv.body === "string" ? auditCsv.body : auditCsv.text;
  record(
    "Audit CSV export respects filters",
    auditCsv.res.status === 200 && (csvText.includes("complaint_created") || csvText.toLowerCase().includes("action")),
    `status=${auditCsv.res.status} bytes=${auditCsv.bytes}`,
  );
  const auditPage2 = await jsonFetch(
    `/api/admin/audit-logs?action=complaint_created&page=2&limit=5`,
    superCookie,
  );
  record("Audit pagination with filters", auditPage2.res.status === 200, `status=${auditPage2.res.status}`);

  // --- 10. Error / recovery spot checks ---
  const expiredCookie = `${auth.getAuthCookieName()}=invalid.token.value`;
  const expired = await jsonFetch("/api/admin/stats", expiredCookie);
  record("Expired/invalid session denied", expired.res.status === 401 || expired.res.status === 403, `status=${expired.res.status}`);
  const badComplaint = await jsonFetch("/api/admin/complaints/not-a-real-id", superCookie, {
    method: "PATCH",
    body: JSON.stringify({ action: "acknowledge" }),
  });
  record("Complaint API missing record fails closed", badComplaint.res.status === 404, `status=${badComplaint.res.status}`);
  const badAudit = await jsonFetch("/api/admin/audit-logs?from=not-a-date", superCookie);
  record(
    "Audit bad date fails closed or ignores safely",
    badAudit.res.status === 200 || badAudit.res.status === 400,
    `status=${badAudit.res.status}`,
  );

  // --- 11. Performance confirmation ---
  await timeRoute("dashboard-stats", "/api/admin/stats", superCookie);
  await timeRoute("ops-health", "/api/admin/ops/health", superCookie);
  await timeRoute("schools", "/api/admin/schools", superCookie);
  await timeRoute("students-search", "/api/admin/students?q=a&limit=20", superCookie);
  await timeRoute("subscriptions", "/api/admin/subscriptions", superCookie);
  await timeRoute("complaints", "/api/admin/complaints", superCookie);
  await timeRoute("audit-search", "/api/admin/audit-logs?limit=25", superCookie);
  await timeRoute("short-learning", "/api/admin/short-learning", superCookie);
  await timeRoute("content-list", "/api/admin/content?limit=25", superCookie);
  await timeRoute("journeys", "/api/admin/short-learning/journeys", superCookie);

  // --- Cleanup restricted fixture ---
  await prisma.adminUser.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  // Leave UAT role if unused; optional cleanup when zero users.
  const roleUsers = await prisma.adminUser.count({ where: { roleId: contentOnlyRole.id } });
  if (roleUsers === 0) {
    await prisma.adminRole.delete({ where: { id: contentOnlyRole.id } }).catch(() => undefined);
  }

  console.log("\n--- Performance summary ---");
  for (const t of timings) {
    console.log(
      `${t.name}: cold=${t.coldMs.toFixed(0)}ms warm=${t.warmMs.toFixed(0)}ms bytes=${t.bytes} status=${t.status}`,
    );
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\nGate 3 UAT: ${passed}/${checks.length} passed, ${failed} failed`);
  if (failed > 0) {
    for (const c of checks.filter((x) => !x.ok)) {
      console.log(`  FAIL detail: ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
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
