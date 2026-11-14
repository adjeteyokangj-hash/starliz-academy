# StarLiz Coding Game World — local database integration

Date: 7 November 2026. This report supplements the earlier local implementation reports. It does not constitute production release acceptance or acceptance of all 40 design decisions.

## Isolated setup

The dedicated launcher is `npm run test:integration:coding-world`. It reuses the existing Coding Learning browser identity, refresh-cookie helper, curriculum journey driver, assessment engines and execution protocol. It does not reuse the previous helpers' inherited environment or C: runner entry point.

- Database: **starliz_game_world_test**, reached only through **127.0.0.1:55432**, SSL explicitly disabled.
- Existing container: **starliz-consolidated-ci-20261106**, PostgreSQL 16.14.
- Schema: 125 copied foundation tables plus CodingWorldContentVersion. The two previously authorised migration SQL files are already applied to this local database. This test harness applies no migrations.
- No .env file supplies test settings. The launcher constructs a fresh allowlisted environment, obtains the existing local container credential internally, and generates synthetic authentication secrets in memory. Credentials and fixture passwords are not written to the report.
- The worker preloader rejects any different database host, port, name or SSL mode before application imports. The QA-only Prisma guard queries the connected database identity before each immutable client first performs an operation, and checks that its URL remains pinned on every operation. A failed identity check stays failed; it cannot proceed to writes.
- A token-protected development-only application probe independently verifies the app's database, port, SSL setting, unique run identifier, absence of production-provider credential variables and disabled development-admin fallback before authenticated application writes.
- Every run reserves its own loopback application port and launches its own Next.js process and output directory. The probe verifies that the intended process answered, rather than an existing development server. Processes owned by the run are stopped afterwards; unrelated apps, Docker containers and servers are retained.

The local schema has no `_prisma_migrations` table. The harness never invokes Prisma migration/reset/db-push commands or generic seed scripts and does not manufacture migration history. Database schema verification and the earlier SQL application are not a claim that Prisma's deployment migration history is populated.

## Service and configuration isolation

`world-test-guard.cjs` is preloaded in the test worker and inherited by Next and its JavaScript child workers. It suppresses synchronous and asynchronous .env reads and marks Next's environment processing as completed. Next may still list discovered .env filenames in its startup banner; the application probe confirms that their production credentials were not loaded. The launcher compares the real .env.local file hash outside the preloader before and after the run.

Outbound fetch, ordinary Node TCP sockets, TLS, HTTP SDK requests, DNS lookups and UDP socket creation are blocked for non-loopback traffic. Separate tests exercise HTTPS and HTTP/2 as well. This is more than a fetch-only guard. Browser requests are restricted to the owned app origin. Production AI, email, payments, object storage and hosted Supabase configuration are not passed to either process. AI instruction uses the existing labelled fallback; no model-reviewed mastery is awarded.

The socket hooks are a Node application test boundary, not a claim of an OS firewall against arbitrary native code. Prisma's native engine is constrained separately through the validated datasource and actual connected-database checks. The existing container executor retains its own isolation requirements. No live provider connectivity is claimed.

Synthetic fixtures include two independent families, students, a school, separate teacher classrooms, an inactive test-only pricing plan and two administrators. Only newly labelled fixtures and their derived test records are written. Test records remain available for review; no student records are deleted and no cleanup/reset runs.

## Integration findings and fixes

1. The old QA readiness URL no longer exists. The dedicated harness uses `/api/auth/me` and the guarded application probe instead.
2. Turbopack cannot create its required Prisma junction on this D: filesystem. The owned application uses the installed Next.js webpack mode, without changing production build configuration.
3. The World origin comparison rejected legitimate loopback browser/API writes because Next normalised its internal URL to localhost. The shared World/Studio origin check now compares the actual Host header, rejects cross-site requests, ignores forwarded-host overrides and retains a URL fallback for requests without Host. Negative tests cover hostile origins and malformed hosts.
4. A cold session-probe timeout in StoreBootstrap fell through into the parent consent flow for a signed-in student. Failed or malformed role probes now retain the current route and offer a retry. They do not infer a parent role or bypass consent. Existing student routing tests and new failed-response checks cover the change.
5. QA-only Tailwind scanning is limited to application source to avoid scanning copied workspaces and generated evidence. Normal production styling configuration is unchanged.
6. The repeated run encountered transaction timeouts under the shared computer's load. The initial guard unnecessarily opened another pool connection per statement inside transactions. It now verifies the immutable client once and validates the pinned environment on every operation. The QA client uses bounded 20-second transaction acquisition / 30-second transaction execution budgets. Production budgets are unchanged. These functional checks do not establish production latency or performance acceptance.

