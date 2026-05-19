import { expect, test, type Page } from "@playwright/test";

const ASSIGNMENT_ID = "e2e-runtime-lifecycle-assignment";
const CHILD_ID = "e2e-runtime-lifecycle-child";

type TransitionLog = {
  eventName: string;
  eventData: Record<string, unknown> | null;
  previousState: string;
  nextState: string;
};

function buildMockChild() {
  const nowIso = new Date().toISOString();
  const dayKey = new Date().toISOString().slice(0, 10);
  return {
    id: CHILD_ID,
    name: "Lifecycle Child",
    avatar: "🦊",
    ageRange: "5-7",
    ageYears: 6,
    startLevelChoice: "Beginner",
    level: "Beginner",
    yearGroup: "Year 1",
    keyStageLevel: "KS1",
    subjectLevels: { spelling: 1, math: 1, reading: 1 },
    stars: 0,
    xp: 0,
    coins: 0,
    weekStreak: 1,
    streakShields: 1,
    petStage: 1,
    petEmotion: "calm",
    petMoodUpdatedAt: nowIso,
    inventory: [],
    weeklyRewardClaimedAt: null,
    dailyGoal: 3,
    weeklyTarget: 18,
    usageLimitMinutes: 45,
    usageTodayMinutes: 0,
    usageDayKey: dayKey,
    lastActiveDay: dayKey,
    adaptive: {
      spellingDifficulty: 1,
      mathDifficulty: 1,
      readingDifficulty: 1,
      spellingStreak: 0,
      weakAreas: [],
      nextBestActivity: "Math Quest",
      lastVoiceMessage: "You are doing great!",
    },
    learnerInsights: {
      spelling: { level: 1, attempts: 0, correct: 0, hintsUsed: 0, avgResponseMs: 0, strengths: [], needsSupport: [], repeatedMistakes: [], audioSupportNeeded: false },
      math: { level: 1, attempts: 0, correct: 0, hintsUsed: 0, avgResponseMs: 0, strengths: [], needsSupport: [], repeatedMistakes: [], audioSupportNeeded: false },
      reading: { level: 1, attempts: 0, correct: 0, hintsUsed: 0, avgResponseMs: 0, strengths: [], needsSupport: [], repeatedMistakes: [], audioSupportNeeded: false },
      updatedAt: nowIso,
    },
    levelDecisions: [],
    dailySubjectProgress: {
      dayKey,
      targets: { spelling: 15, math: 10, reading: 5 },
      completed: { spelling: 0, math: 0, reading: 0 },
      weakItems: { spelling: [], math: [], reading: [] },
    },
    masteryTags: { spelling: {}, math: {}, reading: {} },
    weaknessMap: {},
    spellingPatterns: {},
    mathSkills: {},
    literacySupport: { spellingCompetency: 100, readingCompetency: 100, oralReadingScore: 100, mode: "balanced", interventions: [], updatedAt: nowIso },
    mathSupport: { mathCompetency: 100, weakOperations: [], mode: "standard", interventions: [], updatedAt: nowIso },
    settings: { voiceEnabled: false, sfxEnabled: true, volume: 0.9, voiceStyle: "friendly_coach", coachingStyle: "balanced", reduceMotion: true, largeText: false, highContrast: false },
    theme: "default",
    hubPins: ["math"],
    hubOrder: ["spelling", "math", "reading", "pet", "rewards", "profiles"],
    createdAt: nowIso,
  };
}

function buildMockAssignment() {
  return {
    id: ASSIGNMENT_ID,
    status: "assigned",
    subject: "math",
    studentId: CHILD_ID,
    contentId: "e2e-runtime-lifecycle-content",
    title: "Tutor Runtime Lifecycle Lesson",
    skillFocus: "addition_basic",
    difficulty: 1,
    items: [
      {
        id: "m1",
        questionType: "math",
        question: "1 + 1 = ?",
        prompt: "1 + 1 = ?",
        options: ["1", "2", "3"],
        correctAnswer: "2",
        explanation: "1 plus 1 equals 2",
        hint: "Count two objects",
        coachSteps: [],
        guidedSteps: [],
        workedSolution: "1+1=2",
        visuals: { required: false, type: "none", title: "", altText: "", body: [], prompt: "" },
        learningFocus: "Addition basics",
        retryPrompts: [],
        reviewPrompt: "Try this again",
        weakSkillTags: ["addition"],
        difficulty: 1,
        masterySignals: { firstTryCorrect: false, retryCorrect: false, attemptCount: 0, hintsUsed: 0, mastered: false, reviewed: false },
      },
      {
        id: "m2",
        questionType: "math",
        question: "2 + 2 = ?",
        prompt: "2 + 2 = ?",
        options: ["4", "8", "10"],
        correctAnswer: "4",
        explanation: "2 plus 2 equals 4",
        hint: "Pair and pair",
        coachSteps: [],
        guidedSteps: [],
        workedSolution: "2+2=4",
        visuals: { required: false, type: "none", title: "", altText: "", body: [], prompt: "" },
        learningFocus: "Addition basics",
        retryPrompts: [],
        reviewPrompt: "Try this again",
        weakSkillTags: ["addition"],
        difficulty: 1,
        masterySignals: { firstTryCorrect: false, retryCorrect: false, attemptCount: 0, hintsUsed: 0, mastered: false, reviewed: false },
      },
    ],
  };
}

