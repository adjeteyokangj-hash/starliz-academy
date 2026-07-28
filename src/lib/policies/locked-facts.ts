/** Shared locked facts used across Phase 6 documents — must match shipped product. */

export const LOCKED_PROMISE =
  "AI teaching is guaranteed. Human support is a safety net when available — not a private 1:1 tutor booking.";

export const LOCKED_CHECKBOX =
  "I understand that Short Learning is AI-led and that human tutor support depends on availability.";

export const DAY_SCHOOL_FACTS = [
  "Day School follows a fixed school timetable with school-led attendance.",
  "Day School is teacher-led and AI-first during the school day.",
  "Parents do not book Day School periods.",
  "Day School uses school timetable lesson records and is separate from Short Learning bookings.",
] as const;

export const SHORT_LEARNING_FACTS = [
  "Short Learning is parent-booked learning time outside Day School hours.",
  "Sessions are AI-led and are not named-tutor bookings.",
  "Session lengths are 90 or 120 minutes, starting every 30 minutes where capacity permits.",
  "105-minute sessions are unavailable for new bookings and Admin authoring.",
  "Weekday window: 16:00–20:00. Weekend window: 09:00–18:00.",
  "Short Learning bookings use published after-hours capacity windows.",
  "AI support is available throughout the session. Human tutors are an availability-based safety net and are not guaranteed.",
] as const;

export const BOOKING_RULES_FACTS = [
  "Weekday: opens 7 days ahead; standard deadline 12:00 same day; admin finalises shifts by 14:00; late booking only where capacity permits; free cancellation until 2 hours before.",
  "Weekend: opens 14 days ahead; standard deadline Thursday 18:00; admin finalises shifts by Friday 12:00; late booking only where capacity permits; free cancellation until 18:00 the previous day.",
  "There is no per-booking fee, no cancellation fee, no late-cancellation charge, and no private-tutor fee.",
  "Cancellations and no-shows affect operations and reliability tracking only — not financial penalties.",
] as const;

export const HUMAN_SUPPORT_FACTS = [
  LOCKED_PROMISE,
  "Human support is only considered when AI support is exhausted, the student still needs help, the session is active, an eligible tutor is on shift, available, with a fresh heartbeat, and tutor access is active.",
  "If no tutor is available, the child continues with AI and is not parked waiting for an offline tutor.",
  "Login does not mean available. Availability requires on-shift + fresh heartbeat + active access.",
  "Outside shift, tutors may use dashboard, upcoming shifts, notices and history, but cannot become available, accept students, claim cases or receive new assignments.",
  "At shift end: no new assignments; an active session may finish within the configured grace period; then the tutor returns off shift.",
] as const;

export const CONTACT = {
  supportEmail: "support@starlizacademy.com",
  safeguardingEmail: "safeguarding@starlizacademy.com",
} as const;

export const BOOKING_STATUSES = [
  "Booked",
  "Confirmed",
  "Attended",
  "Completed",
  "Cancelled",
  "Late cancelled",
  "No-show",
  "Expired",
] as const;

/**
 * Preferred UK commercial stance locked by product owner (2026-07-25).
 * Final statutory wording remains subject to solicitor review.
 */
export const SUBSCRIPTION_COMMERCIAL_FACTS = [
  "Preferred commercial stance pending solicitor review — not formal legal advice.",
  "New consumer online subscriptions: 14-day cooling-off period, with immediate service start where the parent chooses immediate digital access. Exact effect of use during cooling-off on any refund is confirmed in final legal wording.",
  "Subscription cancellation takes effect at the end of the current billing period — it does not end immediately. Access, existing bookings, new bookings while still active, reports and learning continue until that date; then renewals stop.",
  "After subscription expiry: no new Short Learning bookings or sessions. Historical reports remain available under the Data Retention Policy. Day School access continues where provided through the school rather than the parent subscription.",
  "Cancel booking is not cancel subscription. Booking cancellation has no fee, no booking refund and no subscription change. Subscription cancellation stops future renewals only and does not cancel existing bookings before expiry.",
  "Parents cancel subscriptions via self-service in the Parent Portal. Support can assist; there is no phone-only or hidden cancellation barrier.",
  "Failed payments: 7-day grace period with notice and retries. During grace, access and bookings continue. After suspension: no new Short Learning bookings and upcoming Short Learning sessions are unavailable until payment succeeds; history remains intact; access restores immediately after successful payment.",
] as const;

/**
 * Preferred UK commercial stance on refunds (2026-07-25).
 * Final statutory wording remains subject to solicitor review.
 */
