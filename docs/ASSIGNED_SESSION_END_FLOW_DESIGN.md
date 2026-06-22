# Assigned Session End Flow Design

**DESIGN ONLY. DO NOT WRITE CODE YET.**
**DO NOT TOUCH CLASS LESSONS.**
**DO NOT TOUCH DATABASE/MIGRATIONS.**
**DO NOT PUSH.**

---

## Overview

After an assigned/adaptive practice session completes, the system checks for a real next assigned session, daily plan limits, and shows the appropriate end message or next-session button. This applies to assigned/adaptive practice only. Class lessons have a separate flow and are not affected.

## Core Flow

```
Assigned session complete → check pending assigned session → check daily time/session limit
→ if more allowed: Show "Start next assigned session"
→ if none left: Show "All assigned work complete"
→ if daily limit reached: Show "Today's planned learning is complete"
→ parent/admin can assign more if needed
```

## End Messages (Accuracy Required)

- **One session done, more available:** "Assigned session complete. Start next assigned session?"
- **All assigned sessions done for today:** "All assigned work complete. Ask parent/admin to assign more."
- **Daily time limit reached:** "You've completed today's planned work."
- **Daily session cap reached:** "You've completed today's planned sessions."

## Tightened Upload Rule

- 20 minute plan, 20 minutes uploaded = allowed.
- 20 minute plan, 23 minutes uploaded = allowed only if 5-minute grace policy is enabled.
- More than 25 minutes uploaded = requires override, split, or reassign to another day.

---

## Weekly Learning Capacity Planner

The system should check not only daily minutes, but also weekly capacity across all active days. The weekly planner becomes the **source of truth** for assigned practice allocation, showing real-time capacity tracking and preventing uneven distribution.

### Capacity Calculation

```
daily_minutes × active_learning_days = weekly_minutes_capacity
```

**Example:**
- 20 minutes per day × 5 active days (Mon–Fri) = 100 minutes per week

### Real-Time Capacity Dashboard

When admin views the assignment interface, the system should show **live capacity tracking** for the current week:

```
Week Capacity: 100 mins

Monday:     20/20 ✅ (at limit)
Tuesday:    15/20 (5 mins available)
Wednesday:  25/20 ⚠️  (5 mins over)
Thursday:   10/20 (10 mins available)
Friday:     10/20 (10 mins available)
────────────────────
Weekly Total: 80/100
Remaining Capacity: 20 mins
Over by: 5 mins (Wednesday)
```

This allows admin to see imbalances at a glance and rebalance before assigning.

### Weekly Allocation Check

When admin uploads assigned content, the planner totals estimated minutes across each day of the week and shows weekly progress against capacity.

**Example Upload Distribution (Balanced):**
```
Monday:    20 mins
Tuesday:   15 mins
Wednesday: 25 mins
Thursday:  20 mins
Friday:    20 mins
─────────────────
Weekly planned: 100/100 mins ✅
```

**Example Upload Distribution (Unbalanced):**
```
Monday:    40 mins ⚠️ (exceeds daily 20-min limit)
Tuesday:   0 mins
Wednesday: 25 mins ⚠️ (exceeds daily 20-min grace threshold)
Thursday:  0 mins
Friday:    0 mins
─────────────────
Weekly planned: 65/100 mins ❌ (unbalanced, overloaded Monday/Wednesday)
```

### Capacity Warnings During Upload

- **Under capacity (< 95%):** No warning, allow upload.
- **Near capacity (95–100%):** Warning: "Weekly plan is at X/Y minutes. Ensure distribution is even across active days."
- **Over by 1–5 mins (daily):** Warning: "Wednesday exceeds the 20-min daily limit by 5 mins. Allow with grace rule?"
- **Over by 6+ mins (daily):** Block unless admin provides override reason or reassigns to another day.
- **Weekly total over by 1–5 mins:** Warning: "Weekly total exceeds 100 mins by Z mins. Allow with grace rule?"
- **Weekly total over by 6+ mins:** Block unless admin provides override reason or reassigns to next week/different days.

### Smart Distribution (Phase 3E)

If enabled, when admin uploads unallocated assigned content, the system can suggest an even distribution across active days:

**Admin uploads 60 minutes of assigned practice:**
```
System suggests distribution:
Monday:    20 mins
Tuesday:   20 mins
Wednesday: 20 mins
Thursday:  (no change)
Friday:    (no change)
```

This prevents accidental overload on any single day and uses available capacity efficiently.

**Another example: Admin uploads 35 minutes with 20 mins available:**
```
Available capacity: 20 mins
Requested: 35 mins

System suggests:
- Distribute 20 mins today (across available slots)
- Move 15 mins to next active week
```

