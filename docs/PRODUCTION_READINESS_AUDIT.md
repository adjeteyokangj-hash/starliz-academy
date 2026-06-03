# StarLiz Academy Production Readiness Audit (Phase 1)

Date: 2026-06-03
Scope: Audit-only. No feature changes.

## Executive Summary

Current production readiness status: **6.5/10 (Architecture ahead of operations hardening)**.

Top blockers before wider beta/production expansion:
1. **Safeguarding admin API uses in-memory global store** for incident/timeline/audit data in one route family instead of durable persistence.
2. **Storage boundary inconsistency**: most media uses Cloudflare R2, but safeguarding evidence upload writes to local filesystem (`public/uploads/safeguarding`).
3. **Incomplete release controls around exposed unfinished experiences** (visible Coming Soon/demo/placeholder surfaces in user-facing paths).
4. **Backup and monitoring are environment-flag based** and not fully enforced at runtime as hard prerequisites.

---

## 1) Build / CI Status

### Current status
- CI workflow exists and is structured.
- Main verify chain includes: Prisma validate, Prisma generate, typecheck, lint, unit tests, build.
- Separate E2E auth job exists and depends on verify.

### Evidence
- Workflow: `.github/workflows/ci.yml`
- Scripts: `package.json`
- Key script commands:
  - `npx tsc --noEmit`
  - `npm run lint -- --max-warnings=0`
  - `npm test`
  - `npm run build`
  - `npm run test:e2e:auth`

### Risks
- Unit `npm test` command is narrow and does not cover all critical domains by default.
- E2E coverage is present but segmented; production gates rely on selected suites.

### Rating
- **Amber-Green**: solid baseline, needs stronger release gate composition.

---

## 2) Authentication / Access Control

### Current status
- Global middleware performs broad auth/role gate checks and adds security headers.
- API guard helpers exist for session/admin/permission and parent unlock flows.
- Parent/student routing protections are present in middleware and parent scope resolution patterns.
- School RBAC guard layer is implemented (`requireSchoolAccess`, role/permission checks, access logging).

### Evidence
- Middleware: `middleware.ts`
- API guard: `src/lib/api_guard.ts`
- School RBAC/guards: `src/lib/schools/guards.ts`
- Representative routes:
  - Student/parent read path currently resolves parent scope from session: `src/app/api/student/dashboard-summary/route.ts`
  - Parent scope checks: `src/app/api/parent/insights/route.ts`
  - Admin permission example: `src/app/api/admin/students/[id]/route.ts`

### Risks
- Student API folder has many routes using `requireSession`; correctness depends on downstream parent/child scope derivation pattern consistency.
- Some permission naming suggests write privilege used for GET in admin area (`students:write` on read path), which can cause over-broad grants.

### Rating
- **Amber**: good control framework, needs permission minimization pass and route-by-route verification matrix.

---

## 3) Payments / Subscriptions

### Current status
- Multi-provider architecture exists (Stripe, Revolut, Paystack, manual fallback) with country/provider routing.
- Webhook signature verification exists for Stripe/Paystack/Revolut and fallback signature path.
- Subscription enforcement library supports trial limits, feature gating, status checks, and child limits.

### Evidence
- Checkout route and provider branching: `src/app/api/subscription/checkout/route.ts`
- Provider routing by country/flags: `src/lib/billing/payment-routing.ts`
- Webhook entry + signature checks: `src/lib/subscriptions/webhook-entry.ts`
- Subscription enforcement: `src/lib/subscriptions/enforcement.ts`
- Payment client indirection: `src/lib/stripe.ts`

### Risks
- Checkout route directly consumes `PAYSTACK_SECRET_KEY` and `REVOLUT_MERCHANT_API_KEY`; Stripe key is resolved via API key abstraction. Key source strategy is mixed.
- `processPaymentWebhookRequest(...allowFallbackSignature: true)` introduces broader acceptance mode; needs explicit production policy hardening and test coverage to prevent misconfiguration drift.
- Feature-gate endpoint currently reports access but broader server-side enforcement consistency for all premium features should be formally mapped and tested.

### Rating
- **Amber**: strong foundation, requires tightening of key management consistency and webhook acceptance posture.

---

## 4) Child Data / GDPR Readiness

### Current status
- Draft policy documents exist for privacy and retention.
- Consent accept/withdraw APIs exist with audit logging.
- Parent data request workflow exists for export/deletion request logging.
- Child data access checks are implemented in multiple parent-scoped routes.

