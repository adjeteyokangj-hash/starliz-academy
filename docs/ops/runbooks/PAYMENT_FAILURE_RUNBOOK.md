# Payment Failure Runbook

Status: Draft operational runbook (Phase 6D).
Owner: Billing Operations Lead
Approvers: Technical Lead, Product Owner

## Review Frequency

- Quarterly.
- After every payment incident, webhook replay drill, provider integration change, or billing policy change.

## Purpose
Restore payment processing and entitlement consistency across providers.

## Scope
- Stripe, Revolut, Paystack checkout and webhook processing.
- Subscription access consistency.

## Triggers
- Elevated checkout failures.
- Webhook signature failures or delivery backlog.
- Entitlement mismatches after successful payment.

## Immediate Containment
1. Confirm provider scope (single provider vs all).
2. Enable incident banner/status page update if required.
3. Preserve webhook payload logs and delivery IDs.

## Recovery Procedure
1. Validate provider API health and credentials.
2. Validate webhook endpoint signatures and tolerance config.
3. Replay queued/failed webhooks safely by provider.
4. Reconcile subscription state for affected users.
5. Verify entitlement endpoints for sampled accounts.

## Verification Checklist
- Checkout succeeds in provider sandbox.
- Webhooks process and persist without errors.
- Subscription access reflects latest payment state.
- Duplicate webhook handling remains idempotent.

## Evidence to Collect
- Provider incident references.
- Failed and replayed webhook counts.
- Reconciled account list.
- Time to restore normal payment flow.

## Sign-Off

| Role | Name | Decision | Date | Evidence Link |
|---|---|---|---|---|
| Billing Operations Lead |  |  |  |  |
| Technical Lead |  |  |  |  |
| Product Owner |  |  |  |  |

## Exit Criteria
- Payment success rate back to baseline.
- Webhook queue drained and reconciled.
- Follow-up actions documented.
