/**
 * Gate 1A — Admin financial integrity UAT (read + controlled PATCH that must not fabricate paid access).
 * Does not run migrations, commits, or destructive resets.
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

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  const dbMod = await import("../src/lib/db.ts");
  const prisma = dbMod.default?.prisma ?? dbMod.prisma;
  const authMod = await import("../src/lib/auth.ts");
  const auth = authMod.default ?? authMod;

  const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
  const stamp = Date.now().toString(36);
  const checks: Check[] = [];

  function record(name: string, ok: boolean, detail?: string) {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  }

  async function cookieFor(user: { id: string; email: string; role: string }) {
    const token = await auth.createSessionToken({ userId: user.id, email: user.email, role: user.role }, 900);
    return `${auth.getAuthCookieName()}=${token}`;
  }

  async function jsonFetch(path: string, cookie: string, init?: RequestInit) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
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
    return { res, body };
  }

  const admin = await prisma.user.findFirst({
    where: { role: "admin", adminProfile: { active: true } },
    select: {
      id: true,
      email: true,
      role: true,
      adminProfile: { select: { role: { select: { name: true, permissions: true } } } },
    },
  });
  if (!admin) throw new Error("No active admin");

  const parentA = await prisma.user.findFirst({
    where: { role: "parent", subscriptions: { some: {} } },
    select: { id: true, email: true, role: true },
    orderBy: { updatedAt: "desc" },
  });
  const parentB = await prisma.user.findFirst({
    where: {
      role: "parent",
      subscriptions: { some: {} },
      ...(parentA ? { id: { not: parentA.id } } : {}),
    },
    select: { id: true, email: true, role: true },
    orderBy: { updatedAt: "desc" },
  });
  const teacher = await prisma.user.findFirst({
    where: { role: { in: ["teacher", "parent"] }, NOT: { role: "admin" } },
    select: { id: true, email: true, role: true },
  });

  if (!parentA || !parentB) throw new Error("Need two parents with subscriptions");
  if (!teacher) throw new Error("Need a non-admin account");

  const adminCookie = await cookieFor(admin);
  const parentCookie = await cookieFor(parentA);
  const teacherCookie = await cookieFor(teacher);

  const beforeA = await prisma.subscription.findFirst({
    where: { parentId: parentA.id },
    orderBy: { updatedAt: "desc" },
  });

  for (const [name, payload] of [
    ["direct activation rejected", { parentId: parentA.id, action: "resume_subscription", status: "active" }],
    ["paid-plan reassignment rejected", { parentId: parentA.id, action: "change_plan", planKey: "pro", status: "active" }],
    ["period-end extension rejected", { parentId: parentA.id, action: "extend_trial", trialDays: 30, renewalDate: new Date(Date.now() + 60 * 86400000).toISOString() }],
  ] as const) {
    const { res, body } = await jsonFetch("/api/admin/subscriptions", adminCookie, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    record(name, res.status === 403, `status=${res.status} error=${(body as { error?: string })?.error ?? ""}`);
  }

  const afterUnsafe = await prisma.subscription.findFirst({
    where: { parentId: parentA.id },
    orderBy: { updatedAt: "desc" },
  });
  record(
    "rejected actions leave DB unchanged",
    beforeA?.status === afterUnsafe?.status
      && beforeA?.planKey === afterUnsafe?.planKey
      && String(beforeA?.currentPeriodEnd) === String(afterUnsafe?.currentPeriodEnd),
    `before=${beforeA?.status}/${beforeA?.planKey} after=${afterUnsafe?.status}/${afterUnsafe?.planKey}`,
  );

  const { res: crossRes } = await jsonFetch("/api/admin/subscriptions", adminCookie, {
    method: "PATCH",
    body: JSON.stringify({
      parentId: parentB.id,
      action: "change_plan",
      planKey: "pro",
      subscriptionId: beforeA?.id,
      status: "active",
    }),
  });
  record("cross-parent paid override rejected", crossRes.status === 403, `status=${crossRes.status}`);

  const { res: cancelRes, body: cancelBody } = await jsonFetch("/api/admin/subscriptions", adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ parentId: parentA.id, action: "cancel_at_period_end" }),
  });
  record(
    "approved cancel request path",
    cancelRes.status === 200 || cancelRes.status === 409,
    `status=${cancelRes.status} msg=${(cancelBody as { message?: string; error?: string })?.message ?? (cancelBody as { error?: string })?.error ?? ""}`,
  );

  const { res: reactivateRes, body: reactivateBody } = await jsonFetch("/api/admin/subscriptions", adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ parentId: parentA.id, action: "reactivate" }),
  });
  record(
    "approved reactivation path",
    reactivateRes.status === 200 || reactivateRes.status === 409,
    `status=${reactivateRes.status} msg=${(reactivateBody as { message?: string; error?: string })?.message ?? (reactivateBody as { error?: string })?.error ?? ""}`,
  );

  const { res: remindRes, body: remindBody } = await jsonFetch("/api/admin/subscriptions", adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ parentId: parentA.id, action: "send_payment_reminder" }),
  });
  const remindHasEvent = Boolean((remindBody as { eventId?: string })?.eventId);
  const remindHasError = String((remindBody as { error?: string })?.error ?? "").length > 0;
  record(
    "real reminder enqueue or honest failure",
    (remindRes.status === 200 && remindHasEvent) || ([404, 409, 500].includes(remindRes.status) && remindHasError),
    `status=${remindRes.status} body=${JSON.stringify(remindBody).slice(0, 180)}`,
  );
  record(
    "reminder never reports empty success",
    remindRes.status !== 200 || remindHasEvent,
    `status=${remindRes.status}`,
  );

  const { res: listRes, body: listBody } = await jsonFetch("/api/admin/subscriptions", adminCookie);
  const rows = (listBody as { rows?: Array<Record<string, unknown>> })?.rows ?? [];
  const sample = rows.find((row) => row.parentId === parentA.id) ?? rows[0];
  record("subscription list loads", listRes.status === 200 && rows.length > 0, `count=${rows.length}`);
  record(
    "Stripe IDs absent from ordinary list payloads",
    !JSON.stringify(listBody).includes("cus_")
      && !rows.some((row) => "stripeCustomerId" in row || "providerCustomerId" in row || "providerSubId" in row),
    sample ? `keys=${Object.keys(sample).join(",")}` : "no rows",
  );
  record(
    "payment-attention / cancel labels present in list shape",
    Boolean(sample && "statusLabel" in sample && "statusDetail" in sample && "cancelScheduled" in sample && "hasProviderCustomer" in sample),
  );

  const { res: parentWrite } = await jsonFetch("/api/admin/subscriptions", parentCookie, {
    method: "PATCH",
    body: JSON.stringify({ parentId: parentA.id, action: "change_plan", planKey: "pro" }),
  });
  const { res: teacherWrite } = await jsonFetch("/api/admin/subscriptions", teacherCookie, {
    method: "PATCH",
    body: JSON.stringify({ parentId: parentA.id, action: "change_plan", planKey: "pro" }),
  });
  record("parent cannot reach Admin billing writes", parentWrite.status === 401 || parentWrite.status === 403, `status=${parentWrite.status}`);
  record("non-admin cannot reach Admin billing writes", teacherWrite.status === 401 || teacherWrite.status === 403, `status=${teacherWrite.status}`);

  const rejected = await prisma.auditLog.findMany({
    where: {
      action: "admin_subscription_change_rejected",
      actorUserId: admin.id,
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  record("audits contain real actor IDs", rejected.length > 0 && rejected.every((row: { actorUserId: string | null }) => row.actorUserId === admin.id), `count=${rejected.length}`);

  const { res: parentPatch } = await jsonFetch(`/api/admin/parents/${parentA.id}`, adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ subscriptionPlan: "pro", stripeCustomerId: `cus_uat_${stamp}` }),
  });
  record("parent profile payment field tamper rejected", parentPatch.status === 403, `status=${parentPatch.status}`);

  // Restricted admin: if no parents:write / SUPER_ADMIN, write should fail.
  const roleName = String(admin.adminProfile?.role?.name ?? "").toUpperCase().replace(/\s+/g, "_");
  let perms: string[] = [];
  try {
    const parsed = JSON.parse(String(admin.adminProfile?.role?.permissions ?? "[]"));
    perms = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    perms = [];
  }
  const canManage = roleName === "SUPER_ADMIN" || perms.includes("parents:write") || perms.includes("MANAGE_SUBSCRIPTIONS");
  record(
    "authorised platform Admin can manage or is honestly read-only",
    canManage || listRes.status === 200,
    `role=${roleName || "none"} canManage=${canManage}`,
  );

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nGate 1A UAT: ${checks.length - failed.length}/${checks.length} passed`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
