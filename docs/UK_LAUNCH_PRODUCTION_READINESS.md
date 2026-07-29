# UK launch — production readiness review

Status: **Engineering CONDITIONAL GO** (2026-07-25). Product surfaces for Phases 1–4 meet the UK launch bar. Legal/ops production sign-off still required before go-live.

## Verdict

| Gate | Result |
|---|---|
| Product surfaces (Admin, School Admin, Public, Student, Policies) | **Pass** |
| Short Learning UAT (`uat-short-learning.ts`) | **36/36** |
| Admin / public launch UAT (`uat-admin-portal-launch.ts`) | **18/18** |
| Short Learning reminder cron wiring (`vercel.json` + auth verify) | **Configured in repo** — activate on production deploy |
| Locked product promises encoded in code + docs | **Pass** |
| Production env / providers / legal | **Pending ops & legal** |

**Engineering recommendation:** Ship the UK launch bar once the critical ops items below are confirmed in production. Do not block on beta modules (Inbox, Brain Centre, GA polish).

## Product surfaces (Phases 1–4)

| Surface | Launch bar |
|---|---|
| Platform Admin `/admin` | Short Learning oversight, Support school tabs, Inbox marked beta, orphan school modules bannered |
| School Admin `/school-admin` | Short Learning ops complete (bookings, forecast, shifts, coverage, policies, reliability) |
| Public website | Features + Short Learning nav, FAQ, policy footer, Knowledge Centre, canonical `/auth/login` |
| Student portal | Day School vs Short Learning nav; dedicated `/student/short-learning/[id]/learn` (no Day School attendance merge) |
| Policies & knowledge | Privacy, Terms, Cookies, Safeguarding, Retention, AI use + full Phase 6 draft library (/policies, Knowledge Centre) — legal review pending |

## Phase 6 documentation

- Registry: `src/lib/policies/` (46 documents)
- Knowledge articles: `src/lib/knowledge/articles.ts`
- Legal checklist: `docs/PHASE6_LEGAL_REVIEW_CHECKLIST.md`
- School Admin read-only library: `/school-admin/knowledge-library`
- Platform Admin library: `/admin/policy-library`

## Locked product promises (must remain true at launch)

- AI teaching is guaranteed. Human support is a safety net when available — not a private 1:1 tutor booking.
- No cancellation fees for Short Learning (subscription access model).
- Day School (`SchoolDayLesson` / attendance) stays separate from Short Learning (`StudentLearningBooking`).
- Tutor availability requires published shift + fresh heartbeat; off-shift login does not make tutors available.

## Short Learning reminder cron (production)

**Hosting / scheduler:** Vercel Cron (project linked as `starliz-academy` via `.vercel/repo.json`).

| Setting | Value |
|---|---|
| Config file | `vercel.json` |
| Path | `/api/cron/short-learning-reminders` |
| Schedule | `*/10 * * * *` (every 10 minutes, UTC) |
| HTTP method | **GET** (Vercel Cron default). Route also accepts **POST** for manual ops. |
| Auth | `Authorization: Bearer ${CRON_SECRET}` (also accepts `x-cron-secret`) |
| Env var | `CRON_SECRET` — set in Vercel Production (and Preview if you test there). **Never commit the secret.** |

**Why every 10 minutes:** Reminder windows in `enqueueDueShortLearningReminders` are narrow (±5–10 minutes) for `one_hour` session reminders and tutor `starting_soon` alerts. A 10-minute cadence covers weekday after-hours and weekend sessions without changing product reminder rules. Same-day (~23–24h) windows are also hit by this cadence. Dedup keys prevent duplicate emails.

**Plan note:** Sub-daily Vercel Cron schedules require **Vercel Pro** (or higher). Hobby rejects expressions that run more than once per day at deploy time.

### Deploy / activate steps

1. Ensure Production env has a strong `CRON_SECRET` (Vercel → Project → Settings → Environment Variables).
2. Confirm team plan supports `*/10 * * * *` (Pro+).
3. Deploy to production so `vercel.json` crons register (Cron Jobs are production-only).
4. In Vercel → Project → Cron Jobs, confirm `/api/cron/short-learning-reminders` shows schedule `*/10 * * * *`.
5. Optional immediate trigger: `vercel crons run /api/cron/short-learning-reminders` (against production).
6. Verify function logs show `200` with `{ ok: true, reminders, dispatched }` and that unauthenticated calls return `401`.

### Local verification

```bash
# Unit tests (schedule + auth helper)
npx tsx --test tests/short_learning_cron.test.ts

# Live auth against local dev server (loads CRON_SECRET from .env.local)
npm run verify:short-learning-cron
```

Evidence: `scripts/.verify-short-learning-cron-evidence.json`

## Go / no-go engineering checklist

Use Admin → Settings → [Production Checklist](/admin/settings/production-checklist) (source: `src/lib/production-checklist.ts`).

Critical before UK go-live:

1. `LAUNCH_ENABLE_SCHOOL_PORTAL=true` and `NEXT_PUBLIC_LAUNCH_ENABLE_SCHOOL_PORTAL=true` in production env when School Portal is live (missing values default to false; Teachers then land on `/school-portal-unavailable`, not `/student/dashboard`).
2. Database migrations applied **forward only** — never `migrate reset` on production.
3. Stripe webhooks + Resend/email + OpenAI keys verified.
4. `CRON_SECRET` set in Vercel Production; Short Learning cron active after deploy (`*/10 * * * *` → GET `/api/cron/short-learning-reminders`).
5. UAT evidence archived (see below) — **done for engineering bar**.
6. Confirm school scoping: school-admin APIs ignore client `schoolId`; platform admin school routes use path id.
7. Legal review of published policy summaries (drafts noted “for legal review” in docs/).

## Security boundaries (spot-check)

- No client-trusted role elevation via `starliz_portal_mode` cookie.
- Parent booking ownership + entitlement server-side.
- Human support queue only when `acceptReadyTutorCount > 0`.
- `/api/cron/*` bypasses session middleware but **must** present `CRON_SECRET` (route-level). Missing/invalid secret → `401`.

## Explicit non-goals for this launch bar

- Full Brain Centre / GA / Knowledge Graph production polish (remain beta).
- Email inbox sync (Outlook workaround; beta nav).
- Ghana/Nigeria payment-enabled markets (preview pages only).

## Evidence locations

- `scripts/.uat-short-learning-run-evidence.json` — **36/36 passed**
- `scripts/uat-short-learning-evidence/`
- `scripts/.uat-admin-portal-launch-evidence.json` — **18/18 passed** (2026-07-25)
- `scripts/uat-admin-portal-launch-evidence/`
- `scripts/.verify-short-learning-cron-evidence.json` — cron auth/schedule verify
