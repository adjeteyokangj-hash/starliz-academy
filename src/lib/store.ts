import { VoiceStyle } from "@/lib/voice_options";

export type LearningLevel = "Beginner" | "Growing" | "Advanced";
export type StartLevelChoice = "Beginner" | "Intermediate" | "Confident";

export type ActivityArea = "spelling" | "math" | "reading" | "coding";

export type AdaptiveState = {
  spellingDifficulty: number;
  mathDifficulty: number;
  readingDifficulty: number;
  spellingStreak: number;
  weakAreas: ActivityArea[];
  nextBestActivity: string;
  lastVoiceMessage: string;
};

export type SubjectAbilityLevels = {
  spelling: number;
  math: number;
  reading: number;
};

export type LearnerSubjectInsight = {
  level: number;
  attempts: number;
  correct: number;
  hintsUsed: number;
  avgResponseMs: number;
  strengths: string[];
  needsSupport: string[];
  repeatedMistakes: string[];
  audioSupportNeeded: boolean;
};

export type LearnerInsights = {
  spelling: LearnerSubjectInsight;
  math: LearnerSubjectInsight;
  reading: LearnerSubjectInsight;
  updatedAt: string;
};

export type LiteracySupportState = {
  spellingCompetency: number;
  readingCompetency: number;
  oralReadingScore: number;
  mode: "balanced" | "spelling_support" | "reading_support";
  interventions?: Array<{
    ts: string;
    fromMode: "balanced" | "spelling_support" | "reading_support";
    toMode: "balanced" | "spelling_support" | "reading_support";
    reason: string;
    spellingCompetency: number;
    readingCompetency: number;
    oralReadingScore: number;
  }>;
  updatedAt: string;
};

export type MathSupportState = {
  mathCompetency: number;
  weakOperations: string[];
  mode: "standard" | "math_support";
  interventions?: Array<{
    ts: string;
    fromMode: "standard" | "math_support";
    toMode: "standard" | "math_support";
    reason: string;
    mathCompetency: number;
  }>;
  updatedAt: string;
};

// ── Subject-specific coaching style types ────────────────────────────
// Each subject uses labels that make sense for that discipline.
// Patient/Storytelling/Step-by-step → gentle pace.
// Challenge/Comprehension/Problem-solving → stretch pace.
export type SpellingCoachStyle = "patient" | "standard" | "challenge";
export type MathCoachStyle = "step-by-step" | "standard" | "problem-solving";
export type ReadingCoachStyle = "storytelling" | "standard" | "comprehension";

export type SubjectCoachingStyles = {
  spelling: SpellingCoachStyle;
  math: MathCoachStyle;
  reading: ReadingCoachStyle;
};

/** Maps a subject-specific style value to the internal tutor pace. */
export function resolveCoachingPace(
  subject: "spelling" | "math" | "reading",
  styles?: SubjectCoachingStyles,
): "gentle" | "balanced" | "stretch" {
  if (!styles) return "balanced";
  if (subject === "spelling") {
    if (styles.spelling === "patient") return "gentle";
    if (styles.spelling === "challenge") return "stretch";
    return "balanced";
  }
  if (subject === "math") {
    if (styles.math === "step-by-step") return "gentle";
    if (styles.math === "problem-solving") return "stretch";
    return "balanced";
  }
  // reading
  if (styles.reading === "storytelling") return "gentle";
  if (styles.reading === "comprehension") return "stretch";
  return "balanced";
}

export type ChildSettings = {
  voiceEnabled: boolean;
  sfxEnabled: boolean;
  volume: number;
  voiceStyle: VoiceStyle;
  /** @deprecated Use subjectCoachingStyles instead. Kept for backward compat. */
  coachingStyle?: "gentle" | "balanced" | "stretch";
  subjectCoachingStyles?: SubjectCoachingStyles;
  reduceMotion: boolean;
  largeText: boolean;
  highContrast: boolean;
};

export type SubjectTargets = {
  spelling: number;
  math: number;
  reading: number;
};

export type SubjectCounts = {
  spelling: number;
  math: number;
  reading: number;
};

export type MasteryTagStats = {
  attempts: number;
  correct: number;
};

export type SubjectMasteryTags = {
  spelling: Record<string, MasteryTagStats>;
  math: Record<string, MasteryTagStats>;
  reading: Record<string, MasteryTagStats>;
};