export const REFUND_COMMERCIAL_FACTS = [
  "Preferred commercial stance pending solicitor review — not formal legal advice.",
  "StarLiz is a monthly subscription service, not a pay-per-lesson service. Refunds are the exception, not the normal cancellation process.",
  "There is no automatic pro-rata refund when a parent cancels part-way through a billing period. The subscription remains active until period end and access continues until expiry.",
  "Goodwill refunds may be issued only as a discretionary Platform Admin (or Platform Owner for exceptional cases) decision — never automatic — with reason, amount, approver, date, notes and audit log. Support may recommend only. School Admin cannot approve financial refunds.",
  "No refund for unused Short Learning sessions. The subscription purchases access, not guaranteed attendance.",
  "No refund because a human tutor was unavailable. AI teaching is guaranteed; human support is a safety net when available. Unavailability of a human tutor is not a refund event where AI learning functioned as described.",
  "For significant platform failure, StarLiz may consider a subscription extension, account credit or goodwill refund at its discretion — without promising a specific automatic remedy.",
  "Refunds are handled in accordance with the payment provider's capabilities and this policy. StarLiz does not promise recovery of non-refundable third-party processing fees.",
] as const;

/**
 * Commercial retention schedule pending solicitor/DPO review (2026-07-25).
 * UK GDPR requires justification, documentation, review, and deletion/anonymisation when no longer needed.
 */
export const RETENTION_COMMERCIAL_FACTS = [
  "Commercial retention schedule pending solicitor and DPO review — not formal legal advice.",
  "Each period must be justified, documented, reviewed regularly, and followed by deletion or irreversible anonymisation when no longer needed. Children's data is kept to the minimum necessary.",
  "Where StarLiz processes records on behalf of a school, the school's approved retention schedule and documented instructions take priority, subject to applicable law. StarLiz will not independently shorten or extend those periods without authority.",
  "Safeguarding records: do not apply a short automatic deletion period; retain under the safeguarding schedule and controller instructions, with regular necessity review.",
  "Legal hold, safeguarding need, fraud investigation, active complaint or litigation pauses normal deletion only for affected records.",
  "Active account data: while account/access remains active. Closed parent account profile: 24 months after closure. Closed student profile and ordinary learning preferences: 24 months after closure or school relationship ends.",
  "Short Learning bookings and attendance states: 3 years after the session. Learning attempts, stages, progress and reports: 3 years after last learning activity. Detailed AI Tutor conversations: 12 months after the session. Anonymised AI help analytics may be retained longer.",
  "Human-support session notes and outcomes: 3 years after the session. Tutor presence/heartbeat/operational shift logs: 12 months. Tutor shifts and capacity records: 3 years.",
  "Booking cancellations, late cancellations and no-show history: 24 months. Reliability restrictions and related decisions: restriction duration plus 12 months.",
  "Parent honesty acknowledgements and accepted policy versions: 6 years after the relevant subscription or booking relationship ends.",
  "Subscription, invoices, payments, refunds and financial audit records: 6 years from the end of the relevant financial year.",
  "Customer-support enquiries and complaints: 3 years after closure. Serious complaints or threatened/legal claims: 6 years after final resolution.",
  "Consent and marketing preference records: while active, then 3 years after withdrawal or last interaction. Cookie consent evidence: 24 months, then refresh or remove.",
  "Routine security and application logs: 12 months. High-risk security incident and breach records: 6 years after closure. Admin audit logs for access, bookings, shifts and policy actions: 6 years. Failed login and abuse-prevention records: 12 months, shorter where practical.",
  "Deleted-account backups: removed through normal backup rotation within 90 days. Unsuccessful job applications: 6 months after recruitment closes. Staff employment and payroll: separate HR schedule, with payroll at least the legally required period.",
] as const;

/**
 * Preferred data-governance position: role-by-processing-purpose mapping (2026-07-25).
 * Pending solicitor/DPO review — not formal legal advice.
 */
