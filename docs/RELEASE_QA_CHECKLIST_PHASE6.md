# Release QA Checklist (Phase 6 Foundation)

Status: Operational checklist for pre-release verification.
Scope: UK launch readiness with safe test data and non-production services only.

## Browser Checks
- [ ] Parent signup, login, logout.
- [ ] Parent dashboard loads with active child context.
- [ ] Child creation and profile updates function correctly.
- [ ] Admin assignment flow creates and tracks assignments.

## Mobile Checks
- [ ] Parent dashboard renders on mobile viewport (390x844 baseline).
- [ ] Parent navigation and key actions are usable without overlap.
- [ ] Consent, report, and support entry points remain accessible on mobile.

## Payment and Subscription Checks
- [ ] Subscription status transitions validated with mock status updates.
- [ ] Expired/cancelled access gating verified through access endpoint.
- [ ] No real payment charge performed in test automation.
- [ ] Billing provider calls remain disabled unless explicitly approved in non-prod.

## Auth and Recovery Checks
- [ ] Login/logout session boundaries verified.
- [ ] Forgot-password request flow returns expected response.
- [ ] Parent PIN set and reset (change) workflow verified.
- [ ] Session and parent-scope protections reject unrelated access.

## Child-Data Checks
- [ ] Parent consent required before child learning access where applicable.
- [ ] Export and deletion requests can be created and tracked.
- [ ] AI-use disclosure visible in parent consent data.
- [ ] Sensitive admin actions generate audit events.

## Rollback Checks
- [ ] Identify latest stable commit hash before release candidate.
- [ ] Verify migration and schema compatibility path.
- [ ] Confirm service rollback playbook owner and execution steps.
- [ ] Confirm alerting/monitoring channels for post-release observation window.

## CI Safety Notes
- Use seeded or deterministic test data only.
- Avoid production endpoints and live payment charges.
- Gate optional teacher/school assertions behind environment credentials.
- Keep full E2E pack opt-in for pipelines with proper fixtures.