export type DailySubjectProgress = {
  dayKey: string;
  targets: SubjectTargets;
  completed: SubjectCounts;
  weakItems: {
    spelling: string[];
    math: string[];
    reading: string[];
  };
};

export type PetEmotion = "calm" | "happy" | "excited" | "sad";

export type LevelDecisionLog = {
  ts: string;
  subject: "spelling" | "math" | "reading";
  previousLevel: number;
  nextLevel: number;
  confidenceScore: number;
  reasons: string[];
};

export type ChildProfile = {
  id: string;
  archived?: boolean;
  name: string;
  avatar: string;
  dateOfBirth?: string | null;
  schoolYear?: string;
  keyStageLevel?: string;
  subjectLevel?: string;
  learningGoals?: string[];
  senSupportNeeds?: string;
  theme:
    | "default"
    | "rainbow"
    | "sunshine"
    | "night-sky"
    | "space"
    | "candy"
    | "princess"
    | "dinosaur"
    | "jungle"
    | "football"
    | "ocean"
    | "galaxy-pro";
  hubPins: string[];
  hubOrder: string[];
  ageRange: "5-7" | "8-10";
  yearGroup?: string;
  ageYears: number;
  startLevelChoice: StartLevelChoice;
  level: LearningLevel;
  subjectLevels: SubjectAbilityLevels;
  stars: number;
  xp: number;
  coins: number;
  weekStreak: number;
  streakShields: number;
  petStage: number;
  petEmotion: PetEmotion;
  petMoodUpdatedAt: string;
  inventory: string[];
  weeklyRewardClaimedAt: string | null;
  dailyGoal: number;
  weeklyTarget: number;
  usageLimitMinutes: number;
  usageTodayMinutes: number;
  usageDayKey: string;
  lastActiveDay: string;
  adaptive: AdaptiveState;
  learnerInsights: LearnerInsights;
  levelDecisions?: LevelDecisionLog[];
  dailySubjectProgress: DailySubjectProgress;
  masteryTags: SubjectMasteryTags;
  /** word → mistake count (increases on wrong, decreases on correct) */
  weaknessMap: Record<string, number>;
  /** spelling pattern slug → mistake count (e.g. "ough", "ph", "silent_e") */
  spellingPatterns: Record<string, number>;
  /** math topic → rolling skill score { score 0-1, attempts, correct } */
  mathSkills: Record<string, { score: number; attempts: number; correct: number }>;
  literacySupport?: LiteracySupportState;
  mathSupport?: MathSupportState;
  settings: ChildSettings;
  createdAt: string;
  /** Last page the child visited so "Continue" can resume their session */
  lastPage?: string;
};

const DEFAULT_HUB_ORDER = ["spelling", "math", "reading", "pet", "rewards", "profiles"];
const LEGACY_PROFILE_KEYS = ["starliz.profiles", "starliz.childProfiles", "childProfiles"];
const LEGACY_ACTIVE_PROFILE_KEYS = ["starliz.activeProfileId", "activeChildId", "activeProfileId"];

let profilesCache: ChildProfile[] = [];
let activeProfileIdCache: string | null = null;
let loaded = false;

function createDefaultInsight(level = 1): LearnerSubjectInsight {
  return {
    level,
    attempts: 0,
    correct: 0,
    hintsUsed: 0,
    avgResponseMs: 0,
    strengths: [],
    needsSupport: [],
    repeatedMistakes: [],
    audioSupportNeeded: false,
  };
}

function createDefaultLearnerInsights(profile?: Partial<ChildProfile>): LearnerInsights {
  return {
    spelling: profile?.learnerInsights?.spelling ?? createDefaultInsight(profile?.adaptive?.spellingDifficulty ?? 1),
    math: profile?.learnerInsights?.math ?? createDefaultInsight(profile?.adaptive?.mathDifficulty ?? 1),
    reading: profile?.learnerInsights?.reading ?? createDefaultInsight(profile?.adaptive?.readingDifficulty ?? 1),
    updatedAt: profile?.learnerInsights?.updatedAt ?? new Date().toISOString(),
  };
}

function notifyProfileChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("starliz-profile-changed"));
}

