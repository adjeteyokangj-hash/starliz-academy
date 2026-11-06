# StarLiz Coding Curriculum design

Date: 2 November 2026. Proposal for approval, not a publication instruction.

## Educational identity

StarLiz learners build, explain, test and improve useful digital creations. The academic foundation is England's computing programme; the distinctive StarLiz layer is a connected portfolio of working projects, supported by AI teaching and practical independent assessment. Robotics, responsible AI, defensive cybersecurity and software engineering enrich the same progression.

The curriculum gives equal attention to computational understanding, practical creation and responsible judgement. A child should be able to explain why a solution works, recognise where it fails, recover saved work and show evidence for a claim. Rewards record achievement after that evidence; they do not replace it.

## Pathways and architecture

| Existing pathway ID | Existing title retained | Proposed description | Years | Expected exit evidence |
|---|---|---|---|---|
| `foundations` | Coding Foundations | Coding Explorers | 1–2 | Plan and predict a short visual program; repair a fault; create, save and retrieve digital work; demonstrate safe help-seeking. |
| `block-coding` | Block Coding | Coding Builders | 3–4 | Create event-driven programs with repetition, decisions and state; control a virtual physical system; use evidence and networks responsibly. |
| `blocks-to-text` | Blocks to Text | Coding Creators | 5–6 | Transfer visual algorithms to executable Python; use functions and collections; build usable webpages; combine and judge data and media. |
| `programming-web` | Programming and Web | Coding Developers | 7–9 | Independently program in Python and JavaScript; explain algorithms, systems and representations; build evaluated data and web products. |
| `applied` | Applied Computing | Coding Engineers | 10–11 | Engineer a bounded, persistent application with service contracts, tests, access controls, reliability evidence, maintenance and honest evaluation. |

Pathway → Course → Module → Lesson → Challenge → Project remains the content structure. Each year has one course with four six-lesson modules. A project is attached to its module and receives milestones from each lesson, then a completed product and independent change. A lesson may have several challenges but a single named learning objective. The year course retains all four project outcomes in its portfolio.

The original published `understanding-loops` lesson and its approved content remain authoritative. Proposal references such as `Y3.02` are not new runtime identifiers. Existing unpublished identifiers `what-is-an-instruction`, `what-is-a-variable`, `first-python-program` and `plan-a-test` also remain reserved for their corresponding work. Course and module aliases are retained in the planning records. No catalogue titles, IDs, routes or learner records are modified by these documents.

## Year course outcomes

| Year / course | Four saved project outcomes |
|---|---|
| 1 — First Instructions | Parcel delivery route; illustrated instruction card; animated pattern garden; private digital storybook. |
| 2 — Stories in Steps | Robot delivery map; interactive story; classroom survey display; digital community guide. |
| 3 — Build Your First Games | Loop-powered animation; playable maze; sensor-controlled delivery robot; trusted discovery guide. |
| 4 — Interactive Worlds | Score-and-lives game; branching story engine; interactive evidence poster; accessible learning game. |
| 5 — From Blocks to Text | Dual-view score program; number challenge; robot rescue simulation; evidence-based web guide. |
| 6 — Pages and Programs | Reusable Python toolkit; accessible portfolio page; data investigation and classifier; calculator with evidence portfolio. |
| 7 — Programs and Pages | Modular revision quiz; executable computer model; search-and-simulation notebook; user-focused data report. |
| 8 — Interactive Web | Interactive revision website; resilient service dashboard; feedback-controlled robot; accessible community tool. |
| 9 — Algorithms and Data | Algorithm investigation tool; searchable data application; evaluated classifier; evidence-backed application. |
| 10 — Applied Projects | Tested service component; inventory service; secure application revision; persistent inventory application. |
| 11 — Reliable Applications | Reliable service prototype; responsible intelligent feature; independent portfolio application; maintained release and handover. |

## Progression from visual to text

1. **Years 1–2: actions and observable state.** Large visual controls, short instructions, read-aloud and direct replay. Introduce ordering and repeat groups through movement and stories. Avoid requiring typing skill as a proxy for computing understanding.
2. **Years 3–4: structured visual programs.** Add events, variables, conditions, procedures and parameters. Trace event-driven state, test failure cases and control sensor-driven simulations. A robot simulator is an actual stateful engine, not a pre-recorded animation.
3. **Year 5: deliberate dual-view transfer.** Show equivalent visual and Python programs, predict both, then edit and write text. Teach expressions, conversion, decisions, counted and conditional loops before expecting reusable functions. HTML and CSS support purposeful communication, with a clear distinction from programming language semantics.
4. **Year 6: reusable text components.** Functions, local state, lists and testable interfaces support increasingly independent text work. Web design, data and AI judgement broaden the contexts. Transfer evidence, not age alone, determines readiness for secondary work.
5. **Years 7–9: deeper programming and systems.** Year 7 starts with a transfer task, not a forced reset. Real Python and JavaScript solve substantive problems. Learners use traces, structures, algorithm comparisons, binary models, circuits and evaluated data. SQL adds a data language but does not substitute for JavaScript programming evidence.
6. **Years 10–11: software products and responsibility.** Model requirements, APIs, persistent state and threats; test contracts and access boundaries; handle concurrency, retries and recovery; evaluate AI features and maintain a release. Architecture remains bounded and age-appropriate rather than imitating an enterprise system for its own sake.

## Seven-stage lesson contract

