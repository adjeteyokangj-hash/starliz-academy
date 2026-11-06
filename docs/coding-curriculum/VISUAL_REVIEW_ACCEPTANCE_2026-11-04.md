# No-typing review: introductory instructions lesson

Implemented a local, objective-specific review for `Y1.01` / **What is an instruction?** following the request for an alternative to written explanations for young learners.

Children choose a command, identify the first movement in their actual saved program, and reason about reversing that arrow. Large answer cards and a read-aloud control replace the mandatory written response. Partial choices can be saved and resumed. An earlier privacy-pending written review is not presented as a blocker for this supported local rubric.

The public question set contains no answer key. Its fingerprint binds the rubric version, activity version, saved artifact and observed movement. The server reconstructs the questions from a fresh native run, verifies every choice, and retains the existing independent practical, prior-stage and assistance checks. Correct choices cannot grant mastery to a program that fails practical reassessment. Earlier pending work is not automatically passed. Successful review records evidence-based assessment and enables the ordinary next-activity lookup.

No learner text, choices, artifact or execution result is sent to an AI provider for this review. Other lessons keep their existing assessment and privacy gates: this rubric is explicitly restricted to the introductory lesson, rather than applying a generic quiz to unrelated objectives. Each additional lesson needs an appropriate objective-specific review design.

Verification:

- Nine focused offline tests passed, including exact/stale/missing/wrong submissions, changed-artifact binding, failing independent work, public answer-key exclusion, and provider-call exclusion through the actual teaching adapter.
- Edge component acceptance passed with actual React components and native practical reassessment at intercepted API boundaries: saved-choice resume, wrong-answer rejection, 7/7 mastery, and next-activity navigation.
- Browser layouts checked at 1440, 820 and 390 pixels; screenshots inspected. No browser errors or model requests.
- Scoped ESLint passed.
- All 440 activity content hashes and the practical executor fingerprint still match the preserved evidence. Whole-curriculum practical verification was not repeated. Development publication was rebound to the current runtime; production acceptance remains separate.

Browser evidence: `artifacts/coding-visual-review-2026-11-04/`. Latest local publication receipt: `verification/local-approval-2026-11-04T13-54-25-475Z/`.

Browser evidence uses fictional learner state and is not authenticated database acceptance. No database migration, deletion, commit, push, deployment, live AI request or restricted runner operation occurred.