function withDefaults(profile: Partial<ChildProfile>): ChildProfile {
  const dayKey = new Date().toISOString().slice(0, 10);
  return {
    id: profile.id ?? crypto.randomUUID(),
    archived: profile.archived ?? false,
    name: profile.name ?? "",
    avatar: profile.avatar ?? "🦊",
    dateOfBirth: profile.dateOfBirth ?? null,
    schoolYear: profile.schoolYear ?? profile.yearGroup ?? "Year 1",
    keyStageLevel: profile.keyStageLevel ?? "",
    subjectLevel: profile.subjectLevel ?? "",
    learningGoals: profile.learningGoals ?? [],
    senSupportNeeds: profile.senSupportNeeds ?? "",
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
    learnerInsights: createDefaultLearnerInsights(profile),
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
    literacySupport: {
      spellingCompetency: profile.literacySupport?.spellingCompetency ?? 100,
      readingCompetency: profile.literacySupport?.readingCompetency ?? 100,
      oralReadingScore: profile.literacySupport?.oralReadingScore ?? 100,
      mode: profile.literacySupport?.mode ?? "balanced",
      interventions: profile.literacySupport?.interventions ?? [],
      updatedAt: profile.literacySupport?.updatedAt ?? new Date().toISOString(),
    },
    mathSupport: {
      mathCompetency: profile.mathSupport?.mathCompetency ?? 100,
      weakOperations: profile.mathSupport?.weakOperations ?? [],
      mode: profile.mathSupport?.mode ?? "standard",
      interventions: profile.mathSupport?.interventions ?? [],
      updatedAt: profile.mathSupport?.updatedAt ?? new Date().toISOString(),
    },
    settings: {
      voiceEnabled: profile.settings?.voiceEnabled ?? true,
      sfxEnabled: profile.settings?.sfxEnabled ?? true,
      volume: profile.settings?.volume ?? 0.9,
      voiceStyle: profile.settings?.voiceStyle ?? "friendly_coach",
      coachingStyle: profile.settings?.coachingStyle ?? "balanced",
      reduceMotion: profile.settings?.reduceMotion ?? false,
      largeText: profile.settings?.largeText ?? false,
      highContrast: profile.settings?.highContrast ?? false,
    },
    createdAt: profile.createdAt ?? new Date().toISOString(),
  };
}

function setCache(profiles: ChildProfile[], activeProfileId: string | null): void {
  profilesCache = profiles.map(withDefaults);
  activeProfileIdCache = activeProfileId ?? profilesCache[0]?.id ?? null;
  loaded = true;
  notifyProfileChange();
}

function readLegacyProfilesFromLocalStorage(): { profiles: ChildProfile[]; activeProfileId: string | null } {
  if (typeof window === "undefined") {
    return { profiles: [], activeProfileId: null };
  }

  let rawProfiles: unknown = null;
  for (const key of LEGACY_PROFILE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value) {
      rawProfiles = value;
      break;
    }
  }

  const rawActiveProfileId = LEGACY_ACTIVE_PROFILE_KEYS
    .map((key) => window.localStorage.getItem(key))
    .find((value) => Boolean(value)) ?? null;

  if (!rawProfiles) {
    return { profiles: [], activeProfileId: rawActiveProfileId };
  }

  try {
    const parsed = JSON.parse(String(rawProfiles));
    if (!Array.isArray(parsed)) {
      return { profiles: [], activeProfileId: rawActiveProfileId };
    }
    return {
      profiles: parsed.map((profile) => withDefaults(profile as Partial<ChildProfile>)),
      activeProfileId: rawActiveProfileId,
    };
  } catch {
    return { profiles: [], activeProfileId: rawActiveProfileId };
  }
}

