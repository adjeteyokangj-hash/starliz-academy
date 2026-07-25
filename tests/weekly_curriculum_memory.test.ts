import assert from "node:assert/strict";
import test from "node:test";

import {
  computeWeekDiversitySummary,
  extractUsedFromStagePack,
  formatWeeklyMemoryForPrompt,
  mergeWeeklyUsed,
  packBelongsToWeek,
  passageFingerprint,
  resolveWeekStartIso,
  resolveWeeklyReviewPolicy,
  shouldIncludePeriodInWeeklyMemory,
  stampWeeklyMetadata,
  structureFingerprint,
  validateAgainstWeeklyMemory,
  type WeeklyCurriculumMemory,
} from "../src/lib/schools/weekly-curriculum-memory";

function memoryWith(used: Partial<WeeklyCurriculumMemory["used"]>): WeeklyCurriculumMemory {
  return {
    weekStart: "2026-07-20",
    schoolId: "school_1",
    classroomId: "class_1",
    subject: "English",
    yearGroup: "Year 5",
    used: {
      passageTitles: [],
      passageFingerprints: [],
      vocabulary: [],
      spellingWords: [],
      questionFingerprints: [],
      workedExampleFingerprints: [],
      scenarioFingerprints: [],
      activityKinds: [],
      topicLabels: [],
      sourceLabels: ["Monday English · Guided reading"],
      ...used,
    },
  };
}

test("resolveWeekStartIso uses Monday of school-local week", () => {
  // Wednesday 22 Jul 2026 12:00 UTC ≈ afternoon London
  const weekStart = resolveWeekStartIso({
    now: new Date("2026-07-22T12:00:00.000Z"),
    timezone: "Europe/London",
  });
  assert.equal(weekStart, "2026-07-20");
});

test("resolveWeeklyReviewPolicy detects intentional review patterns", () => {
  assert.equal(
    resolveWeeklyReviewPolicy({ lessonTitle: "Maths — Weekly challenge", skillFocus: "Mixed fluency" }).allowWeeklyReview,
    true,
  );
  assert.equal(
    resolveWeeklyReviewPolicy({ lessonTitle: "Maths — Place value", skillFocus: "Place value" }).allowWeeklyReview,
    false,
  );
  assert.equal(
    resolveWeeklyReviewPolicy({ allowWeeklyReview: true, reviewReason: "teacher" }).reviewReason,
    "teacher",
  );
});

test("extractUsedFromStagePack captures guided reading fields", () => {
  const used = extractUsedFromStagePack({
    mode: "guided-reading",
    sourceLabel: "Monday English",
    pack: {
      subjectType: "guided-reading",
      title: "Secret Garden",
      estimatedMinutes: 20,
      targetItems: 4,
      activities: [{ kind: "read-passage", estimatedMinutes: 8 }, { kind: "short-answer", estimatedMinutes: 6 }, { kind: "reasoning", estimatedMinutes: 6 }],
      questions: [{
        prompt: "Why does Mary feel lonely in the house?",
        question: "Why does Mary feel lonely in the house?",
        answer: "She has no friends yet",
        explanation: "Evidence from the text",
        hints: ["Look at paragraph 2"],
      }],
      passage: {
        title: "The Secret Garden",
        text: "Mary Lennox walked through the misty Yorkshire gardens and found a hidden key near the ivy wall.",
        paragraphs: ["Mary Lennox walked through the misty Yorkshire gardens and found a hidden key near the ivy wall."],
        wordCount: 18,
      },
      vocabulary: [
        { word: "misty", childFriendlyMeaning: "full of soft fog" },
        { word: "ivy", childFriendlyMeaning: "a climbing plant" },
      ],
    },
  });
  assert.ok(used.passageTitles.includes("The Secret Garden"));
  assert.ok(used.passageFingerprints.length >= 1);
  assert.ok(used.vocabulary.includes("misty"));
  assert.ok(used.questionFingerprints.length >= 1);
  assert.ok(used.activityKinds.includes("seq:read-passage>short-answer>reasoning"));
  assert.deepEqual(used.sourceLabels, ["Monday English"]);
});

