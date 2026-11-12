# Coding Game World: local implementation and compatibility review

Date: 7 November 2026. The uploaded 40-decision document is retained in `GAME_WORLD_DESIGN_BASELINE_2026-11-06.md`. The user's subsequent request authorises local implementation. This report does not certify completion of all 40 decisions or authorise database rollout, curriculum publication or production deployment.

## Baseline protected

Work began on branch `codex/coding-release-candidate-2026-11-03`, HEAD `9d12a2b63f51b6d121cf77b4a84f1e46bc3e771a`. The working tree already contained numerous modified and untracked files, including substantial Coding Learning work. These were preserved; no reset, cleanup, checkout, commit, push, curriculum release-manifest change or production action was performed. The deployed production revision was not inspected or certified.

Installed Next.js guides on route handlers and server/client components were read before implementation. The Sites local-development workflow was used; no Site registration or deployment was requested or performed.

## Implemented locally

- Student route `/student/coding/world` and an Explore Coding Game World entry on Coding Home. Existing lesson routes and workspaces remain available through Continue Coding Lesson.
- Central academy, six explorable locations, isometric vector buildings, keyboard movement, tap movement, touch joystick/directional controls, fast travel, zoom, supported-angle rotation and camera reset.
- Twenty-one developer-defined practice missions: sequences, loops and conditions at each location, plus robot/farm, pizza/traffic and pet/space inventions. Advanced missions check their prerequisites on the server; exploration remains open.
- Actual domain-action validation and separate equipment scenes; correct action order and count are determined by execution, not client completion claims. Conditional visual missions execute both needsHelp fixtures. Replay, pause, reset and action stepping expose the resulting behaviour.
- Existing Blockly editor reused. Existing SourceEditor and isolated Python/JavaScript solve-entry execution reused for written programs. Written solve(world) returns a bounded list of action names. Outputs are revalidated by the visual simulator. Text execution checks behaviour; it does not certify the student's use of a particular native language construct.
- Shared AI transport and existing teaching-message filter reused for optional companion hints. Only authored task context is sent to the model, with bounded local guidance as fallback. No learner identity, source, run history or free-form conversation is sent by this adapter.
- Teacher-help requests use the existing Human Support handoff, booking, school-time and on-shift eligibility services; they do not create another messaging system.
- Private clubhouse, companion/appearance selection, practice stars, milestone badges, server-enforced cosmetic unlocks, building improvements, progress-based next-invention recommendations and practice skills overview.
- Simulated cosmetic daylight/weather changes. Playback and joystick movement pause when the tab is hidden. No offline background activity has been selected or implemented; no rewards accrue while away.
- Autosave, conflict detection, per-mission block/source drafts, explicit version snapshots and restoration as a draft. All new snapshots are retained; the newest 40 are displayed. Portfolio pagination and independently named projects are not yet implemented.
- Parent and teacher practice summaries use existing ownership/classroom guards and are labelled separately from formal mastery. Reading a summary never creates a world or changes a result.
- Content Studio route `/admin/coding/world`: immutable text drafts, fixed engine-contract preview, private executable preview, submission, independent approval, publication gate and audit entries. Only existing mission titles/objectives/dialogues can be edited; engines, reward logic, prerequisites and formal curriculum remain controlled in code.

## Verified integration boundaries

| Existing system | Integration |
| --- | --- |
| Learner identity, consent and Coding entitlements | `requireCodingLearner`, including validated optional booking context. The API derives the child from the active session and rejects a stale UI learner ID. |
| Visual execution | `BlockCommandsEditor`, `VisualCommand`, `executeVisual` and the existing bounded JSON/schema checks. No eval or text-code execution in the browser/server process was added. |
| Written code | `SourceEditor` and `executeSource` through the signed isolated runner client. Missing infrastructure retains the source and reports unavailability. |
| Persistence | Existing `CodingWorkspace` and `CodingProjectVersion`, isolated under `curriculum:game-world:v1` / `world-practice`. JSON compare-and-swap inside a transaction rejects concurrent overwrites. |
| Assessment | Game World never writes formal skillMastery, progressRecord, certificate, wallet, lesson completion, assignment completion or curriculum evidence. Existing formal lesson workflow remains authoritative. |
| Parent/teacher access | Summaries are attached only after existing parent ownership or teacher classroom checks. No new child-selection permission is introduced. |
| AI | Existing model transport, safeTeachingMessage and task-only context. AI cannot grant completion or rewards. |
| Human Support | Existing eligibility and queue workflow; external tutor availability was not exercised. |

