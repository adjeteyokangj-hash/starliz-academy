# Canonical Learning Evidence Contract

## Architecture Map

Activity -> Attempt -> writeLearningActivity -> WeakAreas -> StudentSkills -> LearningDNA -> Snapshots -> HEART BEAT -> Academic Intelligence -> Assignments -> Catch-Up -> Homework -> Certificates -> Analytics

## Canonical Write Contract

`src/lib/learning-activity/writeLearningActivity.ts` is the canonical coordinator for normal learning evidence.

Normal attempt-producing gameplay writes an `Attempt` first, then lets the writer coordinate weak areas, student skills, Learning DNA, assignment state, and academic snapshot invalidation.

Session-summary completion can use the writer with `kind: "session_summary"` when a `ProgressRecord` is still required for existing reads. Session summaries must not fabricate `Attempt` rows.

Quick Level Finder remains placement evidence. It can update placement profile data and readiness snapshots, but it must not write through the normal lesson, spelling, maths, or reading completion path.

## Current Canonical Entrypoints

- `/api/attempts` resolves the canonical `ChildProfile.id`, then calls `writeLearningActivity` for spelling, maths, and reading attempts.
- `/api/student/progress` preserves existing `ProgressRecord` behaviour, then calls `writeLearningActivity` with `kind: "session_summary"` for lesson and quiz completion summaries.

## Readers That Should Use Canonical Outputs

- Academic Intelligence reads `Attempt`, `WeakArea`, `StudentSkill`, `Assignment`, `ProgressRecord`, and Quick Level Finder placement baseline data.
- HEART BEAT and readiness signals should treat `Attempt`, current `WeakArea`, current `StudentSkill`, and fresh academic snapshots as the canonical activity chain.
- Parent/admin analytics should use shared aggregation over `Attempt` and legacy `ProgressRecord` rows so existing history remains visible without double-counting.
- Certificates and awards should read canonical outcomes and existing certificate records. They must not create learning evidence.

## Direct Writers That Remain By Design

- Homework services may update homework-specific evidence and invalidate snapshots where the existing schema supports it. They must not create `Attempt` rows unless real attempt evidence exists.
- Rebuild scripts may repair `WeakArea`, `StudentSkill`, Learning DNA, snapshots, and assignment status from existing evidence only. They are operational tools, not request-path writers.
- Wallet, shop, reward, and certificate flows may create reward or audit records. They must not be treated as learning mastery writers.

## Duplicate Writers And Calculators To Avoid

- Legacy ProgressRecord-only weak-area reconstruction must not overwrite canonical weak-area rows.
- New gameplay routes must call `writeLearningActivity` instead of directly writing `Attempt`, `WeakArea`, `StudentSkill`, Learning DNA, or snapshot invalidation independently.
- Admin, parent, teacher, HEART BEAT, and certificate routes should read canonical outputs and avoid rebuilding performance from incompatible source mixtures.

## Guardrails

- Preserve existing `ProgressRecord` reads and writes unless a route is proven unsafe.
- Do not delete existing learning history.
- Do not fabricate attempts from homework summaries, rewards, or placement data.
- Do not double-count the same session as both an attempt batch and an unrelated mastery event.
- Keep `ChildProfile.id` as the canonical learner identifier.
