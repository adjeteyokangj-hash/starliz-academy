# Curriculum implementation plan and approval gates

Date: 2 November 2026. **Do not implement new curriculum content until the user approves the design baseline.** This is the user's explicit instruction, not a request for approval inferred from a skill.

## Scope and preservation

This work produces planning documents and a structured proposal. It does not seed lessons, change publication flags, rename pathway IDs, modify the existing Coding runtime, reset migrations, write learner records, commit, push or deploy. The original 66-lesson proposal and all local Coding corrections remain intact.

The approved architecture stays Pathway → Course → Module → Lesson → Challenge → Project. Existing published `understanding-loops` content and reserved draft identifiers are mapped, not replaced. Future implementation must take a fresh working-tree baseline before editing shared files and isolate unrelated local changes. Existing records and achievements require version-aware compatibility, never a reset.

## Proposed delivery stages

| Stage | Work after curriculum approval | Dependency | Exit evidence |
|---|---|---|---|
| 0 — Baseline and educational sign-off | Review all lesson rows, reference alignment, accessibility, cognitive load, vocabulary and assessment rubrics; agree primary/secondary runtimes. | User approval of this package. | Signed review record; resolved coverage issues; stable versioned proposal. |
| 1 — Complete shared Coding foundations | Finish authenticated UAT of local corrections, settings migration through an approved release process, consent/access controls, reliable saves, independent evidence, project privacy and accurate awards. | Reviewed existing audit and implementation report. | All role/access cases pass; no loss of saved work; parent replay corresponds to saved version; no false pathway awards. |
| 2 — Versioned curriculum and authoring | Introduce content/version contracts, explicit relationships, prerequisites, project milestones, reviewed tests, provenance, publication workflow and evidence mapping. | Stable shared foundations. | One fully authored draft round-trips through validation without exposing private assessor material. |
| 3 — Visual, scene, media and scenario engines | Extend beyond movement/repeats to events, headings, state, conditions, procedures, media authoring, data displays and age-appropriate interactive safety scenarios. | Authoring/runtime interfaces agreed. | Each required action is real; deterministic fixtures and negative cases pass; keyboard/touch parity verified. |
| 4 — Systems, robotics and network models | Implement actual sensors, actuator state, bounded physics/control, circuits, binary/representation tools, simplified stored-instruction model and network/service traces. | Engine contracts and educational models reviewed. | Model state can be inspected and changed; predictions checked; limits and simplifications explicit. |
| 5 — Text and web execution | Provide real Python execution, actual JavaScript behavior and isolated HTML/CSS preview, including console, limits, cancellation, reset and accessible errors. | Security/runtime review. | Named languages execute correctly; untrusted code cannot access StarLiz authority or other learner artifacts. |
| 6 — Data, API and intelligent-system workspaces | Add isolated relational data, parameterised operations, executable local service contracts, virtual files, small trainable models and held-out evaluation tools. | Text execution and isolation validated. | Transactions, role boundaries, failures, model evaluation and save/resume pass controlled tests. |
| 7 — Publish complete course increments | Author all stages, projects, independent variants, reference implementations, feedback and portfolio evidence for each course. | Relevant engines operational. | A whole course journey passes education, function, security and browser review before being described as available. |
| 8 — Evaluate and extend | Pilot with learners of varied prior experience, review delays and misconceptions, strengthen retrieval/bridges, then extend depth where needed. | Complete reviewed courses. | Evidence-based changes; no arbitrary cap on lessons; versioned equivalence and bridge plans. |

This table is a dependency plan, not a duration estimate. Engineering estimates require an architecture spike and an approved lesson package. A new engine is not accepted because its dashboard loads. Courses can be built in parallel only if separately authorized and their dependencies are ready; this document does not authorize agent delegation.

## Course implementation order

1. Preserve and fully verify Understanding Loops as a regression anchor; do not generalize its single-lesson assumptions by copying them.
2. Build complete foundational visual and digital-fluency learning journeys for Years 1–2, including meaningful safety/reporting scenarios.
3. Complete event-driven, stateful and sensor-driven Years 3–4 modules, retaining existing Coding content compatibility.
4. Implement the deliberate Years 5–6 block-to-text transition, data/media work and Python/web projects.
5. Complete Years 7–9 language, systems, algorithms, service, data and AI depth; verify all planned KS3 evidence before learners exit the band.
6. Complete Years 10–11 engineering, persistent applications, security, reliability, intelligent-feature evaluation and independent capstones.

Do not market later courses as complete while their engine or learning evidence is missing. A complete smaller release may be accurately labelled by its available courses; it must not claim the full Years 1–11 programme has launched.

## Required lesson package

For each inventory row, author and review:

- Stable ID and version; pathway/course/module/project relationships; precise prerequisite skills and placement equivalences.
- One measurable learning objective, a purposeful project milestone, reading-level guidance and accessible input alternatives.
- All seven stages with interactive teacher prompts, model demonstrations, plausible learner errors and reviewed feedback.
- Actual starter artifact and resources, correctly licensed or original; no invented block or API capabilities.
- Runnable reference solutions; at least three task-specific essential checks; the named seeded fault; normal, boundary and negative cases where applicable.
- An unseen independent requirement, at least two assessor-held cases, additional task-appropriate cases, an explanation rubric and safe variants after disclosure.
- Save/resume and version-recovery behavior, parent preview evidence, assistance provenance and accurate achievement language.
- Educational approval, engine verification, security/access checks, browser/accessibility checks and publication approval recorded separately.

The existing lesson validation is specific to Understanding Loops. Future publication tooling must validate each lesson against its declared engine and run its own reference and failure cases. Passing a metadata template, title list or generic test is insufficient.

## Runtime acceptance contracts