## Prepared schema: NOT APPLIED

`prisma/migrations/20261107120000_coding_world_content/migration.sql` only adds `CodingWorldContentVersion`, indexes, status constraints, a single-published-version constraint and server-only row-security restrictions. The Prisma schema was updated and the local generated client refreshed; `prisma validate` passed. No database migration was applied and no database reset, seed, publication or data update was run.

The student practice core uses existing tables. Content Studio storage will report unavailable until the additive migration receives separate database authorisation and is applied to the intended environment. `CODING_WORLD_CONTENT_PUBLICATION_ENABLED` remains unset by this work. When it is not exactly `true`, the student loader does not query the new content table and the admin workflow cannot publish. Even when enabled, publication requires reviewed content and an independently authorised APPROVE_CONTENT actor different from the author. Publishing practice copy does not publish curriculum or executable logic.

## Verification evidence and limits

- Focused semantic TypeScript validation passed for all new world/studio modules and touched student, parent and teacher integrations (`tsconfig.coding-world.json`).
- Twenty-two targeted tests passed: six-location simulations, conditions, progression, cross-location inventions, hostile inputs, runtime limits, cosmetic enforcement, source result contracts, task-only AI context, unsafe-prose rejection, content approval gates and existing project evidence replay.
- Thirty-six additional existing editor, visual engine, source-contract, game, entitlement and teacher-feedback regression tests passed.
- Three real Edge browser component acceptance tests passed: desktop 1440px, mobile 390px and Content Studio. The learner checks build/run/step/version a working farm invention and switch language/preference views. Screenshots are in `artifacts/coding-world/` and were visually inspected.
- Browser API responses and AI/source dependencies in acceptance tests are synthetic. These tests do not prove authenticated route/tenant isolation, live database save/resume, live AI, isolated runner availability or real teacher queue eligibility.
- Full repository typecheck exhausted the default heap. A 6 GiB retry produced severe paging on the 8 GB machine and was stopped. Focused checks passed within 2 GiB. No passing full production build or whole-platform acceptance is claimed.

## Remaining consolidated work before full design acceptance

1. Review and map actual published curriculum lessons to appropriate world missions, with teacher-controlled objectives, prerequisites, assisted/independent evidence and formal mastery criteria. The current world route is Free Practice; a formal guided domain-mission bridge has not been implemented or published.
2. Develop richer location-specific living simulations, more varied challenges, longer overarching/location storylines and controlled NPC interactions. Current activities are deliberately bounded routines with visual equipment state, not complete restaurant, farm, city or pet-care management games.
3. Expand author tooling to reviewed chapters, mappings, rewards and extension packs without granting executable publishing rights. Current studio covers text versions for the fixed practice catalogue.
4. Add ability-based recommendations tied to demonstrated formal skills and teacher controls, beyond current practice-progression recommendations. Define deeper mastery challenges and independence criteria for any new formal world activities.
5. Expand clubhouse decoration placement, outfits/accessories, project management and portfolio pagination. Avatar position, replay frame and open editor mode are transient; saved code, progress and personalisation persist.
6. Agree device/browser support and measured performance budgets; complete touch/keyboard, contrast, reduced-motion and child usability acceptance on supported hardware. Visual SVG scenes are lightweight but no universal device-performance claim has been established.
7. Authorise and validate the additive studio schema in a designated non-production database; test actual authentication, ownership isolation, concurrency, restore, booking access, AI fallback, runner availability and support eligibility end to end.
8. Complete the full platform build/regression and consolidated user acceptance on adequate hardware. Compare the intended production baseline separately. Production release requires its own authorisation.

The implementation is a substantial local extension, not a claim that the entire 40-decision Game World is finished or production ready.

## Reproducible local checks

- `npm run typecheck:coding-world`
- `npm run test:coding-world`
- `npm run test:e2e:coding-world` (isolated component harness; starts no app server or database)
- `npx prisma validate` (schema validation only; does not apply the prepared migration)

The final browser checks also clear a saved program, restore its saved version as a draft and confirm autosave recovery at both desktop and mobile widths.

## Continuation report

The subsequently authorised consolidated local continuation is documented in `GAME_WORLD_CONTINUATION_2026-11-07.md`. This first-stage report is retained as the historical baseline; its earlier feature and verification counts are superseded by that continuation report. Live database tests and both prepared migrations remain held at the user's instruction.
