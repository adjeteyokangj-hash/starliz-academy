# Short Learning, portals, shifts & support

## Locked product promises

- **AI teaching is guaranteed.** Human support is a safety net when available — not a private 1:1 tutor booking.
- Monthly subscription covers **access to booking**, not a named tutor.
- **No cancellation fees.** Cancellations never trigger payment or fee calculation.
- Bookings reserve **learning time**, not a named tutor.
- When no eligible tutor exists: **continue AI tutoring** — do not park the child in a waiting queue.

## Access and portal routing

| Actor | Default portal |
| --- | --- |
| Public | Marketing site + staff/parent login |
| Platform Super Admin (`User.role=admin`) | `/admin` |
| School Owner / School Admin (`SchoolTeacher.role` owner/admin) | `/school-admin` |
| Classroom Teacher / Human Tutor | `/teacher` |
| Parent | Parent portal |
| Student | Student portal |

Implementation:

- `src/lib/schools/portal-routing.ts` — `resolveStaffLanding` / pure `resolveStaffLandingFromMembership`
- Login returns `landingPath`; cookie `starliz_portal_mode` for dual-role switch
- **Switch to Teaching** / **Return to School Admin** via `/api/portal/mode?mode=teaching|school_admin`
- Switch does **not** elevate privileges or allow cross-school access
- School-admin layout redirects non owner/admin to `/teacher`

## Day School vs Short Learning

| Concept | Model | Purpose |
| --- | --- | --- |
| Day School timetable | `SchoolDayLesson` | Fixed school-day periods |
| Booking windows | `SchoolLearningWindow` | When Short Learning may be booked |
| Parent reservation | `StudentLearningBooking` | Short Learning slot for a student |
| Tutor coverage | `TutorSupportShift` | Admin-planned human tutor shifts |
| Presence | `TutorPresence` | Real-time online/available/busy/paused |
| Escalation wait | `HumanSupportQueueEntry` | Only when eligible tutor capacity exists |
| Accepted help | `HumanSupportSession` | Active human-support session |

Do not collapse these models. Do not repurpose Day School attendance as Short Learning demand.

## Booking lifecycle

States: `booked` → `confirmed` → `attended` → `completed` (also `cancelled`, `late_cancelled`, `no_show`, `expired`).

Rules (library: `short-learning-bookings.ts`):

- Durations: **90 / 120** minutes; starts on **30-minute** boundaries
- Weekdays default window **16:00–20:00**; weekends **09:00–18:00** (seeded per school, never overwrite existing)
- Weekday: open **7 days** ahead; standard deadline **12:00** same day; late only with capacity
- Weekend: open **14 days** ahead; deadline **Thursday 18:00**; late only with capacity
- Free cancel (weekday until 2h before; weekend until 18:00 previous day) — always **no fee**
- Entitlement: active subscription **or** school licence parent link
- Reliability: repeated no-shows may restrict booking temporarily (no financial penalty)

Parent UI: `/parent/short-learning` with honesty checkbox (`SHORT_LEARNING_HONESTY_POLICY_VERSION`).

Student UI: `/student/short-learning` — join only own booking, early entry ~10 minutes, during active window.

## Shift lifecycle

Stored: `scheduled` | `on_shift` | `break` | `finished` | `cancelled`.

Derived: `OFF_SHIFT` when not covering.

Acceptance:

```ts
canBecomeAvailable = onShift && heartbeatFresh
canAcceptStudent = onShift && presenceStatus === "AVAILABLE" && heartbeatFresh && tutorAccessActive
```

Login / heartbeat alone does **not** make a tutor available.

At shift end: no new assignments; active session gets configurable grace (`SchoolSupportPolicy.shiftEndGraceMinutes`, default 10).

## Presence lifecycle

`OFFLINE` | `AVAILABLE` | `BUSY` | `PAUSED` — separate from shift state.

## Human escalation

Shared service: `src/lib/schools/support-eligibility.ts`

- Day School: existing period/assignment/AI rules unchanged
- Short Learning: `bookingActive && aiExhausted && !recovered`
- Queue only if `acceptReadyTutorCount > 0`; else continue AI + optional unmet escalation audit

## Subscription and cancellation

- Subscription = booking access entitlement
- Cancellation never creates refund/fee calculation or affects monthly charge
- No per-session payment flow

## Capacity forecasting

Admin Short Learning tabs:

- Overview, Bookings, Demand Forecast, Tutor Shifts, Coverage, Policies/Settings, Reliability

Recommendations are **advisory** — never auto-publish shifts.

## Security boundaries

- School scope from session / `requireSchoolAdminContext` — never trust client `schoolId`
- Parent ownership of student links enforced server-side
- Tutor eligibility and capacity computed server-side
- Portal mode cookie is preference only, not an elevation token

## Data model (additive migration)

`prisma/migrations/20260725140000_short_learning_tutor_shifts`

- `TutorSupportShift`, `SchoolLearningWindow`, `StudentLearningBooking`
- `SchoolSupportPolicy.shiftEndGraceMinutes`, `metadataJson`
- No DROP / truncate / reset

## Operational runbook

1. Admin seeds windows (auto on first slot list) and publishes tutor shifts from forecast/coverage.
2. Parents book with honesty acknowledgement.
3. Tutors log in anytime; go available only on published shift with fresh heartbeat.
4. Students join Short Learning within the entry window; AI leads; human only if eligible.
5. Cron: Vercel schedule `*/10 * * * *` → `GET /api/cron/short-learning-reminders` (`Authorization: Bearer ${CRON_SECRET}`; POST also supported). See `docs/UK_LAUNCH_PRODUCTION_READINESS.md`.

## Key paths

- Libs: `portal-routing.ts`, `tutor-support-shifts.ts`, `short-learning-bookings.ts`, `short-learning-coverage.ts`, `support-eligibility.ts`, `short-learning-notifications.ts`
- Admin: `/school-admin/short-learning/*`
- Public: `/short-learning`, pricing/features copy
- Docs UAT: `docs/LAUNCH_VERIFICATION.md`, `docs/assurance/uat/`, `npm run uat:short-learning`
