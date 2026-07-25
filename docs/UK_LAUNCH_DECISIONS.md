# UK Launch Decision Register

**Document type:** Change-controlled commercial decision register (not a public policy)  
**Register version:** `1.0.0`  
**Opened:** 2026-07-25  
**Decision owner:** StarLiz Academy Product Owner  
**Status:** Commercial decisions **closed** for UK launch; further changes require a new versioned entry  
**Related handover:** [`PHASE6_LEGAL_REVIEW_HANDOVER.md`](./PHASE6_LEGAL_REVIEW_HANDOVER.md)

This register is the definitive record of **why** the UK launch product behaves as it does.  
It is not formal legal advice. External solicitor/DPO/DSL/accessibility assurance may amend **wording** without silently rewriting these commercial decisions — any commercial change must add a new versioned row.

---

## How to use this register

| Rule | Detail |
|---|---|
| Authority | Prefer this register over chat history when explaining a commercial rule |
| Code source of truth | Matching constants in `src/lib/policies/locked-facts.ts` |
| Legal packs | Packs 01–07 hold counsel briefing detail |
| Changes | Do not casually edit locked rows. Bump **Register version**, add a Change log entry, and update the related legal pack |
| External amendments | Solicitor/DPO/DSL wording changes that keep the same commercial intent: note under “Assurance notes” without inventing a new commercial rule |

---

## Programme status (snapshot)

| Track | Status |
|---|---|
| Engineering / product features | **Closed** for UK launch |
| Commercial policy (Packs 01–07) | **Locked** — change-controlled |
| External legal review | Open |
| WCAG 2.2 AA audit | Open |
| DSL safeguarding review | Open |
| Production readiness / launch sequence | Pending external assurance |

**Launch sequence (after assurance):** RC validation → Legal approval → Accessibility sign-off → Launch commit → Deploy → Production smoke test → Enable cron → UK launch.

### Remaining gates (ordered)

1. Solicitor/DPO review of legal packs (Packs 01–06)
2. DSL/legal safeguarding sign-off
3. Independent WCAG 2.2 AA audit
4. Supplier and processor contract labelling
5. RC validation
6. Launch commit and tag *(only when Product Owner requests)*
7. Production deployment and smoke testing
8. Cron activation and live reminder verification
9. UK launch

**Until external reviewers respond:** keep implementation and commercial positions change-controlled. Any amendment must reference the relevant **LD-###**, update the affected legal pack, bump this register version, and rerun `npx tsx --test tests/phase6_policies.test.ts` plus public route spot-checks. **No commit until explicitly requested.**

---

## Decision register

