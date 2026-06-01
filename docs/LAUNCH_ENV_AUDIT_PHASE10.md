# Launch Environment Audit (Phase 10)

Status: Safe pre-release audit command.
Scope: Confirms required launch variables are present without printing secret values.

## Command

```bash
npm run audit:launch-env
```

## What It Checks
- Core runtime keys needed for auth, app URLs, and cron protection.
- Email baseline configuration.
- Provider-specific secrets only for billing providers that are explicitly enabled.
- TrueNumeris webhook secret only when that integration is enabled.

## Safety Rules
- The audit prints key names only, never values.
- Run it in local, preview, or staging before any release candidate promotion.
- Treat any missing required key as a release blocker.

## Current Required Core Keys
- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BASE_URL`
- `CRON_SECRET`
- `EMAIL_FROM`