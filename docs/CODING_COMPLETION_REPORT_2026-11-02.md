# Coding Learning implementation and verification report

Date: 2 November 2026.

Status: platform corrections implemented locally; Coding Learning is not yet complete or release approved. The user requested a proposed Years 1–11 inventory for review. That proposal is in `docs/CODING_CURRICULUM_REVIEW.md`; it is not published curriculum.

## Implemented in this work

- Added a Coding teacher adapter using the existing OpenAI key configuration and the model transport now shared with `/api/coach`. It receives the actual task, program, execution result and year context. Existing bounded hints remain the fallback on missing credentials, timeout, refusal, malformed output or rejected content. Prediction and independent challenge guidance remain deterministic. Model prose cannot award assessment success or mastery and is conservatively recorded as potentially revealing. Hint requests are rate limited.
- Added a platform Coding human-assistance setting, disabled by default, guarded by `MANAGE_SETTINGS`. Setting changes and their audit record are transactional. Requests, new tutor-session acceptance and teacher feedback enforce the setting on the server. Existing active support sessions are not forcibly terminated.
- Added an additive `SkillsLabSettings` migration. Its table has RLS enabled and no client policies; public and Supabase browser-role grants are revoked. Only privileged server access is intended. No hosted schema changes were executed.
- Tightened Day School escalation to the Coding subject and matching classroom. Short Learning escalation rejects bookings for a different subject.
- Applied existing consent, subscription/trial and school-licence checks to Coding learner APIs. Active Coding bookings can provide session access after ownership, parent, subject and timing checks. No pricing tier or existing subscription record was changed.
- A revealed Create answer no longer advances the independent assessment. Restoring after disclosure chooses a different target, from 16 unique targets, rather than relabeling the same solution as independent. Exhaustion returns a teacher-review message. Restore updates are transactional; existing programs are retained in undo/version history under the existing retention policy.
- Changed new lesson certificate wording to a lesson achievement. It no longer states that a whole pathway was completed. Previously stored certificate records were not rewritten.
- Added protected parent inspection and replay of saved work, including step controls, saved time, execution errors and saved block inspection. Existing ownership checks on the parent endpoint remain in force.
- Added unsaved-work status and a page-unload warning. Switching lesson stages first saves edits. Asking for a hint preserves the program sent to the tutor. Editing controls are disabled during requests. Added optimistic timestamp checks to principal save/assessment/hint mutations, returning a conflict response when another session has changed the workspace.
- Added a 66-lesson curriculum proposal, six lessons per year across the existing five pathways. It specifies practical outcomes, required runtimes, placement, mastery and publication gates. Only Understanding Loops remains published.

## Verification

| Check | Result / scope |
|---|---|
| Selected existing regressions plus new completion tests | 57 passed, zero failures; covers interpreter, editor, practical assessment, independent variants, default-off assistance, model fallback/transport, timetable scope, wallet amounts, parent catch-up filtering, learning access and support timing. |
| Shared coach regressions | 9 passed, zero failures (`coach_bug_verification` and `coach_heartbeat_signals`). Total selected unit/regression checks: 66 passed. |
| Browser component checks | 5 passed. Actual React components bundled into an isolated harness, using fixture API responses: 390px, 768px and 1440px editing; parent replay; administrator setting save. No learner records were written. |
| Visual inspection | Mobile workspace and parent replay screenshots inspected. Screenshots saved under `artifacts/coding-completion-*.png`. |
| Focused TypeScript | Passed using `tsconfig.coding-completion.json`, including transitive dependencies. |
| Focused ESLint | Passed with zero warnings allowed over the changed Coding, model transport, coach route, support scheduler and verification files. |
| Full application TypeScript | Failed with 13 diagnostics in pre-existing ` - Copy` files: admin content, Stripe routes, provisioning UI, pricing and school helpers. These files were not edited or deleted. This is not a passing full application build. |
| Migration status | Read-only Prisma status found 67 migration directories, with only `20261102120000_skills_lab_settings` unapplied. The existing Coding workspace and Human Support availability migrations were not listed as pending. |
| Repository whitespace | `git diff --check` passed; Git also reported existing line-ending normalization warnings. |

