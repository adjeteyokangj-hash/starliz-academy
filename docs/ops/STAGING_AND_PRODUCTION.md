# Staging and Production Separation

Status: Launch ops guidance.

## Required Separation
- Distinct environment variables for staging and production.
- Distinct databases and storage buckets.
- Distinct webhook endpoints and secrets.

## Data Rules
- Staging must use synthetic or controlled test data.
- No real payment charges in staging.
- No unrestricted child production exports to staging.

## Testing Rules
- Use safe seeded accounts for end-to-end tests.
- Keep gated E2E test packs opt-in in CI.
- Never run production mutation commands from staging pipelines.

## Release Rules
- Promote only validated builds.
- Confirm migration strategy before promotion.
- Keep rollback steps ready before release window starts.
