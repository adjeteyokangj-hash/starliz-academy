# Manual End-to-End Test Checklist

## Pre-Test Setup
- [ ] Dev server running: `npm run dev`
- [ ] Navigate to: http://localhost:3000/admin/login
- [ ] Log in with admin account (adjeteyokangj@gmail.com)
- [ ] Open DevTools (F12) for error monitoring

---

## Test 1: Reception Phonics Generation ⏳

### Steps
1. [ ] Navigate to `/admin/ai-generator`
2. [ ] **Year Group**: Select "Reception" 
   - Verify: Age group auto-fills to "4–5"
3. [ ] **Subject**: Select "Phonics"
   - Verify: Skill focus shows "Phase 2 Letter Sounds", "Phase 3", "Phase 4", etc.
4. [ ] **Skill Focus**: Select "Phase 2 Letter Sounds"
5. [ ] **Difficulty**: Set to 2
6. [ ] Click **Generate**
   - Expected: 5-10 phonics items appear with letters (a, b, c, d, e)
7. [ ] Review generated content, mark items as approved/rejected
8. [ ] Click **Save to Content Library**
   - Expected: "Saved to Content Library" message appears
9. [ ] Note the Content ID from the response

### Verify in Content Library
- [ ] Navigate to `/admin/content-library`
- [ ] Filter by: Year Group = "Reception", Subject = "Phonics"
- [ ] Content appears in list with metadata:
  - Year: Reception
  - Key Stage: EYFS
  - Subject: Phonics
  - Skill: Phase 2 Letter Sounds
  - Difficulty: 2
  - Status: Review

### ✓ Test Passed If
- Content generated without errors
- Metadata displays correctly in Content Library
- No TypeScript errors in browser console

---

## Test 2: Year 2 Spelling Generation ⏳

### Steps
1. [ ] Navigate to `/admin/ai-generator`
2. [ ] **Year Group**: Select "Year 2"
   - Verify: Age group auto-fills to "6–7"
3. [ ] **Subject**: Select "Spelling"
   - Verify: Skill focus shows "CVC Words", "CVCC Words", etc.
4. [ ] **Skill Focus**: Select "CVC Words"
5. [ ] **Difficulty**: Set to 2
6. [ ] Click **Generate**
   - Expected: 5-10 spelling items (e.g., cat, dog, sit, run)
7. [ ] Review and approve items
8. [ ] Click **Save to Content Library**

### Verify in Content Library
- [ ] Filter by: Year Group = "Year 2", Subject = "Spelling"
- [ ] Verify metadata shows "Year 2 · KS1 · Spelling · CVC Words"

### ✓ Test Passed If
- Spelling content generated
- Metadata correct
- No errors

---

## Test 3: Year 6 Maths Generation ⏳

### Steps
1. [ ] Navigate to `/admin/ai-generator`
2. [ ] **Year Group**: Select "Year 6"
   - Verify: Age group auto-fills to "11–12"
3. [ ] **Subject**: Select "Maths"
   - Verify: Skill focus shows "Fractions", "Decimals", "Percentages", etc.
4. [ ] **Skill Focus**: Select "Fractions"
5. [ ] **Difficulty**: Set to 5
6. [ ] Click **Generate**
   - Expected: 5-10 maths problems about fractions
7. [ ] Review and approve
8. [ ] Save to Content Library

### Verify in Content Library
- [ ] Filter by: Year Group = "Year 6", Subject = "Maths"
- [ ] Verify metadata shows "Year 6 · KS2 · Maths · Fractions"
- [ ] Difficulty shows 5

### ✓ Test Passed If
- Maths content generated with proper difficulty
- Fractions problems shown (not too easy/hard for Year 6)
- Metadata correct

---

## Test 4: Year 8 Science Generation ⏳

### Steps
1. [ ] Navigate to `/admin/ai-generator`
2. [ ] **Year Group**: Select "Year 8"
   - Verify: Age group auto-fills to "13–14"
