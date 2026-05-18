# StarLiz Question Formula

**Standard question flow used across the StarLiz lesson system.**

This document defines the canonical question structure for every lesson question in StarLiz Academy. Every AI-generated question, every admin-created question, and every student-facing question rendered in the lesson player must follow this formula.

---

## A. Question Setup

Every question must include the following fields before it reaches a student.

| Field | Required | Notes |
|---|---|---|
| `subject` | ✅ | e.g. Maths, English, Science, Spelling, Reading |
| `yearGroup` | ✅ | e.g. Year 4, Year 7 |
| `learningObjective` | ✅ | One sentence: what the student will practise |
| `prompt` | ✅ | The full question text shown to the student |
| `keyInformation` | ⚠️ recommended | Key given values (e.g. Voltage = 12V, Resistance = 4Ω) |
| `visual` | optional | Diagram or formula card where useful (see Visual Support below) |
| `answerOptions` | ⚠️ | Required for multiple-choice; omit for free-text input |
| `answer` | ✅ | The correct answer (string or number) |
| `explanation` | ✅ | Why the correct answer is correct — always shown after first submission |
| `hint1` | ✅ | Gentle hint shown after wrong attempt 1 — must not reveal the answer |
| `hint2` | ✅ | Stronger support shown after wrong attempt 2 — may include worked steps |
| `workedSolution` | ✅ | Full worked solution shown only on final failed attempt |
| `skillFocus` | ⚠️ recommended | e.g. "Ohm's Law", "Silent e", "Inference" |
| `scoringWeight` | optional | 1–3 difficulty weighting for session score calculation |

### Visual Support

Diagrams, formula cards, and passages are optional but encouraged for:
- Science questions involving circuits, forces, or reactions
- Maths questions with geometry or multi-step word problems
- Reading questions (passage is required)

Visual types: `diagram`, `formula_card`, `passage`

---

## B. Attempt Pattern

Every question allows up to three attempts. The behaviour at each stage is fixed.

### Attempt 1 — Independent

- The student sees: question prompt, key information, optional visual, optional hint.
- No answer is revealed.
- No worked steps are shown yet.
- The tutor waits.

### Attempt 2 — Gentle hint

- The wrong answer triggers `hint1`.
- The hint points the student toward the right method or relevant information.
- The correct answer must **not** be revealed.
- Example for maths: "Look for the important numbers and choose the operation you need."
- Example for reading: "Read the question again and find the matching clue in the passage."

### Attempt 3 — Stronger support

- The wrong answer triggers `hint2`.
- The support may show worked calculation steps (without the final answer).
- The correct answer must **not** be revealed unless this is also the final allowed attempt.
- Example for Ohm's Law: "Current = Voltage ÷ Resistance. Now put the numbers in: Current = 12 ÷ 4. What is 12 ÷ 4?"

### Final failed attempt

- After three wrong answers, reveal the correct answer and show the full worked explanation (`workedSolution`).
- The tutor confirms the answer with a calm explanation.
- Do **not** say "Try again" while showing the correct answer.
- Score for this question = 0.

### Correct attempt

- After any correct answer, confirm the answer and show the explanation.
- The explanation must say **why** the answer is correct, not just repeat the answer.
- Score is weighted by attempt number (see Scoring Pattern below).

---

## C. Tutor Feedback Pattern

The tutor feedback must follow these rules across all subjects.

### General rules

- Never say "Try again" while showing the correct answer.
- Never mention the microphone when no microphone control is visible or enabled.
- Always explain why the correct answer is correct.
- Keep tone calm and encouraging at every stage.
- Do not patronise: feedback should guide, not shame.

### Subject-specific language

| Subject | Feedback style |
|---|---|
| Maths | Step-by-step working; name the operation used |
| English (spelling) | Sound-by-sound breakdown; letter pattern names |
| English (grammar/punctuation) | Name the rule; give a real sentence example |
| Science | Name the law or formula; show the substitution |
| Reading/comprehension | Key-word matching; quote evidence from passage |
| Vocabulary | Definition in context; example usage |

### Microphone rule

```
if (microphoneVisible && voiceEnabled) {
  // OK to say: "Tap the microphone and say your answer."
} else {
  // Say: "Need help? Use the answer box or choose an option below."
  // Never mention the microphone.
}
```

---

## D. Scoring Pattern

Session score reflects **learning effort**, not just whether the student got it right eventually.

| Outcome | Score for that question |
|---|---|
| Correct on attempt 1 | 100 |
| Correct on attempt 2 | 70 |
| Correct on attempt 3 | 50 |
| Failed all 3 attempts | 0 |

**Session score** = mean of all resolved question scores (rounded to nearest integer).

```typescript
// From src/lib/starliz-question-formula.ts
scoreForResolvedQuestion(attempts: number, correct: boolean): number
computeAttemptWeightedScore(progress: Record<string, QuestionAttemptSummary>): number
```

---

## E. Component Usage

The reusable component is at:

```
src/components/learning/StarLizQuestionCard.tsx
```

It accepts the following core props:

```typescript
subjectBadge        // rendered badge element
attemptNumber       // 1-based current attempt
maxAttempts         // default 3
progressLabel       // e.g. "2/5" or "1/3 (Review)"
learningFocus       // from buildQuestionFormulaScaffold
keyInformation      // string[]
hint                // string | null
unitReminder        // e.g. "A" for Amperes
visual              // QuestionVisualSupport | null
questionPrompt      // question heading
answerOptions       // string[] for multiple-choice
answerValue         // string for free-text
onSubmit            // submit callback
feedback            // tutor feedback text (shown instead of answer area)
feedbackMode        // "none" | "continue" | "retry" | "skip_choice"
isFinalWrong        // true when this was the final failed attempt
onContinue          // continue callback
customAnswerArea    // ReactNode for complex controls (e.g. spelling speech)
```

The lesson page at `src/app/games/lesson/page.tsx` uses this component and passes the spelling speech-recognition controls via `customAnswerArea`.

---

## F. Validation

All content must pass the StarLiz question validator before being stored.

Validator: `src/lib/starliz-question-validator.ts`

The validator:
- Rejects questions missing `prompt` or `answer`
- Rejects questions missing `explanation`
- Warns on missing `hint1` / `hint2` / `workedSolution`
- Science questions may include optional `visual`
- Spelling/reading questions do not require a `visual`
- Maths questions must include a `workedSolution`

---

## G. Study Plan Integration

Each assigned lesson follows the study plan stages defined in `src/lib/study-plan.ts`:

1. **Warm-up** — brief orientation question or review prompt
2. **Teach** — learning objective and key information introduced
3. **Guided practice** — first attempt with full scaffold visible
4. **Independent question** — student works without hints visible initially
5. **Retry support** — hints revealed progressively on wrong answers
6. **Explanation** — worked explanation shown after each question is resolved
7. **Review** — weak questions cycled back for a second pass
8. **Mastery check** — final set of questions without hints
9. **Next step** — diagnostic pointer to the next skill to practise

The current study plan stage is shown in the student dashboard and available to admins on the assignment preview page.
