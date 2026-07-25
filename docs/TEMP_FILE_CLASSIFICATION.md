# Temporary / local-support file classification

Date: 2026-07-25  
Status: Review complete — promotions applied; obsolete files **not deleted**  
No staging / commit / push / migration reset.

## Legend

- **A** Permanent project file  
- **B** Permanent audit evidence  
- **C** Generated reproducible output  
- **D** Obsolete (retain until launch tree-trim)

| Candidate | Original read | Final | Action taken |
|---|---|---|---|
| `scripts/prisma_local.mjs` | Already supported | **A** | Documented; keep |
| `scripts/_prisma-with-env.js` | Undocumented duplicate | **D** | Not deleted; superseded by `prisma_local.mjs` |
| `scripts/load-env-local.mjs` | New | **A** | Optional CLI env check helper |
| `scripts/uat/load-env-local.ts` | New | **A** | Shared loader for UAT runners |
| `scripts/uat/local-fixtures.ts` | New | **A** | Centralised local UAT fixtures |
| `tsconfig.launch-modules.json` | New | **A** | Merged focused typecheck |
| `tsconfig.human-support.json` | Focused one-off | **D** | Superseded; not deleted |
| `tsconfig.human-tutor-sessions.json` | Focused one-off | **D** | Superseded; not deleted |
| `tsconfig.live-classroom.json` | Focused one-off | **D** | Superseded; not deleted |
| `tsconfig.school-ai-tutor.json` | Focused one-off | **D** | Superseded; not deleted |
| `tsconfig.weekly-memory.json` | Focused one-off | **D** | Superseded; not deleted |
| `scripts/uat-short-learning.ts` | Working UAT | **A** | Promoted; writes to `artifacts/` |
| `scripts/uat-admin-portal-launch.ts` | Working UAT | **A** | Promoted; writes to `artifacts/` |
| `scripts/verify-short-learning-cron.ts` | Working verify | **A** | Promoted; writes to `artifacts/` + summary |
| `scripts/generate-phase6-policies.mjs` | Scaffold generator | **D*** | Dangerous vs locked packs — do not run; not deleted |
| `scripts/.uat-*.json` | Run dumps | **C** | Ignore going forward; historical kept |
| `scripts/.verify-short-learning-cron-evidence.json` | Run dump | **C** | New path under artifacts |
| `scripts/uat-short-learning-evidence/**` | HTML dumps | **C** / historical **B** summary copied | Bulky → artifacts; summary in docs/assurance |
| `scripts/uat-admin-portal-launch-evidence/**` | HTML dumps | **C** | New path under artifacts |
| `scripts/uat-premium-daytime-lesson-screenshots/**` | PNGs | **C** | Ignore; not deleted |
| `scripts/uat-short-learning-evidence.md` | Checklist | **B** | Keep as historical checklist |
| `scripts/uat-short-learning/README.md` | Docs | **A**/legacy | Keep; point to LAUNCH_VERIFICATION |
| `scripts/tmp_gcse_runtime_smoke.ts` | Scratch | **D** | Not deleted |
| `docs/assurance/**` | New | **B**/**A** | Permanent assurance tree |
| `docs/LAUNCH_VERIFICATION.md` | New | **A** | Developer verification guide |
| `artifacts/**` | New | **C** root | Gitignored except `.gitkeep` |

\* Obsolete for routine use; generator remains in tree for archaeology only.

## `.env.local` tracking assessment

| File | Tracked? | Ignored? | Recommendation |
|---|---|---|---|
| `.env` | No | Yes (`.env*`) | Keep ignored |
| `.env.local` | **No** | Yes (`.env*.local`) | Keep ignored; do **not** force-add |
| `.env.production` | No | Yes | Keep ignored |

Earlier inspection false-positive: filesystem listing was mistaken for `git ls-files`. Current assessment: `.env.local` is correctly untracked. No untrack action needed. Values not printed.