The admin can accept the suggestion, manually override it, or choose to reassign entirely.

### Weekly Dashboard Visibility

Parent/admin should see:
- **Weekly view card:** "Planned 100/100 minutes across 5 days this week."
- **Daily breakdown:** Bar chart or table showing planned minutes per day.
- **Carry-over from last week:** "1 session (15 mins) carried over from Monday still pending."
- **Completed this week:** "Completed 4/5 planned sessions so far (80 mins done, 20 mins remaining)."
- **Next week preview:** "Next week's capacity: 100 mins (Mon–Fri)."

---

## Daily Minutes vs. Weekly Minutes

The system maintains both:
- **Daily minutes:** Per-day cap, used to check daily overflow and show "Today's planned learning is complete."
- **Weekly minutes:** Per-week cap across all active days, used to check overall workload distribution and prevent overloading.
- **Active days:** Which days of the week the child should have assigned work (e.g., Mon–Fri only, no weekends).

---

## Affected Files Likely Needed Later

### API Routes
- `src/app/api/admin/assignments/route.ts` — list pending assigned sessions for a child
- `src/app/api/admin/daily-plan/route.ts` — get/set daily learning minutes and active days
- `src/app/api/sessions/[id]/complete/route.ts` — check for next assigned session on session complete
- `src/app/api/admin/content/validate-upload.ts` — validate daily time before upload

### UI Components
- `src/components/session/SessionEndCard.tsx` — display end message or next session button
- `src/components/assignments/PendingSessionsList.tsx` — render queue of pending assigned sessions
- `src/components/admin/DailyPlannerForm.tsx` — parent/admin set daily minutes and active days
- `src/components/admin/UploadWarningModal.tsx` — warn if content exceeds daily plan
- `src/components/admin/AdminDashboard.tsx` — show "Completed X/Y sessions today" and HEART BEAT signal

### Pages/Routes
- `src/app/dashboard/assignments.tsx` — parent/admin view of child's daily plan and queue
- `src/app/(student)/session/[id]/page.tsx` — session completion page (displays end card)

### Utilities/Hooks
- `src/lib/session/nextAssignedSession.ts` — query next real pending assigned session
- `src/lib/daily-plan/calculateFit.ts` — calculate sessions/minutes fit for a day
- `src/lib/weekly-plan/calculateWeeklyCapacity.ts` — calculate total weekly minutes from daily minutes and active days
- `src/lib/weekly-plan/validateWeeklyAllocation.ts` — check if uploaded content distribution fits weekly capacity
- `src/lib/weekly-plan/smartDistributionEngine.ts` — suggest even allocation of content across active days
- `src/lib/upload/validateTimeAllocation.ts` — check upload against daily plan + grace rule
- `src/hooks/useAssignedSessionQueue.ts` — fetch and manage pending assigned sessions
- `src/hooks/useWeeklyCapacity.ts` — fetch weekly capacity and current allocation for a child

---

## Data Model Impact

### New Fields/Tables Likely Needed

**DailyPlan / ChildDailySchedule**
- child_id (FK to Child)
- daily_minutes (int, minutes allowed per day; e.g., 20)
- active_days (JSON array: [0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri]; e.g., [0,1,2,3,4] = Mon–Fri only)
- weekly_minutes_capacity (derived: daily_minutes × active_days.length; e.g., 20 × 5 = 100)
- grace_minutes_enabled (boolean, default: true if < 5 mins overage allowed)
- created_at, updated_at

**AssignedSession (modifications)**
- priority (int, 1 = high priority weak area, 2 = medium, 3 = low)
- estimated_duration_minutes (int, for daily planner calculation)
- queued_date (date when added to queue)
- is_completed (boolean, tracks finish state)
- carry_over_date (date, if not completed today, move to next allowed day)

**SessionCompletion (new)**
- session_id (FK)
- child_id (FK)
- completed_at (timestamp)
- next_session_available (boolean)
- minutes_used_today (int)
- daily_limit_reached (boolean)

---

## APIs Likely Needed

### GET /api/assigned-sessions/pending
Query next pending assigned session for a child.
**Params:** `child_id`, optional `limit`
**Returns:** sorted list by priority, then by queued_date

### GET /api/daily-plan/[child_id]
Fetch child's daily learning minutes and active days.
**Returns:** daily_minutes, active_days, grace_minutes_enabled

### POST /api/daily-plan/[child_id]
Parent/admin sets daily minutes and active days.
**Body:** { daily_minutes, active_days, grace_minutes_enabled }

### POST /api/sessions/[id]/complete
Mark session complete and return next session status.
**Returns:** { is_complete: true, next_session: {...} | null, daily_limit_reached: bool, minutes_used_today: int }

