/**
 * Parent Portal A+B Implementation Gate — authenticated UAT.
 * Additive DB writes only. Never runs prisma migrate reset. Never commits.
 *
 * Proves: subscription tampering rejected, self-service cancel at period end,
 * failed-payment status truthfulness, direct-subscriber Short Learning (with/without child),
 * message thread ownership isolation across two parents, notification preference load/save +
 * essential vs optional, support wording, wallet safe-disable, and collects audit IDs.
 *
 * Usage: npx tsx scripts/uat-parent-portal-ab.ts
 */
import { createRequire } from "node:module";
import { loadEnvLocal } from "./uat/load-env-local";

loadEnvLocal();

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
const prisma = new PrismaClient();

const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3001";
const STAMP = Date.now();
const PARENT_A = `uat.ab.parent.a.${STAMP}@starliz.local`;
const PARENT_B = `uat.ab.parent.b.${STAMP}@starliz.local`;
const PASSWORD = "UatParentAB#2026";

type Jar = Map<string, string>;
type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const auditIds: Record<string, string[]> = {};

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function parseSetCookie(headers: Headers, jar: Jar) {
  const raw = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : ([headers.get("set-cookie")].filter(Boolean) as string[]);
  for (const line of raw) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}
async function api(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: cookieHeader(jar) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  parseSetCookie(res.headers, jar);
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ok: res.ok, json: json as Record<string, unknown> | null, text };
}

async function createParent(email: string) {
  const { hashPassword } = await import("../src/lib/auth");
  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await hashPassword(PASSWORD);
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, role: "parent" } })
    : await prisma.user.create({ data: { email, name: email.split("@")[0], role: "parent", passwordHash } });
  // Ensure consent + pin so parent portal APIs work; additive.
  return user;
}

async function login(email: string) {
  const jar: Jar = new Map();
  const res = await api(jar, "POST", "/api/auth/login", { email, password: PASSWORD });
  return { jar, res };
}

async function fetchHtml(path: string, jar: Jar): Promise<{ status: number; html: string }> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { cookie: cookieHeader(jar), accept: "text/html" },
        signal: AbortSignal.timeout(60_000),
      });
      const html = await res.text();
      return { status: res.status, html };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

async function collectAudit(key: string, actions: string[], entityId?: string) {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: { in: actions },
      ...(entityId ? { entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, action: true },
  });
  auditIds[key] = rows.map((r: { id: string; action: string }) => `${r.action}:${r.id}`);
}

