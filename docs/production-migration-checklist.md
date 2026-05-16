# Production Migration Checklist

This checklist covers one-way migration of Parents, Lessons, Content Library, and Assignments from local to production.

## 1. Preconditions

- Confirm your local data is the source of truth.
- Confirm production backup access is available.
- Confirm env vars are set:
  - LOCAL_DATABASE_URL
  - PRODUCTION_DATABASE_URL

## 2. Backup Production First

Use pg_dump before any import.

```bash
# Example with explicit URL
action=backup
pg_dump "$PRODUCTION_DATABASE_URL" --format=custom --file ./tmp/prod-pre-migration.backup
```

Optional schema-only backup:

```bash
pg_dump "$PRODUCTION_DATABASE_URL" --schema-only --file ./tmp/prod-pre-migration-schema.sql
```

## 3. Export Local Dump

```bash
npm run migration:export -- --database-url "$LOCAL_DATABASE_URL" --out ./tmp/migration-local.json --note "pre-prod sync"
```

## 4. Validate With Dry-Run (No Writes)

```bash
npm run migration:import -- --database-url "$PRODUCTION_DATABASE_URL" --in ./tmp/migration-local.json
```

Review summary and errors.

## 5. Apply Import to Production

```bash
npm run migration:import -- --database-url "$PRODUCTION_DATABASE_URL" --in ./tmp/migration-local.json --apply
```

Or use the controlled one-way orchestrator:

```bash
npm run migration:sync:prod -- --dump ./tmp/migration-local.json --apply --confirm-live YES_I_UNDERSTAND
```

## 6. Post-Import Verification

- Login as migrated parent account and verify access.
- Open Admin pages and verify records:
  - Parents
  - Lessons
  - Content Library
  - Assignments
- Validate AI generation and assignment flows.

## 7. Rollback Procedure

If verification fails, restore production from the backup created in step 2.

```bash
# WARNING: this overwrites production state
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$PRODUCTION_DATABASE_URL" ./tmp/prod-pre-migration.backup
```

Then rerun smoke checks.

## 8. Safety Notes

- Import script defaults to dry-run unless --apply is provided.
- sync:prod script requires --confirm-live YES_I_UNDERSTAND for production writes.
- Keep migration dump and backup artifacts until sign-off is complete.

## 9. Deployment Proof Log

### 2026-05-16: Assignment completion persistence

- Applied migration: `20260516120000_add_assignment_completed_at` on production Postgres.
- Re-tested `GET /api/admin/assignments`: returned 200.
- Assigned a fresh task to smoke learner and completed it via student flow.
- Verified Admin Assignments shows `completed` for the fresh assignment.
- Verified `completedAt` is populated and visible in admin UI.

### 2026-05-16: Assignment duplicate handling close-out proof

- Commit hash: `1b2d83b` (proof commit pushed to `origin/main`; baseline validated on `f9df9d0`).
- Production URL tested: `https://www.starlizacademy.com/admin/assignments` and `https://www.starlizacademy.com/games/lesson?assignmentId=cmp8k2he1007xi6041d4nsi8z`.
- Test student used: `Smoke Learner`.
- Content subject/year tested: `Year 4 Maths` (current live smoke lane).
- Blocked mismatch examples: `Subject/type mismatch`, `Year mismatch`, `Key stage mismatch`, `Age mismatch`, `School mismatch`, `Exam board mismatch`.
- Duplicate detection proof:
  - Local gating blocks existing recipients with `Duplicate assignment`.
  - API duplicate-only blocked path supports resend flow (`allDuplicates` + resend handling).
  - Unit proof: `tests/assignment_duplicate_flow.test.ts` covers duplicate and non-duplicate candidate handling.
- Lint/test results:
  - `npm run lint -- --max-warnings=0`: PASS.
  - `npx tsx --test tests/assignment_duplicate_flow.test.ts`: PASS (10/10 after assertion fix).
  - `npx tsc --noEmit`: FAIL (existing `node:sqlite` typing issue in e2e tests, outside this close-out scope).
- Final `git status --short` clean: confirmed after commit and push for this close-out.

Next priority:
- Execute live smoke tests for `Science` and `English` content flows in production (not only Year 4 Maths), and append proof with URLs, student, subject/year pairs, and outcomes.

### 2026-05-16: Science production smoke test

- Production URL tested: `https://www.starlizacademy.com/admin/ai`
- Flow executed: Admin AI Generator, `Year 8` + `Science` + `Photosynthesis`
- Generation proof: `Generated Preview` rendered with `Science - Photosynthesis practice`, quality/safety shown, and approved items listed.
- Save proof: `Saved to Content Library` banner displayed with `View in Content Library` link.
- Outcome: PASS (Science generation and save path verified live in production).

### 2026-05-16: English production smoke test

- Production URL tested: `https://www.starlizacademy.com/admin/ai`
- Flow executed: Admin AI Generator, `Year 8` + `English language` + `Persuasion`
- Generation proof: `Generated Preview` rendered with `English language - Persuasion practice`, quality/safety shown, and approved items listed.
- Save proof: `Saved to Content Library` banner displayed with `View in Content Library` link.
- Outcome: PASS (English generation and save path verified live in production).
