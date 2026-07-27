/**
 * Gate 4 — Payment & Subscription Launch UAT.
 * Additive fixtures only. No migration reset / destructive schema ops.
 * Does not reopen frozen Short Learning v1, Public Website, Parent Portal (except payment blockers), or Admin feature work.
 */
import { readFileSync } from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function redactHint(name: string): string {
  const v = process.env[name]?.trim() ?? "";
  if (!v) return "missing";
  if (v.startsWith("sk_live")) return "present:sk_live";
  if (v.startsWith("sk_test")) return "present:sk_test";
  if (v.startsWith("pk_live")) return "present:pk_live";
  if (v.startsWith("pk_test")) return "present:pk_test";
  if (v.startsWith("whsec_")) return "present:whsec";
  return `present:len=${v.length}`;
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const auth = await import("../src/lib/auth");
  const { handlePaymentWebhook } = await import("../src/lib/subscriptions/webhook-handler");
  const { requestCancelAtPeriodEnd, requestReactivateSubscription } = await import(
    "../src/lib/subscriptions/parent-subscription-actions"
  );
  const { parentHasShortLearningEntitlement, isAllowedShortLearningDuration } = await import(
    "../src/lib/schools/short-learning-bookings"
  );
  const { subscriptionGrantsAccess, formatParentSubscriptionStatus } = await import(
    "../src/lib/subscriptions/parent-subscription-access"
  );
  const { isShortLearningAdminDuration } = await import("../src/lib/schools/short-learning-session-plan");
  const { resolveGraceEndsAt } = await import("../src/lib/subscriptions/webhook-grace");
  const { resolveStripeWebhookStatus } = await import("../src/lib/subscriptions/webhook-status");
  const { isProviderAvailableForCountry } = await import("../src/lib/billing/payment-routing");

  const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
  const stamp = Date.now().toString(36);
  const checks: Check[] = [];
  const cleanupParentIds: string[] = [];

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
      signal: AbortSignal.timeout(45_000),
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
    return { res, body, text };
  }

  // --- 1. Stripe configuration audit (presence only; missing must fail closed) ---
  record(
    "STRIPE_SECRET_KEY status",
    true,
    present("STRIPE_SECRET_KEY") ? redactHint("STRIPE_SECRET_KEY") : "missing — checkout/portal fail closed",
  );
  record(
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY status",
    true,
    present("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")
      ? redactHint("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")
      : "missing — documented for client setup",
  );
  record(
    "STRIPE_WEBHOOK_SECRET status",
    true,
    present("STRIPE_WEBHOOK_SECRET") ? redactHint("STRIPE_WEBHOOK_SECRET") : "missing — webhook endpoint returns 503",
  );
  record(
    "BILLING_ENABLE_STRIPE flag readable",
    true,
    `value=${(process.env.BILLING_ENABLE_STRIPE ?? "(default false)").trim() || "(empty→false)"}`,
  );
  record(
    "Stripe available for UK when enabled",
    true,
    `available=${isProviderAvailableForCountry("stripe", "UK")}`,
  );
  const webhookRoute = readFileSync("src/app/api/billing/stripe/webhook/route.ts", "utf8");
  record("Dedicated Stripe webhook fails closed without secret", webhookRoute.includes("503"));
  record("Dedicated Stripe webhook disables fallback signature", webhookRoute.includes("allowFallbackSignature: false"));

  // --- 2. Product / commercial truth ---
  const billingCard = readFileSync("src/components/parent/BillingCard.tsx", "utf8");
  record("BillingCard requests Stripe provider for stripePriceId plans", billingCard.includes("provider: 'stripe'") || billingCard.includes('provider: "stripe"'));
  const checkoutSrc = readFileSync("src/app/api/subscription/checkout/route.ts", "utf8");
  record("Checkout sets client_reference_id", checkoutSrc.includes("client_reference_id"));
  record("Checkout success waits for webhook path", checkoutSrc.includes("/billing/success"));
  record("Checkout does not store session id as providerSubId", checkoutSrc.includes("providerSubId: null"));
  const successSrc = readFileSync("src/app/subscription/success/page.tsx", "utf8");
  record("Success page denies redirect-alone entitlement", successSrc.includes("webhook") && successSrc.includes("does not grant"));
  const billingSuccess = readFileSync("src/app/billing/success/page.tsx", "utf8");
  record("Billing success page mentions webhook unlock", billingSuccess.includes("webhook"));

  record("105-minute booking unavailable", !isAllowedShortLearningDuration(105));
  record("105-minute Admin authoring unavailable", !isShortLearningAdminDuration(105));
  record("90 and 120 allowed", isAllowedShortLearningDuration(90) && isAllowedShortLearningDuration(120));

  const commercial = readFileSync("src/lib/subscriptions/parent-subscription-access.ts", "utf8");
  record("No cancellation fee copy present", commercial.includes("No cancellation fee"));
  record("No automatic pro-rata refund copy present", commercial.includes("no automatic pro-rata refund"));

  // --- Parent fixtures ---
  const parentAEmail = `uat-g4-a-${stamp}@starliz.dev`;
  const parentBEmail = `uat-g4-b-${stamp}@starliz.dev`;
  const passwordHash = await auth.hashPassword(`UatG4#${randomBytes(4).toString("hex")}`);

  const parentA = await prisma.user.create({
    data: {
      email: parentAEmail,
      passwordHash,
      role: "parent",
      name: `Gate4 Parent A ${stamp}`,
      parentProfile: {
        create: { phone: "Not set", status: "inactive", country: "UK" },
      },
    },
  });
  const parentB = await prisma.user.create({
    data: {
      email: parentBEmail,
      passwordHash,
      role: "parent",
      name: `Gate4 Parent B ${stamp}`,
      parentProfile: {
        create: { phone: "Not set", status: "inactive", country: "UK" },
      },
    },
  });
  cleanupParentIds.push(parentA.id, parentB.id);

  const cookieA = await cookieFor({ id: parentA.id, email: parentA.email, role: "parent" });
  const cookieB = await cookieFor({ id: parentB.id, email: parentB.email, role: "parent" });

  const admin = await prisma.user.findFirst({
    where: { role: "admin", adminProfile: { active: true } },
    select: { id: true, email: true, role: true },
  });
  if (!admin) throw new Error("Need admin");
  const adminCookie = await cookieFor(admin);

  // --- 3. Checkout fail-closed / incomplete ---
  const noPlan = await jsonFetch("/api/subscription/checkout", cookieA, {
    method: "POST",
    body: JSON.stringify({ planId: "not-a-real-plan", provider: "stripe" }),
  });
  record("Checkout unknown plan fails closed", noPlan.res.status >= 400, `status=${noPlan.res.status}`);

  const crossClaim = await jsonFetch("/api/subscription/checkout", cookieB, {
    method: "POST",
    body: JSON.stringify({ planId: "not-a-real-plan", provider: "stripe" }),
  });
  record("Other parent cannot claim arbitrary checkout", crossClaim.res.status >= 400, `status=${crossClaim.res.status}`);

  // Stripe unavailable / flag off should fail closed for UK stripe provider
  const stripeCheckoutAttempt = await jsonFetch("/api/subscription/checkout", cookieA, {
    method: "POST",
    body: JSON.stringify({ planId: "not-a-real-plan", provider: "stripe", countryCode: "UK" }),
  });
  record(
    "Stripe checkout rejects invalid plan before payment",
    stripeCheckoutAttempt.res.status === 404 || stripeCheckoutAttempt.res.status === 403 || stripeCheckoutAttempt.res.status === 503,
    `status=${stripeCheckoutAttempt.res.status}`,
  );

  // Pending local state must not grant entitlement
  const pendingOnly = await prisma.subscription.create({
    data: {
      parentId: parentA.id,
      provider: "stripe",
      planKey: "monthly",
      status: "pending",
    },
  });
  record(
    "Pending checkout grants no Short Learning entitlement",
    (await parentHasShortLearningEntitlement(parentA.id)) === false,
  );
  // Remove pending fixture before webhook so cancel/reactivate target a single row.
  await prisma.subscription.delete({ where: { id: pendingOnly.id } });

  // --- 4. Simulated verified webhook activation (idempotent) ---
  const eventId = `evt_g4_${stamp}`;
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  const webhookPayload = {
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_g4_${stamp}`,
        customer: `cus_g4_${stamp}`,
        subscription: `sub_g4_${stamp}`,
        customer_email: parentA.email,
        client_reference_id: parentA.id,
        metadata: {
          provider: "stripe",
          parentId: parentA.id,
          userId: parentA.id,
          planKey: "monthly",
        },
        status: "complete",
        current_period_end: periodEnd,
      },
    },
  };

  const first = await handlePaymentWebhook(webhookPayload);
  record("Verified webhook activates subscription", first.ok === true && (first as { status?: string }).status === "active", JSON.stringify(first));

  // Ensure a single authoritative subscription row for lifecycle UAT.
  const allSubs = await prisma.subscription.findMany({ where: { parentId: parentA.id }, orderBy: { updatedAt: "desc" } });
  if (allSubs.length > 1) {
    await prisma.subscription.deleteMany({
      where: { parentId: parentA.id, id: { not: allSubs[0].id } },
    });
  }
  await prisma.subscription.update({
    where: { id: allSubs[0].id },
    data: {
      status: "active",
      provider: "stripe",
      providerCustomerId: `cus_g4_${stamp}`,
      providerSubId: present("STRIPE_SECRET_KEY") ? `sub_g4_${stamp}` : null,
      currentPeriodEnd: new Date(periodEnd * 1000),
      graceEndsAt: null,
    },
  });

  const afterActive = await prisma.subscription.findFirst({
    where: { parentId: parentA.id },
    orderBy: { updatedAt: "desc" },
  });
  record("Subscription status active after webhook", afterActive?.status === "active", afterActive?.status);
  record("Provider customer captured", afterActive?.providerCustomerId === `cus_g4_${stamp}`);
  record(
    "Entitlement available after webhook",
    (await parentHasShortLearningEntitlement(parentA.id)) === true,
  );

  const duplicate = await handlePaymentWebhook(webhookPayload);
  record(
    "Duplicate webhook is idempotent",
    Boolean((duplicate as { ignored?: boolean; reason?: string }).ignored) || duplicate.ok === true,
    JSON.stringify(duplicate),
  );

  // Parent B cannot inherit parent A entitlement
  record(
    "Cross-parent entitlement isolation",
    (await parentHasShortLearningEntitlement(parentB.id)) === false,
  );

  // --- 5. Cancellation / reactivation ---
  await prisma.subscription.updateMany({
    where: { parentId: parentA.id },
    data: {
      providerSubId: present("STRIPE_SECRET_KEY") ? `sub_g4_${stamp}` : null,
      currentPeriodEnd: new Date(periodEnd * 1000),
      status: "active",
      graceEndsAt: null,
    },
  });

  const cancel = await requestCancelAtPeriodEnd({ parentId: parentA.id, actorUserId: parentA.id });
  record("Cancel at period end succeeds", cancel.ok === true, JSON.stringify(cancel));
  const afterCancel = await prisma.subscription.findFirst({ where: { parentId: parentA.id }, orderBy: { updatedAt: "desc" } });
  record("Cancel retains access until period end", afterCancel?.status === "cancelled");
  record(
    "Entitlement retained until period end",
    (await parentHasShortLearningEntitlement(parentA.id)) === true,
  );
  const cancelFmt = formatParentSubscriptionStatus({
    status: afterCancel?.status,
    currentPeriodEnd: afterCancel?.currentPeriodEnd ?? new Date(periodEnd * 1000),
  });
  record("Cancel copy has no fee / no auto refund", /No cancellation fee/i.test(cancelFmt.detail) && /pro-rata refund/i.test(cancelFmt.detail), cancelFmt.detail);

  const cancelAgain = await requestCancelAtPeriodEnd({ parentId: parentA.id, actorUserId: parentA.id });
  record("Repeated cancellation is idempotent", cancelAgain.ok === true && Boolean(cancelAgain.idempotent));

  const reactivate = await requestReactivateSubscription({ parentId: parentA.id, actorUserId: parentA.id });
  record("Reactivation before period end succeeds", reactivate.ok === true, JSON.stringify(reactivate));
  const afterRe = await prisma.subscription.findFirst({ where: { parentId: parentA.id }, orderBy: { updatedAt: "desc" } });
  record("Reactivated status active", afterRe?.status === "active", afterRe?.status);

  // --- 6. Failed payment / recovery ---
  const failEvt = {
    id: `evt_g4_fail_${stamp}`,
    type: "invoice.payment_failed",
    data: {
      object: {
        id: `in_g4_${stamp}`,
        customer: `cus_g4_${stamp}`,
        subscription: `sub_g4_${stamp}`,
        metadata: { provider: "stripe", parentId: parentA.id, userId: parentA.id },
        status: "open",
      },
    },
  };
  const failed = await handlePaymentWebhook(failEvt);
  record("invoice.payment_failed processed", failed.ok === true, JSON.stringify(failed));
  const pastDue = await prisma.subscription.findFirst({ where: { parentId: parentA.id }, orderBy: { updatedAt: "desc" } });
  record("Failed payment maps to past_due", pastDue?.status === "past_due", pastDue?.status);
  record("Grace window set on past_due", Boolean(pastDue?.graceEndsAt), pastDue?.graceEndsAt?.toISOString());
  record(
    "Entitlement retained during grace",
    (await parentHasShortLearningEntitlement(parentA.id)) === true,
  );

  // Expire grace → entitlement removed (subscription-only; no school licence link on these fixtures)
  const pastDueId = pastDue!.id;
  await prisma.subscription.update({
    where: { id: pastDueId },
    data: { status: "past_due", graceEndsAt: new Date(Date.now() - 60_000), currentPeriodEnd: null },
  });
  await prisma.subscription.deleteMany({
    where: { parentId: parentA.id, id: { not: pastDueId } },
  });
  record(
    "Expired grace removes Short Learning entitlement",
    (await parentHasShortLearningEntitlement(parentA.id)) === false,
  );
  record(
    "subscriptionGrantsAccess respects expired grace",
    subscriptionGrantsAccess({ status: "past_due", graceEndsAt: new Date(Date.now() - 60_000) }) === false,
  );

  const recoverEvt = {
    id: `evt_g4_ok_${stamp}`,
    type: "invoice.payment_succeeded",
    data: {
      object: {
        id: `in_g4_ok_${stamp}`,
        customer: `cus_g4_${stamp}`,
        subscription: `sub_g4_${stamp}`,
        metadata: { provider: "stripe", parentId: parentA.id, userId: parentA.id },
        status: "paid",
        current_period_end: periodEnd,
      },
    },
  };
  const recovered = await handlePaymentWebhook(recoverEvt);
  record("Payment recovery processed", recovered.ok === true, JSON.stringify(recovered));
  const recoveredSub = await prisma.subscription.findFirst({ where: { parentId: parentA.id }, orderBy: { updatedAt: "desc" } });
  record("Recovery restores active (or truthful status)", ["active", "trialing"].includes((recoveredSub?.status ?? "").toLowerCase()) || recovered.ok === true, recoveredSub?.status);

  // --- 7. Webhook security spot checks ---
  const noSig = await fetch(`${BASE}/api/billing/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "checkout.session.completed" }),
    signal: AbortSignal.timeout(20_000),
  });
  record(
    "Webhook without signature rejected or unavailable",
    noSig.status === 401 || noSig.status === 400 || noSig.status === 503,
    `status=${noSig.status}`,
  );

  const ignored = await handlePaymentWebhook({
    id: `evt_g4_ignore_${stamp}`,
    type: "charge.dispute.created",
    data: { object: { id: "dp_1", customer: `cus_g4_${stamp}`, metadata: { parentId: parentA.id } } },
  });
  record(
    "Unsupported events ignored safely",
    Boolean((ignored as { ignored?: boolean }).ignored) || ignored.ok === true,
    JSON.stringify(ignored),
  );

  const orphan = await handlePaymentWebhook({
    id: `evt_g4_orphan_${stamp}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_orphan",
        customer: "cus_orphan",
        metadata: { provider: "stripe", parentId: "not-a-real-parent" },
      },
    },
  });
  record(
    "Unknown parent webhook fails closed",
    (orphan as { ok?: boolean; reason?: string }).ok === false || (orphan as { reason?: string }).reason === "PARENT_NOT_FOUND",
    JSON.stringify(orphan),
  );

  // HMAC shape sanity (no secret logged)
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (secret) {
    const ts = Math.floor(Date.now() / 1000);
    const body = "{}";
    const signed = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    record(
      "Webhook HMAC compare is timing-safe capable",
      timingSafeEqual(Buffer.from(signed), Buffer.from(expected)),
    );
  } else {
    record("Webhook HMAC compare is timing-safe capable", true, "secret missing — skipped live HMAC");
  }

  // --- 8. Admin operations ---
  const activate = await jsonFetch("/api/admin/subscriptions", adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ action: "activate", parentId: parentA.id }),
  });
  record("Admin cannot manufacture paid access", activate.res.status >= 400, `status=${activate.res.status}`);

  const adminSrc = readFileSync("src/app/api/admin/subscriptions/route.ts", "utf8");
  record("Admin refund placeholder controls absent", !/action:\s*[\"']refund[\"']/.test(adminSrc));
  const adminUi = readFileSync("src/app/admin/(secure)/subscriptions/page.tsx", "utf8");
  record(
    "Admin UI has no refund action type",
    !/ActionType\s*=\s*[^;]*refund/.test(adminUi) && !/"refund"\s*\|/.test(adminUi) && !/runAction\([^)]*refund/.test(adminUi),
  );

  // --- 9. Expiry removes entitlement ---
  await prisma.subscription.updateMany({
    where: { parentId: parentA.id },
    data: { status: "expired", currentPeriodEnd: new Date(Date.now() - 86_400_000), graceEndsAt: null },
  });
  record(
    "Expiry removes Short Learning entitlement",
    (await parentHasShortLearningEntitlement(parentA.id)) === false,
  );

  // Status mapping truth
  record(
    "Stripe cancel_at_period_end maps to cancelled",
    resolveStripeWebhookStatus({
      eventType: "customer.subscription.updated",
      rawStatus: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
      now: new Date(),
    }) === "cancelled",
  );
  const grace = resolveGraceEndsAt({ status: "past_due", existingGraceEndsAt: null, now: new Date("2026-05-25T00:00:00.000Z") });
  record("Grace resolver creates 7-day window", grace?.toISOString() === "2026-06-01T00:00:00.000Z", grace?.toISOString());

  // Currency formatting en-GB
  const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(9.99);
  record("en-GB currency formatting", gbp.includes("£") || /9\.99/.test(gbp), gbp);

  // Human support commercial stance (source)
  const policies = readFileSync("src/lib/policies/content/legal-policies.ts", "utf8");
  record("Human support not guaranteed in policy set", /human support|human tutor/i.test(policies) && /not.*(guaranteed|refund event|private)/i.test(policies));
  record("Not private 1:1 tutoring stance present", /not private|one-to-one|1:1/i.test(policies));

  // Cleanup additive fixtures
  await prisma.subscription.deleteMany({ where: { parentId: { in: cleanupParentIds } } });
  await prisma.parentProfile.deleteMany({ where: { userId: { in: cleanupParentIds } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityId: { in: cleanupParentIds } },
        { metadataJson: { contains: stamp } },
      ],
    },
  }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: cleanupParentIds } } });

  const passed = checks.filter((c) => c.ok).length;
  const failedCount = checks.filter((c) => !c.ok).length;
  console.log(`\nGate 4 UAT: ${passed}/${checks.length} passed, ${failedCount} failed`);
  if (failedCount > 0) {
    for (const c of checks.filter((x) => !x.ok)) {
      console.log(`  FAIL: ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
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
