# Disposable CI database and auth fixtures

The CI workflow gives each enabled job its own healthy PostgreSQL 16 service,
with both Prisma URLs and a CI-only auth secret present before `npm ci` (which
runs Prisma generation). The application and test workers inherit the same
loopback database URL with explicit `sslmode=disable`. Hosted URL normalization,
Prisma 6.19.3, schema, lockfile and developer environment files are unchanged.
Jobs use Ubuntu 24.04 for the locked Playwright browser build and Node 24 for
the locked packages that require Node 22 or later; these are CI-only settings.

`scripts/ci/bootstrap-disposable-db.ts` rejects non-CI execution, hosted targets,
different database identities, mismatched URLs and developer `.env` files. It
checks the connected database identity and confirms that the public schema has
zero tables before running `prisma db push --skip-generate`. It never resets a
database or accepts data loss. Auth specs then create separate synthetic parent,
student, other-owner and admin identities for each spec, using real password
hashing, login, refresh and ownership routes. No auth route is stubbed.

This creates the current application schema for integration tests. It does not
validate the accumulated 27 migration files, hosted migration history, hosted
permissions or row-security acceptance. Service data is discarded with the job.

Playwright starts the application automatically because the workflow does not
set `PLAYWRIGHT_BASE_URL`. Setting that variable in a manual run means the caller
must start the server itself with the same database and auth environment. CI
does not load `.env.local`; traces/screenshots and reports go to `test-results/`
and `playwright-report/`. Local runs retain the OS temporary output directory.

Parent email/password sessions open the dashboard directly. The three auth
specs assert that parent PIN endpoints return 410, use the current child-preview
route, preserve refresh/role/ownership checks, and test the still-supported child
PIN verification API separately. They do not expect a retired parent-unlock
cookie or a removed profile-picker PIN prompt.

All verify commands retain strict exit handling. Independent lint, unit and
build checks still execute after an earlier check fails to retain diagnostics;
the failing step and verify job remain failed. Auth waits for verify to finish
but runs against its own service even if verify failed, so auth coverage is not
silently skipped. The release-smoke opt-in condition remains unchanged.

The full TypeScript command remains `npx tsc --noEmit`. Existing unrelated UAT
and test-fixture type errors are not hidden by changing tsconfig or excluding
files. They require a separate scoped repair if they remain in the PR checks.
Curriculum Review coverage remains 422 local paths, twelve restricted to audited
scenarios, and eighteen unresolved evidence requirements; production readiness
remains false and this setup does not enable publication or deployment.
