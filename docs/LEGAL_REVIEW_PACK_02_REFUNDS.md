# Legal-review package — Refunds & goodwill (Decision pack 2)

Date: 2026-07-25  
Status: Preferred commercial stance locked by product owner — **pending solicitor review**  
Not formal legal advice.  
Depends on: `docs/LEGAL_REVIEW_PACK_01_SUBSCRIPTION.md`

## Purpose

Lock refund commercial rules so counsel can finalise consumer-facing wording that protects revenue while allowing fair exceptional remedies.

## Source documents

| Document | Path |
|---|---|
| Refund Policy | `/policies/refund-policy` |
| Subscription Terms | `/policies/subscription-terms` |
| Locked facts | `REFUND_COMMERCIAL_FACTS` in `src/lib/policies/locked-facts.ts` |
| FAQ / Knowledge Centre | `/faq`, billing articles in `src/lib/knowledge/articles.ts` |
| Checklist | `docs/PHASE6_LEGAL_REVIEW_CHECKLIST.md` |

## Locked commercial rules

1. **No automatic pro-rata** on mid-period voluntary cancel; access continues to period end.
2. **Goodwill refunds** are exceptional, never automatic; Platform Admin approve (Owner for exceptional); Support recommend only; School Admin no financial refunds; audit: reason, amount, approver, date, notes.
3. **No refund for unused sessions** — access purchase, not attendance guarantee.
4. **No refund for human tutor unavailability** — AI guaranteed; human is safety net.
5. **Significant platform failure** — may offer extension, credit or goodwill; no automatic specific remedy promised.
6. **Payment provider fees** — not promised recoverable.
7. Cooling-off unused-service path remains as in Pack 01 (solicitor finalises use-during-period effect).

## Commercial matrix

| Situation | Refund |
|---|---|
| Parent cancels subscription mid-period | No automatic pro-rata |
| Parent cancels a booking | No refund (and no fee) |
| Human tutor unavailable | No refund |
| Child did not attend / unused sessions | No refund |
| Duplicate payment / billing mistake | Goodwill may be issued |
| Major platform failure | Credit, extension or goodwill may be considered |
| Exceptional compassionate case | Platform Admin/Owner discretion |

## Ask for solicitor

- Confirm presentation of “no automatic pro-rata” with end-of-period cancel under UK consumer law.
- Cooling-off interaction with “already used digital service”.
- Whether goodwill discretion language needs consumer-fairness constraints.
- Payment-provider fee disclaimer wording.

## Product note (documentation only)

This pack describes **authority and audit expectations** for goodwill refunds. It does not add a new in-app refund CMS in Phase 6; production billing ops should keep an audit trail when issuing provider-side refunds.