export const CONTROLLER_MAPPING_FACTS = [
  "Preferred data-governance position pending solicitor and DPO review — not formal legal advice.",
  "StarLiz uses a role-by-processing-purpose model. An organisation can be a processor for some activities and a controller for others, depending on who decides the purpose and essential means of processing.",
  "School Day School records (enrolment, timetable, attendance, teacher-assigned lessons, school-directed learning, school reports, classroom/tutor assignments, school-configured safeguarding workflows, school-authorised exports): school or academy trust is controller; StarLiz is processor under documented instructions.",
  "Direct-to-parent Short Learning (accounts, subscription/billing, bookings, entitlement, reliability/no-show controls, direct communications and reports, Short Learning service operation, complaints/support, fraud/security/audit for that service): StarLiz is controller.",
  "School-funded Short Learning: school-directed pupil participation and educational use — school controller, StarLiz processor; StarLiz independent billing, platform security, fraud prevention and legal compliance — StarLiz controller. Split by purpose; not automatically joint controllership.",
  "Day School AI Tutor delivery under school instructions: school controller, StarLiz processor. StarLiz-controlled AI safety and platform operation (security, abuse detection, integrity, legal compliance, AI safety incidents, claims defence, operational audit): StarLiz controller. Processor role is not permission to reuse school pupil data for unrelated model training, advertising or broad product experimentation.",
  "Identifiable school pupil data is not used for StarLiz independent product development unless the school contract expressly permits it, roles and lawful basis are documented, transparency is provided, and a DPIA supports the use where required. Irreversibly anonymised analytics may be used for capacity, performance, quality, aggregate insight and product improvement. Pseudonymised data remains personal data.",
  "Day School human-support cases: school controller, StarLiz processor. Direct Short Learning human-support cases: StarLiz controller. Tutors act under the relevant controller/processor arrangement and are not independent controllers merely because they view or create session notes.",
  "Safeguarding: for routine school-directed safeguarding records the school normally remains controller and StarLiz acts as processor. Where StarLiz independently decides it must record, preserve or disclose information to protect a child, comply with law, manage an incident or cooperate with authorities, StarLiz may act as an independent controller for that specific processing.",
  "Platform administration and security (staff accounts, authentication/access logs, platform audit, cybersecurity, fraud/misuse prevention, provider management, legal compliance, incident investigation, availability monitoring): StarLiz is controller.",
  "Payment providers and infrastructure suppliers are labelled according to the real contract (processor, independent controller or, exceptionally, joint controller) — not automatically all processors. Maintain sub-processor register, written terms, transfer safeguards, school prior authorisation for school-controlled data, and equivalent downstream protections.",
  "Rights requests: Day School/school-controlled — StarLiz logs, verifies enough to route safely, promptly refers to the school, and assists under the DPA; does not independently decide the school's response unless legally required. Direct Short Learning — StarLiz handles directly. Mixed requests are split internally with a clear explanation to the requester.",
  "Every school agreement should include an Article 28-compliant Data Processing Agreement covering subject matter, duration, nature/purpose, categories, instructions, confidentiality, security, sub-processors, rights assistance, DPIA/regulator assistance, breach notification, deletion/return, audit, international transfers, safeguarding escalation, and end-of-contract export/deletion.",
] as const;

/**
 * Preferred accessibility target pending independent audit and legal review (2026-07-25).
 */
export const ACCESSIBILITY_COMMERCIAL_FACTS = [
  "Preferred commercial stance pending independent accessibility testing and legal review — not a certification claim.",
  "Target standard: WCAG 2.2 Level AA.",
  "StarLiz is designed with the objective of conforming to WCAG 2.2 Level AA. We continually review and improve accessibility and will address identified accessibility issues as part of our ongoing development programme. This statement is subject to independent accessibility testing and review before final publication.",
  "Commitments include: keyboard navigation; sufficient colour contrast; screen reader compatibility where practical; clear heading hierarchy and semantic HTML; meaningful labels for forms and controls; visible keyboard focus indicators; alternative text for informative images; captions or transcripts for educational media where applicable; avoidance of colour as the only means of conveying information; responsive layouts that support zoom and different screen sizes.",
  "Until independently audited, do not claim full WCAG 2.2 AA compliance, certified accessibility, or that StarLiz is fully accessible to all users.",
  "Accessibility support: report barriers to support@starlizacademy.com (or the published support form) with the page URL; StarLiz investigates reported issues; the Accessibility Statement is reviewed periodically after significant platform changes.",
] as const;

/**
 * Preferred complaint response-time SLAs pending solicitor review (2026-07-25).
 */
export const COMPLAINT_SLA_COMMERCIAL_FACTS = [
  "Preferred commercial stance pending solicitor review — published service targets, not guaranteed outcomes or remedies.",
  "Acknowledge ordinary complaints within 2 working days of receipt.",
  "Provide a substantive response to ordinary complaints within 10 working days of receipt.",
  "Complex or escalated complaints: target a resolution or clear progress update within 20 working days; if still open at day 10, send an interim update.",
  "Urgent account-access or payment-blocking issues that prevent use of a paid service: acknowledge within 1 working day.",
  "Working days means Monday to Friday, excluding UK bank holidays.",
  "Child welfare and safeguarding concerns are outside ordinary complaint SLAs. Email safeguarding@starlizacademy.com immediately, or contact emergency services if there is immediate danger. Do not wait for complaint acknowledgement timelines.",
  "Day School issues that are school-controlled may be referred to the partner school; StarLiz acknowledges receipt and explains routing.",
  "Unresolved complaints may be escalated from Support to Platform Admin. Booking cancellations remain free of cancellation fees regardless of complaint outcome.",
  "These timelines do not guarantee a particular financial outcome, refund, human-tutor assignment, or change to subscription terms.",
] as const;

/**
 * Staff handbook / runbook visibility (2026-07-25).
 */
export const STAFF_HANDBOOK_VISIBILITY_FACTS = [
  "Staff handbooks and operational runbooks are authenticated-only and are not published on the public Policies hub.",
  "Platform operators read them in /admin/policy-library. School operators and tutors read relevant documents in /school-admin/knowledge-library.",
  "Public legal and product policies remain publicly available on /policies and canonical public routes.",
  "Safeguarding legal wording remains pending focused DSL and legal review; handbook visibility does not finalise safeguarding policy content.",
] as const;