### Evidence
- Privacy docs:
  - `docs/PRIVACY_POLICY_UK_DRAFT.md`
  - `docs/CHILD_DATA_RETENTION.md`
  - `docs/DATA_RETENTION_POLICY_UK_DRAFT.md`
- Consent APIs:
  - `src/app/api/consent/route.ts`
  - `src/app/api/consent/withdraw/route.ts`
- Parent data requests: `src/app/api/parent/data-requests/route.ts`

### Risks
- Retention timelines are still draft and not fully converted to enforced numeric schedules/purge runbooks.
- Export/deletion are currently request-tracked flows; fulfillment automation and exception workflow need explicit production controls and SLA definitions.
- Policy docs are marked draft and need legal/signoff closure for external publication.

### Rating
- **Amber-Red**: compliance architecture present, legal and operational completion pending.

---

## 5) Storage / Media

### Current status
- Cloudflare R2 upload utilities and typed upload flow are present and used by multiple features.
- Certificate exports and generated AI visual assets can persist via R2.

### Evidence
- R2 utility: `src/lib/r2-upload.ts`
- Upload API: `src/app/api/upload/route.ts`
- Certificate export storage: `src/lib/certificate-export-storage.ts`

### Risks
- Safeguarding file upload route writes directly to local server disk (`public/uploads/safeguarding`) instead of R2/object storage.
- Mixed persistence model increases incident handling risk during horizontal scaling and disaster recovery.

### Rating
- **Amber-Red**: mostly cloud-ready, but safeguarding data path is a critical exception.

---

## 6) Monitoring / Backups / Health

### Current status
- Public health endpoint exists and returns safe operational report.
- Admin monitoring endpoint summarizes failures, API keys, webhook health signals, and backup/monitoring env presence.
- Audit logging is pervasive across sensitive actions.

### Evidence
- Health route and builder:
  - `src/app/api/health/route.ts`
  - `src/lib/ops/health.ts`
- Admin monitoring dashboard API: `src/app/api/admin/monitoring/route.ts`
- Secret rotation runbook: `docs/secret-rotation-runbook.md`
- Backup/export UI exists: `src/app/admin/settings/backup/page.tsx`

### Risks
- Backup state is environment-config presence check; no mandatory restore verification evidence in this audit pass.
- Monitoring readiness is env-flag based (`SENTRY_DSN` / `MONITORING_DSN`) rather than hard fail gate for production boot.

### Rating
- **Amber**: operational controls present but not yet strict enough for production assurance.

---

## 7) E2E / Manual QA Gaps

### Current status
- Good E2E inventory exists for auth/session, parent shell, assigned loops, stabilization regressions, and admin schools ops.
- Manual QA checklist exists and is detailed.

### Evidence
- E2E specs in `tests/e2e/*.spec.ts`
- Manual checklist: `MANUAL_E2E_TEST_CHECKLIST.md`

### Coverage observations for requested journeys
- Login: covered (auth/session refresh suite).
- Parent PIN: covered (parent profile gate flows).
- Student learning: partially covered via assigned content loop and final smoke.
- QLF: present in broader suites but no single dedicated production journey gate in scripts.
- Homework: covered in some route/unit paths; explicit full E2E journey not clearly isolated as a gate script.
- Certificates: route/UI partial coverage, but end-to-end issuance/export/verify chain should be promoted to explicit release gate.
- Admin flows: strong coverage in schools ops and selected admin suites.

### Risks
- Current release commands run selected subsets; full critical journey gate matrix is not enforced by one command profile.

### Rating
- **Amber**: substantial testing exists, but release gate composition is incomplete.

---

## 8) Feature Exposure (Unfinished / Placeholder)

### Current status
- Multiple routes/pages intentionally expose Coming Soon, demo, or placeholder-safe behavior.

### Evidence samples
- Admin inbox page says Coming Soon: `src/app/admin/inbox/page.tsx`
- Student dashboard certificate center says Coming Soon: `src/app/student/dashboard/page.tsx`
- Homepage contains Coming Soon statuses: `src/app/page.tsx`
- Certificate templates page advertises demo preview data only: `src/app/admin/certificates/templates/page.tsx`
- Public country profiles include coming-soon country states: `src/lib/public-country-profiles.ts`
- Admin student detail includes placeholder-safe action note: `src/app/admin/students/[id]/page.tsx`

### Risks
- Unfinished experiences are visible in production surface unless explicitly gated by launch scope / feature flags.
- Can create trust and support burden if not controlled by region/role/environment policies.

