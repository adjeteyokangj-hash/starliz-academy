import { ChildProfile as PrismaChildProfile } from "@prisma/client";
import { ChildProfile } from "@/lib/store";
import { levelFromXp } from "@/lib/level_system";

const DEFAULT_HUB_ORDER = ["spelling", "math", "reading", "pet", "rewards", "profiles"];

function normalizeAgeRange(yearGroup: string | null | undefined): "5-7" | "8-10" {
  const lower = (yearGroup ?? "").toLowerCase();
  if (lower.includes("8-10")) return "8-10";
  if (lower.includes("5-7")) return "5-7";
  if (lower.includes("year 4") || lower.includes("year 5")) return "8-10";
  return "5-7";
}

export function withChildDefaults(profile: Partial<ChildProfile>): ChildProfile {
  const dayKey = new Date().toISOString().slice(0, 10);
  return {
    id: profile.id ?? crypto.randomUUID(),
    name: profile.name ?? "",
    avatar: profile.avatar ?? "🦊",
    theme: profile.theme ?? "default",
    hubPins: profile.hubPins ?? ["spelling"],
    hubOrder: profile.hubOrder ?? DEFAULT_HUB_ORDER,
    ageRange: profile.ageRange ?? "5-7",
    yearGroup: profile.yearGroup ?? "Year 1",
    ageYears: profile.ageYears ?? 6,
    startLevelChoice: profile.startLevelChoice ?? "Beginner",
    level: profile.level ?? "Beginner",
    subjectLevels: {
      spelling: profile.subjectLevels?.spelling ?? profile.adaptive?.spellingDifficulty ?? 1,
      math: profile.subjectLevels?.math ?? profile.adaptive?.mathDifficulty ?? 1,
      reading: profile.subjectLevels?.reading ?? profile.adaptive?.readingDifficulty ?? 1,
    },
    stars: profile.stars ?? 0,
    xp: profile.xp ?? 0,
    coins: profile.coins ?? 0,
    weekStreak: profile.weekStreak ?? 1,
    streakShields: profile.streakShields ?? 1,
    petStage: profile.petStage ?? 1,
    petEmotion: profile.petEmotion ?? "calm",
    petMoodUpdatedAt: profile.petMoodUpdatedAt ?? new Date().toISOString(),
    inventory: profile.inventory ?? [],
    weeklyRewardClaimedAt: profile.weeklyRewardClaimedAt ?? null,
    dailyGoal: profile.dailyGoal ?? 3,
    weeklyTarget: profile.weeklyTarget ?? 18,
    usageLimitMinutes: profile.usageLimitMinutes ?? 45,
    usageTodayMinutes: profile.usageTodayMinutes ?? 0,
    usageDayKey: profile.usageDayKey ?? new Date().toISOString().slice(0, 10),
    lastActiveDay: profile.lastActiveDay ?? new Date().toISOString().slice(0, 10),
    adaptive: {
      spellingDifficulty: profile.adaptive?.spellingDifficulty ?? 1,
      mathDifficulty: profile.adaptive?.mathDifficulty ?? 1,
      readingDifficulty: profile.adaptive?.readingDifficulty ?? 1,
      spellingStreak: profile.adaptive?.spellingStreak ?? 0,
      weakAreas: profile.adaptive?.weakAreas ?? [],
      nextBestActivity: profile.adaptive?.nextBestActivity ?? "Spelling Quest",
      lastVoiceMessage: profile.adaptive?.lastVoiceMessage ?? "You are doing great!",
    },
    learnerInsights: {
      spelling: {
        level: profile.learnerInsights?.spelling?.level ?? profile.adaptive?.spellingDifficulty ?? 1,
        attempts: profile.learnerInsights?.spelling?.attempts ?? 0,
        correct: profile.learnerInsights?.spelling?.correct ?? 0,
        hintsUsed: profile.learnerInsights?.spelling?.hintsUsed ?? 0,
        avgResponseMs: profile.learnerInsights?.spelling?.avgResponseMs ?? 0,
        strengths: profile.learnerInsights?.spelling?.strengths ?? [],
        needsSupport: profile.learnerInsights?.spelling?.needsSupport ?? [],
        repeatedMistakes: profile.learnerInsights?.spelling?.repeatedMistakes ?? [],
        audioSupportNeeded: profile.learnerInsights?.spelling?.audioSupportNeeded ?? false,
      },
      math: {
        level: profile.learnerInsights?.math?.level ?? profile.adaptive?.mathDifficulty ?? 1,
        attempts: profile.learnerInsights?.math?.attempts ?? 0,
        correct: profile.learnerInsights?.math?.correct ?? 0,
        hintsUsed: profile.learnerInsights?.math?.hintsUsed ?? 0,
        avgResponseMs: profile.learnerInsights?.math?.avgResponseMs ?? 0,
        strengths: profile.learnerInsights?.math?.strengths ?? [],
        needsSupport: profile.learnerInsights?.math?.needsSupport ?? [],
        repeatedMistakes: profile.learnerInsights?.math?.repeatedMistakes ?? [],
        audioSupportNeeded: profile.learnerInsights?.math?.audioSupportNeeded ?? false,
      },
      reading: {
        level: profile.learnerInsights?.reading?.level ?? profile.adaptive?.readingDifficulty ?? 1,
        attempts: profile.learnerInsights?.reading?.attempts ?? 0,
        correct: profile.learnerInsights?.reading?.correct ?? 0,
        hintsUsed: profile.learnerInsights?.reading?.hintsUsed ?? 0,
        avgResponseMs: profile.learnerInsights?.reading?.avgResponseMs ?? 0,
        strengths: profile.learnerInsights?.reading?.strengths ?? [],
        needsSupport: profile.learnerInsights?.reading?.needsSupport ?? [],
        repeatedMistakes: profile.learnerInsights?.reading?.repeatedMistakes ?? [],
        audioSupportNeeded: profile.learnerInsights?.reading?.audioSupportNeeded ?? false,
      },
      updatedAt: profile.learnerInsights?.updatedAt ?? new Date().toISOString(),
    },
    levelDecisions: profile.levelDecisions ?? [],
    dailySubjectProgress: {
      dayKey: profile.dailySubjectProgress?.dayKey ?? dayKey,
      targets: {
        spelling: profile.dailySubjectProgress?.targets?.spelling ?? 15,
        math: profile.dailySubjectProgress?.targets?.math ?? 10,
        reading: profile.dailySubjectProgress?.targets?.reading ?? 5,
      },
      completed: {
        spelling: profile.dailySubjectProgress?.completed?.spelling ?? 0,
        math: profile.dailySubjectProgress?.completed?.math ?? 0,
        reading: profile.dailySubjectProgress?.completed?.reading ?? 0,
      },
      weakItems: {
        spelling: profile.dailySubjectProgress?.weakItems?.spelling ?? [],
        math: profile.dailySubjectProgress?.weakItems?.math ?? [],
        reading: profile.dailySubjectProgress?.weakItems?.reading ?? [],
      },
    },
    masteryTags: {
      spelling: profile.masteryTags?.spelling ?? {},
      math: profile.masteryTags?.math ?? {},
      reading: profile.masteryTags?.reading ?? {},
    },
    weaknessMap: profile.weaknessMap ?? {},
    spellingPatterns: profile.spellingPatterns ?? {},
    mathSkills: profile.mathSkills ?? {},
    settings: {
      voiceEnabled: profile.settings?.voiceEnabled ?? true,
      sfxEnabled: profile.settings?.sfxEnabled ?? true,
      volume: profile.settings?.volume ?? 0.9,
      voiceStyle: profile.settings?.voiceStyle ?? "friendly_coach",
      coachingStyle: profile.settings?.coachingStyle ?? "balanced",
      subjectCoachingStyles: profile.settings?.subjectCoachingStyles ?? {
        spelling: "standard",
        math: "standard",
        reading: "standard",
      },
      reduceMotion: profile.settings?.reduceMotion ?? false,
      largeText: profile.settings?.largeText ?? false,
      highContrast: profile.settings?.highContrast ?? false,
    },
    createdAt: profile.createdAt ?? new Date().toISOString(),
  };
}