3. [ ] **Subject**: Select "Science"
   - Verify: Skill focus shows "Cell Structure", "Photosynthesis", etc.
4. [ ] **Skill Focus**: Select "Cell Structure"
5. [ ] **Difficulty**: Set to 5
6. [ ] Click **Generate**
   - Expected: Science questions about cells
7. [ ] Review and approve
8. [ ] Save to Content Library

### Verify in Content Library
- [ ] Filter by: Year Group = "Year 8", Subject = "Science"
- [ ] Verify metadata shows "Year 8 · KS3 · Science · Cell Structure"

### ✓ Test Passed If
- Science content generated
- Age-appropriate for Year 8
- Metadata correct

---

## Test 5: Year 11 GCSE Maths Generation ⏳

### Steps
1. [ ] Navigate to `/admin/ai-generator`
2. [ ] **Year Group**: Select "Year 11"
   - Verify: Age group auto-fills to "15–16"
3. [ ] **Subject**: Select "GCSE Maths"
   - Verify: Skill focus shows "Trigonometry", "Vectors", etc.
4. [ ] **Skill Focus**: Select "Trigonometry"
5. [ ] **Difficulty**: Set to 5
6. [ ] Click **Generate**
   - Expected: GCSE-level trigonometry problems
7. [ ] Review and approve
8. [ ] Save to Content Library

### Verify in Content Library
- [ ] Filter by: Year Group = "Year 11", Subject = "GCSE Maths"
- [ ] Verify metadata shows "Year 11 · KS4 · GCSE Maths · Trigonometry"
- [ ] Problems are GCSE-level (not too easy)

### ✓ Test Passed If
- GCSE Maths content generated
- Age-appropriate difficulty
- Metadata correct
- Subject type properly mapped (GCSE Maths → Math legacy type)

---

## Test 6: Content Library Filtering ⏳

### Steps
1. [ ] Navigate to `/admin/content-library`
2. [ ] Test filters:
   - [ ] Filter by Year Group = "Reception" → shows only Reception content
   - [ ] Filter by Year Group = "Year 6" → shows only Year 6 content
   - [ ] Filter by Key Stage = "KS2" → shows Years 3-6 only
   - [ ] Filter by Key Stage = "KS4" → shows Years 10-11 only
   - [ ] Filter by Subject = "Phonics" → shows only phonics (Reception-Year 2)
   - [ ] Filter by Subject = "GCSE Maths" → shows only Year 11 content
3. [ ] Verify no invalid combinations appear (e.g., Reception + GCSE)

### ✓ Test Passed If
- Filters work correctly
- No invalid year/subject combinations shown
- Curriculum constraints enforced

---

## Test 7: Assignment to Student ⏳

### Steps
1. [ ] Go to Content Library, find generated "Reception Phonics" content
2. [ ] Click **Assign**
3. [ ] Select a test student (or create one)
4. [ ] Click **Assign Content**
   - Expected: Confirmation message
5. [ ] Note the Assignment ID

### Verify in Student Portal
- [ ] Log out of admin
- [ ] Log in as the test student
- [ ] Navigate to `/student/dashboard` or student portal
- [ ] Verify assigned content appears in "My Lessons" or "Assignments"
- [ ] Content shows metadata: "Reception · Phonics · Phase 2"

### ✓ Test Passed If
- Assignment created successfully
- Content visible in student portal
- Student can click to start activity

---

## Test 8: Student Attempt & Tracking ⏳

### Steps
1. [ ] As student, click on assigned phonics content
2. [ ] Complete the activity (answer all questions)
3. [ ] Mark as complete or submit attempt
   - Expected: Attempt data recorded
4. [ ] Return to dashboard
   - Expected: Activity shows as "Completed"