## Results

The machine-readable results under `artifacts/world-database-integration/` are authoritative for individual attempts. Earlier failed/interrupted attempts are retained rather than removed.

The corrected full backend run is `3d762e62-cf78-45e3-b5e8-f72206326c6a/result.json`: **42 checks passed, two requirements unverified, one browser navigation check failed**. Its application used port 56400, then stopped. The .env.local hash was unchanged. The browser failure was a 180-second initial navigation timeout; it is not a successful UI acceptance result. A separately scoped browser follow-up warms the actual application and entry assets, retains request-failure diagnostics, and creates its own application and synthetic accounts.

The targeted browser follow-up is `33abc0ec-77db-4d13-8bf7-2278ab28e8b0/result.json`: **four setup/authentication checks passed; the combined browser acceptance check failed**. It used its own port 53786 and fresh fixtures. It successfully displayed the actual world at 1440, 768 and 390 pixels, renamed a named project through browser autosave, verified the stored title, reloaded it, and displayed the guided legacy lesson. Those assertions precede the saved `guided-legacy.png` screenshot in the driver. It failed waiting 90 seconds for the guided curriculum activity heading. No guided-activity screenshot was produced.

The follow-up server log records **Prisma P2024**: connection acquisition timed out with a ten-connection pool and a 20-second pool timeout during the page flow. Background refresh requests also returned 401. The exact contribution of pool/client lifecycle, cold compilation, refresh rotation and shared-machine resource pressure is not conclusively isolated. Browser acceptance remains failed; successful native activity API checks do not overrule this live page failure. The guard retains a failed identity verification rather than allowing unchecked writes.

Initial browser diagnostics recorded timed-out session probes and a blocked script injected by the computer's Kaspersky software. No external-host exception or antivirus configuration change was made. The warmup reads real HTML/assets and the existing session endpoint; it does not replace application/API responses. The targeted run used the original asset warmup plus a separate read-only warm request to its owned session endpoint; the final reusable harness includes that session warmup explicitly.

| Requirement | Result | Scope |
| --- | --- | --- |
| Isolated application and worker datasource | Passed | Independent connected-database checks and application probe; both runs retained the original .env.local hash. |
| External provider isolation | Passed locally | Clean environment, Node SDK socket guards, browser external-request blocking; no live provider acceptance claimed. |
| Runner implementation provenance | Passed | D: implementation loaded; entry point and four imported local modules match C:. |
| Student/parent/teacher/admin authentication | Passed | Real passwords, cookies and database users. Exhaustive refresh/multi-device acceptance remains open. |
| All 27 missions | Passed | Real authenticated API execution and persisted completion, including six living simulations. |
| Visual programming execution | Passed at server/runtime boundary | Actual visual engine; authenticated graphical Blockly interaction was not explicitly asserted and remains unverified in this run. Earlier isolated component checks are separate evidence. |
| Python and JavaScript execution | Unverified | Missing runsc and reviewed pinned images; actual failed source runs retained drafts. |
| Guided legacy lesson | Passed locally | Actual saved workspace, learner binding and authenticated browser page. |
| Guided curriculum activity API | Passed | Actual native execution and build-stage assessment; no manufactured mastery. |
| Guided curriculum activity browser | Failed | Heading did not appear within 90 seconds; P2024 recorded during the live flow. |
| Project autosave/restoration/history | Passed, scoped | Actual database versions/restoration, browser rename/autosave/reload. Exhaustive deep pagination was not exercised against this database. |
| Clubhouse and appearance persistence | Passed | Actual database round-trip. |
| Parent ownership and teacher permissions | Passed, scoped | Own-child/foreign-child and separate classroom reads; not every school assignment/reporting workflow. |
| Studio persistence and independent review | Passed | Draft, submit, self-approval rejection and independent approval. Publishing remained disabled and rejected. |
| Student data isolation | Passed | Separate learners, rejected stale identity, foreign version cursor and stale revision. |
| Existing assessment protection | Passed, scoped | All practice completions leave formal workspaces unchanged; native build checks retain canonical contracts. |
| Focused regressions | Passed | 87 tests, zero failures. |
| Focused types and lint | Passed | Resource-bounded checks; no whole-platform build claim. |
| All 40 decisions / production acceptance | Open | No design decision removed; remaining educational, gameplay, hosted and performance acceptance is explicit below. |