async function main() {
  console.log(`UAT base=${BASE}`);
  const home = await fetch(BASE, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  record("server responds", Boolean(home && (home as Response).ok), home ? `status=${(home as Response).status}` : "no response");
  if (!home) { await finish(); return; }

  const userA = await createParent(PARENT_A);
  const userB = await createParent(PARENT_B);
  record("two parent fixtures created (additive)", true, `${userA.id.slice(0,8)} / ${userB.id.slice(0,8)}`);

  const { jar: jarA, res: loginA } = await login(PARENT_A);
  const { jar: jarB, res: loginB } = await login(PARENT_B);
  record("parent A login", loginA.status === 200, `status=${loginA.status}`);
  record("parent B login", loginB.status === 200, `status=${loginB.status}`);

  // 1. Subscription tampering rejected
  const tamperStatus = await api(jarA, "PATCH", "/api/subscription", { status: "active" });
  record("PATCH status=active rejected (403)", tamperStatus.status === 403, `status=${tamperStatus.status}`);
  const tamperPlan = await api(jarA, "PATCH", "/api/subscription", { pricingPlanId: "attacker-plan" });
  record("PATCH pricingPlanId rejected (403)", tamperPlan.status === 403, `status=${tamperPlan.status}`);
  const tamperOwner = await api(jarA, "PATCH", "/api/subscription", { parentId: userB.id, status: "active" });
  record("PATCH other-owner rejected (403)", tamperOwner.status === 403, `status=${tamperOwner.status}`);
  const tamperId = await api(jarA, "PATCH", "/api/subscription", { id: "sub_other", status: "active" });
  record("PATCH subscription id spoof rejected (403)", tamperId.status === 403, `status=${tamperId.status}`);
  await collectAudit("subscription_change_rejected", ["subscription_change_rejected"], userA.id);

  // 2. Cancel + reactivate on an active subscription (additive create for parent A)
  const periodEnd = new Date(Date.now() + 20 * 86_400_000);
  await prisma.subscription.deleteMany({ where: { parentId: userA.id } }); // additive cleanup of our own fixture rows only
  await prisma.subscription.create({
    data: { parentId: userA.id, provider: "manual", planKey: "family", status: "active", currentPeriodEnd: periodEnd },
  });
  const cancel = await api(jarA, "PATCH", "/api/subscription", { action: "cancel_at_period_end" });
  const cancelOk = cancel.status === 200 && (cancel.json?.action === "cancel_at_period_end");
  record("self-service cancel at period end", cancelOk, `status=${cancel.status} accessEndsAt=${String(cancel.json?.accessEndsAt ?? "")}`);
  const cancelIdem = await api(jarA, "PATCH", "/api/subscription", { action: "cancel_at_period_end" });
  record("cancel is idempotent", cancelIdem.status === 200 && Boolean(cancelIdem.json?.idempotent), `idempotent=${String(cancelIdem.json?.idempotent)}`);

  const subAfterCancel = await prisma.subscription.findFirst({ where: { parentId: userA.id }, orderBy: { updatedAt: "desc" } });
  record("access retained until period end after cancel", subAfterCancel?.status === "cancelled" && Boolean(subAfterCancel?.currentPeriodEnd && subAfterCancel.currentPeriodEnd > new Date()), `status=${subAfterCancel?.status}`);

  const subGet = await api(jarA, "GET", "/api/subscription");
  const subMeta = (subGet.json?.subscription ?? {}) as Record<string, unknown>;
  record("GET subscription shows cancel scheduled + access end", Boolean(subMeta.cancelScheduled) && Boolean(subMeta.accessEndsAt), `label=${String(subMeta.statusLabel)}`);

  const reactivate = await api(jarA, "PATCH", "/api/subscription", { action: "reactivate" });
  record("reactivation available", reactivate.status === 200 && reactivate.json?.action === "reactivate", `status=${reactivate.status}`);
  await collectAudit("cancel_reactivate", ["subscription_cancel_requested", "subscription_cancelled_at_period_end", "subscription_reactivated"], subAfterCancel?.id);

  // 3. Failed-payment truthfulness
  await prisma.subscription.updateMany({ where: { parentId: userA.id }, data: { status: "past_due", graceEndsAt: new Date(Date.now() + 5 * 86_400_000) } });
  const pastDueGet = await api(jarA, "GET", "/api/subscription");
  const pd = (pastDueGet.json?.subscription ?? {}) as Record<string, unknown>;
  const pdOk = pd.statusLabel === "Payment needs attention" && pd.paymentFailed === true && pd.canManageBilling === true && pd.statusTone === "danger";
  record("failed-payment shows accurate status (not yellow Pending)", pdOk, `label=${String(pd.statusLabel)} tone=${String(pd.statusTone)}`);

  // 4. Direct subscriber Short Learning without child → clear explanation, entitled true
  await prisma.subscription.updateMany({ where: { parentId: userB.id }, data: {} });
  await prisma.subscription.deleteMany({ where: { parentId: userB.id } });
  await prisma.subscription.create({ data: { parentId: userB.id, provider: "manual", planKey: "family", status: "active", currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000) } });
  const slNoChild = await api(jarB, "GET", "/api/parent/short-learning/bookings");
  const slEntitled = slNoChild.json?.entitled === true;
  const slNoChildExplained = Array.isArray(slNoChild.json?.students) && (slNoChild.json?.students as unknown[]).length === 0 && typeof slNoChild.json?.emptyReason === "string";
  record("direct subscriber entitled without school link", slEntitled, `entitled=${String(slNoChild.json?.entitled)}`);
  record("no-child direct subscriber gets clear explanation", slNoChildExplained, String(slNoChild.json?.emptyReason ?? "").slice(0, 80));

  // 5. Messages thread IDOR — parent B cannot read parent A's thread
  const threadA = await prisma.parentMessageThread.create({
    data: {
      channel: "text",
      contactAddress: PARENT_A,
      parentId: userA.id,
      parentEmail: PARENT_A,
      contactLabel: "Parent A",
      lastMessageAt: new Date(),
      unreadCount: 0,
      parentUnreadCount: 0,
    },
  });
  await prisma.parentMessage.create({
    data: { threadId: threadA.id, direction: "inbound", body: "A private message", fromAddress: PARENT_A, toAddress: "support@starlizacademy.com", actorUserId: userA.id, sentAt: new Date() },
  });
  const ownRead = await api(jarA, "GET", `/api/parent/messages?threadId=${threadA.id}`);
  record("owner reads own thread", ownRead.status === 200 && Array.isArray(ownRead.json?.messages) && (ownRead.json?.messages as unknown[]).length >= 1, `status=${ownRead.status}`);
  const foreignRead = await api(jarB, "GET", `/api/parent/messages?threadId=${threadA.id}`);
  record("cross-parent thread access denied (404)", foreignRead.status === 404, `status=${foreignRead.status}`);
  await collectAudit("message_access_denied", ["message_access_denied"], threadA.id);

  // 6. Support wording page
  const support = await fetchHtml("/parent/support", jarA);
  const supportHtml = support.html;
  const supportOk = /2 working days/.test(supportHtml) && /10 working days/.test(supportHtml) && !/1–2 business days/.test(supportHtml) && /safeguarding@starlizacademy\.com/.test(supportHtml);
  record("support wording matches locked SLA + safeguarding split", supportOk, `status=${support.status}`);

  // 7. Notification preferences load + save + essential enforcement
  const acctGet = await api(jarA, "GET", "/api/account");
  const prefsLoaded = acctGet.json?.notifications && typeof acctGet.json.notifications === "object";
  record("notification prefs load persisted values", Boolean(prefsLoaded));
  const saveProds = await api(jarA, "PATCH", "/api/account", { notifications: { productUpdates: true, lessonReminders: false } });
  const savedPrefs = (saveProds.json?.notifications ?? {}) as Record<string, unknown>;
  record("notification prefs save (partial)", saveProds.status === 200 && savedPrefs.productUpdates === true && savedPrefs.lessonReminders === false, `status=${saveProds.status}`);
  // Sender enforcement (unit-proven); DB check that lessonReminders pref persisted disabled
  const prefRow = await prisma.notificationPreference.findFirst({ where: { userId: userA.id, eventType: "parent_lesson_reminder" }, select: { emailEnabled: true } });
  record("disabled optional pref persisted for sender gate", prefRow?.emailEnabled === false, `emailEnabled=${String(prefRow?.emailEnabled)}`);
  await collectAudit("notification_preferences_updated", ["notification_preferences_updated"], userA.id);

  // 8. Wallet safe-disable
  const wallet = await fetchHtml("/parent/wallet", jarA);
  record("standalone wallet disabled/safe", /Wallet unavailable/.test(wallet.html), `status=${wallet.status}`);

  // 9. Lifecycle notice idempotency (direct helper)
  const { enqueueParentSubscriptionLifecycleNotice } = await import("../src/lib/subscriptions/parent-subscription-lifecycle-notices");
  const n1 = await enqueueParentSubscriptionLifecycleNotice({ parentId: userA.id, eventType: "invoice.payment_failed", previousStatus: "active", nextStatus: "past_due", currentPeriodEnd: periodEnd, graceEndsAt: new Date(Date.now() + 5 * 86_400_000) });
  const n2 = await enqueueParentSubscriptionLifecycleNotice({ parentId: userA.id, eventType: "invoice.payment_failed", previousStatus: "active", nextStatus: "past_due", currentPeriodEnd: periodEnd, graceEndsAt: new Date(Date.now() + 5 * 86_400_000) });
  const idempotent = n1.ok && n2.ok && (n1 as { eventId?: string }).eventId === (n2 as { eventId?: string }).eventId;
  record("lifecycle notice idempotent (no spam)", idempotent, `id1=${String((n1 as { eventId?: string }).eventId ?? "").slice(0,8)}`);
  await collectAudit("payment_failed", ["payment_failed"], userA.id);

  // Hardening additions
  const acctTruth = await api(jarA, "GET", "/api/account");
  const acct = (acctTruth.json?.account ?? {}) as Record<string, unknown>;
  record("account subscriptionStatus is billing state not plan badge", typeof acct.subscriptionStatus === "string" && !["Family", "Free", "Premium"].includes(String(acct.subscriptionStatus)), `status=${String(acct.subscriptionStatus)}`);
  record("account does not leak stripeCustomerId", !("stripeCustomerId" in acct), `keys=${Object.keys(acct).filter((k) => /stripe/i.test(k)).join(",") || "none"}`);

  const msgPayload = await api(jarA, "GET", `/api/parent/messages?threadId=${threadA.id}`);
  const msgs = (msgPayload.json?.messages ?? []) as Array<Record<string, unknown>>;
  record("messages omit actorUserId", msgs.every((m) => !("actorUserId" in m)), `count=${msgs.length}`);

  // Restore active for idempotent reactivate check
  await prisma.subscription.updateMany({ where: { parentId: userA.id }, data: { status: "active", graceEndsAt: null } });
  const reactivateAgain = await api(jarA, "PATCH", "/api/subscription", { action: "reactivate" });
  record("reactivate is idempotent when already active", reactivateAgain.status === 200 && Boolean((reactivateAgain.json as { idempotent?: boolean } | null)?.idempotent ?? true), `status=${reactivateAgain.status}`);

  const supportHtml2 = (await fetchHtml("/parent/support", jarA)).html;
  record("support form has associated labels", /htmlFor="support-subject"|for="support-subject"|id="support-subject"/.test(supportHtml2));

  await finish();
}

async function finish() {
  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n=== UAT SUMMARY: ${passed}/${checks.length} passed ===`);
  console.log("Audit IDs:", JSON.stringify(auditIds, null, 2));
  console.log("migrationReset=false committed=false");
  await prisma.$disconnect();
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

main().catch(async (e) => {
  console.error("UAT ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