| ID | Decision | Locked position | Decision date | Owner | Version | Related pack / constant |
|---|---|---|---|---|---|---|
| LD-001 | AI-first teaching model | AI teaching is **guaranteed**. Learning continues with AI regardless of human tutor availability. | 2026-07-25 | Product Owner | 1.0.0 | Product promise · `LOCKED_PROMISE` |
| LD-002 | Human support promise | Human support is a **safety net when available** — not a private 1:1 / named tutor booking. Not guaranteed. | 2026-07-25 | Product Owner | 1.0.0 | Pack product policies · `HUMAN_SUPPORT_FACTS` |
| LD-003 | Human escalation conditions | Human support only when AI exhausted, student still needs help, session active, eligible tutor on shift, available, fresh heartbeat, access active. If none available, child continues with AI (not parked). | 2026-07-25 | Product Owner | 1.0.0 | `HUMAN_SUPPORT_FACTS` |
| LD-004 | Tutor availability model | Login ≠ available. Availability requires published shift + fresh heartbeat + active access. Off-shift: dashboard/history only; no new assignments. Shift-end grace for active sessions only. | 2026-07-25 | Product Owner | 1.0.0 | Tutor / shift policies · `HUMAN_SUPPORT_FACTS` |
| LD-005 | Day School vs Short Learning | Distinct products and data models. Day School = school timetable / `SchoolDayLesson`. Short Learning = parent-booked / `StudentLearningBooking`. Parents do not book Day School periods. | 2026-07-25 | Product Owner | 1.0.0 | `DAY_SCHOOL_FACTS` · `SHORT_LEARNING_FACTS` |
| LD-006 | Short Learning windows & lengths | Weekday 16:00–20:00; weekend 09:00–18:00. Sessions 90 or 120 minutes on 30-minute starts where capacity permits. | 2026-07-25 | Product Owner | 1.0.0 | `SHORT_LEARNING_FACTS` |
| LD-007 | Booking open / deadline rules | Weekday: open 7 days ahead; deadline 12:00 same day; admin finalises shifts by 14:00; free cancel until 2h before. Weekend: open 14 days ahead; deadline Thu 18:00; admin finalises Fri 12:00; free cancel until 18:00 previous day. Late booking only if capacity exists. | 2026-07-25 | Product Owner | 1.0.0 | `BOOKING_RULES_FACTS` |
| LD-008 | No booking cancellation fees | No per-booking fee, no cancellation fee, no late-cancellation charge, no private-tutor fee. Cancellations/no-shows are operational/reliability controls only — not financial penalties. | 2026-07-25 | Product Owner | 1.0.0 | `BOOKING_RULES_FACTS` · Pack 01 |
| LD-009 | Honesty checkbox | Parents acknowledge Short Learning is AI-led and human support depends on availability. | 2026-07-25 | Product Owner | 1.0.0 | `LOCKED_CHECKBOX` |
| LD-010 | Cooling-off | New consumer online subscriptions: **14-day** cooling-off; immediate start where parent chooses digital access now. Effect of use during cooling-off on refund = solicitor final wording. | 2026-07-25 | Product Owner | 1.0.0 | Pack 01 · `SUBSCRIPTION_COMMERCIAL_FACTS` |
| LD-011 | Subscription cancellation timing | Cancel = **end of current billing period** (not immediate). Access and bookings continue until expiry; then no renewal. | 2026-07-25 | Product Owner | 1.0.0 | Pack 01 · `SUBSCRIPTION_COMMERCIAL_FACTS` |
| LD-012 | Booking cancel ≠ subscription cancel | Cancelling a booking does not cancel the subscription; no fee, no booking refund, no subscription change. | 2026-07-25 | Product Owner | 1.0.0 | Pack 01 |
| LD-013 | Self-service cancel | Parent Portal self-service; Support may assist; no phone-only / hidden barrier. | 2026-07-25 | Product Owner | 1.0.0 | Pack 01 |
| LD-014 | Failed payment grace | **7-day** grace with notice/retries; then Short Learning entitlement suspends until payment succeeds; history intact; restores immediately after successful payment. | 2026-07-25 | Product Owner | 1.0.0 | Pack 01 |
| LD-015 | No automatic mid-period pro-rata | Voluntary mid-period cancel does not trigger automatic pro-rata refund; access continues to period end. | 2026-07-25 | Product Owner | 1.0.0 | Pack 02 · `REFUND_COMMERCIAL_FACTS` |
| LD-016 | Goodwill refunds | Exceptional, never automatic. Platform Admin approve (Owner for exceptional). Support recommend only. School Admin cannot approve financial refunds. Audit trail required. | 2026-07-25 | Product Owner | 1.0.0 | Pack 02 |
| LD-017 | No refund — unused sessions | Subscription buys access, not guaranteed attendance at every session. | 2026-07-25 | Product Owner | 1.0.0 | Pack 02 |
| LD-018 | No refund — human tutor unavailable | AI guaranteed; human is safety net. Human unavailability is not a refund event where AI worked as described. | 2026-07-25 | Product Owner | 1.0.0 | Pack 02 |
| LD-019 | Platform failure remedy | Extension, credit or goodwill may be considered — no automatic specific remedy promised. Processor fees not promised recoverable. | 2026-07-25 | Product Owner | 1.0.0 | Pack 02 |
| LD-020 | Retention schedule (commercial) | Numeric commercial schedule locked (e.g. closed profiles 24 months; SL bookings/progress 3 years; AI chats 12 months; finance 6 years from FY end). School instructions prioritize for school-controlled records. Policy only — purge jobs not implied by this register. | 2026-07-25 | Product Owner | 1.0.0 | Pack 03 · `RETENTION_COMMERCIAL_FACTS` |
| LD-021 | Safeguarding retention carve-out | No short automatic deletion for safeguarding records; retain under safeguarding schedule + controller instructions with necessity review. | 2026-07-25 | Product Owner | 1.0.0 | Pack 03 — **DSL/legal review still required for final wording** |
| LD-022 | Controller / processor mapping | Role-by-processing-purpose. Day School: school controller / StarLiz processor. Direct Short Learning: StarLiz controller. Split AI / human support / safeguarding by purpose. Article 28 DPA for schools. | 2026-07-25 | Product Owner | 1.0.0 | Pack 04 · `CONTROLLER_MAPPING_FACTS` |
| LD-023 | School pupil data reuse | Identifiable school pupil data not used for unrelated StarLiz product development unless contract + lawful basis + transparency (+ DPIA where required). Irreversible anonymised analytics may be used. | 2026-07-25 | Product Owner | 1.0.0 | Pack 04 |
| LD-024 | Accessibility target | **WCAG 2.2 Level AA** as objective; continuous improvement; subject to independent testing before final publication. Do not claim full compliance / certified / fully accessible to all users pre-audit. | 2026-07-25 | Product Owner | 1.0.0 | Pack 05 · `ACCESSIBILITY_COMMERCIAL_FACTS` |
| LD-025 | Complaint response SLAs | Acknowledge ordinary **2** working days; substantive **10**; complex/escalated **20** (interim by day 10); urgent access/payment-blocking ack **1** working day. Targets, not guaranteed remedies. | 2026-07-25 | Product Owner | 1.0.0 | Pack 06 · `COMPLAINT_SLA_COMMERCIAL_FACTS` |
| LD-026 | Safeguarding vs complaint clock | Child welfare concerns are **outside** ordinary complaint SLAs — escalate immediately (`safeguarding@starlizacademy.com` / emergency services if immediate danger). | 2026-07-25 | Product Owner | 1.0.0 | Pack 06 — **DSL review for full safeguarding wording** |
| LD-027 | Staff handbook visibility | Staff handbooks and runbooks are **authenticated-only** (`/admin/policy-library`, `/school-admin/knowledge-library`). Public hub = legal + product only. | 2026-07-25 | Product Owner | 1.0.0 | Pack 07 · `STAFF_HANDBOOK_VISIBILITY_FACTS` |
| LD-028 | Policy publishing model | Phase 6 policies are code-managed drafts (46 documents). Statuses editorial. No CMS. Legal docs remain Draft until external approval. | 2026-07-25 | Product Owner | 1.0.0 | Phase 6 handover |
| LD-029 | Contacts | Support: `support@starlizacademy.com`. Safeguarding: `safeguarding@starlizacademy.com`. | 2026-07-25 | Product Owner | 1.0.0 | `CONTACT` |
| LD-030 | No migration reset / no casual DB wipe | Production and launch ops must not use migrate reset / destructive wipe as a normal procedure. | 2026-07-25 | Product Owner | 1.0.0 | Ops / Platform Admin handbook |

