import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { KNOWLEDGE_ARTICLES } from "../src/lib/knowledge/articles";
import { LOCKED_PROMISE } from "../src/lib/policies/locked-facts";
import {
  ALL_POLICY_DOCUMENTS,
  getPolicyBySlug,
  listLegalReviewRequired,
  listPublicPolicyDocuments,
  listStaffOnlyDocuments,
  POLICY_HUB_GROUPS,
} from "../src/lib/policies/registry";
import { SHORT_LEARNING_PROMISE } from "../src/lib/schools/short-learning-bookings";

const REQUIRED_LEGAL_SLUGS = [
  "terms",
  "privacy",
  "cookies",
  "subscription-terms",
  "booking-cancellation",
  "refund-policy",
  "acceptable-use",
  "accessibility",
  "complaints",
  "intellectual-property",
  "ai-use",
  "online-safety",
  "safeguarding",
  "data-protection",
  "data-retention",
  "account-suspension",
  "communications-policy",
  "security-incident-response",
] as const;

const REQUIRED_PRODUCT_SLUGS = [
  "short-learning-policy",
  "day-school-policy",
  "human-tutor-support",
  "ai-tutor-policy",
  "parent-responsibilities",
  "student-code",
  "tutor-code",
  "attendance-policy",
  "booking-reliability",
  "behaviour-policy",
  "assessment-progress",
  "learning-reports",
  "lesson-quality",
  "content-review",
  "ai-safety",
  "human-support-escalation",
  "tutor-availability-shifts",
  "incident-reporting",
  "quality-assurance",
] as const;

const REQUIRED_STAFF_SLUGS = [
  "tutor-handbook",
  "school-admin-ops",
  "platform-admin-ops",
  "human-support-runbook",
  "safeguarding-escalation",
  "incident-response",
  "ai-monitoring",
  "booking-capacity-guide",
  "tutor-shift-guide",
  "reminder-ops",
  "policy-review-procedure",
] as const;

function allText(docId: string): string {
  const doc = getPolicyBySlug(docId);
  assert.ok(doc, docId);
  return [
    doc.title,
    doc.summary,
    doc.purpose,
    doc.scope,
    ...doc.sections.flatMap((s) => [s.heading, ...s.body]),
  ]
    .join("\n")
    .toLowerCase();
}

test("Phase 6 registry contains the full launch document set", () => {
  assert.equal(ALL_POLICY_DOCUMENTS.length, 48);
  for (const slug of [...REQUIRED_LEGAL_SLUGS, ...REQUIRED_PRODUCT_SLUGS, ...REQUIRED_STAFF_SLUGS]) {
    assert.ok(getPolicyBySlug(slug), `missing ${slug}`);
  }
});

test("every public document has version/status metadata", () => {
  for (const doc of listPublicPolicyDocuments()) {
    assert.ok(doc.version);
    assert.ok(doc.status);
    assert.ok(doc.effectiveDate);
    assert.ok(doc.lastReviewed);
    assert.ok(doc.nextReview);
    assert.ok(doc.owner);
    assert.ok(doc.changeHistory.length > 0);
  }
});

test("legal policies are flagged for legal review", () => {
  const legal = listLegalReviewRequired();
  assert.equal(legal.length, REQUIRED_LEGAL_SLUGS.length);
  for (const slug of REQUIRED_LEGAL_SLUGS) {
    const doc = getPolicyBySlug(slug);
    assert.equal(doc?.legalReviewRequired, true);
    assert.match(doc?.status ?? "", /Draft|Under Review|Approved|Published|Archived/);
  }
});

test("policy hub groups resolve to existing documents", () => {
  for (const group of POLICY_HUB_GROUPS) {
    for (const slug of group.slugs) {
      assert.ok(getPolicyBySlug(slug), `hub missing ${slug}`);
    }
  }
});

test("locked AI promise and no cancellation-fee wording appear", () => {
  assert.equal(SHORT_LEARNING_PROMISE, LOCKED_PROMISE);
  const shortLearning = allText("short-learning-policy");
  assert.match(shortLearning, /ai teaching is guaranteed/);
  assert.match(shortLearning, /not a private 1:1 tutor booking|not named-tutor/);
  assert.match(shortLearning, /no cancellation fee/);
  assert.doesNotMatch(shortLearning, /guaranteed tutor support|book a tutor|your tutor is waiting|human tutor included/);

  const booking = allText("booking-cancellation");
  assert.match(booking, /no cancellation fee/);
  assert.doesNotMatch(booking, /cancellation charge applies|pay a cancellation fee/);
});

