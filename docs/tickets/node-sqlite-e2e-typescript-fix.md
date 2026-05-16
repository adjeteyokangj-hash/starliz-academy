# Ticket: Fix node:sqlite TypeScript errors in e2e specs

## Date
2026-05-16

## Problem
`npx tsc --noEmit` fails on e2e specs importing `DatabaseSync` from `node:sqlite`:

- `tests/e2e/admin-schools-ops.spec.ts`
- `tests/e2e/admin-schools-ops-cleanup.spec.ts`

Error:
- `TS2307: Cannot find module 'node:sqlite' or its corresponding type declarations.`

## Root Cause
The project's TypeScript environment does not currently expose typings for `node:sqlite` (available in newer Node typing surfaces), while test code already uses the runtime module.

## Scope
- Type-level fix only.
- No runtime behavior change.
- Keep existing e2e test logic intact.

## Acceptance Criteria
- `npx tsc --noEmit` no longer reports `TS2307` for `node:sqlite` imports.
- No changes required in e2e test semantics.

## Implementation
- Add a local ambient declaration file for `node:sqlite` with the subset used by tests (`DatabaseSync`, `exec`, `prepare().get()`, `close`).

## Validation
- Run `npx tsc --noEmit` and confirm clean output (or at least no `node:sqlite` module resolution errors).
