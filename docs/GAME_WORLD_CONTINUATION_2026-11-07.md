# StarLiz Coding Game World — consolidated local continuation

**Date:** 7 November 2026  
**Status:** Local feature implementation delivered; production acceptance remains open.  
**Scope:** Continue the existing upgrade, preserve Coding Learning and all pre-existing work.  
**Explicit holds:** Live database tests, migration application, Git push and deployment.

This is the continuation of `GAME_WORLD_IMPLEMENTATION_2026-11-07.md`. The original design baseline and first implementation report remain available as historical records. The user's later instruction specifically keeps live database tests on hold and authorises completion of local code and isolated tests. No new implementation cycle or replacement Coding Learning system was created.

## Requested priorities

| Priority | Local result | Verification boundary |
| --- | --- | --- |
| Guided lessons | New guided discovery and world lesson/activity routes reuse the canonical editors, APIs, saved workspaces, teacher assignment status and existing mastery checks. | Real components, assessment functions and native activity state machine tested with isolated API responses. Live account/database validation remains held. |
| Actual games | Six stateful living systems and six additional advanced missions, alongside all original 21 missions. | Both situations and unsafe actions tested; farm interaction, persistence and reload exercised in three browser sizes. |
| Personalisation and portfolio | Avatar appearance, 8×5 clubhouse placement, movement/rotation/return to inventory, floor themes, named projects and paginated version history. | Old-save defaults, unlock and occupancy guards, isolated persistence and browser interaction tested. |
| Content Studio | Chapter labels/order, curriculum links, badge labels, additional missions using fixed simulation templates, executable previews and existing review/publishing workflow. | Strict metadata validation, real component authoring and disabled publication tested. Storage activation remains held. |
| Integration testing | Actual world/canonical route handlers and world persistence functions tested against isolated auth/database boundaries; existing regressions retained. | No live student, school, AI, support queue, runner or database execution claimed. |

## Guided curriculum integration

- `/student/coding/world/lessons/[lessonId]` opens the existing legacy lesson workspace and canonical `/api/student/coding/lessons/[lessonId]` API.
- `/student/coding/world/activities/[activityId]` opens the existing curriculum ActivityLoader/LearningWorkspace and canonical activity API.
- Guided discovery lists published lessons and released activities only. It retains actual prerequisite/unlock decisions and teacher-assigned status. Recommendations prioritise eligible teacher assignments, saved learning and year suitability; Free Practice cannot unlock formal activities.
- The guided world routes explicitly whitelist booking and daytime-period context; arbitrary query parameters cannot override lesson IDs, locations or API endpoints. Existing lesson workspaces also offer a link to their world presentation after work has been saved.
- Domain scenes render actual recorded lesson positions, targets, obstacles and stops. Formal objectives, cases, curriculum identifiers, independent evidence, assessment contracts and publication manifests were not replaced or changed.
- The original standard presentation remains available. World presentation is optional. Non-spatial practical work continues to use its existing engine and output tools, rather than inventing an unrelated game result.
- World views suppress the existing optional read-aloud controls to retain text-only Game World communication.
- Canonical GET responses now supply an `X-Coding-Learner` binding. Updated lesson/activity clients carry it on actions and example requests. The canonical POST handlers reject a stale binding with 409 before saving or executing when the active learner has changed. Existing access guards remain authoritative, and older clients without the optional header remain compatible.

## Living games

The original 21 missions remain. Six advanced missions bring the built-in catalogue to **27**. Additional Content Studio missions can be introduced only through reviewed fixed-engine templates once storage and publication are separately authorised.

| Location | Stateful simulation |
| --- | --- |
| Pizza Restaurant | Flour inventory, customer orders, topping requests, dietary variation, preparation bench, oven occupancy, three-tick baking and safe serving. |
| Robot Factory | A bounded factory floor, obstacle variations, actual coordinates, component pickup, carrying and delivery. |
| Happy Farm | Three distinct beds, finite seeds, reservoir/refill, moisture, growth ticks, rain/dry scenarios and individual harvests. |
| Traffic City | North/east vehicle queues, pedestrian crossings, mutually safe light phases and a priority-vehicle variation. |
| Space Centre | Fuel preparation and consumption, launch state, debris/shield variation, travel, scanning, samples, return and docking. |
| Pet Care Centre | Two virtual animals with separate hunger, hygiene, happiness and energy, plus a sensitive-diet variation. |

Sandbox state is saved in the existing private world JSON. Each equipment action is validated and stepped on the server. No elapsed-time growth or unattended rewards are introduced. Returning restores the equipment state; it does not run missed ticks. Sandbox interactions never complete a practice mission, formal lesson or mastery record. Program checks reconstruct their own defined situations, and completion still comes from server execution. Replay frames include actual simulation state.

