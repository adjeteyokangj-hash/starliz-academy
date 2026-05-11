# StarLiz Academy

## Polish Game Hub Cards and Add Child-Friendly Voice Reactions

This app is a Next.js + Tailwind PWA focused on child learning games, adaptive progress, and parent analytics.

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Required Environment Variables

- `AUTH_SECRET`: required for session and middleware JWT verification.
- `OPENAI_API_KEY`: required for `/api/admin/ai/generate`.
- `RESEND_API_KEY`: required for production weekly progress emails.
- `EMAIL_FROM`: required sender identity for outbound emails (must be verified in Resend for production).

Create a `.env` file in `starliz-academy` with:

```bash
AUTH_SECRET=replace_with_long_random_secret
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_xxx
EMAIL_FROM="StarLiz Academy <onboarding@resend.dev>"
```

For production:

- Use a verified custom sender/domain in Resend, for example `EMAIL_FROM="StarLiz Academy <hello@yourdomain.com>"`.
- Set `RESEND_API_KEY` and `EMAIL_FROM` in Vercel project environment variables.
- You can also store the email key from Admin Settings -> API Keys (`provider: email`), which takes precedence over env fallback.

## Seed Admin User

Create or update an admin account:

```bash
npm run seed:admin -- --email admin@example.com --password "StrongPassword123!" --name "StarLiz Admin"
```

## Assigned Content E2E (Playwright)

Run the closed-loop assignment test (spelling + math + reading):

```bash
npm run test:e2e:assigned-loop
```

Optional environment variables:

- `E2E_PARENT_EMAIL` (default: `e2e.parent+assigned@starliz.local`)
- `E2E_PARENT_PASSWORD` (default: `PlaywrightAssigned#2026`)
- `PLAYWRIGHT_BASE_URL` (set when running against an already-started environment)

## PWA Install Testing

### Browser Install Test
1. Run `npm run dev`.
2. Open the app in Chrome/Edge.
3. Use the install prompt (browser omnibox install icon or in-app prompt).
4. Confirm installed app launches standalone.
5. Verify shortcuts and icons from `manifest.webmanifest`.

### Desktop Install Test
1. Install from Chrome/Edge as desktop app.
2. Launch from Start Menu or desktop shortcut.
3. Verify offline badge appears when internet is disabled.
4. Verify core pages open: dashboard, spelling, math, reading, rewards, profiles.

### Mobile Install Test
1. Open the deployed URL in Android Chrome or iOS Safari.
2. Android: tap install prompt / Add to Home Screen.
3. iOS: Share -> Add to Home Screen.
4. Open from home screen and verify standalone feel.
5. Turn off internet and verify offline entry points still load.

## Vercel Deployment Setup

1. Push repository to GitHub.
2. In Vercel, import project and select `starliz-academy` root.
3. Use default Next.js build settings:
	- Build command: `npm run build`
	- Output: `.next`
4. Deploy and verify:
	- `/manifest.webmanifest`
	- service worker registration
	- PWA install prompt
	- offline fallback route
5. Run final checks:
	- `npm run lint`
	- `npm run build`

## Production Checklist

- Game Hub reorder controls work with keyboard and drag-and-drop
- Live-region announcements are active
- Voice style and accessibility settings persist per profile
- Rewards require confirmation before coin spend
- Offline badge and queue indicator are visible
- Parent exports generate CSV/PDF successfully
