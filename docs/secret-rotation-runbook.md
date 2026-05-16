# Secret Rotation Runbook (Local + Staging)

Use this runbook immediately after any credential exposure in logs, chats, or screenshots.

## 1) Rotate at provider level first

Rotate and revoke old values in each external provider dashboard:

- OpenAI: `OPENAI_API_KEY`
- Microsoft Graph: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`
- Resend: `RESEND_API_KEY`, `EMAIL_FROM` (verify sender if changed)
- Auth/session: `AUTH_SECRET`
- Database: `DATABASE_URL`, `DIRECT_URL`
- Payments (if enabled): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYSTACK_SECRET_KEY`

## 2) Update secret stores

Update both environments:

- Local developer env file(s)
- Staging secret manager / platform env vars

Do not keep real secrets in committed files. Keep placeholders only in tracked files such as `env.example`.

## 3) Invalidate old sessions and tokens

After `AUTH_SECRET` and provider key rotation:

- Force logout active sessions if applicable
- Re-issue OAuth app credentials where needed
- Recreate webhooks that depend on rotated signing secrets

## 4) Verify application health

Check these flows in staging:

- Login/session creation
- Coach voice calls (OpenAI + browser fallback)
- Parent notifications and email sends
- SMS/WhatsApp outbound messaging
- Any payment webhook endpoint still in use

## 5) Audit and prevention

- Remove exposed values from chat snippets, docs, and screenshots
- Add repository secret scanning in CI (gitleaks/trufflehog or equivalent)
- Add a pre-commit guard for high-risk key patterns
- Keep `env` and `.env.local` out of version control