async function installDeterministicMocks(page: Page) {
  const child = buildMockChild();
  const assignment = buildMockAssignment();

  await page.route("**/api/**", async (route) => {
    const url = route.request().url();

    if (url.includes("/api/consent")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accepted: true }) });
      return;
    }

    if (url.includes("/api/auth/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "e2e-parent", email: "e2e@local", role: "parent" } }),
      });
      return;
    }

    if (url.includes("/api/children/active")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ child }) });
      return;
    }

    if (url.endsWith("/api/children") || url.includes("/api/children?")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ children: [child], activeChildId: child.id }),
      });
      return;
    }

    if (url.includes("/api/student/assignments")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(assignment) });
      return;
    }

    if (url.includes("/api/student/progress")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rewards: { xpEarned: 10, coinsEarned: 3, starsEarned: 1, streak: 1 },
          notification: { ok: true },
        }),
      });
      return;
    }

    if (url.includes("/api/branding")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function completeWarmupAndStartLesson(page: Page) {
  await expect(page.getByRole("button", { name: /Start talking with Star/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Start talking with Star/i }).click();

  await expect(page.getByRole("button", { name: /Tap the microphone/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Tap the microphone/i }).click();

  const beginButton = page.getByRole("button", { name: /Begin my lesson/i });
  await expect(beginButton).toBeEnabled({ timeout: 15_000 });
  await beginButton.click();
}

async function submitAnswerValue(page: Page, value: string) {
  const lessonMain = page.locator("main");
  const exactButton = lessonMain.getByRole("button", { name: value, exact: true }).first();
  if (await exactButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await exactButton.click();
    return;
  }

  const answerInput = lessonMain.locator("input[placeholder*='Type']").first();
  await expect(answerInput).toBeVisible({ timeout: 10_000 });
  await answerInput.fill(value);
  await lessonMain.getByRole("button", { name: /Submit/i }).first().click();
}

test.describe("lesson runtime lifecycle event flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const globalWindow = window as Window & {
        __tutorTransitionLogs?: Array<{
          eventName: string;
          eventData: Record<string, unknown> | null;
          previousState: string;
          nextState: string;
        }>;
        SpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          maxAlternatives: number;
          onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }>>; timeStamp?: number }) => void) | null;
          onerror: ((event: { error?: string }) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
          abort?: () => void;
        };
        webkitSpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          maxAlternatives: number;
          onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }>>; timeStamp?: number }) => void) | null;
          onerror: ((event: { error?: string }) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
          abort?: () => void;
        };
      };

      globalWindow.__tutorTransitionLogs = [];

      const originalDebug = console.debug.bind(console);
      console.debug = (...args: unknown[]) => {
        if (args[0] === "[TutorEngine] transition" && args[1] && typeof args[1] === "object") {
          const payload = args[1] as {
            event?: { name?: string; data?: Record<string, unknown> };
            previousState?: string;
            nextState?: string;
          };

          globalWindow.__tutorTransitionLogs?.push({
            eventName: String(payload.event?.name ?? ""),
            eventData: payload.event?.data ?? null,
            previousState: String(payload.previousState ?? ""),
            nextState: String(payload.nextState ?? ""),
          });
        }
        originalDebug(...args);
      };

      // Keep lesson deterministic and avoid real speech/TTS in headless execution.
      localStorage.setItem("lessonVoiceEnabled", "false");
      localStorage.setItem("starliz.lesson.voice", "false");

      // Remove stale persisted lesson sessions from prior runs.
      localStorage.removeItem("starliz_lesson_e2e-runtime-lifecycle-assignment");
      localStorage.removeItem("starliz:lesson:e2e-runtime-lifecycle-assignment");
      localStorage.removeItem("starliz:lesson-progress:e2e-runtime-lifecycle-assignment");

      class MockSpeechRecognition {
        lang = "en-GB";
        interimResults = false;
        continuous = false;
        maxAlternatives = 1;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }>>; timeStamp?: number }) => void) | null = null;
        onerror: ((event: { error?: string }) => void) | null = null;
        onend: (() => void) | null = null;

        start() {
          window.setTimeout(() => {
            this.onresult?.({
              results: [[{ transcript: "I feel good and ready", confidence: 0.98 }]],
              timeStamp: performance.now(),
            });
            window.setTimeout(() => {
              this.onend?.();
            }, 0);
          }, 0);
        }

        stop() {
          this.onend?.();
        }

        abort() {
          this.onend?.();
        }
      }

      globalWindow.SpeechRecognition = MockSpeechRecognition;
      globalWindow.webkitSpeechRecognition = MockSpeechRecognition;
    });

    await installDeterministicMocks(page);
  });

  test("emits full tutor runtime lifecycle deterministically", async ({ page }) => {
    await page.goto(`/games/lesson?assignmentId=${ASSIGNMENT_ID}`);

    await page.waitForFunction(
      () => !document.body.innerText.includes("Preparing your learning space"),
      { timeout: 20_000 },
    );

    await completeWarmupAndStartLesson(page);

    // Wait until the lesson question card is fully active before answering.
    await expect(page.getByText(/Attempt 1\/3/i)).toBeVisible({ timeout: 15_000 });

    // Q1: correct first try -> ANSWER_SUBMITTED, ANSWER_CORRECT, NEXT_ITEM
    await submitAnswerValue(page, "2");
    await expect(page.getByRole("button", { name: /Continue/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Continue/i }).click();

    // Q2: wrong twice with retry, then final wrong
    await submitAnswerValue(page, "8");
    await expect(page.getByRole("button", { name: /Try again/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Try again/i }).click();

    await submitAnswerValue(page, "8");
    await expect(page.getByRole("button", { name: /Try again/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Try again/i }).click();

    await submitAnswerValue(page, "8");
    await expect(page.getByRole("button", { name: /Try a similar question|Continue/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Try a similar question|Continue/i }).click();

    // Ensure no dead-end after repeated wrong answers: review intro must appear.
    await expect(page.getByText("Review Round")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Start Review" })).toBeVisible({ timeout: 10_000 });

    // Review flow start and completion.
    await page.getByRole("button", { name: "Start Review" }).click();
    await submitAnswerValue(page, "4");
    await expect(page.getByRole("button", { name: /Continue/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Continue/i }).click();

    await expect(page.getByText("Review Complete")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Continue to Results" }).click();

    await expect(page.getByText(/Lesson Complete/i)).toBeVisible({ timeout: 20_000 });

    const transitionLogs = await page.evaluate(() => {
      const globalWindow = window as Window & { __tutorTransitionLogs?: TransitionLog[] };
      return globalWindow.__tutorTransitionLogs ?? [];
    });

    const eventCounts = transitionLogs.reduce<Record<string, number>>((acc, log) => {
      acc[log.eventName] = (acc[log.eventName] ?? 0) + 1;
      return acc;
    }, {});

    const requiredEvents = [
      "ASSIGNMENT_LOADED",
      "LESSON_STARTED",
      "ANSWER_SUBMITTED",
      "ANSWER_CORRECT",
      "ANSWER_WRONG_RETRY",
      "ANSWER_FINAL_WRONG",
      "NEXT_ITEM",
      "REVIEW_TRIGGERED",
      "REVIEW_BEGAN",
      "REVIEW_COMPLETE",
      "LESSON_COMPLETED",
    ];

    for (const eventName of requiredEvents) {
      expect(eventCounts[eventName] ?? 0, `${eventName} should be emitted`).toBeGreaterThan(0);
    }

    // Events that should only occur once (assert no duplicate spam for once-only lifecycle transitions).
    expect(eventCounts.ASSIGNMENT_LOADED ?? 0).toBe(1);
    expect(eventCounts.LESSON_STARTED ?? 0).toBe(1);
    expect(eventCounts.REVIEW_BEGAN ?? 0).toBe(1);
    expect(eventCounts.LESSON_COMPLETED ?? 0).toBe(1);

    // Ensure retry/final-wrong path is actually exercised.
    expect(eventCounts.ANSWER_WRONG_RETRY ?? 0).toBeGreaterThanOrEqual(2);
    expect(eventCounts.ANSWER_FINAL_WRONG ?? 0).toBe(1);

    const completedLog = transitionLogs.find((log) => log.eventName === "LESSON_COMPLETED");
    expect(completedLog).toBeTruthy();
    expect(completedLog?.eventData).toBeTruthy();
    expect(typeof completedLog?.eventData?.finalScore).toBe("number");
    expect(typeof completedLog?.eventData?.masteryReady).toBe("boolean");
  });
});