### Rating
- **Amber-Red**: requires explicit exposure policy and gating enforcement before wider rollout.

---

## Current Status Summary

- Build/CI: Amber-Green
- Authentication/Access: Amber
- Payments/Subscriptions: Amber
- Child Data/GDPR: Amber-Red
- Storage/Media: Amber-Red
- Monitoring/Backups/Health: Amber
- E2E/Manual QA: Amber
- Feature Exposure: Amber-Red

Overall: **6.5/10 production readiness**.

---

## Top Risks

1. Safeguarding incident data path using in-memory global store under admin API path.
2. Safeguarding evidence local-disk upload path inconsistent with cloud object storage strategy.
3. Compliance docs and retention schedules still draft, with operational fulfillment pathways not yet strict.
4. Mixed payment key source strategy and permissive webhook fallback mode requiring tighter production policy.
5. Unfinished/demo surfaces visible without complete feature-flag enforcement matrix.

---

## Blockers (Must Resolve Before Broad Production Rollout)

1. **Durable safeguarding persistence and access hardening** for `src/app/api/admin/schools/[schoolId]/safeguarding/_lib/*` path family.
2. **Single storage policy** for safeguarding and certificate evidence (cloud object storage, not local disk in prod topology).
3. **Retention policy finalization and execution controls** (numeric schedules, legal-hold flow, delete/anonymize runbooks).
4. **Release gate hardening**: enforce critical journey test matrix in CI for auth, parent PIN, student learning, homework, certificates, and admin flows.

---

## Recommended Priority Order

1. Security + data durability blockers (safeguarding persistence, storage unification).
2. Production release gates (CI matrix hardening and mandatory checks).
3. Payment/webhook hardening consistency (key source, strict verification mode policy).
4. GDPR operational completion (retention schedule, deletion/export fulfillment governance).
5. Feature exposure controls (flags and route-level launch gating).

---

## Phase 2 Implementation Plan (Build, CI & Release Stability)

### Objective
Stabilize release pipeline so every deploy is validated by deterministic, production-relevant quality gates.

### Workstreams
1. **Single source release command**
   - Add one release verification script chaining typecheck, lint, curated unit suites, curated E2E smoke suites, and build.
   - Ensure consistent local and CI usage.

2. **CI gate expansion**
   - Keep existing verify and e2e-auth jobs.
   - Add targeted production smoke job(s) for:
     - parent PIN journey
     - assigned lesson completion journey
     - certificate export/verify journey
     - key admin operational flow

3. **Failure diagnostics quality**
   - Standardize job artifacts: lint output, typecheck output, Playwright traces/videos on failure, route smoke report.
   - Add explicit pass/fail summary artifact for release decisioning.

4. **Environment contract checks**
   - Enforce required env groups for chosen payment provider(s), monitoring, backup, auth secret, and R2.
   - Fail CI if required production env contract is incomplete for release profile.

5. **Release checklist automation**
   - Wire checklist generation to current code state and CI outcomes.
   - Produce machine-readable readiness summary for go/no-go.

### Exit Criteria for Phase 2
- One deterministic release gate command used by both developers and CI.
- CI blocks merge/release on typecheck/lint/test/build failures and critical E2E smoke failures.
- Diagnostic artifacts are consistently available for failed runs.
- Env contract checks fail fast for missing required production secrets/config.

---

## Audit Constraints Compliance

This Phase 1 audit did **not** perform:
- Prisma reset
- Migration reset
- DB push reset
- Git push
- Rebase
- Cherry-pick

This phase is report-only and does not change product features.
# StarLiz Academy Production Readiness Audit (Phase 1)

Date: 2026-06-03
Scope: audit-only, no feature changes

## Executive Summary

Current production readiness is strong on architecture and route breadth, but blocked by a few hardening risks that must be addressed before wider launch.

Overall readiness estimate: 6.8/10

Top blockers:
1. Safeguarding admin API uses in-memory store in one route family instead of durable DB-backed storage.
2. Mixed media storage paths (Cloudflare R2 for most uploads, local disk for safeguarding evidence uploads) create compliance and backup gaps.
3. CI and monitoring are present, but release guardrails are not yet strict enough for environment drift and regression prevention.

## 1) Build / CI Status

### Current status
- Build/test script coverage is good in package scripts.
- CI workflow exists and runs install, prisma validate/generate, typecheck, lint, unit tests, build, then e2e auth.
- Commands are standardized and CI-friendly.

### Evidence
- package scripts: package.json
- CI workflow: .github/workflows/ci.yml