Both test applications were stopped after their runs. Synthetic profiles, projects, versions, school links and Studio records remain for review.

The serialized focused unit/regression batch passed **87 tests, zero failures** with a 768 MiB per-process heap cap. Evidence: `regressions-cb0b4cfd-2a74-42d5-ae64-7b4903aa4e5c.log`. This comprises 44 World/evidence tests, three preload safety tests, four student bootstrap tests and 36 existing Coding Learning regressions. Focused TypeScript (including the integration harness, database guard and shared bootstrap) passed with a 2 GiB cap. Targeted ESLint passed with a 1 GiB cap. The whole-platform production build/typecheck was not repeated.

Read-only final database checks confirmed 126 public tables, zero foreign servers, zero published content versions, no Prisma history table, and zero User email addresses outside the synthetic `@example.invalid` domain.

The authenticated database checks exercised all 27 built-in missions, project saves/snapshots/restoration, persistent avatar/room state, cross-student isolation, foreign-history cursor refusal, stale revision refusal, parent ownership, teacher classroom scope, Content Studio drafts and independent approval. Publication remained disabled. All 27 practice completions were checked separately from formal curriculum workspaces. The guided curriculum driver used the actual native runtime and build-stage checks, with fallback instruction explicitly distinguished from model instruction.

### Unverified boundaries

- Successful Python and JavaScript execution: Docker Desktop has no runsc runtime and none of the three reviewed pinned language/media image digests. WSL Ubuntu also failed to respond. Actual source-run requests fail closed and retain their source drafts. No weaker executor or fake execution result is substituted.
- Real Supabase Auth, Supabase anon/authenticated-role policies and hosted security configuration: this is plain local PostgreSQL with StarLiz application password/cookie authentication and application ownership checks.
- Live AI, email, storage, payments and tutor support delivery: deliberately disabled or blocked.
- Full model-reviewed curriculum mastery, every teacher assignment workflow, every curriculum lesson and full 40-decision educational/gameplay acceptance: not established by the scoped native build-stage journey.
- Successful whole-platform production build, device performance budgets and production deployment: not claimed.

## Forty-decision acceptance register

All decisions remain the approved baseline. “Evidence” below identifies scoped local evidence, not a replacement specification or full acceptance.

