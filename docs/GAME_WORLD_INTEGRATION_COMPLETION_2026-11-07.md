# StarLiz Game World — integration completion investigation

7 November 2026. Continuation of `GAME_WORLD_DATABASE_INTEGRATION_2026-11-07.md`.

**Outcome:** The QA guard lifecycle defect was corrected and P2024 did not recur in either corrected application run. All 42 backend/isolation checks and 92 affected regression tests passed. **Guided browser acceptance still failed before document commit. Python and JavaScript execution remain unverified. This is not production acceptance.** No Game World features were rebuilt or design decisions superseded.

## 1. P2024 root cause and evidence

The earlier P2024 stack points to the QA guard's `SELECT current_database(), inet_server_port()` in `src/lib/db.ts`, rather than a curriculum assessment statement. The base Prisma client was cached globally, but its identity-verification promise was module-scoped. Next development module reloads therefore repeated the guard query against the same client. A rejected verification then remained rejected in that module.

This lifecycle mismatch is a confirmed defect. It exposed unnecessary pool acquisitions during severe development/host stalls. The instrumented baseline recorded a verification taking **16,956 ms end-to-end** while Prisma recorded **324 ms** for its SQL. The machine had **7,817 MB physical RAM, only 33 MB free**, and the QA process recorded an event-loop stall of **39,527 ms**—longer than the existing 20-second pool-acquisition timeout. Resource starvation/development delay is a measured contributing factor; this evidence does not establish that every historical timeout had one exclusive cause.

The investigation does **not** support PostgreSQL connection exhaustion or a long-running curriculum transaction as the cause:

| Observation | Result |
| --- | --- |
| PostgreSQL `max_connections` / reserved connections | 100 / 3; unchanged |
| Database connection limit / login-role connection limit | Both -1 (no additional per-database/per-role cap); unchanged |
| Effective Prisma pool / acquisition timeout | 10 / 20 seconds; unchanged |
| Launcher URL versus normalization | Launcher requests 3 connections; existing normalization raises the effective limit to 10. This production normalization was not changed. |
| Corrected full run: peak cluster activity entries / target-database sessions | 13 / 7; cluster entries include PostgreSQL background processes |
| Corrected focused run: peak cluster activity entries / target-database sessions | 10 / 3 |
| Maximum sampled transaction age | 1.455 s in the full run; 4.328 s in the focused run |
| Ungranted locks in the final target-database check | 0 |
| Prisma client proliferation | One cached client per observed application/worker process; repeated module evaluations reused it |
| Test concurrency | HTTP acceptance actions serialized; browser-generated parallel requests remained real; unit/regression files ran with concurrency 1 |

Read-only PostgreSQL samples are in `postgres-observations.ndjson`; Prisma query durations/module loads are in `prisma-observations.ndjson`; process heap/event-loop observations are in `process-observations.ndjson`, inside the run directories below. The interrupted diagnostic baseline is retained at `f36c9ade-e404-40d3-9da3-d40dce335d88/`.

## 2. Exact correction

The QA identity promise now lives in `globalForPrisma.worldQaIdentity`, paired with the **actual base client object**. A Next module reload reuses the verified promise; a different client must verify again. A failed verification remains fail-closed. The datasource URL/host/port/database/SSL checks remain, and every operation still checks that its URL is pinned.

Two regression tests execute the real bundled database module across separate CommonJS evaluations with a shared global cache. They assert one identity query for one reused client, and zero permitted operations when the connected database identity is wrong. These tests use boundary doubles, not connections to another database.

No connection-pool size, pool timeout, PostgreSQL setting, authentication rule, learner filter, execution limit or memory ceiling was increased. Existing QA transaction budgets were retained. Additional changes are QA diagnostics and a focused browser driver using its own real login and one shared browser/API cookie jar; authentication or refresh rotation is not bypassed.

## 3. Guided curriculum browser result

**Failed; acceptance remains open.**