export function toDbUpdateInput(profile: ChildProfile) {
  return {
    name: profile.name,
    avatar: profile.avatar,
    yearGroup: profile.yearGroup ?? profile.ageRange,
    stars: profile.stars,
    xp: profile.xp,
    coins: profile.coins,
    level: levelFromXp(profile.xp),
    streak: profile.weekStreak,
    selectedVoice: profile.settings.voiceStyle,
    selectedTheme: profile.theme,
    snapshotJson: JSON.stringify(profile),
    archived: false,
  };
}

export function fromDbRecord(row: PrismaChildProfile): ChildProfile {
  if (row.snapshotJson) {
    try {
      const parsed = JSON.parse(row.snapshotJson) as Partial<ChildProfile>;
      return withChildDefaults({
        ...parsed,
        id: row.id,
        archived: row.archived,
        name: row.name,
        avatar: row.avatar ?? parsed.avatar,
        ageRange: parsed.ageRange ?? normalizeAgeRange(row.yearGroup),
        yearGroup: row.yearGroup ?? parsed.yearGroup,
        stars: row.stars,
        xp: row.xp,
        coins: row.coins,
        weekStreak: row.streak,
        theme: (row.selectedTheme as ChildProfile["theme"] | null) ?? parsed.theme,
        settings: {
          voiceEnabled: parsed.settings?.voiceEnabled ?? true,
          sfxEnabled: parsed.settings?.sfxEnabled ?? true,
          volume: parsed.settings?.volume ?? 0.9,
          voiceStyle: row.selectedVoice as ChildProfile["settings"]["voiceStyle"],
          coachingStyle: parsed.settings?.coachingStyle ?? "balanced",
          subjectCoachingStyles: parsed.settings?.subjectCoachingStyles ?? {
            spelling: "standard",
            math: "standard",
            reading: "standard",
          },
          reduceMotion: parsed.settings?.reduceMotion ?? false,
          largeText: parsed.settings?.largeText ?? false,
          highContrast: parsed.settings?.highContrast ?? false,
        },
      });
    } catch {
      // Fallback handled below.
    }
  }

  return withChildDefaults({
    id: row.id,
    archived: row.archived,
    name: row.name,
    avatar: row.avatar ?? "🦊",
    ageRange: normalizeAgeRange(row.yearGroup),
    yearGroup: row.yearGroup ?? "Year 1",
    ageYears: 6,
    startLevelChoice: "Beginner",
    stars: row.stars,
    xp: row.xp,
    coins: row.coins,
    weekStreak: row.streak,
    theme: (row.selectedTheme as ChildProfile["theme"] | null) ?? "default",
    weaknessMap: {},
    spellingPatterns: {},
    mathSkills: {},
    settings: {
      voiceEnabled: true,
      sfxEnabled: true,
      volume: 0.9,
      voiceStyle: row.selectedVoice as ChildProfile["settings"]["voiceStyle"],
      coachingStyle: "balanced",
      subjectCoachingStyles: { spelling: "standard", math: "standard", reading: "standard" },
      reduceMotion: false,
      largeText: false,
      highContrast: false,
    },
  });
}
