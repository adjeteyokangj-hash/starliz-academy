# Approved curriculum: local publication acceptance

The user approved all lesson curriculum content on 4 November 2026. This approval was applied to the existing local development implementation. No content was regenerated and no database was accessed or changed for this activation.

## Result

- Development publication: 440 activities, comprising 264 core lessons, 132 consolidation sessions and 44 portfolio projects, across five pathways and Years 1–11.
- Production and unspecified environment checks: zero expanded activities exposed by this development-only approval. The existing original lesson remains separately published.
- All 440 activity hashes match the preserved practical evidence. The executor/dependency fingerprint is unchanged: `37fb829f383205db57e5a8ce5c2e9fdf075f80de33e853b3b678af47fc2797f8`.
- The historical 6,162 practical checks and 2,590 Blockly round trips were preserved, not rerun or relabelled as new runtime evidence.
- Current full runtime binding: `4c0d0b7d5c1ada1414517f16c249b59e88846a2224b7bbfd49660f46805f427a`.
- Final approval receipt and metadata backups: `verification/local-approval-2026-11-04T11-57-48-337Z/`.

## Learner behaviour

After mastering Understanding Loops, **Continue to next activity** now resolves against the released expanded curriculum and the current learner's saved mastery and prerequisite evidence. Expanded activity completion uses the same continuation component and checks recorded mastery server-side. Draft QA activities are excluded. Booking context is preserved by the continuation link.

Without expanded prerequisites or a verified later-entry readiness grant, the first eligible activity is **What is an instruction?** Completing the original loop lesson does not confer earlier curriculum credits or change the learner's year group. Older learners may use the existing practical readiness bridges to establish later entry. The homepage now links directly to the learning journey and removes stale unpublished-pathway guidance when the full local curriculum is published.

The Studio editors, independent outputs, assessments, subscriptions, ownership checks, private portfolios and privacy restrictions remain in place. No permissions were widened.

## Fresh verification

| Check | Result |
| --- | --- |
| Actual development catalogue and exact content/runtime binding | 440 released, all hashes match |
| Actual production / unspecified environment publication | Both reject local approval: 0 expanded activities |
| Focused offline regressions | 32 passed |
| Next endpoint | Learner scoping, booking context, publication, prerequisite filtering, original and expanded mastery, unauthorised access tested with fictional boundary fixtures |
| Edge catalogue component acceptance | Passed: actual 440 authored definitions, all 11 year filters, collapsed module navigation, prerequisite labels, eligible links and next-activity navigation |
| Edge next-step component acceptance | Passed: caught-up, prerequisites, service failure, real timeout, retry, next link and booking context |
| Edge homepage component acceptance | Passed: existing placement and mastered portfolio behaviour; approved learning-journey links and removal of stale guidance |
| Responsive catalogue / continuation | Passed at 1440, 820 and 390 pixels; no horizontal overflow |
| Scoped ESLint | Passed for 13 affected source/script/test files |
| Affected routes and components | Five esbuild compilation outputs passed; code not executed by this compilation |
| Git diff whitespace | Passed; line-ending notices only |
| Existing localhost:3000 student Coding page | HTTP 200; this is reachability, not authenticated publication acceptance |

The catalogue browser test initially exceeded its five-second initial-render expectation. Its snapshot showed the populated catalogue. It passed after allowing initial rendering and opening collapsed modules before counting their activities. A test mock also needed the updated released-catalogue export; the corrected endpoint test passed. No practical content defect was found.

Browser acceptance used actual React components and authored content with fictional learner progress and intercepted API responses. It is not authenticated database persistence evidence. The existing prior authenticated evidence is preserved; fresh authenticated publication acceptance is pending. No full production build or full-project typecheck was run for this local publication change.

Screenshots and machine-readable results: `artifacts/coding-approved-catalogue-2026-11-04/`; environment and compilation receipts: `artifacts/coding-local-publication-2026-11-04/`. Existing homepage and next-step browser evidence remains in its respective artifact directories.

## Remaining production gates

Production approval, authenticated ordinary-learner publication journeys, ZDR verification, runner security and operational hosting acceptance, hosted subscription/school/private-media checks, dependency advisory disposition and broader accessibility/device acceptance remain separate. No restricted runner operation or live AI request was attempted. No migration, data deletion, commit, push or deployment occurred.