### Verify in Database
- [ ] Query: `SELECT * FROM Attempt WHERE studentId=? ORDER BY createdAt DESC LIMIT 1`
- [ ] Verify fields:
  - [ ] studentId: matches test student
  - [ ] contentId: matches assigned content
  - [ ] accuracy: recorded (0-100%)
  - [ ] status: "completed"
  - [ ] createdAt: current timestamp

### ✓ Test Passed If
- Attempt recorded in database
- All fields populated correctly
- Student can see completion status

---

## Test 9: Weak Areas Detection ⏳

### Steps
1. [ ] As student, take another attempt with low accuracy (deliberately answer wrong)
2. [ ] Complete with score < 50%
3. [ ] Check database:
   - [ ] Query: `SELECT * FROM WeakArea WHERE studentId=?`
   - [ ] Verify weak area created for "Phonics" or "Phase 2 Letter Sounds"

### Verify Weak Area Fields
- [ ] subject: "phonics"
- [ ] skillFocus: "Phase 2 Letter Sounds"
- [ ] yearGroup: "Reception"
- [ ] confidenceScore: low (<0.5)
- [ ] createdAt/updatedAt: current

### ✓ Test Passed If
- Low-scoring attempts create weak area entries
- Weak area metadata includes subject/skill/year
- Confidence score updates on repeated attempts

---

## Test 10: Parent Dashboard Progress ⏳

### Steps
1. [ ] Log out of student account
2. [ ] Log in as parent (e.okang@yahoo.com)
3. [ ] Navigate to `/parent/progress` or child dashboard
4. [ ] Verify displays:
   - [ ] Total attempts: shows count from database
   - [ ] Subjects worked on: "Phonics", "Maths", etc. (from saved content)
   - [ ] Recent activity: shows attempts and timestamps
   - [ ] Strengths: subjects with high accuracy
   - [ ] Weaknesses: subjects from weak_areas table
   - [ ] 30-day activity chart: attempt trend

### Verify Report Export
- [ ] Click **Download Report** (PDF or Excel)
- [ ] Report includes:
  - [ ] Child's name, age/year group
  - [ ] Subject summary: attempts per subject
  - [ ] Skill breakdown: progress per skill (Phonics phases, maths topics)
  - [ ] Progress trend: week-over-week
  - [ ] Recommendations: based on weak areas

### ✓ Test Passed If
- Parent dashboard shows attempt data
- Report downloads without errors
- Metadata from new Subject system visible in report
- Curriculum structure evident in UI

---

## Summary Checklist

### All Tests Complete?
- [ ] Test 1: Reception Phonics ✓
- [ ] Test 2: Year 2 Spelling ✓
- [ ] Test 3: Year 6 Maths ✓
- [ ] Test 4: Year 8 Science ✓
- [ ] Test 5: Year 11 GCSE Maths ✓
- [ ] Test 6: Content Library Filtering ✓
- [ ] Test 7: Assignment to Student ✓
- [ ] Test 8: Student Attempt Tracking ✓
- [ ] Test 9: Weak Areas Detection ✓
- [ ] Test 10: Parent Dashboard ✓

### No Errors?
- [ ] No console errors (check DevTools)
- [ ] No database errors (check server logs)
- [ ] No TypeScript errors
- [ ] All forms submit successfully

### Curriculum Metadata Visible?
- [ ] Content Library shows: Year · Key Stage · Subject · Skill
- [ ] Student portal shows curriculum context
- [ ] Parent dashboard references subjects/skills
- [ ] Reports include curriculum structure

### Production Ready?
- [ ] All curriculum integrations working
- [ ] No hardcoded lists remaining
- [ ] Subject type mapping working (17 → 3 legacy)
- [ ] Backward compatibility maintained
- [ ] All 5 year ranges work
- [ ] Full pipeline (generate → save → assign → attempt → insights) works

---

**Test Date**: _____________  
**Tester**: _____________  
**Result**: ✓ PASS / ✗ FAIL  
**Issues Found**: _____________  
**Ready for Production**: YES / NO  

