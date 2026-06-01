# Security Route Map - Phase 3

## Scope
This map captures the highest-risk API groups audited in Phase 3 and documents guard posture, tenant boundaries, risks, and fixes.

## Route Inventory (High Risk)

| Route | Allowed Roles | Tenant Scope | Guard Used | Missing Guard Risk | Recommended Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/schools/[schoolId]/safeguarding/incidents` | Admin | Global admin + schoolId partition | `requireAdmin()` + in-memory governance rules | Previously trusted spoofable `x-starliz-role` headers | Enforce authenticated admin session before any role/action logic | Patched |
| `/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]` | Admin | Global admin + schoolId partition | `requireAdmin()` + workflow transition checks | Previously trusted spoofable role headers | Enforce `requireAdmin()` and derive actor from session | Patched |
| `/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/audit` | Admin | Global admin + schoolId partition | `requireAdmin()` | Previously trusted spoofable role headers | Enforce `requireAdmin()` | Patched |
| `/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/escalation` | Admin | Global admin + schoolId partition | `requireAdmin()` + transition checks | Previously trusted spoofable role headers | Enforce `requireAdmin()` and derive actor from session | Patched |
| `/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/timeline` | Admin | Global admin + schoolId partition | `requireAdmin()` | Previously trusted spoofable role headers | Enforce `requireAdmin()` and derive actor from session | Patched |
| `/api/admin/usage-events` | Admin | Global admin endpoint | `requireAdmin()` | Previously any authenticated user could post to admin endpoint | Replace `requireSession()` with `requireAdmin()` | Patched |
| `/api/parent/*` and `/api/student/*` routes using `resolveParentScope` | Parent account only | Parent -> owned child only | `requireSession()` + `resolveParentScope()` + child ownership checks | Parent scope could fall back to email matching, enabling identity ambiguity | Restrict fallback to local dev opt-in env only | Patched |
| `/api/webhooks/payment` | Webhook callers only | Provider-signed events only | `processPaymentWebhookRequest()` | Production could accept requests when secrets were absent | Fail closed in production when provider secret is missing; reject requests with no signature headers | Patched |
| `/api/billing/stripe/webhook` | Stripe only | Provider-signed events only | Stripe signature verification + event dedupe in handler | Low (already strict) | Keep strict mode (`allowFallbackSignature: false`) | Verified |
| `/api/webhooks/stripe-school` | Stripe only | Provider-signed events only | Stripe signature verification | Low (already strict) | Keep strict signature verification + school resolution | Verified |
| `/api/upload` | Admin | Admin-only | `requireAdmin()` + MIME/size checks | Low | Keep strict MIME/size/folder checks | Verified |
| `/api/school/safeguarding/upload` | Owner/Admin school members | School tenant boundary | `requireSchoolRoles()` + incident schoolId match + MIME/size checks | Low | Keep school-scoped guard and school/incident cross-check | Verified |

## Notes
- School APIs in `src/app/api/school/**` were sampled for role checks; most routes use `requireSchoolPermission`/`requireSchoolRoles` and school scoping helpers.
- Webhook replay protection remains in place through `payment_webhook_events` dedupe in `src/lib/subscriptions/webhook-handler.ts` for events that include provider event IDs.

## Follow-Up Candidates
1. Add integration tests that assert admin safeguarding endpoints reject non-admin sessions.
2. Add regression tests ensuring `resolveParentScope()` does not resolve by email in production.
3. Add tests for payment webhook failure behavior when signature headers or secrets are missing.
