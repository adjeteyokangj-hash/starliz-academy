/**
 * OPTIONAL / DANGEROUS scaffold generator for Phase 6 policy content modules.
 *
 * The live policy bodies in `src/lib/policies/content/` are now hand-locked
 * commercial drafts (Packs 01–07 / LD register). Re-running this script can
 * overwrite locked wording.
 *
 * Do not run unless Product Owner cites an LD-### change and bumps
 * docs/UK_LAUNCH_DECISIONS.md. Prefer editing content files directly.
 *
 * Historical usage: node scripts/generate-phase6-policies.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve("src/lib/policies/content");
mkdirSync(outDir, { recursive: true });

const PROMISE =
  "AI teaching is guaranteed. Human support is a safety net when available — not a private 1:1 tutor booking.";

function docTs(d) {
  const defs = d.definitions ? `definitions: ${JSON.stringify(d.definitions)},` : "";
  const resp = d.responsibilities ? `responsibilities: ${JSON.stringify(d.responsibilities)},` : "";
  const exc = d.exceptions ? `exceptions: ${JSON.stringify(d.exceptions)},` : "";
  const rel = d.relatedDocumentIds ? `relatedDocumentIds: ${JSON.stringify(d.relatedDocumentIds)},` : "";
  return `  buildPolicy({
    id: ${JSON.stringify(d.id)},
    slug: ${JSON.stringify(d.slug)},
    title: ${JSON.stringify(d.title)},
    category: ${JSON.stringify(d.category)},
    audience: ${JSON.stringify(d.audience)},
    purpose: ${JSON.stringify(d.purpose)},
    scope: ${JSON.stringify(d.scope)},
    summary: ${JSON.stringify(d.summary)},
    legalReviewRequired: ${d.legalReviewRequired ?? false},
    status: ${JSON.stringify(d.status ?? "Draft")},
    publicVisible: ${d.publicVisible ?? true},
    publicPath: ${JSON.stringify(d.publicPath ?? `/policies/${d.slug}`)},
    reportingRoute: ${JSON.stringify(d.reportingRoute ?? "support@starlizacademy.com")},
    complaintsRoute: ${JSON.stringify(d.complaintsRoute ?? "support@starlizacademy.com")},
    ${defs}
    ${resp}
    ${exc}
    ${rel}
    sections: [
${d.sections
  .map(
    (sec) => `      s(${JSON.stringify(sec.heading)},
${sec.body.map((b) => `        ${JSON.stringify(b)},`).join("\n")}
      ),`,
  )
  .join("\n")}
    ],
  })`;
}

function writeModule(filename, exportName, docs) {
  const body = `import { buildPolicy, s } from "../build";
import type { PolicyDocument } from "../types";

/** Phase 6 draft set — aligned to shipped product behaviour. */
export const ${exportName}: PolicyDocument[] = [
${docs.map(docTs).join(",\n")}
];
`;
  writeFileSync(resolve(outDir, filename), body, "utf8");
  console.log("wrote", filename, docs.length);
}

const daySchool = [
  "Day School follows a fixed school timetable with school-led attendance.",
  "Day School is teacher-led and AI-first during the school day.",
  "Parents do not book Day School periods.",
  "Day School uses SchoolDayLesson records and must not be confused with Short Learning bookings.",
];

const shortLearning = [
  "Short Learning is parent-booked learning time outside Day School hours.",
  "Sessions are AI-led and are not named-tutor bookings.",
  PROMISE,
  "Session lengths are 90 or 120 minutes, starting every 30 minutes where capacity permits.",
  "Weekday window: 16:00–20:00. Weekend window: 09:00–18:00.",
  "Short Learning uses SchoolLearningWindow capacity and StudentLearningBooking records.",
];

const booking = [
  "Weekday bookings open 7 days ahead. Standard deadline: 12:00 same day. School admin finalises tutor shifts by 14:00. Late booking is allowed only where existing capacity permits. Free cancellation until 2 hours before the session.",
  "Weekend bookings open 14 days ahead. Standard deadline: Thursday 18:00. School admin finalises tutor shifts by Friday 12:00. Late booking only where capacity permits. Free cancellation until 18:00 the previous day.",
  "There is no per-booking fee, no cancellation fee, no late-cancellation charge, and no private-tutor fee. The monthly subscription covers Short Learning access.",
  "Cancellations and no-shows affect operations and reliability tracking only. They are not financial penalties.",
  "Booking statuses include: Booked, Confirmed, Attended, Completed, Cancelled, Late cancelled, No-show, Expired.",
];

const human = [
  PROMISE,
  "Human tutor support is only considered when AI support is exhausted, the student still needs help, the learning session is active, an eligible tutor is on shift, the tutor is available, the heartbeat is fresh, and tutor access is active.",
  "If no tutor is available, the child continues with AI and is not parked waiting for an offline tutor. Human support is not guaranteed.",
  "Login does not mean available. A tutor can only become available when on shift, heartbeat is fresh, and access is active.",
  "Outside shift, tutors may access dashboard, upcoming shifts, notices and history. They cannot become available, accept a student, claim a support case, or receive a new assignment.",
  "At shift end: no new assignments. An active session may finish within the configured grace period. Then the tutor returns off shift.",
];

function simple(slug, title, category, audience, purpose, bodies, opts = {}) {
  return {
    id: slug,
    slug,
    title,
    category,
    audience,
    legalReviewRequired: opts.legalReviewRequired ?? false,
    status: opts.status ?? (opts.legalReviewRequired ? "Draft" : "Under Review"),
    publicVisible: opts.publicVisible ?? true,
    publicPath: opts.publicPath ?? `/policies/${slug}`,
    purpose,
    scope: opts.scope ?? "StarLiz Academy UK launch product behaviour as implemented.",
    summary: opts.summary ?? purpose,
    definitions: opts.definitions,
    responsibilities: opts.responsibilities,
    relatedDocumentIds: opts.relatedDocumentIds,
    sections: opts.sections ?? [
      { heading: "Purpose and scope", body: [purpose, "This document reflects shipped behaviour and is subject to review."] },
      { heading: "Policy rules", body: bodies },
      { heading: "Reporting", body: ["Contact support@starlizacademy.com. For child welfare concerns use safeguarding@starlizacademy.com."] },
    ],
  };
}

const legal = [
  simple("terms", "Terms and Conditions", "legal", ["Public", "Parent"], "Set the rules for using StarLiz Academy websites, apps and learning services.", [...daySchool, ...shortLearning, ...booking.slice(2), ...human], {
    legalReviewRequired: true,
    publicPath: "/terms",
    status: "Draft",
    relatedDocumentIds: ["privacy", "subscription-terms", "booking-cancellation"],
    sections: [
      { heading: "1. About these terms", body: ["These Terms govern access to StarLiz Academy. Draft for legal review — not formal legal advice."] },
      { heading: "2. Learning modes", body: [...daySchool, ...shortLearning] },
      { heading: "3. AI and human support", body: human },
      { heading: "4. Subscriptions and bookings", body: booking },
      { heading: "5. Acceptable use and enforcement", body: ["Do not misuse the platform, bypass security, or put children at risk. We may suspend accounts that breach these terms."] },
    ],
  }),
  simple("privacy", "Privacy Policy", "legal", ["Public", "Parent"], "Explain how StarLiz Academy processes personal data under UK GDPR.", [
    "We process account, child learning, booking, support and technical data to provide Day School and Short Learning.",
    "Payments are handled by payment providers; we do not store full card numbers on StarLiz servers.",
    "We do not sell children's personal data.",
    "Contact support@starlizacademy.com to exercise UK GDPR rights. Safeguarding retention may limit erasure.",
  ], { legalReviewRequired: true, publicPath: "/privacy", status: "Draft", relatedDocumentIds: ["cookies", "data-retention", "ai-use"] }),
  simple("cookies", "Cookie Policy", "legal", ["Public", "Parent"], "Describe cookies and similar technologies used on StarLiz Academy sites.", [
    "Essential cookies support authentication and security.",
    "Functional cookies may store preferences.",
    "Analytics cookies are optional where enabled.",
    "Blocking essential cookies may break login or booking.",
  ], { legalReviewRequired: true, publicPath: "/cookies", status: "Draft" }),
  simple("subscription-terms", "Subscription Terms", "legal", ["Public", "Parent"], "Explain what a monthly subscription includes and how access works.", [
    "Eligible monthly subscriptions cover Short Learning booking access — no per-booking fee.",
    "No cancellation fee, late-cancellation charge, or private-tutor fee.",
    "Cancelling a booking does not cancel the subscription.",
    "Failed payments may suspend booking entitlement until resolved.",
    "Open owner decision: final UK cooling-off and statutory cancellation wording after legal review.",
  ], { legalReviewRequired: true, status: "Draft", relatedDocumentIds: ["refund-policy", "booking-cancellation"] }),
  simple("booking-cancellation", "Booking and Cancellation Policy", "legal", ["Public", "Parent"], "Describe Short Learning booking windows, deadlines and free cancellation.", booking, {
    legalReviewRequired: true,
    status: "Draft",
    scope: "Parent-booked Short Learning only. Does not apply to Day School timetable periods.",
  }),
  simple("refund-policy", "Refund Policy", "legal", ["Public", "Parent"], "Clarify refunds for subscriptions versus bookings.", [
    "Cancelling a Short Learning booking does not create a booking-fee refund because there is no per-booking fee.",
    "Subscription refunds follow Subscription Terms, provider rules and UK consumer law after legal review.",
    "Open owner decision: publish final pro-rata and cooling-off refund rules.",
  ], { legalReviewRequired: true, status: "Draft" }),
  simple("acceptable-use", "Acceptable Use Policy", "legal", ["Public", "Parent", "Student", "Tutor"], "Define acceptable and prohibited use of StarLiz Academy.", [
    "Treat learners and staff with respect.",
    "Do not bypass authentication, school scoping or tutor eligibility controls.",
    "Do not claim a named private tutor booking.",
    "Do not share harmful content involving children.",
  ], { legalReviewRequired: true, status: "Draft" }),
  simple("accessibility", "Accessibility Statement", "legal", ["Public", "Parent"], "State accessibility aims and how to request support.", [
    "We aim to make portals usable with assistive technologies.",
    "Report barriers to support@starlizacademy.com with the page URL.",
    "Open owner decision: target WCAG level and audit schedule.",
  ], { legalReviewRequired: true, status: "Draft" }),
  simple("complaints", "Complaints Procedure", "legal", ["Public", "Parent"], "Explain how to raise a complaint.", [
    "Email support@starlizacademy.com with account email and issue details.",
    "Child welfare concerns: safeguarding@starlizacademy.com or emergency services if immediate danger.",
    "Booking cancellations remain free of cancellation fees regardless of complaint outcome.",
    "Open owner decision: publish response-time SLAs.",
  ], { legalReviewRequired: true, status: "Draft" }),
  simple("intellectual-property", "Intellectual Property Policy", "legal", ["Public", "Parent"], "Describe ownership of platform content and limits on reuse.", [
    "Platform software, branding and curriculum structures are protected IP.",
    "Users receive a limited licence for intended learning use.",
    "Do not commercially exploit platform content without permission.",
  ], { legalReviewRequired: true, status: "Draft" }),
  simple("ai-use", "AI Use and Transparency Policy", "legal", ["Public", "Parent", "Student"], "Explain how AI is used in teaching.", [
    PROMISE,
    "AI teaches and adapts practice during sessions.",
    "AI does not guarantee a human tutor will join and does not create a private named-tutor reservation.",
    "If no tutor is available, the child continues with AI.",
    "Report AI concerns to support@starlizacademy.com.",
  ], { legalReviewRequired: true, publicPath: "/ai-use", status: "Draft" }),
  simple("online-safety", "Online Safety Policy", "legal", ["Public", "Parent", "Student", "Tutor"], "Describe online safety expectations for digital learning.", [
    "Children should use the platform with suitable adult oversight for their age.",
    "Report inappropriate content to support@starlizacademy.com or safeguarding@starlizacademy.com.",
    "Human support is for learning help within an active session.",
  ], { legalReviewRequired: true, status: "Draft" }),
  simple("safeguarding", "Safeguarding and Child Protection Policy", "legal", ["Public", "Parent", "Tutor", "School Admin", "Staff"], "Public summary of child welfare commitments and reporting routes.", [
    "The welfare of the child is paramount. Draft for DSL and legal review.",
    "Role-based portals and shift-gated tutor access limit who can interact with learners.",
    "Immediate danger: contact emergency services first, then safeguarding@starlizacademy.com and the school DSL where relevant.",
  ], { legalReviewRequired: true, publicPath: "/safeguarding-policy", status: "Draft" }),
  simple("data-protection", "Data Protection Policy", "legal", ["Public", "School Admin", "Platform Admin", "Staff"], "Set organisational data protection principles.", [
    "Process personal data under UK GDPR principles.",
    "Access is role-scoped.",
    "Open owner decision: final controller/processor mapping per school contract type.",
  ], { legalReviewRequired: true, status: "Draft" }),
  simple("data-retention", "Data Retention Policy", "legal", ["Public", "Parent", "School Admin", "Staff"], "Describe retention and deletion.", [
    "Numeric retention schedules remain under legal and safeguarding review.",
    "Booking statuses including no-shows may be retained for reliability controls.",
    "Deletion requests: support@starlizacademy.com — safeguarding may limit erasure.",
  ], { legalReviewRequired: true, publicPath: "/data-retention", status: "Draft" }),
  simple("account-suspension", "Account Suspension and Termination Policy", "legal", ["Public", "Parent", "Tutor", "School Admin"], "Explain when accounts may be restricted or terminated.", [
    "Grounds include Acceptable Use breaches, safeguarding risk, booking abuse after reliability controls, and failed payment.",
    "Appeals: support@starlizacademy.com.",
  ], { legalReviewRequired: true, status: "Draft" }),
];

writeModule("legal-policies.ts", "LEGAL_POLICIES", legal);

const productSpecs = [
  ["short-learning-policy", "Short Learning Policy", ["Public", "Parent", "School Admin"], "Define Short Learning as parent-booked AI-led after-hours learning.", [...shortLearning, ...booking, ...human]],
  ["day-school-policy", "Day School Learning Policy", ["Public", "Parent", "School Admin", "Tutor"], "Define Day School as timetabled school-day learning separate from Short Learning.", daySchool],
  ["human-tutor-support", "Human Tutor Support Policy", ["Public", "Parent", "Tutor", "School Admin"], "Define human support as a non-guaranteed safety net.", human],
  ["ai-tutor-policy", "AI Tutor Policy", ["Public", "Parent", "Student"], "Describe AI Tutor teaching behaviour and limits.", [PROMISE, "AI leads Short Learning sessions and continues when human support is unavailable."]],
  ["parent-responsibilities", "Parent Responsibilities Policy", ["Parent"], "Set expectations for parents.", ["Keep child profiles accurate.", "Book only when the child can attend.", "Cancel when plans change — there is no cancellation fee."]],
  ["student-code", "Student Code of Conduct", ["Student", "Parent"], "Expected student behaviour.", ["Be kind and try your best.", "Ask the AI Tutor for help when stuck.", "Tell a trusted adult if something feels wrong."]],
  ["tutor-code", "Tutor Code of Conduct", ["Tutor", "School Admin"], "Professional expectations for tutors.", ["Follow safeguarding rules.", "Only go available on published shifts with fresh presence.", "Do not imply a private named booking."]],
  ["attendance-policy", "Attendance Policy", ["Parent", "School Admin", "Tutor"], "Attendance for Day School vs Short Learning.", ["Day School attendance is school-led.", "Short Learning attendance uses StudentLearningBooking statuses.", "Do not merge the two."]],
  ["booking-reliability", "Booking Reliability and No-Show Policy", ["Parent", "School Admin"], "Reliability controls without financial penalties.", ["No-shows may reduce limits or require confirmations — not fees.", "There is no cancellation fee."]],
  ["behaviour-policy", "Behaviour Policy", ["Parent", "Student", "Tutor", "School Admin"], "Behaviour expectations.", ["Respectful conduct required in AI and human-supported sessions."]],
  ["assessment-progress", "Assessment and Progress Policy", ["Parent", "School Admin"], "How progress is tracked.", ["Progress may come from lessons, assessments and Short Learning activity."]],
  ["learning-reports", "Learning Reports Policy", ["Parent", "School Admin"], "Who can see learning reports.", ["Parents see linked children; school staff see school-scoped learners."]],
  ["lesson-quality", "Lesson Quality Policy", ["School Admin", "Platform Admin", "Staff"], "Quality expectations.", ["Lessons should be age-appropriate and safe."]],
  ["content-review", "Content Review Policy", ["Platform Admin", "Staff"], "How content is reviewed.", ["Review for accuracy, safeguarding and age suitability."]],
  ["ai-safety", "AI Safety Policy", ["Parent", "Staff", "Platform Admin"], "Safety controls around AI.", [PROMISE, "Report unsafe AI behaviour to support."]],
  ["human-support-escalation", "Human Support Escalation Policy", ["Tutor", "School Admin", "Staff"], "Escalation paths.", ["Learning stuck paths may reach on-shift tutors when eligible.", "Welfare concerns use safeguarding procedures."]],
  ["tutor-availability-shifts", "Tutor Availability and Shift Policy", ["Tutor", "School Admin"], "Shifts gate availability.", human],
  ["incident-reporting", "Incident Reporting Policy", ["Tutor", "School Admin", "Staff", "Parent"], "How to report incidents.", ["Technical: support@starlizacademy.com. Safeguarding: safeguarding channels."]],
  ["quality-assurance", "Quality Assurance Policy", ["School Admin", "Platform Admin", "Staff"], "QA across learning and support.", ["Monitor reliability, shift coverage, AI quality and safeguarding workflows."]],
];

writeModule(
  "product-policies.ts",
  "PRODUCT_POLICIES",
  productSpecs.map(([slug, title, audience, purpose, bodies]) =>
    simple(slug, title, "product", audience, purpose, bodies, { status: "Under Review" }),
  ),
);

const staffSpecs = [
  ["tutor-handbook", "Tutor Handbook", "handbook", ["Tutor", "Staff"], "Practical guide for tutors.", [...human, "Use teacher portal tools. Off-shift: upcoming shifts and history only."]],
  ["school-admin-ops", "School Admin Operations Manual", "handbook", ["School Admin"], "Operate from /school-admin.", ["Short Learning tabs cover bookings, forecast, shifts, coverage, policies and reliability.", "Day School attendance stays separate.", "Finalise weekday shifts by 14:00 and weekend shifts by Friday 12:00 where process requires."]],
  ["platform-admin-ops", "Platform Super Admin Operations Manual", "handbook", ["Platform Admin"], "Operate from /admin.", ["Use Short Learning oversight.", "Never migrate reset production.", "Set CRON_SECRET and provider keys in Vercel Production."]],
  ["human-support-runbook", "Human Support Operations Runbook", "runbook", ["Tutor", "School Admin", "Staff"], "Operate the human support safety net.", human],
  ["safeguarding-escalation", "Safeguarding Escalation Procedure", "runbook", ["Staff", "School Admin", "Tutor"], "Escalate welfare concerns.", ["Protect the child first.", "Notify school DSL and safeguarding@starlizacademy.com.", "Do not use the tutor queue as safeguarding."]],
  ["incident-response", "Incident Response Procedure", "runbook", ["Platform Admin", "Staff"], "Respond to production incidents.", ["Contain, communicate, remediate, review. See docs/ops runbooks."]],
  ["ai-monitoring", "AI Monitoring Procedure", "runbook", ["Platform Admin", "Staff"], "Monitor AI tutoring.", ["Review quality signals and reported concerns."]],
  ["booking-capacity-guide", "Booking and Capacity Planning Guide", "handbook", ["School Admin"], "Plan Short Learning capacity.", [...booking, "Late booking only when capacity remains."]],
  ["tutor-shift-guide", "Tutor Shift Scheduling Guide", "handbook", ["School Admin", "Tutor"], "Publish and manage shifts.", human],
  ["reminder-ops", "Production Reminder Operations Guide", "runbook", ["Platform Admin", "Staff"], "Operate reminders.", ["Endpoint /api/cron/short-learning-reminders", "Vercel Cron */10 * * * *", "Auth: CRON_SECRET Bearer header", "Do not publish the secret publicly.", "Requires Pro+ and email provider credentials."]],
  ["policy-review-procedure", "Policy Review and Approval Procedure", "handbook", ["Platform Admin", "Staff"], "Policy lifecycle.", ["States: Draft, Under Review, Approved, Published, Archived.", "Legal policies need external legal review before formal approval claims.", "Do not invent solicitor approvals."]],
];

writeModule(
  "staff-docs.ts",
  "STAFF_DOCS",
  staffSpecs.map(([slug, title, category, audience, purpose, bodies]) =>
    simple(slug, title, category, audience, purpose, bodies, { status: "Draft" }),
  ),
);

console.log("done");