The simulations are bounded educational systems. This delivery does not claim an unrestricted commercial restaurant-management game, a complete physical ecosystem or unbounded AI NPC behaviour.

## Personalisation and projects

- Avatar appearance provides skin tone, hair style, outfit colour and earned accessories. Appearance is rendered consistently in the world and clubhouse.
- The clubhouse has an 8×5 floor, up to 24 placed decorations, collision checks, movement, rotation, reversible return to inventory and selectable floors. Placement and accessory unlocks are enforced on the server.
- Avatar position now persists. Camera controls remain the finite-world map controls from the initial implementation.
- Up to 24 independently named projects can be kept, including several for one mission. Active named-project edits and renames autosave, and the mission working copy is kept in sync. Different named projects and historical snapshots remain separate.
- Version history now uses owned cursor pagination rather than truncating access at 40 entries. Pages contain up to 40 versions; all stored versions remain retained. A foreign cursor is rejected before querying the history page.
- Restoring a snapshot opens a draft and does not silently replace the original version. Formal mastery records remain separate.
- Existing saves receive additive defaults for appearance, room, projects, position and simulation state. No existing world or student record was reset.

## Content Studio and migration holds

Studio versions can contain chapter title/order, curriculum references, a practice badge label and up to three additional missions per content pack. Additional missions select from the six developer-controlled living simulation engines. They cannot supply executable code, new engine logic, arbitrary URLs, formal lesson-completion claims or wallet mutations. Original mission prerequisites and formal curriculum release gates remain authoritative.

Curriculum references must resolve to existing lessons. Publishing cannot expose an unreleased lesson. Additional missions require their parent practice mission and declared existing prerequisites. Duplicate published mission IDs and conflicting curriculum mappings are rejected. Publishing uses a serializable transaction, independent approval, audit entries and the existing environment gate.

**Both migrations are prepared only and remain unapplied:**

1. `prisma/migrations/20261107120000_coding_world_content/migration.sql` — the original held Content Studio table migration, retained unchanged.
2. `prisma/migrations/20261107130000_coding_world_content_metadata/migration.sql` — an additive metadataJson column, generated as a local Prisma schema-to-schema diff without applying it.

The Prisma client was regenerated locally and schema validation passed. No migration reset, database schema application, seed, production publication, Git push or deployment was performed. The publication flag was not enabled by this work. The practice core and guided bridge reuse existing storage. Studio storage requires separate authorisation and the held schema rollout before it can be activated.

## Validation

- **43 targeted tests passed**: original mission behaviour, six living systems, unsafe actions, old saves, appearance/placement guards, named projects, sandbox resume, guided recommendations, safe content extensions, canonical and world route scoping, stale learner bindings, pagination ownership, concurrent saves and unavailable-runner draft retention.
- **36 existing regression tests passed**: editor behaviour, visual/native engines, source execution contracts, entitlement policies, game execution and teacher-feedback independence rules.
- **Six browser acceptance checks passed**: desktop 1440px, tablet 768px, mobile 390px, expanded Content Studio, guided legacy lesson and guided curriculum activity. Browser checks use the actual application stylesheet and component CSS. They cover a working program, snapshots/restore, named projects, decoration placement/rotation, appearance changes, farm actions and sandbox resume without mission credit.
- Focused TypeScript validation and targeted lint passed. The focused typecheck retains a **2 GiB heap cap**; the memory-heavy full application typecheck was not repeated.
- `prisma validate` passed. Migration SQL was not applied.

The browser API fixtures and auth/database boundary doubles are isolated test data. Native visual execution, legacy assessment and curriculum state-machine transitions run for real inside those tests. They do not establish live authentication, real database transactions, school licensing, AI provider availability, isolated runner availability or actual tutor queue eligibility. Those checks remain held at the user's instruction.

Representative screenshots are in `artifacts/coding-world/`, including `clubhouse-390.png`, `farm-sandbox-390.png`, `guided-legacy.png` and `guided-activity.png`. Component/module layouts were visually inspected. Full hosted application acceptance, device-performance budgets and a successful whole-platform production build remain unverified.

## Review and release boundary

The requested local feature continuation is implemented. This report is not final acceptance of all 40 design decisions or production readiness. Educational review should confirm the presentation mappings and expanded mission content. Subsequent work must use a confirmed non-production environment before live account/database testing. Neither held migration nor content publication should be activated without the separately required authorisation. Production release and Git push remain separately controlled.

The pre-existing working tree was not reset, cleaned, checked out, committed or pushed. Exact pre-continuation copies of the main reused modules were retained under `artifacts/world-continuation-20261107-064557/` for review.

## Reproduce local checks

```text
npm run typecheck:coding-world
npm run test:coding-world
npm run test:e2e:coding-world
npx prisma validate
```

The browser configuration starts no application server and contacts no live database. The focused typecheck is intentionally not a substitute for whole-platform release acceptance.