### POST /api/admin/upload/validate-time
Check if uploading new assigned content fits the daily plan.
**Body:** { child_id, estimated_minutes, upload_date }
**Returns:** { allowed: bool, exceeds_by: int, grace_applicable: bool, requires_override: bool }

### POST /api/admin/upload/validate-weekly-allocation
Check if uploading content fits the weekly capacity and shows daily distribution.
**Body:** { child_id, daily_allocation: { Mon: mins, Tue: mins, ... } }
**Returns:** { weekly_total: int, weekly_capacity: int, exceeds_by: int, is_balanced: bool, warnings: [] }

### POST /api/admin/upload/assign-with-override
Assign content with admin override and reason.
**Body:** { child_id, content_id, override_reason, assign_to_date }

---

## UI Changes Likely Needed

### Session End Screen (Highest Priority)
- Replace generic "Session Complete" with context-aware message.
- Add conditional "Start next assigned session" button (only if real pending session exists).
- Add "All assigned work complete" copy if queue is empty.
- Add "Today's planned learning is complete" if daily cap is reached.
- Show HEART BEAT signal (status icon) to parent/admin in dashboard after session end.

### Daily Planner Form
- Parent/admin input: daily minutes (e.g., 20, 30, 60).
- Checkboxes: active days of week.
- Toggle: enable/disable 5-minute grace rule.
- Preview: "Child can do X sessions per day at estimated Y minutes each."

### Upload Warning Modal
- Display total estimated minutes before and after upload.
- Show how many minutes over the daily plan.
- If within grace (1–5 mins): show warning, allow approve/edit/skip.
- If over grace (6+ mins): block and require override reason or reassign to another day.
- Buttons: "Approve", "Edit content time", "Override with reason", "Assign to another day", "Cancel".

### Admin Dashboard
- Show daily queue: "Completed 3/4 sessions today. 15 mins used of 20 planned."
- Show weekly overview: "Planned 100/100 minutes across 5 active days this week."
- Show daily breakdown: Bar chart or table showing planned/completed minutes per day.
- Show carry-over pending: "1 session from yesterday still pending. 2 sessions from last week pending."
- Show next week preview: "Next week's capacity: 100 mins (Mon–Fri)."
- Show HEART BEAT signal:
  - Green: child completed planned work, daily and weekly balanced.
  - Amber: daily complete but weekly distribution uneven or close to cap.
  - Red: child struggled, no suitable next work, or multiple carry-overs.

### Parent/Admin Notifications
- Alert when child finishes all assigned work for the day.
- Alert if child struggles in a session (from session analytics).
- Alert if child reaches daily time/session cap before queue is empty.

---

## Risk Areas

### 1. Daily Reset Logic
- **Risk:** Sessions from yesterday not properly carried over or double-counted.
- **Mitigation:** Use explicit carry_over_date field; reset daily_minutes used at 00:00 UTC per child's timezone.
- **Test:** Verify sessions at day boundary; test timezone edge cases.

### 2. Fake Next Session Button
- **Risk:** Button shows even if no real pending assigned session exists (race condition or cache lag).
- **Mitigation:** Always query pending sessions at session complete time; do not rely on client-side cache alone.
- **Test:** Rapid session completions; queue deletion scenarios.

### 3. Grace Rule Ambiguity
- **Risk:** Admin uploads 25 mins when plan is 20 mins; unclear if grace applies.
- **Mitigation:** Hard rule: grace applies only if policy is enabled AND overage is 1–5 mins. Over 5 mins always requires override.
- **Test:** Test cases at 1 min, 5 mins, 6 mins over.

### 4. Weak-Area Priority
- **Risk:** Priority field not set on existing assigned sessions; older sessions show instead of weak areas.
- **Mitigation:** Default priority = 2 (medium); admin can set priority = 1 for weak-area sessions. Migration needed.
- **Test:** Verify priority sort; test mixed-priority queues.

### 5. Carry-Over Accumulation
- **Risk:** Unfinished sessions pile up; child falls far behind on assigned work.
- **Mitigation:** Parent/admin sees carry-over count on dashboard; system flags if carry-over > 3 days old.
- **Test:** Simulate 5+ days of incomplete sessions; verify dashboard alert.

### 6. Time Estimation Accuracy
- **Risk:** Estimated minutes do not match real session time; daily plan is wrong.
- **Mitigation:** Track real session duration; compare to estimate; admin can adjust estimated_duration_minutes.
- **Test:** Log real vs estimated for 100 sessions; calculate avg error.

### 7. Weekly Capacity Calculation
- **Risk:** Active days change mid-week; weekly capacity is miscalculated or stale.
- **Mitigation:** Recalculate weekly_minutes_capacity when active_days is updated; flag carry-overs from old week.
- **Test:** Change active_days from 5 to 4; verify capacity recalculates; check carry-over handling.