| Decision | Local evidence / remaining acceptance |
| --- | --- |
| 1 Guided and free practice | Actual curriculum discovery/lesson persistence and native build-stage checks; deeper guided-gameplay alignment remains reviewable. |
| 2 Connected six-location world | Existing world and all six locations retained; 27 mission executions exercised. |
| 3 Walking and map | Existing controls retained; exhaustive device interaction acceptance remains open. |
| 4 Customisable avatar | Appearance saved through actual database reads; full cosmetic acceptance remains open. |
| 5 Isometric identity | Existing presentation retained; screenshots support visual review. |
| 6 Exploration and unlocks | Sequential mission completion exercised; prerequisite guards retained. |
| 7 Blocks to source | Native visual execution exercised; successful Python/JavaScript execution remains unverified. |
| 8 AI and teacher assistance | Labelled fallback and teacher permissions exercised; live AI/support delivery blocked. |
| 9 Rewards | Practice completion/unlocks retained; no formal mastery or wallet claims manufactured. |
| 10 Clubhouse | Room and appearance database persistence exercised. |
| 11 Individual worlds | Cross-student isolation exercised; no multiplayer feature introduced. |
| 12 Living simulations | All six living missions executed through the real application. |
| 13 World evolution | Existing milestones retained; long-term evolution acceptance remains open. |
| 14 NPC interaction | Existing authored interaction retained; deeper NPC acceptance remains open. |
| 15 Adaptive editor | Responsive browser checks supplement the earlier component acceptance. |
| 16 Projects and versions | Actual saves, immutable snapshots and restoration exercised; browser autosave covered by the final run result. |
| 17 Adaptive learning | Existing recommendations retained; comprehensive mastery/teacher adaptation remains open. |
| 18 Mission discovery | Existing mission boards and discovery retained; full NPC interaction review remains open. |
| 19 Debugging | Server execution/replay outputs retained; comprehensive coaching acceptance remains open. |
| 20 Combined stories | Existing authored stories retained; narrative depth requires educational review. |
| 21 Inventors Adventure | Existing adventure identity retained. |
| 22 Companion selection | Existing selectable companions retained; live model response acceptance remains open. |
| 23 Text-only communication | World text-only presentation retained; no voice provider enabled. |
| 24 Movement controls | Existing keyboard/touch controls retained; exhaustive input acceptance remains open. |
| 25 Programmable equipment | Six real simulation engines exercised; broader object variety remains reviewable. |
| 26 Camera | Existing camera controls retained; full supported-device acceptance remains open. |
| 27 Environment | Controlled weather situations retained; full dynamic environment acceptance remains open. |
| 28 Offline progression | Saved state is retained; optional background progression remains unimplemented. |
| 29 Dashboard | Existing skills, achievements, recommendations and portfolio retained. |
| 30 Adult oversight | Parent ownership and separate teacher classroom scopes exercised; all school reporting workflows remain open. |
| 31 Entry points | Existing canonical and world routes retained; guided pages covered by final browser results. |
| 32 Alignment | Existing year, entitlement and curriculum gates retained; comprehensive adaptive alignment remains open. |
| 33 Game variety | 27 missions, including cross-location and living missions, exercised. |
| 34 Expandable chapters | Metadata draft storage exercised; adaptive/mastery challenge acceptance remains open. |
| 35 Evidence-based assessment | Practice cannot create formal progress; actual native build-stage assessment exercised. Full independent/model review remains open. |
| 36 Inclusion and safeguarding | Isolation and role checks exercised; comprehensive safeguarding/accessibility review remains open. |
| 37 Performance | Resource-bounded focused checks; complete device/performance budgets remain open. |
| 38 Content Studio | Actual draft/review/independent approval exercised; publication remains disabled. |
| 39 Modular architecture | Existing storage, editors, authentication and assessment reused; no platform rebuild. |
| 40 Consolidated release | Work remains local; production release requires separate acceptance and authorisation. |

## Protection record

No migration reset, additional migration, production connection, starliz_ci write, environment-file edit, database/container/volume deletion, Git commit, Git push or deployment was performed. Existing uncommitted implementation and prior reports were retained. No additional hosted project or subscription was created.

## Reproduction

```text
npm run test:integration:coding-world
node scripts/coding/world-test-launcher.cjs --browser-only
npm run test:coding-world
node --test tests/coding_world_guard.test.cjs
node --max-old-space-size=2048 node_modules/typescript/bin/tsc -p tsconfig.coding-world-integration.json --noEmit
```

The integration command exits nonzero when a required check fails. Unverified execution requirements are labelled separately, never converted into successful source execution. New runs create fresh labelled fixtures without resetting or deleting prior data. This delivery completes the isolated setup and reports the executed checks; it does **not** claim that the failed browser acceptance or remaining hosted/runtime requirements have passed.

Continuation: `GAME_WORLD_INTEGRATION_COMPLETION_2026-11-07.md` records the subsequent pool-lifecycle correction, 92 passing regressions, corrected daemon/component findings, and the still-failed browser/secure-runner acceptance boundaries. Earlier results above are retained as historical evidence.
