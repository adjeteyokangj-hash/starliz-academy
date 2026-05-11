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
