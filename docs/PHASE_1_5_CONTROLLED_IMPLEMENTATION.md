# Assigned Session End Flow: Phases 1–5 Controlled Implementation

**Status:** Pre-implementation file review gate
**Scope:** All phases (1–5) in one controlled pass
**Constraint:** Report required schema changes before any code is written

---

## Strict Implementation Scope

✅ **In Scope:**
- Assigned/adaptive practice sessions only
- Real pending session checks
- Daily minutes and session planner
- Weekly capacity planner
- 5-minute grace rule for upload allocation
- Carry-over logic to next active learning day
- Smart Catch-Up cap enforcement (no auto-same-day sessions after daily cap)
- Parent/admin dashboard visibility
- HEART BEAT informational signals

❌ **Out of Scope:**
- Class lessons (do not touch)
- Homework flow changes (read-only compatibility checks only)
- Login/authentication/unrelated systems
- Database migrations (report needed schema changes first)
- Prisma reset
- Migration reset
- db push reset
- git push

---

## Reference Documents

- **Design:** [docs/ASSIGNED_SESSION_END_FLOW_DESIGN.md](docs/ASSIGNED_SESSION_END_FLOW_DESIGN.md)
- **Review:** [docs/ASSIGNED_SESSION_END_FLOW_DESIGN_REVIEW.md](docs/ASSIGNED_SESSION_END_FLOW_DESIGN_REVIEW.md)

---

## Implementation Rules

### Files and Structure
- Use existing data structures where possible (extend current tables, do not create new ones unless unavoidable)
- Prefer audit-log or event-sourcing patterns if suitable
- Avoid schema migrations in this pass unless absolutely required
- Helper functions and tests first, then UI

### Code Quality
- No placeholder cards; UI should be simple but functional
- Disabled states must explain the real reason to users
- All new functions should be pure and testable
- Use TypeScript strictly; no `any` types

### Validation Before Merge
- `git diff --check` (no trailing whitespace)
- `npx tsc --noEmit` (type safety)
- `npm run lint -- --max-warnings=0` (linting)
- Run focused assigned-session end-flow tests

---

## Pre-Implementation Gate

**Before Any Code is Written:**

1. **List all files you intend to create or modify**, organized by category:
   - New API routes
   - New UI components
   - New utilities/helpers
   - Modified existing files
   - New test files

2. **Report any schema changes needed:**
   - If you need to add fields to existing tables, list them exactly
   - If you need new tables, describe the structure
   - Do NOT run `prisma migrate dev` or `prisma reset`
   - Just report the exact Prisma schema additions needed

3. **Wait for approval** before proceeding with any code

---

## Implementation Phases (Reference)

### Phase 1: Fix assigned-session end messages
- Create SessionEndCard component
- Add end-message logic: check if next assigned session exists
- Deploy to session complete page

### Phase 2: Add real pending assigned-session check
- Create useAssignedSessionQueue hook
- Implement GET /api/assigned-sessions/pending route
- Add priority field to data model (or extend existing session record)

### Phase 3: Add daily minutes/session planner
- Create DailyPlan model/table OR extend existing plan table
- Create DailyPlannerForm component
- Implement POST /api/daily-plan routes
- Add calculateWeeklyCapacity utility

### Phase 4: Add admin upload warning + 5-minute grace rule
- Implement POST /api/admin/upload/validate-time route
- Implement POST /api/admin/upload/validate-weekly-allocation route
- Create UploadWarningModal component
- Add grace_minutes_enabled flag to DailyPlan

### Phase 5: Add parent/admin dashboard visibility + HEART BEAT signals
- Enhance admin dashboard with weekly overview
- Add daily breakdown component
- Add carry-over visibility
- Add HEART BEAT signal logic

---

## Smart Catch-Up Integration (Critical)

**Decision Rule (Locked):**
```
If daily_limit_reached = true AND catch-up trigger fires:
  → Do NOT create same-day session
  → Record weak-area need
  → Schedule to next active learning day
  → Allow parent/admin override with reason only
```

**Implementation Point:**
- Filter logic in catch-up task sync (e.g., `syncCatchUpTasks`)
- Check: if `daily_minutes_used_today >= daily_minutes`, move high-priority due date forward

---

## Next Step

**Submit:**
- Exact list of files to create/modify
- Schema changes required (if any)
- Wait for approval

**Then proceed with implementation.**

---

**Ready for file review before code begins.**