| Run | Result |
| --- | --- |
| `a98e504e-41bc-4ddb-8ca8-1499feac0430` — corrected full run, port 56396 | 42 backend/isolation checks passed; two source-execution requirements unverified; broad browser replay failed at the startup/retry screen. No P2024. |
| `9e9c8195-7ea8-4197-ad9a-0ea2e4e16d9c` — focused guided run, port 60150 | Four setup/authentication checks passed; actual native assessment reached the build-stage result without awarding mastery. The browser failed waiting 180 seconds for navigation commit to the guided activity. No P2024. |

The focused run used a new real browser login, successfully refreshed that session, verified the API's learner binding and warmed real HTML/assets/API routes. No application response was mocked. Next logged HTTP 200 for the activity page and its canonical API, but the browser remained at `about:blank`; it never established a committed document. This is a different failure from the earlier identity-query P2024, and its exact transport/startup cause is **not conclusively isolated**. Severe host pressure and blocked antivirus-injected script traffic were observed during investigation; no antivirus setting or external-host exception was changed.

The existing legacy lesson's authenticated API still passed in the corrected full run. The focused browser did not reach the later legacy-page assertion because its first navigation failed. Earlier successful legacy browser evidence is preserved in the preceding report; it is not relabelled as a new pass here. The new driver and diagnostics allow the focused check to be rerun without repeating feature development.

## 4. Python runner verification

**Unverified. The components are present, but a successful interpreter result was not obtained.**

Windows Docker uses the `desktop-linux` daemon, whose registered runtimes are `io.containerd.runc.v2`, `nvidia` and `runc`; it lacks the reviewed images/runsc combination. Ubuntu's native Docker daemon is a different engine at `unix:///var/run/docker.sock`.

A real Ubuntu probe confirmed:

- `runsc` is registered at `/opt/starliz-coding-test-gvisor/runsc`.
- The reviewed Python and JavaScript image digests are installed there. They are not globally missing from the workstation.
- The broker loaded the existing D: runner modules, required `runsc`, and accepted a signed Python job using image `sha256:b18b261e1b4974b4f321451ad5251ded85abb22c2b8b262da527dda1d031ab30`.
- Its response signature was verified. It returned `infrastructure-error`, null exit code and empty stdout/stderr after **21,427 ms**. The existing preparation/startup/cleanup deadlines did not produce a successful interpreter result. The first attempt did not capture sufficient lifecycle events to identify the exact failing subphase.

Evidence: `artifacts/world-runner-verification/cc59427a-985a-4dd4-ba8e-0254021c541a/result.json` and `artifacts/world-database-integration/runner-attempt-20261107.json`.

The verified historical installation is also documented in `CODING_RUNNER_INVESTIGATION_2026-11-02.md`; its prior pass is not substituted for current verification.

## 5. JavaScript runner verification

**Unverified.** The reviewed image `sha256:4dda2383bfc88c245be66c59a6f7cebbdd593111c349d1f34c3e43ae179e3457` was found in the Ubuntu daemon. Both a follow-up probe and an independent JavaScript-only invocation failed at the WSL service boundary with **`Wsl/Service/0x8007274c`**, before JavaScript execution could be verified.

Evidence: `runner-follow-up-593f8668-1059-4c43-9cac-f3f5f4c69333.json` and `javascript-runner-a36f3922-8c60-469e-a007-cc7f5d3a2a07.json` under `artifacts/world-database-integration/`.

No replacement runtime was installed, no image was pulled, and no daemon configuration was changed. No runc fallback or in-process student-code execution was used. The new verification script uses the existing signed broker and container executor with their existing isolation/resource limits. The runner-only probe receives a minimal environment, has no database client/URL and writes no database records.

## 6. Authentication, persistence and isolation

The corrected full run repeated actual database-backed checks against **only `starliz_game_world_test` at 127.0.0.1:55432**, with local SSL disabled:

- Real student, parent, teacher and administrator password/cookie authentication.
- All 27 Free Practice missions, persisted completions and protection against formal assessment writes.
- Named project autosave, snapshot history and restoration, plus clubhouse/avatar persistence.
- Separate learner state, foreign-history cursor refusal, stale identity/revision refusal.
- Own-parent access and foreign-parent denial; distinct teacher classroom scopes and student denial.
- Studio draft persistence, submit/review, self-approval denial, independent approval and disabled-publication rejection; students denied Studio access.
- Canonical guided lesson persistence and native curriculum build-stage checks, with fallback instruction explicitly distinguished from model review.