test("identical and near-identical passages are rejected", () => {
  const original = "Mary found a hidden garden behind the ivy wall and listened to birds singing.";
  const renamed = "Sarah found a secret garden behind the ivy wall and listened to birds singing.";
  const memory = memoryWith({
    passageTitles: ["The Secret Garden"],
    passageFingerprints: [passageFingerprint("The Secret Garden", original)],
  });

  const identical = validateAgainstWeeklyMemory({
    mode: "guided-reading",
    memory,
    pack: {
      subjectType: "guided-reading",
      title: "Reading",
      estimatedMinutes: 20,
      targetItems: 1,
      activities: [],
      questions: [],
      passage: {
        title: "The Secret Garden",
        text: original,
        paragraphs: [original],
        wordCount: 14,
      },
    },
  });
  assert.ok(identical.some((issue) => issue.code === "weekly_duplicate_passage"));

  const near = validateAgainstWeeklyMemory({
    mode: "guided-reading",
    memory,
    pack: {
      subjectType: "guided-reading",
      title: "Reading",
      estimatedMinutes: 20,
      targetItems: 1,
      activities: [],
      questions: [],
      passage: {
        title: "A Hidden Place",
        text: renamed,
        paragraphs: [renamed],
        wordCount: 14,
      },
    },
  });
  assert.ok(near.some((issue) => issue.code === "weekly_duplicate_passage"));

  const different = validateAgainstWeeklyMemory({
    mode: "guided-reading",
    memory,
    pack: {
      subjectType: "guided-reading",
      title: "Reading",
      estimatedMinutes: 20,
      targetItems: 1,
      activities: [],
      questions: [],
      passage: {
        title: "River Rescue",
        text: "Omar and his sister built a small raft from fallen branches to cross the swollen brook after heavy rain.",
        paragraphs: ["Omar and his sister built a small raft from fallen branches to cross the swollen brook after heavy rain."],
        wordCount: 20,
      },
      vocabulary: [
        { word: "raft", childFriendlyMeaning: "a flat boat" },
        { word: "swollen", childFriendlyMeaning: "much bigger than usual" },
        { word: "brook", childFriendlyMeaning: "a small stream" },
      ],
    },
  });
  assert.equal(different.length, 0);
});

test("repeated vocabulary overlap is detected", () => {
  const memory = memoryWith({
    vocabulary: ["misty", "ivy", "manor", "lonely", "key"],
  });
  const issues = validateAgainstWeeklyMemory({
    mode: "guided-reading",
    memory,
    pack: {
      subjectType: "guided-reading",
      title: "Reading",
      estimatedMinutes: 20,
      targetItems: 1,
      activities: [],
      questions: [],
      vocabulary: [
        { word: "misty", childFriendlyMeaning: "foggy" },
        { word: "ivy", childFriendlyMeaning: "plant" },
        { word: "manor", childFriendlyMeaning: "house" },
        { word: "lonely", childFriendlyMeaning: "alone" },
      ],
    },
  });
  assert.ok(issues.some((issue) => issue.code === "weekly_duplicate_vocabulary"));
});

test("maths same structure with different numbers is rejected", () => {
  const stem = structureFingerprint("There are 24 sweets shared equally between 6 children. How many each?");
  const mathsMemory = memoryWith({
    workedExampleFingerprints: [stem],
    questionFingerprints: [`struct:${stem}`],
    sourceLabels: ["Monday Maths · Place value"],
  });

  const issues = validateAgainstWeeklyMemory({
    mode: "maths",
    memory: mathsMemory,
    pack: {
      subjectType: "maths",
      title: "Maths",
      estimatedMinutes: 20,
      targetItems: 2,
      activities: [{ kind: "worked-example", estimatedMinutes: 5 }],
      questions: [{
        prompt: "There are 36 sweets shared equally between 9 children. How many each?",
        question: "There are 36 sweets shared equally between 9 children. How many each?",
        answer: 4,
        explanation: "Divide",
        hints: ["Share equally"],
      }],
      workedExamples: [{
        question: "There are 36 sweets shared equally between 9 children. How many each?",
        steps: ["36 ÷ 9", "4"],
        answer: "4",
      }],
    },
  });
  assert.ok(
    issues.some((issue) =>
      issue.code === "weekly_duplicate_worked_example" || issue.code === "weekly_duplicate_question"
    ),
  );

  const different = validateAgainstWeeklyMemory({
    mode: "maths",
    memory: mathsMemory,
    pack: {
      subjectType: "maths",
      title: "Maths",
      estimatedMinutes: 20,
      targetItems: 1,
      activities: [{ kind: "reasoning", estimatedMinutes: 8 }],
      questions: [{
        prompt: "Explain why 407 is greater than 470 when comparing hundreds incorrectly — what mistake was made?",
        question: "Explain why 407 is greater than 470 when comparing hundreds incorrectly — what mistake was made?",
        answer: "Compared tens instead of hundreds",
        explanation: "Place value error",
        hints: ["Look at hundreds"],
      }],
      workedExamples: [{
        question: "Compare 3,405 and 3,450 using a place-value chart. Which is larger and why?",
        steps: ["Align places", "Compare tens"],
        answer: "3,450",
      }],
    },
  });
  assert.equal(different.length, 0);
});