---

## Phased Implementation Checklist

### Phase 1: Fix assigned-session end messages
- [ ] Create SessionEndCard component.
- [ ] Add end-message logic: check if next assigned session exists.
- [ ] Deploy to session complete page.
- [ ] Manual test: verify correct message for each scenario.

### Phase 2: Add real pending assigned-session check
- [ ] Create useAssignedSessionQueue hook.
- [ ] Implement GET /api/assigned-sessions/pending route.
- [ ] Add priority field to AssignedSession schema.
- [ ] Update SessionEndCard to conditionally show "Start next" button.
- [ ] Manual test: verify queue order (priority, then date).

### Phase 3: Add daily minutes/session planner
- [ ] Create DailyPlan model/table with active_days and weekly_minutes_capacity.
- [ ] Create DailyPlannerForm component (set daily minutes, select active days).
- [ ] Implement calculateWeeklyCapacity utility (daily_minutes × active_days.length).
- [ ] Implement POST /api/daily-plan routes.
- [ ] Add calculateFit utility (sessions/minutes that fit per day).
- [ ] Show on parent/admin dashboard: "Completed X/Y sessions, Z minutes used." + "Weekly: 100/100 mins across 5 active days."
- [ ] Manual test: set daily plan with different active_days; verify weekly capacity recalculates.

### Phase 4: Add admin upload warning + 5-minute grace rule
- [ ] Implement POST /api/admin/upload/validate-time route (daily check).
- [ ] Implement POST /api/admin/upload/validate-weekly-allocation route (weekly check).
- [ ] Implement validateWeeklyAllocation utility (sum daily allocation, compare to weekly_minutes_capacity).
- [ ] Create UploadWarningModal component (show daily + weekly warnings).
- [ ] Add grace_minutes_enabled flag to DailyPlan.
- [ ] Hard rule: 1–5 mins over (daily or weekly) = warn, allow if grace enabled; 6+ mins = require override.
- [ ] Add POST /api/admin/upload/assign-with-override route.
- [ ] Manual test: upload at 1, 5, 6, 10 mins over daily; upload with uneven weekly distribution.

### Phase 5: Add parent/admin dashboard visibility + HEART BEAT signals
- [ ] Add HEART BEAT signal logic (green/amber/red status, including weekly balance check).
- [ ] Enhance admin dashboard with weekly overview: "Planned 100/100 minutes across 5 active days this week."
- [ ] Add daily breakdown component (bar chart or table: planned vs completed per day).
- [ ] Add carry-over visibility: current week + previous week pending sessions.
- [ ] Add next week preview: "Next week's capacity: 100 mins (Mon–Fri)."
- [ ] Add notifications: child completes all work, reaches daily cap, reaches weekly cap, carries over to next day/week.
- [ ] Show real minutes used vs planned on parent view (daily + weekly).
- [ ] Manual test: run through full week flow; verify weekly signals and alerts; test active_days change mid-week.

### Phase 3E: Smart Distribution (Optional, Post-Phase 5)
- [ ] Create SmartDistributionEngine utility: takes total_minutes and active_days, suggests even allocation.
- [ ] Add `suggestDistribution` endpoint: POST /api/admin/upload/suggest-distribution
- [ ] **Body:** { child_id, total_minutes, start_date, active_days }
- [ ] **Returns:** { suggested_allocation: { Mon: X, Tue: Y, ... }, carries_to_next_week: Z_mins }
- [ ] Integrate into UploadWarningModal: show "Smart distribute across week?" button if unbalanced.
- [ ] Admin can accept suggestion, override manually, or reassign entirely.
- [ ] Manual test: upload 60 mins with 20 mins daily, 5 days → verify even distribution suggested.

---

## Notes

- **Class lessons are not affected.** Do not apply daily planner, grace rule, or end-flow logic to class lessons.
- **Database migrations:** DailyPlan and AssignedSession modifications require schema updates.
- **Backward compatibility:** Existing assigned sessions without priority/estimated_duration should default to priority=2, estimated_duration=15.
- **Testing:** E2E test at day boundary, timezone edge cases, rapid queue changes.
- **Weekly planner as source of truth:** The weekly capacity dashboard is the single source of truth for allocated assigned practice. All uploads, overrides, and reassignments must flow through it.
- **Smart Distribution (Phase 3E):** Optional post-Phase 5 enhancement. When enabled, suggests balanced allocation across active days to prevent accidental overload. Admin can accept, override, or reassign.
- **Parent approval in grace scenarios:** Future enhancement: allow parents to approve the 1–5 minute overage if admin enables it as policy.

---

**Ready for code implementation after design approval.**