function syncLegacyProfilesToLocalStorage(profiles: ChildProfile[], activeProfileId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(profiles);
    for (const key of LEGACY_PROFILE_KEYS) {
      window.localStorage.setItem(key, serialized);
    }
    for (const key of LEGACY_ACTIVE_PROFILE_KEYS) {
      if (activeProfileId) {
        window.localStorage.setItem(key, activeProfileId);
      } else {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore localStorage write failures.
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function hydrateProfilesFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  const payload = await fetchJson<{ children: ChildProfile[]; activeChildId: string | null }>("/api/children");
  if (!payload) {
    setCache([], null);
    return;
  }

  const dbProfiles = payload.children.map(withDefaults);
  const legacy = readLegacyProfilesFromLocalStorage();

  if (dbProfiles.length > 0) {
    setCache(dbProfiles, payload.activeChildId);
    syncLegacyProfilesToLocalStorage(dbProfiles, payload.activeChildId);
    return;
  }

  if (!legacy.profiles.length) {
    setCache([], payload.activeChildId);
    syncLegacyProfilesToLocalStorage([], payload.activeChildId);
    return;
  }

  const mergedById = new Map<string, ChildProfile>();
  for (const profile of legacy.profiles) {
    mergedById.set(profile.id, withDefaults(profile));
  }
  const mergedProfiles = [...mergedById.values()];
  const mergedActiveChildId = payload.activeChildId ?? legacy.activeProfileId ?? mergedProfiles[0]?.id ?? null;

  setCache(mergedProfiles, mergedActiveChildId);

  // Backfill legacy local-only children into the server, then rehydrate from DB.
  await Promise.all(
    mergedProfiles.map((profile) =>
      fetchJson("/api/children", {
        method: "POST",
        body: JSON.stringify(profile),
      }),
    ),
  );

  const refreshed = await fetchJson<{ children: ChildProfile[]; activeChildId: string | null }>("/api/children");
  const finalProfiles = refreshed?.children?.map(withDefaults) ?? mergedProfiles;
  const finalActiveChildId = refreshed?.activeChildId ?? mergedActiveChildId;
  setCache(finalProfiles, finalActiveChildId);
  syncLegacyProfilesToLocalStorage(finalProfiles, finalActiveChildId);
}

export async function hydrateActiveProfileFromServer(): Promise<ChildProfile | null> {
  if (typeof window === "undefined") return null;
  const payload = await fetchJson<{ child: ChildProfile | null }>("/api/children/active");
  if (!payload?.child) return null;
  const normalized = withDefaults(payload.child);
  const nextProfiles = profilesCache.some((profile) => profile.id === normalized.id)
    ? profilesCache.map((profile) => (profile.id === normalized.id ? normalized : profile))
    : [...profilesCache, normalized];
  setCache(nextProfiles, normalized.id);
  syncLegacyProfilesToLocalStorage(nextProfiles, normalized.id);
  return normalized;
}

export function isProfileStoreReady(): boolean {
  return loaded;
}

export function getProfiles(): ChildProfile[] {
  return profilesCache;
}

export function getActiveProfileId(): string | null {
  return activeProfileIdCache;
}

export function setActiveProfileId(profileId: string): void {
  activeProfileIdCache = profileId;
  notifyProfileChange();
  void fetchJson("/api/children/active", {
    method: "POST",
    body: JSON.stringify({ childId: profileId }),
  });
}

export function saveProfiles(profiles: ChildProfile[]): void {
  profilesCache = profiles.map(withDefaults);
  if (profilesCache.length && !profilesCache.find((profile) => profile.id === activeProfileIdCache)) {
    activeProfileIdCache = profilesCache[0].id;
  }
  notifyProfileChange();
}

export function addProfile(profile: ChildProfile): void {
  const normalized = withDefaults(profile);
  profilesCache = [...profilesCache, normalized];
  activeProfileIdCache = normalized.id;
  notifyProfileChange();
  void fetchJson("/api/children", {
    method: "POST",
    body: JSON.stringify(normalized),
  });
}

export function getProfile(): ChildProfile | null {
  if (!profilesCache.length) return null;
  if (!activeProfileIdCache) {
    activeProfileIdCache = profilesCache[0].id;
    return profilesCache[0];
  }
  return profilesCache.find((profile) => profile.id === activeProfileIdCache) ?? profilesCache[0] ?? null;
}

export function saveLastPage(page: string): void {
  const profile = getProfile();
  if (!profile) return;
  const updated = { ...profile, lastPage: page };
  const index = profilesCache.findIndex((p) => p.id === updated.id);
  if (index >= 0) profilesCache[index] = updated;
  syncLegacyProfilesToLocalStorage(profilesCache, activeProfileIdCache);
}

export function saveProfile(data: ChildProfile): void {
  const normalized = withDefaults(data);
  const index = profilesCache.findIndex((profile) => profile.id === normalized.id);
  const isNew = index < 0;
  if (index >= 0) {
    profilesCache[index] = normalized;
  } else {
    profilesCache.push(normalized);
  }
  activeProfileIdCache = normalized.id;
  notifyProfileChange();
  if (isNew) {
    void fetchJson("/api/children", {
      method: "POST",
      body: JSON.stringify(normalized),
    });
  } else {
    void fetchJson(`/api/children/${normalized.id}`, {
      method: "PUT",
      body: JSON.stringify(normalized),
    });
  }
}

export function clearProfile(): void {
  profilesCache = [];
  activeProfileIdCache = null;
  loaded = false;
  notifyProfileChange();
}