The first browser attempts were blocked by sandbox loopback access, a Windows Turbopack junction error, the default browser-cache location and the standalone harness's missing `process.env` replacement. Verification succeeded using webpack, the workspace's existing Playwright browser and the corrected isolated harness. These environment failures were not treated as product test passes.

Repeatable checks (PowerShell, from the repository root):

```powershell
node_modules\.bin\tsx.cmd --test tests/coding_completion.test.ts tests/coding_lesson.test.ts tests/coding_editor.test.ts tests/parent_wallet_money.test.ts tests/parent_report_coding_filter.test.ts tests/human_support_timing.test.ts tests/subscription_learning_access.test.ts tests/support_eligibility.test.ts
node_modules\.bin\tsx.cmd --test tests/coach_bug_verification.test.ts tests/coach_heartbeat_signals.test.ts
node .\node_modules\typescript\bin\tsc -p tsconfig.coding-completion.json
node .\node_modules\eslint\bin\eslint.js src/lib/coding src/lib/coach/model-json.ts src/lib/schools/human-support-scheduler.ts src/app/api/coach/route.ts src/app/api/student/coding src/app/api/admin/coding src/app/api/teacher/coding src/components/coding "src/app/admin/(secure)/coding/page.tsx" tests/coding_completion.test.ts tests/coding_isolation.test.ts tests/e2e/coding-workspace-components.spec.ts --max-warnings=0
```

For the browser component checks, run `npm run dev:webpack -- --hostname 127.0.0.1 --port 3000` in a separate terminal, then:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
$env:PLAYWRIGHT_BROWSERS_PATH=(Join-Path (Get-Location) '.playwright-browsers')
node_modules\.bin\playwright.cmd test tests/e2e/coding-workspace-components.spec.ts --workers=1 --reporter=line
```

## Not established by this verification

- Authenticated, database-backed learner → parent → administrator → tutor end-to-end UAT.
- Live model response quality, age suitability or safeguarding evaluation across a complete curriculum. Unit tests use mocked model responses; the live API was not exercised with child data.
- Runtime verification of the new settings table's RLS/grants, since its migration was not applied.
- Database integration tests for concurrent reward requests or simultaneous settings changes and tutor acceptance. Timestamp guards are implemented, but concurrency is not certified by component tests.
- Full accessibility conformance, assistive-technology testing, production build success or deployment readiness.
- Completion of Years 1–11 curriculum, text-language runtimes, event-driven block scenes, isolated Python/web/database execution, or course/pathway-level completion awards. These are specified for review, not implemented or published by this change.

## Required next work

1. Review the proposed lesson inventory, depth, practical outcomes and runtime requirements. Any exam-board alignment needs its own approved mapping.
2. Implement and educationally review the agreed remaining lessons and engines. Require executable reference and negative cases; do not publish catalogue entries as a substitute for working lessons.
3. Apply the additive settings migration through an approved release process and verify RLS, browser-role denial, server administration, audit writes and safe failure behavior.
4. Run authenticated UAT for all seven stages, save/resume, fresh independent assessment, rewards/certificates, parent replay, assistance disabled/enabled, unavailable tutors, wrong classroom/subject, expired bookings, cross-child access, consent and subscription/licence denial.
5. Resolve or exclude the unrelated duplicate-source files through a separately reviewed repository cleanup; then run the required full application checks and release tests.

No migration reset, existing-data deletion, commit, push, deployment or other Skills Lab implementation was performed. Existing local changes were preserved. The proposed target of 13 Skills Labs remains a separate user scope decision.

## Documentation consulted

- OpenAI Chat Completions reference: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
