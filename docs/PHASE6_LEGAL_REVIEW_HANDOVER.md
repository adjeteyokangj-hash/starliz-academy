# Phase 6 — Legal-review handover package

**Date assembled:** 2026-07-25  
**Status:** Commercial policy decisions **closed** — package ready for external assurance  
**Not formal legal advice.** Do not mark policies Approved/Published until solicitor/DPO/DSL/accessibility assurance completes.

---

## 1. Pack index

| Pack | File | Topic | Owner status | External assurance still required |
|---|---|---|---|---|
| 01 | [`LEGAL_REVIEW_PACK_01_SUBSCRIPTION.md`](./LEGAL_REVIEW_PACK_01_SUBSCRIPTION.md) | Cooling-off, cancel end-of-period, booking≠subscription, Parent Portal cancel, 7-day payment grace | **Locked** | Solicitor |
| 02 | [`LEGAL_REVIEW_PACK_02_REFUNDS.md`](./LEGAL_REVIEW_PACK_02_REFUNDS.md) | No automatic pro-rata; goodwill discretionary; no unused-session / no human-tutor refund | **Locked** | Solicitor |
| 03 | [`LEGAL_REVIEW_PACK_03_RETENTION.md`](./LEGAL_REVIEW_PACK_03_RETENTION.md) | Commercial retention schedule; school-instruction priority; safeguarding carve-out | **Locked** | Solicitor / DPO / DSL (safeguarding carve-out) |
| 04 | [`LEGAL_REVIEW_PACK_04_CONTROLLER_MAPPING.md`](./LEGAL_REVIEW_PACK_04_CONTROLLER_MAPPING.md) | Role-by-purpose; Day School processor / direct Short Learning controller | **Locked (preferred)** | Solicitor / DPO |
| 05 | [`LEGAL_REVIEW_PACK_05_ACCESSIBILITY.md`](./LEGAL_REVIEW_PACK_05_ACCESSIBILITY.md) | WCAG 2.2 Level AA **target**; continuous improvement; no compliance claim | **Locked (target)** | Independent WCAG audit + legal wording check |
| 06 | [`LEGAL_REVIEW_PACK_06_COMPLAINT_SLAS.md`](./LEGAL_REVIEW_PACK_06_COMPLAINT_SLAS.md) | **2 / 10 / 20** working-day SLAs (+ 1-day urgent access/payment ack); safeguarding outside SLAs | **Locked** | Solicitor |
| 07 | [`LEGAL_REVIEW_PACK_07_STAFF_HANDBOOK_VISIBILITY.md`](./LEGAL_REVIEW_PACK_07_STAFF_HANDBOOK_VISIBILITY.md) | Staff handbooks/runbooks authenticated-only | **Locked** | Ops confirmation only (not a legal position change) |

**Master checklist:** [`PHASE6_LEGAL_REVIEW_CHECKLIST.md`](./PHASE6_LEGAL_REVIEW_CHECKLIST.md)  
**Verification evidence:** [`PHASE6_LEGAL_REVIEW_VERIFICATION.md`](./PHASE6_LEGAL_REVIEW_VERIFICATION.md)  
**Launch Decision Register:** [`UK_LAUNCH_DECISIONS.md`](./UK_LAUNCH_DECISIONS.md)  
**This handover:** `docs/PHASE6_LEGAL_REVIEW_HANDOVER.md`

---

## 2. Master decision register (commercial — closed)

| Area | Locked decision | Constant / primary surface |
|---|---|---|
| AI / human support | AI teaching guaranteed; human support safety net when available — not named 1:1 booking | `LOCKED_PROMISE` |
| Booking fees | No Short Learning cancellation / late-cancel / per-booking fee | `BOOKING_RULES_FACTS` |
| Day School vs Short Learning | Distinct models (`SchoolDayLesson` vs `StudentLearningBooking`) | Day School / Short Learning policies |
| Cooling-off | 14-day; immediate start; solicitor finalises use-during-period effect | `SUBSCRIPTION_COMMERCIAL_FACTS` |
| Subscription cancel | End of current billing period (not immediate) | Pack 01 · Subscription Terms |
| Booking cancel | ≠ subscription cancel; no fee / no booking refund | Pack 01 |
| Self-service cancel | Parent Portal (+ Support help) | Pack 01 |
| Failed payment | 7-day grace, then Short Learning entitlement suspend | Pack 01 |
| Mid-period refund | No automatic pro-rata | `REFUND_COMMERCIAL_FACTS` |
| Goodwill | Discretionary; Platform Admin / Owner; Support recommend only; School Admin no financial refunds | Pack 02 |
| Unused sessions / no human tutor | Not refund events | Pack 02 |
| Retention schedule | Commercial numeric schedule locked; school instructions override for school-controlled records; safeguarding no short auto-delete | `RETENTION_COMMERCIAL_FACTS` |
| Controller mapping | Purpose-based; Day School school controller / StarLiz processor; direct SL StarLiz controller | `CONTROLLER_MAPPING_FACTS` |
| Accessibility | WCAG 2.2 Level AA **objective**; no full-compliance claim pre-audit | `ACCESSIBILITY_COMMERCIAL_FACTS` |
| Complaint SLAs | Acknowledge **2** wd; substantive **10** wd; complex **20** wd; urgent access/payment ack **1** wd | `COMPLAINT_SLA_COMMERCIAL_FACTS` |
| Staff handbook visibility | Authenticated-only (not on public Policies hub) | `STAFF_HANDBOOK_VISIBILITY_FACTS` |

