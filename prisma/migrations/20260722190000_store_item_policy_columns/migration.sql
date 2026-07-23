-- AlterTable
ALTER TABLE "StoreItem" ADD COLUMN IF NOT EXISTS "rewardType" TEXT NOT NULL DEFAULT 'digital';
ALTER TABLE "StoreItem" ADD COLUMN IF NOT EXISTS "approvalMode" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "StoreItem" ADD COLUMN IF NOT EXISTS "stockTotal" INTEGER;

-- Backfill policy columns from description tokens, then strip tokens from description.
UPDATE "StoreItem"
SET
  "rewardType" = CASE
    WHEN LOWER(COALESCE("description", '')) ~ 'type[[:space:]]*:[[:space:]]*physical' THEN 'physical'
    ELSE 'digital'
  END,
  "approvalMode" = CASE
    WHEN LOWER(COALESCE("description", '')) ~ 'approval[[:space:]]*:[[:space:]]*admin' THEN 'admin'
    WHEN LOWER(COALESCE("description", '')) ~ 'approval[[:space:]]*:[[:space:]]*parent' THEN 'parent'
    ELSE 'none'
  END,
  "stockTotal" = CASE
    WHEN COALESCE("description", '') ~* 'stock[[:space:]]*:[[:space:]]*[0-9]+'
      THEN NULLIF(regexp_replace(COALESCE("description", ''), '.*stock[[:space:]]*:[[:space:]]*([0-9]+).*', '\1', 'i'), '')::INTEGER
    ELSE NULL
  END
WHERE
  COALESCE("description", '') ~* 'type[[:space:]]*:'
  OR COALESCE("description", '') ~* 'approval[[:space:]]*:'
  OR COALESCE("description", '') ~* 'stock[[:space:]]*:';

UPDATE "StoreItem"
SET "description" = NULLIF(
  TRIM(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          COALESCE("description", ''),
          'type[[:space:]]*:[[:space:]]*(digital|physical)',
          '',
          'gi'
        ),
        'approval[[:space:]]*:[[:space:]]*(none|parent|admin)',
        '',
        'gi'
      ),
      'stock[[:space:]]*:[[:space:]]*[0-9]+',
      '',
      'gi'
    )
  ),
  ''
)
WHERE
  COALESCE("description", '') ~* 'type[[:space:]]*:'
  OR COALESCE("description", '') ~* 'approval[[:space:]]*:'
  OR COALESCE("description", '') ~* 'stock[[:space:]]*:';
