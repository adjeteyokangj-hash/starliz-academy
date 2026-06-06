# Ga Learning Hub Voice Blueprint

This blueprint anchors voice on top of the verified Ga Word Bank.

## Foundation Rule

Voice features are downstream of approved Ga content:

Approved Ga Word Bank -> pronunciation references -> generated/uploaded audio -> admin approval -> student listen/repeat -> student recordings -> future native verification.

## Voice Source Types

- AI_GENERATED
- AI_GENERATED_SONG
- ADMIN_UPLOADED
- PRONUNCIATION_REFERENCE
- STUDENT_RECORDING
- FUTURE_NATIVE_SPEAKER
- NATIVE_VERIFIED

Reference-only rule: external references (for example YouTube) are guidance only and must not be cloned or copied into owned audio assets.

## Audio Review Lifecycle

- DRAFT
- AI_GENERATED
- APPROVED_FOR_EARLY_LEARNING
- NEEDS_NATIVE_REVIEW
- NATIVE_VERIFIED
- REJECTED
- REPLACED

Student-facing playback is blocked unless status is APPROVED_FOR_EARLY_LEARNING or stronger.

## Voice Content Areas

- Letter sounds
- Sound combinations
- Word audio
- Phrase audio
- Lesson audio sections
- Songs
- Student recordings

## Activity Modes

- LISTEN_REPEAT
- SOUND_DRILL
- WORD_AUDIO_FLASHCARD
- PHRASE_REPEAT
- SONG_LISTEN
- SONG_REPEAT
- RECORD_AND_REVIEW
- CALL_AND_RESPONSE

## Admin Surfaces

- Voice Dashboard
- Word Audio Manager
- Letter and Sound Audio Manager
- Song Manager
- Student Recording Review Queue

## Quality Controls

1. No student-facing audio without admin approval.
2. AI audio can be used now only under early-learning approval or better.
3. Reference links are not app-owned audio files.
4. Generation pipeline must not clone third-party voices.
5. Audio must link to approved words or reviewed pronunciation notes.
6. Songs must flag unapproved words.
7. Student feedback should be supportive.
8. Native verification can be added later without schema redesign.
9. Approval transitions must be audit logged.
10. Rejected audio must be blocked from lessons.

## Phase Rollout

### Phase 2.6A: Voice Foundation

- Core status and source taxonomy
- Admin dashboard metrics
- Upload and approval pipeline scaffolding
- Audit-ready lifecycle transitions

### Phase 2.6B: AI Voice Generation

- Word and phrase generation
- Lesson intro generation
- Admin review checkpoint before student access

### Phase 2.6C: Pronunciation References

- Reference URL metadata and timestamps
- Link references to letters/sounds/words
- Explicit anti-cloning controls

### Phase 2.7: Student Speaking Practice

- Record/replay attempts
- Supportive AI feedback
- Admin review queue
- Weak-sound tracking

### Phase 2.8: Songs

- Song lesson type
- Lyrics validation against approved words
- Approval workflow and progress tracking