**Confirmed retained:** Complaint SLA numbers remain **2 / 10 / 20** working days (plus 1-day urgent acknowledgement).

---

## 3. Unresolved external-review items

Commercial owner decisions are closed. Remaining work is **external assurance** only:

| # | Item | Who | Gate |
|---|---|---|---|
| 1 | Focused **DSL/legal safeguarding review** (retention carve-out + public role wording) | DSL + solicitor | Before marking Safeguarding / related retention wording Approved |
| 2 | Independent **WCAG 2.2 AA audit** | Accessibility auditor | Before claiming conformance / removing “objective” / draft caveats |
| 3 | **Solicitor/DPO review of Packs 01–06** | Solicitor + DPO | Before Approved/Published on legal policies |
| 4 | **Supplier/processor contract labelling** (Stripe, Resend, OpenAI, hosting, etc.) | Legal + ops against real contracts | Before final Privacy / Data Protection supplier schedules |

Also confirm during solicitor/DPO review (not new commercial decisions):

- UK GDPR lawful bases against Pack 04  
- PECR / cookie consent UX for non-essential cookies  
- Children’s data age thresholds and parental authority wording  
- Provider terms alignment  

### Explicit non-claims until assurance completes

- Formal solicitor, DPO, DSL or accessibility certification approval  
- Full WCAG 2.2 AA compliance  
- Guaranteed human tutors / named private Short Learning tutor bookings  
- Cancellation fees or automatic mid-period pro-rata refunds  
- Guaranteed remedies from meeting complaint SLA clocks  

---

## 4. Affected routes and libraries

### Public (consumer-facing)

| Route | Role |
|---|---|
| `/policies` | Public hub (legal + product only; staff handbooks excluded) |
| `/policies/[slug]` | Public policy renderer (`publicVisible !== false`) |
| `/privacy` | Privacy Policy wrapper |
| `/terms` | Terms wrapper |
| `/cookies` | Cookie Policy wrapper |
| `/safeguarding-policy` | Safeguarding wrapper |
| `/data-retention` | Data Retention wrapper |
| `/ai-use` | AI Use wrapper |
| `/faq` | Parent FAQ (includes complaint SLAs, accessibility, billing) |
| `/knowledge-centre` | Plain-language Knowledge Centre |
| `/policies/complaints` | Complaints Procedure (SLA table) |
| `/policies/accessibility` | Accessibility Statement (WCAG 2.2 AA target) |
| `/policies/subscription-terms` | Subscription Terms |
| `/policies/refund-policy` | Refund Policy |
| `/policies/data-protection` | Data Protection / controller mapping |
| `/policies/data-retention` | Retention schedule |

### Authenticated (staff-only content)

| Route | Role |
|---|---|
| `/admin/policy-library` | Full 46-document index |
| `/admin/policy-library/[slug]` | Platform Admin document viewer (includes staff-only) |
| `/school-admin/knowledge-library` | Audience-filtered school/tutor library |
| `/school-admin/knowledge-library/[slug]` | School Admin document viewer |

Staff handbook public URLs (e.g. `/policies/tutor-handbook`) are **not published** (`publicVisible: false` → `notFound()`).

---

## 5. Content and code sources (for reviewers)

| Layer | Path |
|---|---|
| Locked commercial facts | `src/lib/policies/locked-facts.ts` |
| Legal policy bodies | `src/lib/policies/content/legal-policies.ts` |
| Product / ops policies | `src/lib/policies/content/product-policies.ts` |
| Staff handbooks / runbooks | `src/lib/policies/content/staff-docs.ts` |
| Registry / hub / href helpers | `src/lib/policies/registry.ts` |
| Document model | `src/lib/policies/types.ts`, `build.ts` |
| Knowledge Centre articles | `src/lib/knowledge/articles.ts` |
| Policy renderer | `src/components/policies/PolicyDocumentView.tsx` |
| Phase 6 tests | `tests/phase6_policies.test.ts` |

**Document set:** 46 policies (16 legal · 19 product/ops · 11 staff). No CMS; code-managed drafts.

---

## 6. Verification evidence (latest run)

**Command:** `npx tsx --test tests/phase6_policies.test.ts`  
**Result:** **22/22 pass** (2026-07-25)  
**Duration:** ~3.0s  

| Suite coverage (representative) | Result |
|---|---|
| 46-document registry | Pass |
| Legal review flags | Pass |
| Subscription / refund / retention / controller / accessibility locks | Pass |
| Complaint SLA lock (2 / 10 / 20; no open-owner placeholder) | Pass |
| Staff handbooks authenticated-only + absent from public hub | Pass |
| Knowledge Centre coverage | Pass |
| Canonical page modules + middleware allowlist | Pass |

