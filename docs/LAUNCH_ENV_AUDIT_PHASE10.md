# Launch Environment Audit (Phase 10)

Status: Safe pre-release audit command.
Scope: Confirms required launch variables are present without printing secret values.

## Command

```bash
npm run audit:launch-env
```

Strict release profile:

```bash
npm run audit:launch-env -- --strict
```

## What It Checks
- Core runtime keys needed for auth, app URLs, and cron protection.
- Email baseline configuration.
- Provider-specific secrets only for billing providers that are explicitly enabled.
- TrueNumeris webhook secret only when that integration is enabled.
- In strict mode: R2 storage keys, webhook fallback policy declaration, backup configuration, and monitoring DSN coverage.

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

## Strict Mode Additional Requirements
- R2 object storage:
	- `CLOUDFLARE_R2_ENDPOINT`
	- `CLOUDFLARE_R2_ACCESS_KEY_ID`
	- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
	- `CLOUDFLARE_R2_BUCKET`
	- `CLOUDFLARE_R2_PUBLIC_URL`
- Webhook policy declaration:
	- `PAYMENT_WEBHOOK_ALLOW_FALLBACK_SIGNATURE`
- Backup config (at least one):
	- `BACKUP_PROVIDER` or `DATABASE_BACKUP_URL`
- Monitoring config (at least one):
	- `SENTRY_DSN` or `MONITORING_DSN`