---

## Quick answers (FAQ from the register)

| Question | Answer | ID |
|---|---|---|
| Why don’t we guarantee a tutor? | AI is guaranteed; human support is a safety net when on-shift tutors are available. | LD-001, LD-002 |
| Why are booking cancellations free? | Commercial model: subscription buys access; cancellations are operational, not fee events. | LD-008 |
| Why doesn’t cancel mid-month refund automatically? | Cancel runs to period end; no automatic pro-rata. | LD-011, LD-015 |
| Why WCAG 2.2 AA not “fully compliant”? | Target locked; independent audit still required before conformance claims. | LD-024 |
| Why 2 / 10 / 20 day complaint times? | Parent-friendly investigation room without overpromising. | LD-025 |
| Why aren’t staff handbooks on the public hub? | Operational runbooks are authenticated-only. | LD-027 |

---

## External assurance still open (not commercial decisions)

| Item | Owner | Blocks |
|---|---|---|
| Solicitor/DPO review of Packs 01–06 | External counsel / DPO | Approved/Published legal policies |
| Independent WCAG 2.2 AA audit | Accessibility auditor | Conformance claims |
| Focused DSL/legal safeguarding review | DSL + solicitor | Final safeguarding wording |
| Supplier/processor contract labelling | Legal + ops | Final Privacy / DP supplier schedules |

---

## Change log

| Register version | Date | Summary | Author |
|---|---|---|---|
| 1.0.0 | 2026-07-25 | Initial register capturing UK launch commercial locks LD-001–LD-030 aligned to Packs 01–07 and `locked-facts.ts`. | Product Owner / Phase 6 assembly |

---

## Related documents

- [`PHASE6_LEGAL_REVIEW_HANDOVER.md`](./PHASE6_LEGAL_REVIEW_HANDOVER.md)  
- [`PHASE6_LEGAL_REVIEW_CHECKLIST.md`](./PHASE6_LEGAL_REVIEW_CHECKLIST.md)  
- [`PHASE6_LEGAL_REVIEW_VERIFICATION.md`](./PHASE6_LEGAL_REVIEW_VERIFICATION.md)  
- Packs 01–07 under `docs/LEGAL_REVIEW_PACK_*.md`  
- Code constants: `src/lib/policies/locked-facts.ts`  
- Production readiness (ops, not decisions): [`UK_LAUNCH_PRODUCTION_READINESS.md`](./UK_LAUNCH_PRODUCTION_READINESS.md)