The application probe independently verified its database, SSL/port, build identity, disabled admin fallback and absence of production-provider credential variables. The clean environment/preloader continues to suppress .env loading and block external SDK TCP/TLS/HTTP/DNS/UDP operations, rather than relying only on fetch. Browser requests stayed within the owned origin; the focused context blocks service workers to keep its request boundary observable. The .env.local hashes were unchanged in both corrected application runs.

These are StarLiz application authentication/ownership checks against local PostgreSQL. Hosted Supabase Auth/RLS policies and live AI/email/storage/support delivery remain outside this acceptance claim. All synthetic profiles, projects, versions, school links and Studio data are retained.

## 7. Regression results

**92 tests passed, zero failed**, serialized with a 768 MiB test-worker heap cap through the clean isolated launcher. This includes the original 87 checks, two new client-identity lifecycle checks and three existing database-URL normalization checks. Evidence: `completion-regressions-d61ceaa5-83a8-4183-9b58-491f76494c05.log` under `artifacts/world-database-integration/`.

Focused integration TypeScript passed with a 2 GiB cap; targeted lint passed with a 1 GiB cap; tracked-file whitespace checks passed. No full application typecheck/build was attempted under the measured memory pressure.

## 8. Remaining acceptance blockers

1. Guided browser document commit/startup still fails on this workstation. No new passing guided-browser acceptance is claimed, despite passing canonical API/native assessment checks and no recurring P2024.
2. Ubuntu WSL service reliability and secure interpreter startup/completion remain unavailable for current Python/JavaScript acceptance. Installed components and historical passes are not current execution passes.
3. Host capacity is insufficient for reliable combined development/browser/WSL testing at the measured moment. No unrelated user applications were stopped and no global resource limits were changed.
4. Existing hosted integration, model-reviewed mastery, comprehensive school/device/performance testing and the remaining 40-decision educational/gameplay acceptance remain open as detailed in the preceding report. No design decision has been removed or superseded.

## 9. Files changed in this continuation

- `src/lib/db.ts` — per-client QA identity lifetime and QA-only Prisma observations.
- `scripts/coding/world-test-launcher.cjs` — bounded read-only PostgreSQL sampling and clean regression/guided modes.
- `scripts/coding/world-test-guard.cjs` — QA-only process/event-loop observations.
- `scripts/coding/world-database-integration.ts` — focused guided acceptance branch.
- `scripts/coding/world-guided-browser.ts` — real login/shared-cookie browser assertions.
- `scripts/coding/world-runner-verification.mjs` — real signed Linux/runsc verification and independently selectable languages; no alternative executor.
- `tests/coding_world_db_identity.test.ts` — reload and fail-closed regressions.
- `package.json` — includes the new identity tests in the existing World test command.
- This report and a continuation pointer in the preceding report.

## 10. Production protection and reproduction

Production Supabase, `starliz_ci`, .env.local, schema/migration files and the 40-decision baseline were not modified. No reset, additional migration, existing-record/working-file deletion, commit, push or deployment occurred. Test apps were stopped after their results were recorded. Only newly created runner job containers are subject to the existing executor's normal scoped cleanup; no existing container or volume was removed.

```text
node scripts/coding/world-test-launcher.cjs
node scripts/coding/world-test-launcher.cjs --guided-only
node scripts/coding/world-test-launcher.cjs --regressions
node --max-old-space-size=2048 node_modules/typescript/bin/tsc -p tsconfig.coding-world-integration.json --noEmit
```

The Linux runner probe is `scripts/coding/world-runner-verification.mjs`, invoked in Ubuntu with a clean environment, `DOCKER_HOST=unix:///var/run/docker.sock` and `CODING_RUNNER_CONTAINER_TESTS=1`. Optional final argument `python` or `javascript` selects one language. It does not reset data, install components or execute learner source inside Next.

Diagnostic incident: one process-list command unexpectedly emitted an unrelated Cursor worker API credential into this chat's tool output. It was not used, repeated in this report or saved in QA artifacts. Rotate that credential. Subsequent process diagnostics use aggregate metrics without process arguments. This did not change or access StarLiz production Supabase.