test("spelling target words and review policy", () => {
  const memory = memoryWith({
    spellingWords: ["ai", "rain", "train", "paint", "wait", "sail"],
  });
  const sameWords = validateAgainstWeeklyMemory({
    mode: "spelling",
    memory,
    pack: {
      subjectType: "spelling",
      title: "Spelling",
      estimatedMinutes: 20,
      targetItems: 4,
      activities: [],
      questions: [],
      targetWords: ["rain", "train", "paint", "wait", "sail", "plain"],
    },
  });
  assert.ok(sameWords.some((issue) => issue.code === "weekly_duplicate_vocabulary"));

  const reviewAllowed = validateAgainstWeeklyMemory({
    mode: "spelling",
    memory,
    policy: { allowWeeklyReview: true, reviewReason: "consolidation" },
    pack: {
      subjectType: "spelling",
      title: "Spelling",
      estimatedMinutes: 20,
      targetItems: 4,
      activities: [],
      questions: [],
      // High overlap but not an exact copy of the full prior set.
      targetWords: ["rain", "train", "paint", "cloud", "storm"],
    },
  });
  // Review mode allows consolidation overlap that is not an exact copy.
  assert.equal(reviewAllowed.length, 0);

  const exactCopyBlocked = validateAgainstWeeklyMemory({
    mode: "spelling",
    memory,
    policy: { allowWeeklyReview: true, reviewReason: "consolidation" },
    pack: {
      subjectType: "spelling",
      title: "Spelling",
      estimatedMinutes: 20,
      targetItems: 4,
      activities: [],
      questions: [],
      targetWords: ["ai", "rain", "train", "paint", "wait", "sail"],
    },
  });
  assert.ok(exactCopyBlocked.some((issue) => issue.code === "weekly_duplicate_vocabulary"));
});

test("science repeated scenario rejected; different topic accepted", () => {
  const scenario = structureFingerprint(
    "Observe ice melting on a tray and record how long it takes in sunlight versus shade.",
  );
  const memory = memoryWith({
    scenarioFingerprints: [scenario],
    topicLabels: ["Changing states"],
  });
  const repeat = validateAgainstWeeklyMemory({
    mode: "science",
    memory,
    pack: {
      subjectType: "science",
      title: "Science",
      estimatedMinutes: 20,
      targetItems: 2,
      activities: [],
      questions: [],
      scenarioOrObservation: "Observe ice melting on a tray and record how long it takes in sunlight versus shade.",
    },
  });
  assert.ok(repeat.some((issue) => issue.code === "weekly_duplicate_scenario"));

  const different = validateAgainstWeeklyMemory({
    mode: "science",
    memory,
    pack: {
      subjectType: "science",
      title: "Science",
      estimatedMinutes: 20,
      targetItems: 2,
      activities: [],
      questions: [{
        prompt: "Name one variable to keep the same in a fair test of plant growth.",
        question: "Name one variable to keep the same in a fair test of plant growth.",
        answer: "Amount of water",
        explanation: "Control variable",
        hints: ["Fair test"],
      }],
      scenarioOrObservation: "Compare bean seedlings grown with and without light over five school days.",
      learningObjective: "Plant growth",
    },
  });
  assert.equal(different.length, 0);
});

test("prompt formatter is bounded and omits raw fingerprint hashes", () => {
  const memory = memoryWith({
    passageTitles: ["The Secret Garden", "River Rescue"],
    vocabulary: Array.from({ length: 30 }, (_, i) => `word${i}`),
    questionFingerprints: [
      "struct:why does the character feel lonely in the house",
      "abc123rawfingerprintshouldnothappen",
    ],
    workedExampleFingerprints: ["there are # sweets shared equally between # children"],
  });
  const prompt = formatWeeklyMemoryForPrompt(memory);
  assert.match(prompt, /Content already used this week/);
  assert.match(prompt, /Passage titles/);
  assert.match(prompt, /Generate materially different content/);
  assert.doesNotMatch(prompt, /abc123rawfingerprintshouldnothappen/);
  assert.ok(prompt.length < 2500);
});

