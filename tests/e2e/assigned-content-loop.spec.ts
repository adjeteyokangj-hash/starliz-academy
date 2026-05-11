import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

type SeededSubject = {
  assignmentId: string;
  contentId: string;
};

type SeededData = {
  parentEmail: string;
  parentPassword: string;
  childId: string;
  childName: string;
  spelling: SeededSubject;
  math: SeededSubject;
  reading: SeededSubject;
};

const prisma = new PrismaClient();

const E2E_PARENT_EMAIL = process.env.E2E_PARENT_EMAIL ?? "e2e.parent+assigned@starliz.local";
const E2E_PARENT_PASSWORD = process.env.E2E_PARENT_PASSWORD ?? "PlaywrightAssigned#2026";
const E2E_CHILD_ID = "e2e-assigned-loop-child";
const E2E_CHILD_NAME = "E2E Assigned Loop";

let seeded: SeededData;

async function seedAssignedLoopFixtures(): Promise<SeededData> {
  const passwordHash = await bcrypt.hash(E2E_PARENT_PASSWORD, 12);

  const parent = await prisma.user.upsert({
    where: { email: E2E_PARENT_EMAIL },
    update: {
      passwordHash,
      role: "parent",
      name: "E2E Parent",
      trialSessionsUsed: 0,
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
      consentWithdrawnAt: null,
    },
    create: {
      email: E2E_PARENT_EMAIL,
      passwordHash,
      role: "parent",
      name: "E2E Parent",
      trialSessionsUsed: 0,
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
    },
    select: { id: true, email: true },
  });

  await prisma.subscription.deleteMany({
    where: { parentId: parent.id, providerSubId: "e2e-assigned-loop" },
  });

  await prisma.subscription.create({
    data: {
      parentId: parent.id,
      provider: "manual",
      providerSubId: "e2e-assigned-loop",
      planKey: "yearly",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.childProfile.upsert({
    where: { id: E2E_CHILD_ID },
    update: {
      parentId: parent.id,
      name: E2E_CHILD_NAME,
      avatar: "star",
      archived: false,
      age: 7,
      yearGroup: "Year 2",
    },
    create: {
      id: E2E_CHILD_ID,
      parentId: parent.id,
      name: E2E_CHILD_NAME,
      avatar: "star",
      age: 7,
      yearGroup: "Year 2",
    },
  });

  const spellingContent = await prisma.aIContentCache.create({
    data: {
      contentType: "spelling",
      level: 2,
      topic: "E2E assigned spelling",
      skillFocus: "silent-e",
      status: "published",
      createdBy: "e2e-playwright",
      contentJson: JSON.stringify([
        {
          id: "e2e-spelling-1",
          word: "cake",
          hint: "It ends with silent e.",
          categoryHint: "silent e",
          patterns: ["a_e"],
        },
        {
          id: "e2e-spelling-2",
          word: "make",
          hint: "Another silent e word.",
          categoryHint: "silent e",
          patterns: ["a_e"],
        },
      ]),
    },
    select: { id: true },
  });

  const mathContent = await prisma.aIContentCache.create({
    data: {
      contentType: "math",
      level: 2,
      topic: "E2E assigned math",
      skillFocus: "addition",
      status: "published",
      createdBy: "e2e-playwright",
      contentJson: JSON.stringify([
        {
          id: "e2e-math-1",
          prompt: "9 + 4 = ?",
          answer: 13,
          choices: [11, 12, 13, 14],
          topic: "addition",
        },
        {
          id: "e2e-math-2",
          prompt: "10 + 2 = ?",
          answer: 12,
          choices: [10, 11, 12, 13],
          topic: "addition",
        },
      ]),
    },
    select: { id: true },
  });

  const readingContent = await prisma.aIContentCache.create({
    data: {
      contentType: "reading",
      level: 2,
      topic: "E2E assigned reading",
      skillFocus: "comprehension",
      status: "published",
      createdBy: "e2e-playwright",
      contentJson: JSON.stringify([
        {
          id: "e2e-reading-1",
          passage: "Tom packs a red kite and goes to the park.",
          question: "What color is the kite?",
          answer: "Red",
          choices: ["Blue", "Red", "Green", "Yellow"],
        },
        {
          id: "e2e-reading-2",
          passage: "Maya takes a raincoat because the sky is dark.",
          question: "What does Maya take?",
          answer: "Raincoat",
          choices: ["Hat", "Raincoat", "Ball", "Book"],
        },
      ]),
    },
    select: { id: true },
  });

  const [spellingAssignment, mathAssignment, readingAssignment] = await Promise.all([
    prisma.assignment.create({
      data: { studentId: E2E_CHILD_ID, contentId: spellingContent.id, status: "assigned" },
      select: { id: true },
    }),
    prisma.assignment.create({
      data: { studentId: E2E_CHILD_ID, contentId: mathContent.id, status: "assigned" },
      select: { id: true },
    }),
    prisma.assignment.create({
      data: { studentId: E2E_CHILD_ID, contentId: readingContent.id, status: "assigned" },
      select: { id: true },
    }),
  ]);

  return {
    parentEmail: parent.email,
    parentPassword: E2E_PARENT_PASSWORD,
    childId: E2E_CHILD_ID,
    childName: E2E_CHILD_NAME,
    spelling: { assignmentId: spellingAssignment.id, contentId: spellingContent.id },
    math: { assignmentId: mathAssignment.id, contentId: mathContent.id },
    reading: { assignmentId: readingAssignment.id, contentId: readingContent.id },
  };
}

async function cleanupAssignedLoopFixtures(): Promise<void> {
  const content = await prisma.aIContentCache.findMany({
    where: { createdBy: "e2e-playwright" },
    select: { id: true },
  });
  const contentIds = content.map((entry) => entry.id);

  const assignments = await prisma.assignment.findMany({
    where: {
      OR: [
        { studentId: E2E_CHILD_ID },
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
      ],
    },
    select: { id: true },
  });
  const assignmentIds = assignments.map((entry) => entry.id);

  await prisma.attempt.deleteMany({
    where: {
      OR: [
        { assignmentId: { in: assignmentIds.length ? assignmentIds : ["__none__"] } },
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
        { studentId: E2E_CHILD_ID },
      ],
    },
  });

  await prisma.assignment.deleteMany({
    where: {
      OR: [
        { id: { in: assignmentIds.length ? assignmentIds : ["__none__"] } },
        { studentId: E2E_CHILD_ID },
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
      ],
    },
  });

  await prisma.childProfile.deleteMany({ where: { id: E2E_CHILD_ID } });
  await prisma.subscription.deleteMany({
    where: {
      OR: [
        { providerSubId: "e2e-assigned-loop" },
        { parent: { email: E2E_PARENT_EMAIL } },
      ],
    },
  });
  await prisma.aIContentCache.deleteMany({
    where: { id: { in: contentIds.length ? contentIds : ["__none__"] } },
  });
}

async function getAssignmentStatus(id: string): Promise<string | null> {
  const assignment = await prisma.assignment.findUnique({ where: { id }, select: { status: true } });
  return assignment?.status ?? null;
}

async function getLatestAttempt(assignmentId: string) {
  return prisma.attempt.findFirst({
    where: { assignmentId },
    orderBy: { createdAt: "desc" },
    select: {
      assignmentId: true,
      contentId: true,
      correct: true,
      questionText: true,
      answerGiven: true,
    },
  });
}

async function getAssignmentAttemptCount(assignmentId: string): Promise<number> {
  return prisma.attempt.count({ where: { assignmentId } });
}

async function seedClientProfileState(
  page: import("@playwright/test").Page,
  profile: { id: string; name: string },
): Promise<void> {
  await page.evaluate((payload) => {
    const profiles = JSON.stringify([
      {
        id: payload.id,
        name: payload.name,
        avatar: "🦊",
        ageRange: "5-7",
        adaptive: {
          spellingDifficulty: 2,
          mathDifficulty: 2,
          readingDifficulty: 2,
        },
      },
    ]);

    const profileKeys = ["starliz.profiles", "starliz.childProfiles", "childProfiles"];
    const activeKeys = ["starliz.activeProfileId", "activeChildId", "activeProfileId"];

    for (const key of profileKeys) {
      window.localStorage.setItem(key, profiles);
    }
    for (const key of activeKeys) {
      window.localStorage.setItem(key, payload.id);
    }
  }, profile);
}

test.describe("Assigned Content Closed Loop", () => {
  test.beforeAll(async () => {
    await cleanupAssignedLoopFixtures();
    seeded = await seedAssignedLoopFixtures();
  });

  test.afterAll(async () => {
    await cleanupAssignedLoopFixtures();
    await prisma.$disconnect();
  });

  test("serves assigned first and completes only after assigned attempt", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(seeded.parentEmail);
    await page.getByLabel("Password").fill(seeded.parentPassword);
    await page.getByRole("button", { name: "Login" }).click();
    // Wait for session cookie to be set before making API calls
    await expect.poll(async () => {
      const response = await page.request.get("/api/auth/me");
      return response.status();
    }, { timeout: 20_000 }).toBe(200);

    const activateChild = await page.request.post("/api/children/active", {
      data: { childId: seeded.childId },
    });
    expect(activateChild.ok()).toBe(true);
    await seedClientProfileState(page, { id: seeded.childId, name: seeded.childName });

    const consentCheck = await page.request.get("/api/consent");
    const consentPayload = (await consentCheck.json()) as { accepted?: boolean };
    if (!consentPayload.accepted) {
      await page.request.post("/api/consent", { data: { accepted: true, version: "1.0" } });
    }

    const spoofedAttempt = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "spelling",
        skillFocus: "silent-e",
        contentId: seeded.spelling.contentId,
        assignmentId: seeded.spelling.assignmentId,
        questionText: "spoofed question",
        answerGiven: "spoofed",
        correctAnswer: "spoofed",
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(spoofedAttempt.ok()).toBe(true);
    await expect.poll(async () => getAssignmentStatus(seeded.spelling.assignmentId)).toBe("assigned");

    await page.goto(`/games/spelling?assignmentId=${seeded.spelling.assignmentId}&contentId=${seeded.spelling.contentId}`);
    await expect(page.getByText("Source: Assigned")).toBeVisible();
    await page.getByPlaceholder("Type what you hear").fill("cake");
    await page.getByRole("button", { name: "Check Answer" }).click();

    await expect.poll(async () => getAssignmentStatus(seeded.spelling.assignmentId)).toBe("in_progress");
    const firstSpellingAttempt = await getLatestAttempt(seeded.spelling.assignmentId);
    const answeredWord = (firstSpellingAttempt?.questionText ?? "").trim().toLowerCase();
    const secondWord = answeredWord === "cake" ? "make" : "cake";

    const secondSpellingAttempt = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "spelling",
        skillFocus: "silent-e",
        contentId: seeded.spelling.contentId,
        assignmentId: seeded.spelling.assignmentId,
        questionText: secondWord,
        answerGiven: secondWord,
        correctAnswer: secondWord,
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(secondSpellingAttempt.ok()).toBe(true);

    await expect.poll(async () => getAssignmentStatus(seeded.spelling.assignmentId)).toBe("completed");
    const spellingAttempt = await getLatestAttempt(seeded.spelling.assignmentId);
    expect(spellingAttempt?.contentId).toBe(seeded.spelling.contentId);
    expect(spellingAttempt?.correct).toBe(true);
    expect(await getAssignmentAttemptCount(seeded.spelling.assignmentId)).toBeGreaterThanOrEqual(2);

    await page.goto(`/games/math?assignmentId=${seeded.math.assignmentId}&contentId=${seeded.math.contentId}`);
    await expect(page.getByText("Source: Assigned")).toBeVisible();
    await page.getByPlaceholder("Type the answer").fill("13");
    await page.getByRole("button", { name: "Check Answer" }).click();

    await expect.poll(async () => getAssignmentStatus(seeded.math.assignmentId)).toBe("in_progress");
    const firstMathAttempt = await getLatestAttempt(seeded.math.assignmentId);
    const firstMathPrompt = (firstMathAttempt?.questionText ?? "").trim();
    const secondMathQuestion = firstMathPrompt === "9 + 4 = ?"
      ? { prompt: "10 + 2 = ?", answer: "12" }
      : { prompt: "9 + 4 = ?", answer: "13" };

    const secondMathAttempt = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "math",
        skillFocus: "addition",
        contentId: seeded.math.contentId,
        assignmentId: seeded.math.assignmentId,
        questionText: secondMathQuestion.prompt,
        answerGiven: secondMathQuestion.answer,
        correctAnswer: secondMathQuestion.answer,
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(secondMathAttempt.ok()).toBe(true);

    await expect.poll(async () => getAssignmentStatus(seeded.math.assignmentId)).toBe("completed");
    const mathAttempt = await getLatestAttempt(seeded.math.assignmentId);
    expect(mathAttempt?.contentId).toBe(seeded.math.contentId);
    expect(mathAttempt?.correct).toBe(true);
    expect(await getAssignmentAttemptCount(seeded.math.assignmentId)).toBeGreaterThanOrEqual(2);

    await page.goto(`/games/reading?assignmentId=${seeded.reading.assignmentId}&contentId=${seeded.reading.contentId}`);
    await expect(page.getByText("Source: Assigned")).toBeVisible();
    await page.getByRole("button", { name: "Red" }).click();

    await expect.poll(async () => getAssignmentStatus(seeded.reading.assignmentId)).toBe("in_progress");
    const firstReadingAttempt = await getLatestAttempt(seeded.reading.assignmentId);
    const firstReadingQuestion = (firstReadingAttempt?.questionText ?? "").trim();
    const secondReadingQuestion = firstReadingQuestion === "What color is the kite?"
      ? { question: "What does Maya take?", answer: "Raincoat" }
      : { question: "What color is the kite?", answer: "Red" };

    const secondReadingAttempt = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "reading",
        skillFocus: "comprehension",
        contentId: seeded.reading.contentId,
        assignmentId: seeded.reading.assignmentId,
        questionText: secondReadingQuestion.question,
        answerGiven: secondReadingQuestion.answer,
        correctAnswer: secondReadingQuestion.answer,
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(secondReadingAttempt.ok()).toBe(true);

    await expect.poll(async () => getAssignmentStatus(seeded.reading.assignmentId)).toBe("completed");
    const readingAttempt = await getLatestAttempt(seeded.reading.assignmentId);
    expect(readingAttempt?.contentId).toBe(seeded.reading.contentId);
    expect(readingAttempt?.correct).toBe(true);
    expect(await getAssignmentAttemptCount(seeded.reading.assignmentId)).toBeGreaterThanOrEqual(2);
  });
});