### Risks
- CI has only one e2e lane (auth-focused), while broader critical journeys rely on manual checks or optional e2e scripts.
- Build success can still be affected by environment assumptions (payment and webhook secrets, backup provider, monitoring DSN).

### Blockers
- No blocker-level CI misconfiguration found, but release confidence is limited by partial e2e gating.

## 2) Authentication / Access Control

### Current status
- Middleware enforces role-aware redirects, public route allowlist, refresh flow, security headers.
- API-level guards exist: requireSession, requireAdmin, requireAdminPermission, school role/permission guards.
- Parent scope and parent unlock flows are consistently used in parent APIs.

### Evidence
- middleware: middleware.ts
- API guard: src/lib/api_guard.ts
- school RBAC guards: src/lib/schools/guards.ts

### Risks
- Some student routes depend on requireSession plus parent-scope semantics; role assumptions should be verified route-by-route in hardening pass.
- A development fallback admin path exists behind env flags; safe by default but should be explicitly verified disabled in production deployment.

### Blockers
- No immediate blocker, but role-contract consistency audit is required before launch sign-off.

## 3) Payments / Subscriptions

### Current status
- Multi-provider payment routing exists: Stripe, Revolut, Paystack, manual fallback.
- Checkout and webhook processing include provider signatures and metadata linking to parent/plan.
- Subscription enforcement exists for learning and premium features, including trial limits and plan features.

### Evidence
- checkout: src/app/api/subscription/checkout/route.ts
- provider routing: src/lib/billing/payment-routing.ts
- webhook verification entry: src/lib/subscriptions/webhook-entry.ts
- access enforcement: src/lib/subscriptions/enforcement.ts

### Risks
- Mixed operational posture: UI and docs indicate Stripe-first while Paystack/Revolut paths remain present and configurable.
- Signature fallback behavior is flexible; should be tightened per environment and provider rollout policy.
- Key source of truth should be unified and audited for live/test separation in deployment config.

### Blockers
- Not a functional blocker, but policy blocker: production provider matrix and key-separation policy need explicit lock-down.

## 4) Child Data / GDPR Readiness

### Current status
- Draft policies exist for privacy and retention.
- Consent acceptance and withdrawal are auditable.
- Parent data-request endpoints exist for export/deletion request creation and listing.

### Evidence
- privacy docs: docs/PRIVACY_POLICY_UK_DRAFT.md
- retention docs: docs/CHILD_DATA_RETENTION.md, docs/DATA_RETENTION_POLICY_UK_DRAFT.md
- consent APIs: src/app/api/consent/route.ts, src/app/api/consent/withdraw/route.ts
- parent data requests: src/app/api/parent/data-requests/route.ts

### Risks
- Policies are still marked draft and require legal sign-off.
- Data request workflow logs requests, but full deletion/export execution and verification lifecycle needs explicit operational runbook coverage.
- Safeguarding evidence storage inconsistency impacts data-boundary and retention compliance.

### Blockers
- Legal/policy sign-off and safeguarding storage alignment are launch blockers for GDPR confidence.

## 5) Storage / Media

### Current status
- Cloudflare R2 upload foundation is implemented with typed folders, MIME allowlist, size limits, object key generation.
- Certificate/media flows use R2 in core paths.

### Evidence
- R2 upload core: src/lib/r2-upload.ts
- generic upload route: src/app/api/upload/route.ts
- certificate export storage path present via R2 usage

### Risks
- Safeguarding evidence upload currently writes to local disk under public/uploads/safeguarding.
- Local filesystem storage is inconsistent with R2 strategy, weakens portability/recovery, and increases privacy risk.

### Blockers
- Mixed storage architecture for safeguarding evidence is a top blocker for production hardening.

## 6) Monitoring / Backups / Health

### Current status
- Health endpoint exists and returns safe summary payload.
- Admin monitoring endpoint checks failed jobs, audit volume, API key status, webhook metrics, backup env flags, monitoring env flags.
- Audit logging is widely used across sensitive operations.

### Evidence
- health route: src/app/api/health/route.ts
- monitoring route: src/app/api/admin/monitoring/route.ts
- health library: src/lib/ops/health.ts
- backup/export UI: src/app/admin/settings/backup/page.tsx

### Risks
- Backup checks are largely environment-flag based; full backup execution and restore verification are not clearly automated here.
- Error logging is mostly console-based in many API paths; centralized telemetry consistency needs strengthening.

### Blockers
- Backup/restore proof and monitoring signal normalization are high-priority but not immediate hard blockers if quickly addressed.

