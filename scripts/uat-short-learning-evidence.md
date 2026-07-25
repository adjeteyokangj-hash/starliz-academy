# UAT checklist — Short Learning & school-admin portals

**Latest run:** 2026-07-25 — **36/36 passed** (HTML+API authenticated UAT)

**Evidence:** [`scripts/uat-short-learning-evidence/`](./uat-short-learning-evidence/)  
**Run JSON:** [`scripts/.uat-short-learning-run-evidence.json`](./.uat-short-learning-run-evidence.json)  
**Summary:** [`scripts/uat-short-learning-evidence/UAT-SUMMARY.md`](./uat-short-learning-evidence/UAT-SUMMARY.md)  
**Runner:** `npx tsx scripts/uat-short-learning.ts`

> Capture mode: HTML page dumps + `.meta.json` (Playwright Chromium was not available for PNG screenshots).

## Auth / landing

- [x] School owner/admin → `/school-admin` — `auth/01-owner-login-landing.html`
- [x] Switch to Teaching → `/teacher` + cookie — `auth/02-teaching-mode-cookie.html`
- [x] Platform admin → `/admin` — `auth/04-platform-admin-unchanged.html`
- [x] Login JSON landingPath — `auth/05-login-json-landing.json`

## School admin

- [x] Non-admin teacher blocked (API 403 / redirect probe) — `school-admin/01-teacher-redirect.html`
- [x] Create published tutor shift — `school-admin/02-shift-created.html`
- [x] Overlapping shift rejected — `school-admin/03-overlap-rejected.json`
- [x] Bookings list — `school-admin/04-bookings-list.html`
- [x] Demand forecast + coverage — `school-admin/02-demand-forecast.html`, `03-coverage-gap.html`

## Shift gates

- [x] Off-shift cannot become available — `shifts/01-off-shift-heartbeat.json`
- [x] On-shift + heartbeat can accept — `shifts/02-on-shift-available.json`
- [x] Grace after shift end, no new accept — `shifts/03-grace-no-accept.json`
- [x] Tutor dashboard capture — `shifts/04-tutor-dashboard.html`

## Parent Short Learning

- [x] Honesty copy + slots UI — `parent/02-slots-honesty-checkbox.html`
- [x] Honesty required — `parent/03-honesty-required.json`
- [x] Cancel no fee — `parent/04-cancel-statuses.json`
- [x] Nav — `parent/05-nav-link.html`

## Student / escalation

- [x] Upcoming booking — `student/01-upcoming-booking.html`
- [x] Session shell Day School vs Short Learning — `student/02-session-shell-copy.html`
- [x] AI-led / safety-net copy — `student/03-ai-led-copy.html`
- [x] No tutor → continue AI — `student/04-escalation-no-tutor.json`
- [x] AI tutor entry — `student/05-ai-tutor-entry.html`

## Launch

- [x] School portal flag on — `launch/02-portal-flag-on.html`
