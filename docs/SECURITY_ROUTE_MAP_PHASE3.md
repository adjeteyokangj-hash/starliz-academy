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
| `/api/billing/truenumeris/webhook` | TrueNumeris only | Provider-signed events only | HMAC `x-truenumeris-signature` verification | Low | Keep fail-closed HMAC verification when secret is absent/mismatched | Verified |
| `/api/webhooks/revolut` | Revolut only | Provider-signed events only | Revolut signature + timestamp tolerance | Low | Keep fail-closed secret requirement and timestamp window checks | Verified |
| `/api/webhooks/twilio/whatsapp` | Twilio inbound webhook | Public provider callback | Form payload parsing + duplicate insert tolerance | Missing Twilio request signature verification leaves spoofing/replay surface | Add `X-Twilio-Signature` verification before accepting inbound payloads | Follow-up |
| `/api/upload` | Admin | Admin-only | `requireAdmin()` + MIME/size checks | Low | Keep strict MIME/size/folder checks | Verified |
| `/api/school/safeguarding/upload` | Owner/Admin school members | School tenant boundary | `requireSchoolRoles()` + incident schoolId match + MIME/size checks | Low | Keep school-scoped guard and school/incident cross-check | Verified |
| `/api/auth/login` | Public login | Session issuance only | Password verification + `AUTH_SECRET` fail-closed check | Low | Keep fail-closed auth-secret requirement and refresh-token rotation | Verified |
| `/api/auth/refresh` | Public session refresh with cookie | Current session only | Signed refresh token verification + DB-backed token-family rotation | Low | Keep cookie-only refresh and revocation checks | Verified |
| `/api/auth/teacher-invite` | Public invite validation/acceptance | Invite token scope only | Signed/hashed invite token validation + consume-on-accept | Low | Keep single-use invite token flow and rate limiting on accept | Verified |
| `/api/auth/password-reset/request` and `/api/auth/password-reset/confirm` | Public recovery | Token-bound user only | Stored hashed reset token + expiry + single-use checks | Low | Keep hashed token persistence and invalidation on use | Verified |

## Notes
- School APIs in `src/app/api/school/**` were sampled for role checks; most routes use `requireSchoolPermission`/`requireSchoolRoles` and school scoping helpers.
- Webhook replay protection remains in place through `payment_webhook_events` dedupe in `src/lib/subscriptions/webhook-handler.ts` for events that include provider event IDs.
- `/api/webhooks/payment` supports Stripe, Paystack, and Revolut signatures. In production, missing provider secrets now fail closed rather than silently bypassing verification.
- `/api/billing/stripe/webhook`, `/api/webhooks/stripe-school`, `/api/webhooks/revolut`, and `/api/billing/truenumeris/webhook` are intentionally public because they are provider callback endpoints and cannot rely on browser sessions.
- `/api/auth/login`, `/api/auth/refresh`, `/api/auth/teacher-invite`, and password-reset routes are intentionally public because they bootstrap or restore authentication. Their boundary is token/password verification rather than session presence.
- `/api/webhooks/twilio/whatsapp` is intentionally public for inbound message delivery, but it still depends on database duplicate tolerance instead of provider-authenticated request verification.

## Tests Added
- `tests/security_admin_route_rejections.test.ts`
	- Confirms non-admin rejection on safeguarding incident list/create, detail/update, audit, escalation, timeline, and admin usage-events routes.
- `tests/payment_webhook_security.test.ts`
	- Confirms payment webhook missing-signature rejection.
	- Confirms production fail-closed behavior when Stripe, Paystack, or Revolut secrets are absent.
	- Confirms dedicated Stripe and Revolut webhook endpoints fail closed when secrets are missing.

## Follow-Up Candidates
1. Add Twilio webhook request-signature verification and regression coverage for invalid/missing `X-Twilio-Signature`.
2. Add regression tests ensuring `resolveParentScope()` does not resolve by email in production.
3. Extend payment webhook replay/idempotency tests around duplicate provider event IDs for the shared webhook path.
