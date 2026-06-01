# Final Smoke Checklist (Phase 9)

Status: Opt-in release smoke for launch-candidate verification only.
Scope: Dedicated fixtures, non-production services, and explicit human approval before execution.

## Safety Gate
- The suite is disabled by default.
- Set `E2E_FINAL_SMOKE=1` before running `npm run test:e2e:final-smoke`.
- Do not run against production.

## Covered Journeys
- Admin can create or save science content with the expected subject metadata.
- Parent can open assigned content for the seeded child fixture.
- Voice-off mode suppresses tutor speech playback.
- Difficulty changes produce different content complexity signals.

## Preconditions
- Local or staging-safe environment only.
- Prisma database available with non-production credentials.
- No live payment provider actions.
- Dedicated smoke fixtures can be created and removed.

## Run Order
- Start the app locally or point Playwright to a safe environment.
- Confirm seeded admin and parent fixtures are not shared with other test runs.
- Export `E2E_FINAL_SMOKE=1`.
- Run `npm run test:e2e:final-smoke`.

## Abort Conditions
- Any unexpected live provider call.
- Shared staging environment contains conflicting smoke fixtures.
- Auth or database config points at production resources.