**Public HTTP spot-check (localhost:3000):** **15/15** returned HTTP 200  

`/policies`, `/policies/complaints`, `/policies/accessibility`, `/policies/subscription-terms`, `/policies/refund-policy`, `/policies/data-protection`, `/policies/data-retention`, `/privacy`, `/terms`, `/cookies`, `/ai-use`, `/data-retention`, `/safeguarding-policy`, `/faq`, `/knowledge-centre`

**Staff-only check:** `/policies/tutor-handbook` serves Next.js not-found fallback (`meta name="next-error" content="not-found"`) — not listed on public hub.

**Constraints observed for this handover assembly:**

- No product behaviour change  
- No policy position / SLA number change  
- No schema / database / migration reset  
- No commit / push  

---

## 7. Suggested review order for external counsel

1. Pack 01 Subscription → Pack 02 Refunds (consumer money flow)  
2. Pack 06 Complaints (SLA clocks + safeguarding carve-out)  
3. Pack 04 Controller mapping → Pack 03 Retention (with DSL on safeguarding carve-out)  
4. Pack 05 Accessibility (wording only until audit commissioned)  
5. Pack 07 Staff visibility (confirm authenticated libraries acceptable)  
6. Cross-check live routes in §4 against final counsel wording  

---

## 8. Files included in this handover set

### Decision packs and indexes

- `docs/PHASE6_LEGAL_REVIEW_HANDOVER.md` *(this file)*  
- `docs/PHASE6_LEGAL_REVIEW_CHECKLIST.md`  
- `docs/PHASE6_LEGAL_REVIEW_VERIFICATION.md`  
- `docs/UK_LAUNCH_DECISIONS.md`  
- `docs/LEGAL_REVIEW_PACK_01_SUBSCRIPTION.md`  
- `docs/LEGAL_REVIEW_PACK_02_REFUNDS.md`  
- `docs/LEGAL_REVIEW_PACK_03_RETENTION.md`  
- `docs/LEGAL_REVIEW_PACK_04_CONTROLLER_MAPPING.md`  
- `docs/LEGAL_REVIEW_PACK_05_ACCESSIBILITY.md`  
- `docs/LEGAL_REVIEW_PACK_06_COMPLAINT_SLAS.md`  
- `docs/LEGAL_REVIEW_PACK_07_STAFF_HANDBOOK_VISIBILITY.md`  

### Implementation / evidence sources (read with packs)

- `src/lib/policies/**`  
- `src/lib/knowledge/articles.ts`  
- `src/components/policies/PolicyDocumentView.tsx`  
- `src/app/policies/**`, `src/app/faq/**`  
- `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/cookies/page.tsx`  
- `src/app/safeguarding-policy/page.tsx`, `src/app/data-retention/page.tsx`, `src/app/ai-use/page.tsx`  
- `src/app/admin/policy-library/**`  
- `src/app/school-admin/knowledge-library/**`  
- `tests/phase6_policies.test.ts`  

---

## 9. Full changed-file list (Phase 6 legal/policy surfaces)

Untracked or modified working-tree files for this workstream (git status at handover assembly):

```text
docs/LEGAL_REVIEW_PACK_01_SUBSCRIPTION.md
docs/LEGAL_REVIEW_PACK_02_REFUNDS.md
docs/LEGAL_REVIEW_PACK_03_RETENTION.md
docs/LEGAL_REVIEW_PACK_04_CONTROLLER_MAPPING.md
docs/LEGAL_REVIEW_PACK_05_ACCESSIBILITY.md
docs/LEGAL_REVIEW_PACK_06_COMPLAINT_SLAS.md
docs/LEGAL_REVIEW_PACK_07_STAFF_HANDBOOK_VISIBILITY.md
docs/PHASE6_LEGAL_REVIEW_CHECKLIST.md
docs/PHASE6_LEGAL_REVIEW_HANDOVER.md
docs/PHASE6_LEGAL_REVIEW_VERIFICATION.md
src/app/admin/policy-library/[slug]/page.tsx
src/app/admin/policy-library/page.tsx
src/app/faq/page.tsx
src/app/policies/[slug]/page.tsx
src/app/policies/page.tsx
src/app/school-admin/knowledge-library/[slug]/page.tsx
src/app/school-admin/knowledge-library/page.tsx
src/components/policies/PolicyDocumentView.tsx
src/lib/knowledge/articles.ts
src/lib/policies/build.ts
src/lib/policies/content/legal-policies.ts
src/lib/policies/content/product-policies.ts
src/lib/policies/content/staff-docs.ts
src/lib/policies/locked-facts.ts
src/lib/policies/registry.ts
src/lib/policies/types.ts
tests/phase6_policies.test.ts
```

*(Related but outside this handover pack index: `docs/SHORT_LEARNING_AND_PORTALS.md`, `docs/UK_LAUNCH_PRODUCTION_READINESS.md` — product/ops launch docs, not decision packs.)*

---

**End of handover.** Next actions are external: DSL/legal safeguarding review → WCAG audit → solicitor/DPO on Packs 01–06 → supplier labelling → then RC / launch commit when the owner requests it.
