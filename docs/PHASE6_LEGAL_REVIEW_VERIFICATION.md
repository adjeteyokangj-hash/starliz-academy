# Phase 6 verification evidence — legal-review handover

Date: 2026-07-25  
Command: `npx tsx --test tests/phase6_policies.test.ts`  
Result: **22/22 pass**  
Constraints: no product/policy/SLA/schema/DB/route changes during handover assembly; no migration reset; no commit/push.

## Test output summary

```text
tests 22
pass 22
fail 0
```

Notable locks verified:

- Complaint SLAs: 2 / 10 / 20 working days (urgent 1-day ack); no open-owner placeholder
- Staff handbooks: `publicVisible: false`; absent from public hub
- Subscription / refund / retention / controller / accessibility commercial locks present

## Public route spot-check

15/15 HTTP 200 on localhost:3000 for:

`/policies`, `/policies/complaints`, `/policies/accessibility`, `/policies/subscription-terms`, `/policies/refund-policy`, `/policies/data-protection`, `/policies/data-retention`, `/privacy`, `/terms`, `/cookies`, `/ai-use`, `/data-retention`, `/safeguarding-policy`, `/faq`, `/knowledge-centre`

Staff-only: `/policies/tutor-handbook` → Next.js not-found meta (`content="not-found"`).
