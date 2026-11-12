# Coding implementation and verification — 2 November 2026

**Historical implementation snapshot.** The subsequent [runner investigation and verification report](CODING_RUNNER_INVESTIGATION_2026-11-02.md) records successful real local Docker/gVisor interpreter tests, further curriculum/interface corrections and current remaining gates. Its runtime findings supersede the unavailable-engine status below.

## Readiness

Coding is **not release-ready** and none of the five pathways is complete. The approved inventory remains 264 core lessons, 132 consolidation sessions and 44 portfolio project outcomes. These project outcomes are embedded in the learning sequence; they should not be counted as 44 additional scheduled lessons. The implementation preserves the five existing pathway identifiers and the existing published `understanding-loops` lesson. No other lab has been started.

## Implemented locally

- Fixed sequential stage unlocking to require all preceding stages, prevented opening a workspace from silently updating it, preserved append-only project history, and recorded immutable mastery program snapshots for parent preview.
- Parent Coding access explicitly requires a parent session and child ownership. Existing consent, subscription, school and optional human-assistance checks remain server-side. Human assistance remains disabled by default.
- Added strict versioned curriculum packages and a publication verifier. Publication requires executable stage references, seeded-fault failures, independent variants/held-out cases, matching hashes/runtime versions and recorded educational, accessibility, security and learner verification. Approved inventory counts are separated from delivered content.
- Authored six executable First Instructions **draft packages**, with an administrator-only responsive author preview. Reference programs, seeded faults and independent cases execute through the route engine. These are not published learner lessons: full learner AI/save/mastery integration and educational review remain outstanding.
- Added a dedicated signed Python/JavaScript/SQLite container-runner integration, backend client, permission-controlled administrator preview API and adversarial integration test definitions. Per-job gVisor containers, immutable image references, no network/mounts, read-only root and resource limits are specified. Infrastructure failures cannot count as assessment failures. Real container execution has not been verified.
- Prepared the requested Supabase Edge gateway locally. It authenticates and forwards bounded signed requests, strips browser authority and preserves signed results. It never evaluates learner source and uses no database client. See `supabase/CODING_EXECUTION.md`. Supabase's hosted Edge runtime is not the dedicated container host; a reviewed Linux execution host is still required for this design.

## Database and preservation

Verified the configured Supabase pooler target and migration history before applying the single reviewed additive `20261102120000_skills_lab_settings` migration. Target fingerprint: `6e8331571ea9c13c393cd1c2c96adda278376e3aca6606a738c4e85a7b8b0295`. The new settings table has RLS enabled and no anon/authenticated/PUBLIC grants. Application record counts were unchanged by the migration. Evidence: `artifacts/coding-database-verification.json`.

Four pre-existing migration checksum differences were recorded and left untouched. Three differ beyond line endings; one is a line-ending-only difference. This history needs reconciliation before release. No reset, historical rewrite or original record deletion was performed.

Authenticated verification created fresh, labelled QA families/workspaces/versions and dedicated QA administrators. These QA records were retained, and fixture administrators were disabled after their runs. An early nontransactional fixture failure left two labelled QA users; later fixture creation is transactional. Original users and learner work were not borrowed for these tests. A QA settings write saved human assistance as disabled; assistance was never globally enabled during testing.

## Verification evidence

| Check | Result and limits |
| --- | --- |
| Coding lesson/editor/completion/curriculum runtime tests | 40 passed in the completed focused run |
| Runner protocol/isolation argument tests | 4 passed; mock executor, not real containers |
| Signed backend execution client | 3 passed again after Supabase URL support; mock executor |
| Supabase gateway transport tests | 3 passed; injected upstream, not hosted Edge verification |
| Real container integration suite | Explicitly skipped: local Linux Docker engine unavailable |
| Authenticated learner journey and access-control tests | Two tests passed: actual login, model-backed tutor response, progression, saving/resume, assisted retry, concurrent/idempotent mastery rewards, certificates, parent immutable evidence, ownership/consent/subscription/admin denials |
| Six draft administrator API checks | Executable references and seeded faults passed during authenticated run |
| Draft mobile browser check | Not passed: first run ambiguous image selector; fixed selector, subsequent Chromium launch timed out. Must rerun |
| Production build | Not established; resource-heavy build was stopped |
| Whole-application type check | Not established in this run; stopped after prolonged execution |

Earlier report `docs/CODING_COMPLETION_REPORT_2026-11-02.md` contains previous regression and component-browser evidence. It is historical evidence, not a substitute for current release checks. Focused TypeScript/lint checks passed at earlier implementation checkpoints. Final focused TypeScript/lint reruns stalled without diagnostics and were interrupted; these checks remain required for the Supabase changes. The final tracked-file whitespace check passed.

## Remaining implementation and release gates

1. Verify Supabase Edge bundling/routes and signed end-to-end transport after deployment approval. Supply the isolated runtime host, reviewed gVisor/image configuration and real interpreter/isolation evidence. No function deployment or hosted secret configuration has occurred.
2. Finish the First Instructions learner journey, educational review, AI guidance, independent mastery and parent portfolio integration before publication. Six drafts do not satisfy the 264-lesson inventory.
3. Author, execute and review every remaining core lesson, consolidation session and portfolio project, including age-appropriate text programming, web, data and advanced projects. Do not generate placeholder content to satisfy counts.
4. Verify school subject/classroom permissions, assistance enabled/disabled behavior, subscription combinations and safeguarding in authenticated multi-tenant journeys. Current tests cover important family/admin denials but not every school configuration.
5. Complete accessibility review, all five pathway journeys, mobile/browser rerun, clean production build/type checks, operational failure/recovery/load checks and migration-history reconciliation.

No commits, pushes or deployments were performed. Existing local changes and backup files were retained. Backup `* - Copy.*` files are excluded from TypeScript/lint compilation rather than deleted.