| Stage | Learner activity | Required artifact or evidence |
|---|---|---|
| Discover | Observe a bounded demonstration linked to the project's purpose. | Visible initial state, user goal and teacher explanation. |
| Predict | Commit to an expected output, transition, decision or failure before execution. | Prediction and its reasoning, separate from the result. |
| Build | Work with the AI teacher through a manageable example. | Versioned artifact and help provenance. |
| Practise | Change an input, parameter, user need or dataset. | Execution or interaction evidence for the changed case. |
| Debug | Diagnose and repair the specifically named seeded fault. | Reproduction, cause, correction and regression result. |
| Create | Complete the specified unseen independent variation. | Artifact version and assessor-held results without a shown solution. |
| Review | Explain one important decision and compare outcome with intent. | Spoken, written or demonstrative explanation grounded in evidence. |

The inventory provides a lesson-specific task, fault, independent variation and at least three essential checks for each of 264 lessons. The planning JSON expands these into stage prompts, prerequisites and mastery criteria. Full teacher scripts, reference programs and executable tests must still be authored and verified in implementation.

## AI-first teaching and optional human assistance

The AI teacher should demonstrate, ask useful questions, diagnose misconceptions and respond to actual artifacts and execution results. It should use the approved lesson version, prerequisite evidence, year/reading needs and assistance history. Retrieval must stay within reviewed curriculum material and known runtime capabilities. It must not invent blocks, commands, sensor behavior or claims of successful execution.

Hints progress from a nudge to a targeted explanation and, if necessary, a worked example. The learner gets an attempt between escalations where appropriate. Any disclosed independent solution marks that challenge as assisted; a new equivalent task is required. Resetting an editor or restarting a session does not erase help provenance. Parents see support needs and subsequent independent success without punitive labels.

Human assistance remains disabled by default and controlled by an administrator for Coding. The server must enforce the setting at request and session acceptance, with valid classroom/subject or booking context and available tutor capacity. Lack of capacity means continued AI learning with saved context. A human tutor's answer disclosure affects independence in the same way as an AI answer. Safeguarding concerns use the platform's authorized workflow rather than a curriculum-created contact channel.

Safety practice scenarios must be visibly labelled as practice. They do not send real reports or replace the platform's genuine help and safeguarding routes, which remain available outside the exercise. A child raising a real concern must not be kept inside a scored simulation.

AI and human assistance cannot award practical mastery merely by asserting that a learner understands. Executable results determine behavioral checks. Explanation rubrics need calibration and a review path for uncertainty. Live teaching requires age-band, misconception, safety, solution-leakage and failure-mode evaluation before publication.

## Assessment and mastery

Each lesson has five evidence dimensions: prediction; practical behavior; debugging; explanation; independent transfer. Essential checks are task-specific. All essential checks must pass, the named fault must be repaired and explained, and the unseen variation must pass at least two assessor-held cases. Two cases are a floor, not sufficient coverage for every complex program. Boundary, negative and security cases are added according to the task's risk and specification.

For digital media, scenarios and systems, practical evidence can be rendered output, an inspected permission decision, a truth table, a simulated report path or an execution trace. A scenario validator verifies actions and effects; an explanation is assessed against a stated rubric. The system must not give a misleading code-execution label to those outcomes.

Module mastery requires its six lesson outcomes, a functional project and an independent change. Course mastery requires all four module outcomes and a delayed transfer/review session. Pathway completion requires all required course outcomes or practical evidence of equivalence. A lesson certificate names its lesson; a pathway award requires pathway evidence. Reward records, academic scores and money retain distinct semantics.

Certificates and parent summaries must preserve provenance: curriculum version, artifact version, essential checks passed, independent assessment version and assistance status. Existing evidence is not retroactively invalidated by a revised curriculum. Migration of curriculum versions requires a reviewed equivalence map and bridge plan.

## Placement, inclusion and responsive interfaces

Placement combines a short practical task, a prediction, a fault repair and an explanation at each pathway boundary. Multiple-choice knowledge and self-reported experience cannot certify practical mastery. Learners arriving without prior StarLiz courses take a targeted bridge. Learners who demonstrate competence can bypass repetition with recorded evidence.

Keep school year separate from learning readiness. Age, reading, motor or language needs influence presentation and scaffolding, not automatic assumptions about capability. Provide touch, keyboard and pointer equivalents; read-aloud, captions and alternative explanations; clear focus and status messages; usable layouts at mobile, tablet and desktop widths; and reduced-motion options. Professional does not mean tiny controls or dense adult terminology.

| Band | Workspace character | Parent-visible evidence |
|---|---|---|
| Years 1–2 | Large action blocks, picture plans, audio support, predictable replay and clear save/retrieve actions. | Picture/story replay, child's plan and spoken explanation, safe-choice evidence. |
| Years 3–4 | Scene or robotics canvas, contextual blocks, sensor/state panels, trace controls and meaningful restart. | Playable private project, conditions tested, repaired fault and independent change. |
| Years 5–6 | Optional paired block/text view, readable editor and console, web preview, data tools and clear error guidance. | Actual program/page, data evidence, differences between versions and support used. |
| Years 7–9 | Language-appropriate editor, console, test panel, circuit/model/data views and user requirements. | Runnable artifact, tests, algorithm/model evidence, sources and evaluation. |
| Years 10–11 | Project workspace with source files, isolated data/API tools, contracts, tests, version history and review record. | Working application, access/recovery evidence, design decisions and maintained portfolio. |

## Portfolio contract

Every project entry includes its user/purpose, learner-authored artifact, actual preview or replay, saved version, tested skills, assistance used, independent change, one repaired issue, accessible explanation, credit/provenance and next learning step. Parents can inspect only their child's work; teachers remain within authorized scope. Public sharing is not required to complete any lesson or course.

Preview engines must run code in a separate, restricted context. Parent viewing must not execute learner code with the parent's application credentials, production data, unrestricted network or application-origin authority. Prefer read-only validated replay where suitable; interactive code needs the same isolated runtime as the learner workspace. No secrets or real personal datasets are needed in projects.