test("Day School and Short Learning remain distinct", () => {
  const day = allText("day-school-policy");
  const short = allText("short-learning-policy");
  assert.match(day, /parents do not book day school/);
  assert.match(day, /schooldaylesson|timetable/);
  assert.match(short, /parent-booked/);
  assert.doesNotMatch(short, /studentlearningbooking/);
  assert.match(short, /16:00/);
  assert.match(short, /90 or 120/);
});

test("human support policy does not guarantee tutors", () => {
  const text = allText("human-tutor-support");
  assert.match(text, /not guaranteed|safety net/);
  assert.match(text, /continues with ai/);
  assert.doesNotMatch(text, /guaranteed human tutor|named private tutor is reserved/);
});

test("subscription commercial stance is locked in Subscription Terms", () => {
  const text = allText("subscription-terms");
  assert.match(text, /14-day cooling-off|14-day cooling/);
  assert.match(text, /end of the current billing period/);
  assert.match(text, /cancel booking is not cancel subscription/);
  assert.match(text, /parent portal/i);
  assert.match(text, /7-day grace/);
  assert.match(text, /preferred commercial stance pending solicitor review/);
  assert.doesNotMatch(text, /open owner decision: final uk cooling-off/i);
});

test("refund policy separates booking refunds from cooling-off", () => {
  const text = allText("refund-policy");
  assert.match(text, /does not create a booking-fee refund|no per-booking fee/);
  assert.match(text, /14-day cooling-off/);
  assert.match(text, /cancel booking is not cancel subscription/);
});

test("refund commercial stance locks no automatic pro-rata and goodwill rules", () => {
  const text = allText("refund-policy");
  assert.match(text, /no automatic pro-rata refund/);
  assert.match(text, /goodwill refund/);
  assert.match(text, /never automatic/);
  assert.match(text, /no refund for unused/);
  assert.match(text, /no human tutor available does not equal a refund|human-tutor unavailability is not a refund/);
  assert.match(text, /school admin cannot approve financial refunds/i);
  assert.match(text, /payment provider/);
  assert.doesNotMatch(text, /open owner decision remaining: whether any goodwill/i);
});

