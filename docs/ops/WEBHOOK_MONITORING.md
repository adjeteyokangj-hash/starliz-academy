# Webhook Monitoring

Status: Phase 7 operations foundation.

## Coverage
- Payment provider webhooks.
- School/payment lifecycle webhook processors.

## Review Routine
1. Review recent webhook failures every day.
2. Confirm replay/idempotency behavior on duplicate events.
3. Verify production fail-closed behavior when secrets are missing.

## Safe Failure Summary Rules
- Report provider, endpoint, status code, and timestamp.
- Do not expose child identifiers, raw signatures, or secret values.
- Do not include full request/response payloads in routine reports.

## Escalation
- Warning: isolated transient failures.
- Critical: sustained failure burst, signature verification issues, or access inconsistencies.

## Manual Review Required
- Pager/on-call ownership.
- Final SLA for webhook backlog and replay windows.