| Workspace | Required implementation | Must not count as completion |
|---|---|---|
| Route and scene | Actual event/state execution, movement, conditions, variables, bounded repeats, procedures, restart and traces. | A pre-recorded animation selected by an answer. |
| Robotics | Sensor readings derived from simulated state, actuator effects, calibrated units, mission conditions and bounded control. | A robot icon moving along a fixed path regardless of learner program. |
| Systems/circuits/networks | Inspectable transitions, truth-table evaluation, binary operations, representation changes and request/packet traces. | A static diagram with a completion button. |
| Media/data/scenarios | Real editable artifacts, formulas/charts/transformations and observable decisions with a stated rubric and consequences. | Multiple-choice recall standing in for creation or help-seeking practice. |
| Python | Real language execution in a constrained environment, output capture, supported libraries, limits, cancellation and isolation. | String matching a few expected lines while claiming Python executed. |
| Web/JavaScript | Real rendering and interaction in an isolated context, safe origin boundaries and controlled resources. | An image of a website or code evaluated in the privileged StarLiz page. |
| SQL/files/APIs | Per-project isolated data, actual query/update/file operations and executed service handlers; controlled failures and test requests. | Canned responses claimed to be a learner-built backend, or use of production tables. |
| AI/classifier | A small genuine train/evaluate process, independent test data, reproducible metrics and uncertainty/bias exploration. | A hard-coded label selector described as a learned model. |
| Portfolio/release | Artifact-linked versions, reproducible test evidence, controlled maintenance/recovery and accessible demonstrations. | A generated project description without working artifacts. |

Curated fixtures are appropriate for repeatability, age suitability and safe testing. They must exercise actual learner-authored logic. Fixture APIs used while learning consumption must be distinguished from later projects in which the learner implements the service. No lesson requires unrestricted network access, real attacks, real payment actions, production credentials or real personal datasets.

## Verification plan

### Educational and coverage checks

Validate every requirement anchor within its key stage, including compound requirements in the matrix. Confirm all three curriculum strands remain represented: understanding computation, making useful digital artifacts and responsible judgement. Review spirals for increased demand rather than superficial theme changes. Check that prerequisites precede independent use and that practical placement can establish equivalence.

Pilot the proposed timing and four-module structure. If a course's core outcomes cannot be reached with the planned consolidation, add sessions or split the course; do not lower mastery criteria to preserve a lesson count. Record qualitative learner explanations as well as behavioral outputs.

### Engine and assessment checks

Run reference solutions against actual engines and ensure seeded faults fail for the intended reason. Include multiple valid solutions, unfamiliar inputs, boundary cases, finite execution, error recovery and deterministic reset. Calibrate explanation scoring against reviewed examples; offer review for uncertain or disputed results. Distinguish assistance from accessibility support. Verify independence after AI or human answer disclosure using a new task.

Test save/resume across devices, interrupted requests, stale tabs, concurrent updates and restored versions. Verify reward/certificate idempotency and that lesson mastery does not imply course or pathway completion. A reopened artifact must reproduce the evidence attributed to it.

### Access and safety checks

Test student ownership, parent ownership, teacher classroom scope, administrator settings permissions, school licence and subscription boundaries, consent, expired sessions, wrong-subject bookings and unavailable tutors. Assistance disabled must be enforced at request and acceptance, not only in the interface. Do not create an unattended queue when no tutor capacity exists.

Verify sandbox escape resistance, data isolation, output/time/memory limits, cancellation, network restrictions, redacted logging and fixture provenance. Treat learner code and model output as untrusted. Parent previews must not inherit parent credentials or expose other children's data. Age-appropriate help/report scenarios must not solicit sensitive disclosures or send real reports during tests.

### Browser and accessibility checks

Test the whole course journey on phone, tablet and desktop: placement/bridge, instruction, demonstration, editing, execution, errors, save/resume, independent assessment, project completion and parent portfolio. Include keyboard-only use, focus, screen-reader status, labels, target sizes, readable contrast, zoom, alternative inputs, captions and reduced motion. Record real authenticated tests separately from fixture-based component checks.

### Release evidence

Educational approval, passing content/engine checks, authenticated end-to-end results, application checks and migration status belong in the release report. Existing local corrections and unrelated repository errors must be accounted for. No reset, data deletion, commit, push, migration deployment or application deployment is authorized by this planning package. Further releases require the user's instructions and the relevant concrete review evidence.

## Planning integrity checks performed

The generated proposal validates counts, unique lesson IDs, all 66 original mappings, project references, valid alignment tags, three essential checks per lesson, explicit prerequisites ordered before dependent lessons, preserved pathway IDs, existing runtime aliases and proposal-only status. Every statutory shorthand has evidence within its own key stage. The validation report records source-file preservation against the start-of-task baseline.

These checks establish document consistency only. They do not prove that a lesson teaches effectively, that a model is safe, that a runtime works or that statutory outcomes have been achieved by learners.

## Decisions requested before new content implementation

1. Approve or revise the 264-core-lesson inventory, 132 consolidation sessions, course outcomes and deliberate spirals. Additional depth remains possible.
2. Approve the five existing pathways with their current IDs/titles; decide separately whether to use the proposed Explorer/Builder/Creator/Developer/Engineer descriptions in the UI.
3. Confirm the programme is a broad StarLiz course using England as its minimum reference. Any GCSE examination-board mapping is separate and must be named before qualification-related claims or preparation content are added.
4. Approve architecture investigation for actual Python, web, SQL/API and classifier runtimes under the stated isolation contracts; select implementations only after a technical/security review.
5. Approve a bounded first course increment and its educational review process. This does not authorize a database migration or release.

The other Skills Labs may later use the same review method, but this package neither specifies their curricula nor starts their implementation. The overall 13-lab scope remains a separate user decision.