test("metadata stamp is additive and week diversity hides fingerprints", () => {
  const stamped = stampWeeklyMetadata(
    { source: "daytime_school_timetable", title: "Maths · Core" },
    {
      weekStart: "2026-07-20",
      schoolId: "school_1",
      classroomId: "class_1",
      dayOfWeek: 2,
      weeklySequenceIndex: 2,
      allowWeeklyReview: false,
      weekDiversity: {
        weekStart: "2026-07-20",
        passage: "New",
        vocabularyOverlap: "Low",
        questionOverlap: "Low",
        workedExamples: "New",
        scenarios: "New",
        blocked: false,
        blockedReason: null,
        comparedAgainst: ["Monday Maths"],
      },
    },
  );
  assert.equal(stamped.source, "daytime_school_timetable");
  assert.equal(stamped.weekStart, "2026-07-20");
  assert.equal(stamped.classroomId, "class_1");
  assert.equal(stamped.weeklyMemoryVersion, 1);
  const diversity = stamped.weekDiversity as { passage: string; blocked: boolean };
  assert.equal(diversity.passage, "New");
  assert.equal(diversity.blocked, false);
  assert.equal("passageFingerprints" in stamped, false);
});

test("week diversity summary surfaces blocked reason without fingerprints", () => {
  const summary = computeWeekDiversitySummary({
    memory: memoryWith({
      passageFingerprints: [passageFingerprint("A", "same text about a garden key")],
      sourceLabels: ["Tuesday English · Guided reading"],
    }),
    packs: [{
      subjectType: "guided-reading",
      title: "x",
      estimatedMinutes: 10,
      targetItems: 1,
      activities: [],
      questions: [],
      passage: {
        title: "A",
        text: "same text about a garden key",
        paragraphs: ["same text about a garden key"],
        wordCount: 6,
      },
    }],
    issues: [{
      code: "weekly_duplicate_passage",
      message: "Too similar to Tuesday’s Guided Reading core stage",
    }],
  });
  assert.equal(summary.blocked, true);
  assert.match(summary.blockedReason ?? "", /Weekly repetition detected/);
  assert.doesNotMatch(JSON.stringify(summary), /passageFingerprints/);
});

test("memory loading filters: class/subject/week/current lesson", () => {
  assert.equal(shouldIncludePeriodInWeeklyMemory({
    periodSubject: "English",
    targetSubject: "English",
    periodYearGroup: "Year 5",
    targetYearGroup: "Year 5",
    periodClassroomId: "class_a",
    targetClassroomId: "class_a",
  }), true);

  assert.equal(shouldIncludePeriodInWeeklyMemory({
    periodSubject: "English",
    targetSubject: "English",
    periodClassroomId: "class_b",
    targetClassroomId: "class_a",
  }), false);

  assert.equal(shouldIncludePeriodInWeeklyMemory({
    periodSubject: "Maths",
    targetSubject: "English",
    periodClassroomId: "class_a",
    targetClassroomId: "class_a",
  }), false);

  assert.equal(shouldIncludePeriodInWeeklyMemory({
    periodSubject: "English",
    targetSubject: "English",
    periodClassroomId: "class_a",
    targetClassroomId: "class_a",
    periodLessonId: "lesson_current",
    excludeLessonId: "lesson_current",
  }), false);

  assert.equal(packBelongsToWeek({
    meta: { weekStart: "2026-07-20" },
    createdAt: new Date("2026-07-22T10:00:00.000Z"),
    weekStart: "2026-07-20",
    timezone: "Europe/London",
  }), true);

  assert.equal(packBelongsToWeek({
    meta: { weekStart: "2026-07-13" },
    createdAt: new Date("2026-07-22T10:00:00.000Z"),
    weekStart: "2026-07-20",
    timezone: "Europe/London",
  }), false);

  assert.equal(packBelongsToWeek({
    meta: null,
    createdAt: new Date("2026-07-14T10:00:00.000Z"),
    weekStart: "2026-07-20",
    timezone: "Europe/London",
  }), false);
});

test("mergeWeeklyUsed bounds collections", () => {
  const merged = mergeWeeklyUsed([
    extractUsedFromStagePack({
      pack: {
        subjectType: "spelling",
        title: "a",
        estimatedMinutes: 10,
        targetItems: 1,
        activities: [],
        questions: [],
        targetWords: Array.from({ length: 80 }, (_, i) => `word${i}`),
      },
    }),
  ]);
  assert.ok(merged.spellingWords.length <= 40);
});