## 7) E2E / Manual QA Gaps

### Current status
- E2E suite exists with auth, parent profile gate, assigned content loops, school ops, smoke/stabilization specs.
- Manual checklist exists and is extensive.

### Evidence
- e2e specs: tests/e2e/*.spec.ts
- manual checklist: MANUAL_E2E_TEST_CHECKLIST.md

### Coverage relative to requested critical journeys
- login: covered (auth-session-refresh, release-qa-foundation)
- parent PIN: covered (parent-profile-gate)
- student learning: partially covered (assigned loop, tutor runtime, final smoke)
- QLF: indirect/partial in broader tests; dedicated critical-path e2e not clearly isolated
- homework: partial coverage; no strict end-to-end launch gate dedicated only to homework critical path
- certificates: partial coverage through export paths; student dashboard still shows coming-soon messaging in one area
- admin flows: broad but fragmented; production gate should define required subset

### Risks
- Critical paths are tested but distributed; launch gating set is not yet a single mandatory production pack.

### Blockers
- Not a blocker if Phase 2 introduces a strict release test pack and pass criteria.

## 8) Feature Exposure (unfinished / placeholder / demo)

### Current status
- Several visible "coming soon" or demo-safe surfaces remain exposed.

### Evidence examples
- admin inbox page shows "Email inbox coming soon": src/app/admin/inbox/page.tsx
- student dashboard certificate center coming-soon message: src/app/student/dashboard/page.tsx
- country profiles for Ghana/Nigeria explicitly coming soon: src/lib/public-country-profiles.ts
- certificate template page references demo preview data: src/app/admin/certificates/templates/page.tsx
- student admin page notes placeholder-safe actions: src/app/admin/students/[id]/page.tsx

### Risks
- User-visible unfinished surfaces can reduce trust and create support overhead in live rollout.

### Blockers
- Not blocker-level for private beta if gated by role/region, but blocker-level for broader public release without exposure controls.

---

## Major Risks (Consolidated)

1. Safeguarding route family includes in-memory storage contracts under admin API path, not durable storage.
2. Safeguarding evidence uploads use local disk while core media uses R2.
3. Legal retention/privacy docs are draft and not yet signed off.
4. Production release test gate is fragmented across scripts/specs.
5. Payment provider and key-separation policy requires stricter operational lock.

## Top Blockers

1. Replace in-memory safeguarding store paths with durable DB-backed implementation and migration-safe contracts.
2. Standardize safeguarding evidence storage to R2 (or a single approved durable object store) with retention controls.
3. Finalize GDPR/retention legal policy sign-off and align runtime retention implementation.

## Recommended Priority Order

1. Safeguarding data durability and storage unification.
2. Compliance lock: retention/legal sign-off and parent rights execution evidence.
3. Release guardrails: mandatory CI/e2e production pack and explicit go/no-go checks.
4. Payment hardening: provider enablement matrix and strict live/test key policy.
5. Feature exposure controls for unfinished surfaces.
6. Monitoring/backup operational proof (restore drill + alerting baselines).

## Phase 2 Implementation Plan (Build, CI & Release Stability)

Goal: make build and release verification deterministic and gateable.

### Workstream A: Command Contract Hardening
- Freeze production command contract for typecheck, lint, tests, build.
- Add one command alias for full production verification run.
- Ensure non-interactive, deterministic behavior in CI and local pre-release runs.

### Workstream B: CI Gate Strengthening
- Keep verify lane as required status check.
- Add required targeted e2e lane for release-critical paths (auth + parent PIN + assignment loop + one admin flow).
- Fail fast on missing env requirements for release-mode jobs.

### Workstream C: Release Checklist Automation
- Convert production checklist into machine-readable checks where feasible.
- Publish release artifact summary (typecheck/lint/test/build pass, env audit pass, webhook monitor health snapshot).

### Workstream D: Drift Detection
- Add checks for provider config drift (billing provider flags vs active env keys).
- Add checks for monitoring/backup config drift.

### Workstream E: Evidence and Sign-off
- Generate one release readiness report artifact each run.
- Define owner sign-offs for engineering, compliance, and operations.

### Exit Criteria for Phase 2
- Required CI checks are green on main.
- Release verification command passes in clean environment.
- Critical e2e release pack is green.
- Release report artifact generated and reviewed.

## Current Status Snapshot

- Architecture maturity: high.
- Production hardening maturity: moderate.
- Immediate launch readiness: blocked by safeguarding durability/storage and compliance finalization.
