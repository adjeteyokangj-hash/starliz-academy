# Introductory route review coverage

Extended the no-typing review from `Y1.01` to all six introductory route lessons, `Y1.01`–`Y1.06`, after the second lesson still displayed the written form.

The first lesson checks commands and direction. Sequencing checks the first arrow, complete ordered trail and last move. Prediction checks the observed trail and its endpoints. Debugging checks the repaired movement, trail and repair decision. Planning checks the route and a planning decision. The route project checks the complete trail, final move and how to verify stops and destination. Questions derive movement evidence from the actual saved artifact and native execution, with objective-specific conceptual questions where appropriate.

All supported lessons retain independent practical reassessment before mastery. The server checks every choice against a rubric and artifact/observed-route fingerprint; public questions contain no answer key. Unsupported objectives do not inherit a generic route quiz. No learner data or choices are sent to a model for these reviews.

Supported lessons without a current replay display **Load my review choices**, which runs the saved program to prepare the questions. They never fall back to a mandatory written explanation. Review tutoring also uses the no-typing instruction, instead of asking for written evidence. Existing learner records and work are retained.

Native tests cover all six lessons and every authored independent variation, plus wrong/missing/stale answers, changed artifacts, duplicate-choice prevention and rejection of failing practical work. Browser acceptance covers the first and second lessons, including choice save/resume, wrong answers, mastery, next activity, responsive widths and loading missing replay evidence. Browser state is fictional and API boundaries are intercepted; this is not authenticated database acceptance.

Evidence is retained under `artifacts/coding-visual-review-2026-11-04/lesson-1/` and `lesson-2/`. The earlier single-lesson report remains historical evidence of the first implementation. Other curriculum activities retain their existing reviews until their own objective-specific rubrics are implemented.

No migration, data deletion, commit, push or deployment is part of this change. The 440 authored activity definitions and historical practical proofs are preserved.