test("data retention commercial schedule is locked with school and safeguarding carve-outs", () => {
  const text = allText("data-retention");
  assert.match(text, /commercial retention schedule pending solicitor/);
  assert.match(text, /school's approved retention schedule/);
  assert.match(text, /3 years after the session/);
  assert.match(text, /12 months after the session/);
  assert.match(text, /6 years from the end of the relevant financial year/);
  assert.match(text, /do not apply a short automatic deletion period/);
  assert.match(text, /90 days/);
  assert.doesNotMatch(text, /numeric retention schedules remain under legal and safeguarding review/i);
});

test("data protection policy defers school retention to school instructions", () => {
  const text = allText("data-protection");
  assert.match(text, /school's approved retention schedule|data retention policy/i);
  assert.match(text, /role-by-processing-purpose|data processor/i);
});

test("controller mapping locks Day School processor and direct Short Learning controller roles", () => {
  const text = allText("data-protection");
  assert.match(text, /preferred data-governance position pending solicitor/);
  assert.match(text, /school or academy trust is data controller/);
  assert.match(text, /starliz is data processor/i);
  assert.match(text, /subscriptions purchased directly by a parent, starliz is data controller/i);
  assert.match(text, /article 28-compliant data processing agreement/i);
  assert.match(text, /promptly refers it to the school/);
  assert.match(text, /not automatically all processors/i);
  assert.doesNotMatch(text, /open owner decision remaining: final controller/i);
});

test("privacy policy states public controller summary wording", () => {
  const text = allText("privacy");
  assert.match(text, /when a school provides starliz/i);
  assert.match(text, /when a parent buys short learning directly/i);
  assert.match(text, /promptly refers it to the school/);
});

test("accessibility statement locks WCAG 2.2 AA target without overclaiming compliance", () => {
  const text = allText("accessibility");
  assert.match(text, /wcag 2\.2 level aa/i);
  assert.match(text, /objective of conforming to wcag 2\.2 level aa/i);
  assert.match(text, /independent accessibility testing/i);
  assert.match(text, /keyboard navigation/i);
  assert.match(text, /does not claim that it is fully wcag 2\.2 aa compliant/i);
  assert.match(text, /does not claim.*fully accessible to all users/i);
  assert.doesNotMatch(text, /open owner decision: target wcag/i);
  assert.doesNotMatch(text, /starliz is fully wcag 2\.2 aa compliant/i);
});

test("complaints procedure locks response-time SLAs without overpromising remedies", () => {
  const text = allText("complaints");
  assert.match(text, /acknowledge ordinary complaints within 2 working days/i);
  assert.match(text, /substantive response to ordinary complaints within 10 working days/i);
  assert.match(text, /within 20 working days/i);
  assert.match(text, /within 1 working day/i);
  assert.match(text, /outside ordinary complaint slas/i);
  assert.match(text, /service targets/i);
  assert.doesNotMatch(text, /open owner decision: publish response-time slas/i);
  const terms = allText("terms");
  assert.match(terms, /2 working days/i);
  assert.match(terms, /complaints procedure/i);
});

test("staff handbooks are authenticated-only and absent from the public hub", () => {
  const staff = listStaffOnlyDocuments();
  assert.ok(staff.length >= 11);
  for (const slug of REQUIRED_STAFF_SLUGS) {
    const doc = getPolicyBySlug(slug);
    assert.equal(doc?.publicVisible, false, slug);
    assert.ok(!listPublicPolicyDocuments().some((d) => d.slug === slug), slug);
  }
  assert.ok(!POLICY_HUB_GROUPS.some((g) => /staff handbook/i.test(g.title)));
  const escalation = allText("safeguarding-escalation");
  assert.match(escalation, /outside ordinary complaint response-time slas/i);
  assert.match(escalation, /pending focused dsl and legal review/i);
});

test("subscription wording is consistent", () => {
  const text = allText("subscription-terms");
  assert.match(text, /no per-booking fee/);
  assert.match(text, /cancelling a short learning booking|cancel booking is not cancel subscription/i);
  assert.match(text, /no automatic pro-rata refund/);
});

test("AI transparency statement is present", () => {
  const text = allText("ai-use");
  assert.match(text, /ai teaching is guaranteed/);
  assert.match(text, /safety net when available/);
});

test("Knowledge Centre has required topic coverage without placeholders", () => {
  assert.ok(KNOWLEDGE_ARTICLES.length >= 40);
  const blob = KNOWLEDGE_ARTICLES.map((a) => `${a.title} ${a.summary} ${(a.body ?? []).join(" ")}`).join("\n");
  assert.doesNotMatch(blob.toLowerCase(), /todo|tbd|lorem ipsum|placeholder/);
  assert.match(blob, /Day School/);
  assert.match(blob, /Short Learning/);
  assert.match(blob, /no cancellation fee/i);
  assert.match(blob, /AI teaching is guaranteed/);
  for (const article of KNOWLEDGE_ARTICLES) {
    assert.ok(article.id && article.title && article.summary && article.category);
  }
});

test("canonical public routes exist as page modules", () => {
  const routes = [
    "src/app/privacy/page.tsx",
    "src/app/terms/page.tsx",
    "src/app/cookies/page.tsx",
    "src/app/safeguarding-policy/page.tsx",
    "src/app/data-retention/page.tsx",
    "src/app/ai-use/page.tsx",
    "src/app/policies/page.tsx",
    "src/app/policies/[slug]/page.tsx",
    "src/app/faq/page.tsx",
    "src/app/knowledge-centre/page.tsx",
    "src/app/school-admin/knowledge-library/page.tsx",
    "src/app/school-admin/knowledge-library/[slug]/page.tsx",
    "src/app/admin/(secure)/policy-library/page.tsx",
    "src/app/admin/(secure)/policy-library/[slug]/page.tsx",
  ];
  for (const route of routes) {
    const raw = readFileSync(resolve(process.cwd(), route), "utf8");
    assert.ok(raw.length > 50, route);
    assert.doesNotMatch(raw, /TODO: write policy|lorem ipsum/i);
  }
});

test("middleware allowlists policy public paths", () => {
  const interceptorPath = ["proxy.ts", "middleware.ts"]
    .map((name) => resolve(process.cwd(), name))
    .find((path) => {
      try {
        readFileSync(path, "utf8");
        return true;
      } catch {
        return false;
      }
    });
  assert.ok(interceptorPath, "expected proxy.ts or middleware.ts");
  const raw = readFileSync(interceptorPath!, "utf8");
  for (const path of [
    "/policies",
    "/privacy",
    "/terms",
    "/faq",
    "/cookies",
    "/safeguarding-policy",
    "/data-retention",
    "/ai-use",
    "/knowledge-centre",
  ]) {
    assert.match(raw, new RegExp(`"${path.replace("/", "\\/")}"`));
  }
});
