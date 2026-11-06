# Curriculum coverage review

Date: 2 November 2026. Review baseline: `docs/CODING_CURRICULUM_REVIEW.md` and the existing Coding catalogue. Status: proposed design, for approval.

## Finding

The original 66 lessons are a useful programming spine, but not a comprehensive Years 1–11 computing curriculum. They propose only six lessons per year, leave significant computing and digital-literacy outcomes unaddressed, and put too many new concepts into several final projects. Adding attractive lesson titles would not resolve these gaps: instruction, practical evidence and supported transfer are required.

Recommend **264 core lessons, 24 per year**, with **12 consolidation sessions per year**. The number follows a proposed four-module annual structure, not a statutory lesson-count requirement. It remains adjustable after educational review and delivery evidence. Every year produces four portfolio projects and a course review. Learners can require additional bridges, practice or greater challenge.

The expanded proposal preserves the runtime identifiers `foundations`, `block-coding`, `blocks-to-text`, `programming-web` and `applied`. Existing catalogue titles remain authoritative. Coding Explorers, Builders, Creators, Developers and Engineers are proposed descriptions only. The established structure remains Pathway → Course → Module → Lesson → Challenge → Project.

## Reference and claim boundary

The [DfE programme for England](https://www.gov.uk/government/publications/national-curriculum-in-england-computing-programmes-of-study/national-curriculum-in-england-computing-programmes-of-study) supplies the minimum academic reference. Its expectations are organised by key stage. StarLiz's year-by-year allocation, lesson count, projects and modern-technology extensions are original planning choices. The detailed [coverage matrix](COVERAGE_MATRIX.md) uses short internal labels rather than reproducing the programme.

Computing is broader than programming. A Coding product using computing as its minimum reference must deliberately include the relevant systems, information-technology and responsible-use learning. These can be delivered through practical creation, experimentation and evidence review within Coding. Creating separate Robotics, AI or Cybersecurity Labs is not part of this proposal.

Alignment means a proposed task can furnish evidence for an outcome. Delivered coverage requires that the task actually exists, passes its engine checks, is taught accessibly and is assessed. The proposed inventory does not establish those conditions. Only Understanding Loops is established as a published practical lesson in the inspected catalogue. All other entries remain proposals or existing unpublished drafts.

## Gaps and required additions

| Area | Finding in the original 66 | Recommended treatment and examples |
|---|---|---|
| Early digital fluency | Saving appears as a platform affordance, not a taught skill; creation and retrieval lack explicit progression. | Y1.07–Y1.12 and Y2.13–Y2.18 teach tool choice, original media, naming, retrieval, editing and data display. |
| Everyday computing | Device purposes and input/output beyond coding are largely absent. | Y1.19, Y2.05–Y2.06 and Y2.19 make device actions observable; later robotics revisits input, process and output. |
| Online safety and respectful use | Privacy, contact, consent to reuse, conduct and reporting are not a planned recurring sequence. | Age-appropriate fictional scenarios begin in Year 1 and recur every year, progressing to permissions, identity, defensive security and changing risks. |
| Networks and information judgement | Internet services, search ranking, source evaluation and collaboration are not explicitly taught. | Y3.19–Y3.24 and Y5.19–Y5.24 establish foundations; Y8.07–Y8.12 deepens communication and service behaviour. |
| Physical systems | A moving maze character does not alone demonstrate sensor-driven control or feedback. | Y3.13–Y3.18 introduces real simulated sensor/actuator behaviour; Y5.13–Y5.18 and Y8.13–Y8.18 deepen modelling and feedback. |
| Data and multiple tools | Data arrives late; a portfolio or webpage alone does not establish data collection, analysis or tool combination. | Data begins pictorially in Year 2, develops through charts/formulas in Year 4, validation and evaluation in Year 6, and multi-tool analysis in Year 7. |
| Systems and representations | Logic circuits, binary operations, components, stored instructions, text, sound and image representation are missing. | Y7.07–Y7.12 and Y7.19–Y7.20 provide executable models and observable representation changes. |
| Algorithms before the end of KS3 | Binary search and comparison are deferred to Year 10. | Linear search and traceable sorting in Year 7; binary search, alternate strategies and operation growth in Year 9. |
| Two programming languages | Python and JavaScript are named, but the transition and expected independent competence are under-specified. | Python has substantial assessed work by Year 7; JavaScript has independent interaction and state tasks in Year 8. HTML/CSS are not counted as a programming language substitute. |
| Modular design | Functions appear briefly before enough practice with input, selection and iteration. | More gradual text transfer in Year 5; explicit functions, collections and component tests in Year 6; contracts deepen later. |
| Real software development | No explicit API progression, version conflict, idempotency, concurrency or maintained release. | Y8 introduces controlled service consumption; Y10 builds a data/API application; Y11 addresses reliability, compatibility and maintenance. |
| AI literacy | No explicit distinction between rules and learned models, test separation, errors, uncertainty or bias. | Age-appropriate classifier investigations begin in Year 6; Year 9 evaluates models rigorously; Year 11 integrates and audits a bounded intelligent feature. |
| Project authenticity | Several titles describe products without a staged build, audience, evidence or realistic independent change. | Every six-lesson module builds one coherent artifact; all courses retain four tested outcomes and an evidence-based review. |
| KS4 breadth | A final software application alone leaves digital media and further-study progression thin. | Year 11 includes original accessible media, a maintained release, handover and evidence relevant to further learning or professional roles. |

## Review of progression and repetition

All 66 original rows were individually reviewed in [the crosswalk](ORIGINAL_66_REVIEW.md). None is silently discarded. The crosswalk identifies retained material, deeper treatment, splits, deliberate spirals and movement to a more suitable point.

Specific corrections:

- **Python should not restart in Year 7.** The existing `first-python-program` draft identifier and title are retained. Its planned secondary role becomes a transfer assessment with a targeted bridge for learners without primary Python experience. Learners demonstrating competence move on; they do not repeat elementary work solely because they entered a new year.
- **Loops need changing demands.** Grouped visual repetition precedes counted text loops, conditional iteration, nested traces, collection traversal and algorithm analysis. Repeating a lesson with only a new picture is not progression.
- **Repeated game projects need different learning evidence.** A block maze examines input, collision and goals. A score-and-lives game examines state and replay. A modular Python quiz examines functions, validation and data. A JavaScript revision site examines DOM interaction and responsive state. Their shared topic does not justify repeating the same assessment.
- **Web learning should spiral deliberately.** Year 5 introduces page structure and style; Year 6 tests semantic accessibility and responsive constraints; Year 8 adds real JavaScript interaction and evaluated user needs. Re-teaching headings and colours alone in Year 8 would be insufficient.
- **Data and algorithms should start before Year 9.** Earlier projects establish categories, counts, formulas, validation, search and fair comparisons. Year 9 can then assess structure choice, preconditions, database relations and model evaluation.
- **A combined calculator and portfolio needs preparation.** Functions, data, error handling, evidence links, accessibility and integration get distinct lessons before Y6.24. The old single project brief cannot bear all of those new concepts at once.
- **Database safety cannot be one final-year lesson.** Data modelling and queries precede safe updates, atomic changes, server authorization and threat-driven review. Year 11 can then address concurrent changes and maintenance.

## Depth and time judgement

There is no defensible claim that six lessons per year provide comprehensive mastery of the stated scope. The original outline might serve as a short enrichment sequence if advertised honestly. It does not establish the repeated practice, practical range or end-of-stage evidence needed for the proposed comprehensive product.

Proposed annual scheduling:

| Years | Core lessons | Consolidation sessions | Initial session estimate | Annual guided capacity |
|---|---|---|---|---|
| 1–2 | 24 per year | 12 per year | 30 minutes | 18 hours per year |
| 3–6 | 24 per year | 12 per year | 45 minutes | 27 hours per year |
| 7–11 | 24 per year | 12 per year | 60 minutes | 36 hours per year |

This is 396 scheduled sessions and approximately 324 guided hours across eleven years. It assumes one session in each of 36 teaching weeks. These are design estimates, not a legal minimum, a school timetable prescription or a promise that every learner will reach mastery in that time. Larger projects can span additional sessions; younger learners can split sessions. Time-on-task and evidence from pilots must determine revisions.

Each nine-session cycle contains six core lessons and three consolidation opportunities. Consolidation includes delayed retrieval, mixed practice, unfamiliar debugging, independent transfer, portfolio explanation and targeted repair. It must not become another easy completion quiz. Additional work is assigned in response to a diagnosed need, with an opportunity to demonstrate mastery and exit the bridge.

## Project and evidence gaps closed in the design

The proposal contains 44 coherent module projects, not 264 unrelated capstones. Each lesson adds a saved milestone. Course completion requires all four project rubrics, essential lesson evidence and a delayed independent transfer assessment. Portfolio entries show actual runnable work or interactive model evidence, test outcomes, revisions and a learner explanation. A generated description of a supposed project is not sufficient.

For safety, media and systems topics, the artifact can be an interactive report, a traceable circuit, an executable computer model or a data investigation. It need not be falsely described as a software application. Independent assessments use unseen fixture data, faults or user requirements. Assistive technology and read-aloud do not count as answer assistance. Human or AI solution disclosure does.

## Remaining uncertainty and required educational review

- A computing curriculum specialist must review the complete sequence, terminology, cognitive load, explanations and assessment validity before publication.
- Appropriate age differentiation requires pilots with learners of differing reading, motor, language and prior-computing experience; a year label alone cannot determine difficulty.
- No exam board was specified. GCSE content, assessment objectives, exam preparation and qualification claims require a separately approved mapping.
- The inventory specifies what lesson packages must contain. It is not a collection of completed lesson scripts, executable reference implementations or validated hidden tests.
- A model-backed tutor requires age-band, misconception, solution-leakage and safeguarding evaluation. A fluent response does not establish learning or safe guidance.
- Content, icons, datasets and media need original or appropriately licensed assets with provenance. This proposal's original sequence and tasks do not establish exclusivity over general computing ideas or guarantee a legal intellectual-property position.

## Recommendation

Approve this package as the **curriculum design baseline**, subject to any requested revisions, before authoring new application content. Keep unpublished work out of the learner catalogue until its complete practical journey, reference solutions, failure cases, independence checks, access controls and parent evidence pass review. Expand the inventory whenever pilots show missing depth; do not treat 264 as a fixed maximum.
