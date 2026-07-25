# Legal-review package — Subscription & cancellation (Decision pack 1)

Date: 2026-07-25  
Status: Preferred commercial stance locked by product owner — **pending solicitor review**  
Not formal legal advice.

## Purpose

Give external counsel the locked commercial positions for UK consumer subscription cooling-off, cancellation, booking vs subscription separation, self-service cancel, and failed-payment grace — so they can produce compliant final wording.

## Source documents to review

| Document | Path |
|---|---|
| Subscription Terms | `/policies/subscription-terms` · `src/lib/policies/content/legal-policies.ts` |
| Refund Policy | `/policies/refund-policy` |
| Booking and Cancellation Policy | `/policies/booking-cancellation` |
| Terms and Conditions (subscriptions section) | `/terms` |
| Locked facts constant | `src/lib/policies/locked-facts.ts` → `SUBSCRIPTION_COMMERCIAL_FACTS` |
| Parent FAQ | `/faq` |
| Knowledge Centre billing articles | `src/lib/knowledge/articles.ts` |
| Checklist | `docs/PHASE6_LEGAL_REVIEW_CHECKLIST.md` |

## Locked commercial rules (encode, do not invent)

1. **14-day cooling-off** for new consumer online subscriptions; service may start immediately with parent agreement; unused-service refund path; solicitor finalises effect of use during cooling-off.
2. **Subscription cancel = end of current billing period** (not immediate). Access, existing bookings, new bookings while active, and reports continue until expiry; then no renewal.
3. **After expiry:** no new Short Learning bookings/sessions; historical reports per retention; Day School via school arrangement continues where applicable.
4. **Booking cancel ≠ subscription cancel.** Booking cancel: no fee, no booking refund, no subscription change.
5. **Self-service cancel** in Parent Portal; Support may assist; no phone-only / hidden barrier.
6. **Failed payment:** 7-day grace with notice/retries; then Short Learning entitlement suspend; restore immediately on successful payment; history intact.
7. **Human support promise unchanged.**

## Explicit ask for solicitor

- Final Consumer Contracts / digital content cooling-off wording (including immediate performance and use).
- Confirmation that end-of-period cancel + no mid-period pro-rata (preferred) is lawfully presented.
- Any mandatory notices or buttons required at purchase / cancel.
- Alignment with payment-provider (e.g. Stripe) customer portal realities.

## Still open (owner)

- None for Pack 01 subscription cancel / cooling-off / grace (see Pack 02 for refunds).

## Verification after this pack

- `npm run test:phase6-policies`
- Public route spot-check including `/policies/subscription-terms` and `/policies/refund-policy`
