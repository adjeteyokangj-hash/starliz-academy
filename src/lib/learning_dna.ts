type SubjectKey = "spelling" | "math" | "reading";

type ModalityScores = {
  visual: number;
  verbal: number;
  interactive: number;
  repetition: number;
  logic: number;
};

type PaceScores = {
  slow: number;
  balanced: number;
  challenge: number;
};

type SubjectState = {
  attempts: number;
  correct: number;
  accuracy: number;
  avgResponseMs: number;
  avgHintsUsed: number;
  confidenceEma: number;
};

export type LearningDnaSnapshot = {
  version: number;
  updatedAt: string;
  totalAttempts: number;
  correctAttempts: number;
  confidenceEma: number;
  frustrationEma: number;
  independenceEma: number;
  focusEma: number;
  guessingRiskEma: number;
  modalityScores: ModalityScores;
  paceScores: PaceScores;
  recurringMistakes: Record<string, number>;
  subjectStates: Record<SubjectKey, SubjectState>;
  tutorPersona: {
    pace: "slow" | "balanced" | "challenge";
    style: "visual_scaffold" | "guided_reasoning" | "interactive_questioning" | "pattern_practice";
    tone: "calm" | "encouraging" | "stretch";
  };
  recommendations: string[];
};

export type LearningDnaAttemptSignal = {
  subject: SubjectKey;
  skillFocus: string;
  correct: boolean;
  responseTimeMs: number;
  hintsUsed: number;
  difficulty: number;
  errorType?: string;
};

export type LearningDnaCoachDirective = {
  confidenceScore: number;
  pace: "slow" | "balanced" | "challenge";
  style: "visual_scaffold" | "guided_reasoning" | "interactive_questioning" | "pattern_practice";
  tone: "calm" | "encouraging" | "stretch";
  summary: string;
  reinforcementTip: string;
  priorityWeakSkills: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ema(previous: number, observation: number, alpha = 0.18): number {
  return clamp(previous + alpha * (observation - previous), 0, 1);
}

function defaultSubjectState(): SubjectState {
  return {
    attempts: 0,
    correct: 0,
    accuracy: 0,
    avgResponseMs: 0,
    avgHintsUsed: 0,
    confidenceEma: 0.5,
  };
}

function defaultSnapshot(): LearningDnaSnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    totalAttempts: 0,
    correctAttempts: 0,
    confidenceEma: 0.5,
    frustrationEma: 0.2,
    independenceEma: 0.5,
    focusEma: 0.5,
    guessingRiskEma: 0.2,
    modalityScores: {
      visual: 1,
      verbal: 1,
      interactive: 1,
      repetition: 1,
      logic: 1,
    },
    paceScores: {
      slow: 1,
      balanced: 1,
      challenge: 1,
    },
    recurringMistakes: {},
    subjectStates: {
      spelling: defaultSubjectState(),
      math: defaultSubjectState(),
      reading: defaultSubjectState(),
    },
    tutorPersona: {
      pace: "balanced",
      style: "guided_reasoning",
      tone: "encouraging",
    },
    recommendations: [],
  };
}

function parseProfileObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed JSON and reset safely.
  }
  return {};
}

function parseSnapshot(value: unknown): LearningDnaSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultSnapshot();
  }

  const v = value as Record<string, unknown>;
  const base = defaultSnapshot();
  const totalAttempts = Number(v.totalAttempts);
  const correctAttempts = Number(v.correctAttempts);

  const subjectStatesRaw = v.subjectStates && typeof v.subjectStates === "object"
    ? (v.subjectStates as Record<string, unknown>)
    : {};

  const getSubjectState = (subject: SubjectKey): SubjectState => {
    const raw = subjectStatesRaw[subject];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base.subjectStates[subject];
    const row = raw as Record<string, unknown>;
    const attempts = Number(row.attempts);
    const correct = Number(row.correct);
    const avgResponseMs = Number(row.avgResponseMs);
    const avgHintsUsed = Number(row.avgHintsUsed);
    const confidenceEma = Number(row.confidenceEma);
    return {
      attempts: Number.isFinite(attempts) && attempts >= 0 ? attempts : 0,
      correct: Number.isFinite(correct) && correct >= 0 ? correct : 0,
      accuracy: Number.isFinite(attempts) && attempts > 0 && Number.isFinite(correct)
        ? Math.round((correct / attempts) * 100)
        : 0,
      avgResponseMs: Number.isFinite(avgResponseMs) && avgResponseMs >= 0 ? avgResponseMs : 0,
      avgHintsUsed: Number.isFinite(avgHintsUsed) && avgHintsUsed >= 0 ? avgHintsUsed : 0,
      confidenceEma: Number.isFinite(confidenceEma) ? clamp(confidenceEma, 0, 1) : 0.5,
    };
  };

  const snapshot: LearningDnaSnapshot = {
    ...base,
    version: Number(v.version) || 1,
    updatedAt: typeof v.updatedAt === "string" && v.updatedAt ? v.updatedAt : base.updatedAt,
    totalAttempts: Number.isFinite(totalAttempts) && totalAttempts >= 0 ? totalAttempts : 0,
    correctAttempts: Number.isFinite(correctAttempts) && correctAttempts >= 0 ? correctAttempts : 0,
    confidenceEma: clamp(Number(v.confidenceEma) || base.confidenceEma, 0, 1),
    frustrationEma: clamp(Number(v.frustrationEma) || base.frustrationEma, 0, 1),
    independenceEma: clamp(Number(v.independenceEma) || base.independenceEma, 0, 1),
    focusEma: clamp(Number(v.focusEma) || base.focusEma, 0, 1),
    guessingRiskEma: clamp(Number(v.guessingRiskEma) || base.guessingRiskEma, 0, 1),
    modalityScores: {
      visual: Number((v.modalityScores as Record<string, unknown> | undefined)?.visual) || base.modalityScores.visual,
      verbal: Number((v.modalityScores as Record<string, unknown> | undefined)?.verbal) || base.modalityScores.verbal,
      interactive: Number((v.modalityScores as Record<string, unknown> | undefined)?.interactive) || base.modalityScores.interactive,
      repetition: Number((v.modalityScores as Record<string, unknown> | undefined)?.repetition) || base.modalityScores.repetition,
      logic: Number((v.modalityScores as Record<string, unknown> | undefined)?.logic) || base.modalityScores.logic,
    },
    paceScores: {
      slow: Number((v.paceScores as Record<string, unknown> | undefined)?.slow) || base.paceScores.slow,
      balanced: Number((v.paceScores as Record<string, unknown> | undefined)?.balanced) || base.paceScores.balanced,
      challenge: Number((v.paceScores as Record<string, unknown> | undefined)?.challenge) || base.paceScores.challenge,
    },
    recurringMistakes: (() => {
      const raw = v.recurringMistakes;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const out: Record<string, number> = {};
      for (const [key, count] of Object.entries(raw as Record<string, unknown>)) {
        const parsed = Number(count);
        if (Number.isFinite(parsed) && parsed > 0) {
          out[key] = parsed;
        }
      }
      return out;
    })(),
    subjectStates: {
      spelling: getSubjectState("spelling"),
      math: getSubjectState("math"),
      reading: getSubjectState("reading"),
    },
    recommendations: Array.isArray(v.recommendations)
      ? (v.recommendations as unknown[]).filter((entry): entry is string => typeof entry === "string").slice(0, 5)
      : [],
  };

  return snapshot;
}

function strongestModality(scores: ModalityScores): keyof ModalityScores {
  return (Object.entries(scores) as Array<[keyof ModalityScores, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "interactive";
}

function strongestPace(scores: PaceScores): keyof PaceScores {
  return (Object.entries(scores) as Array<[keyof PaceScores, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "balanced";
}

function deriveTutorPersona(snapshot: LearningDnaSnapshot): LearningDnaSnapshot["tutorPersona"] {
  const modality = strongestModality(snapshot.modalityScores);
  const pace = strongestPace(snapshot.paceScores);

  const style: LearningDnaSnapshot["tutorPersona"]["style"] =
    modality === "visual"
      ? "visual_scaffold"
      : modality === "logic"
        ? "pattern_practice"
        : modality === "interactive"
          ? "interactive_questioning"
          : "guided_reasoning";

  const tone: LearningDnaSnapshot["tutorPersona"]["tone"] =
    snapshot.frustrationEma >= 0.55
      ? "calm"
      : snapshot.confidenceEma >= 0.7
        ? "stretch"
        : "encouraging";

  return {
    pace,
    style,
    tone,
  };
}

function deriveRecommendations(snapshot: LearningDnaSnapshot): string[] {
  const output: string[] = [];

  if (snapshot.frustrationEma >= 0.55) {
    output.push("Use shorter teaching turns with encouragement-first language.");
  }
  if (snapshot.guessingRiskEma >= 0.45) {
    output.push("Add mini-check questions before revealing full solutions.");
  }
  if (snapshot.independenceEma <= 0.45) {
    output.push("Delay hint escalation and request one independent step first.");
  }
  if (snapshot.focusEma <= 0.4) {
    output.push("Keep sessions shorter and insert recap checkpoints.");
  }

  const weakestSubject = (Object.entries(snapshot.subjectStates) as Array<[SubjectKey, SubjectState]>)
    .sort((a, b) => a[1].accuracy - b[1].accuracy)[0];
  if (weakestSubject && weakestSubject[1].attempts >= 4) {
    output.push(`Prioritise revision in ${weakestSubject[0]} before raising difficulty.`);
  }

  return output.slice(0, 5);
}

function updateRollingAverage(currentAvg: number, currentCount: number, nextValue: number): number {
  if (currentCount <= 0) return nextValue;
  return Math.round(((currentAvg * currentCount + nextValue) / (currentCount + 1)) * 100) / 100;
}

export function extractLearningDnaFromProfileJson(raw: string | null | undefined): LearningDnaSnapshot | null {
  const profile = parseProfileObject(raw);
  if (!profile.learningDna) return null;
  return parseSnapshot(profile.learningDna);
}

export function updateLearningDnaFromAttempt(
  existingProfileJson: string | null | undefined,
  signal: LearningDnaAttemptSignal,
): { nextProfileJson: string; snapshot: LearningDnaSnapshot } {
  const profile = parseProfileObject(existingProfileJson);
  const snapshot = parseSnapshot(profile.learningDna);

  const subjectState = snapshot.subjectStates[signal.subject] ?? defaultSubjectState();
  const nextAttempts = snapshot.totalAttempts + 1;
  const nextCorrectAttempts = snapshot.correctAttempts + (signal.correct ? 1 : 0);

  const boundedResponseMs = clamp(signal.responseTimeMs, 0, 300_000);
  const boundedHints = clamp(signal.hintsUsed, 0, 8);

  const confidenceObservation = signal.correct
    ? clamp(0.6 + (1 - boundedHints / 4) * 0.3, 0, 1)
    : clamp(0.28 - boundedHints * 0.05, 0, 1);

  const frustrationObservation = signal.correct
    ? 0.12
    : clamp(0.35 + (boundedHints >= 2 ? 0.22 : 0) + (boundedResponseMs > 45_000 ? 0.16 : 0), 0, 1);

  const independenceObservation = signal.correct
    ? clamp(1 - boundedHints * 0.22, 0.15, 1)
    : clamp(0.35 - boundedHints * 0.08, 0, 0.35);

  const focusObservation = boundedResponseMs <= 4_000
    ? 0.45
    : boundedResponseMs <= 30_000
      ? 0.82
      : boundedResponseMs <= 70_000
        ? 0.58
        : 0.34;

  const guessingObservation = signal.correct && boundedHints === 0 && boundedResponseMs < 2_500
    ? 0.65
    : signal.correct
      ? 0.18
      : 0.3;

  snapshot.totalAttempts = nextAttempts;
  snapshot.correctAttempts = nextCorrectAttempts;
  snapshot.confidenceEma = ema(snapshot.confidenceEma, confidenceObservation);
  snapshot.frustrationEma = ema(snapshot.frustrationEma, frustrationObservation);
  snapshot.independenceEma = ema(snapshot.independenceEma, independenceObservation);
  snapshot.focusEma = ema(snapshot.focusEma, focusObservation);
  snapshot.guessingRiskEma = ema(snapshot.guessingRiskEma, guessingObservation);

  // Modality and pacing signals are soft votes that accumulate over time.
  if (boundedHints >= 2 || !signal.correct) {
    snapshot.modalityScores.visual += 1;
    snapshot.modalityScores.interactive += 1;
    snapshot.modalityScores.repetition += 1;
  } else if (signal.correct && boundedHints === 0 && boundedResponseMs < 12_000) {
    snapshot.modalityScores.logic += 1;
    snapshot.modalityScores.verbal += 0.8;
  } else {
    snapshot.modalityScores.interactive += 0.6;
    snapshot.modalityScores.verbal += 0.5;
  }

  if (boundedResponseMs > 45_000 || boundedHints >= 2) {
    snapshot.paceScores.slow += 1;
  } else if (signal.correct && boundedHints === 0 && boundedResponseMs < 10_000 && signal.difficulty >= 3) {
    snapshot.paceScores.challenge += 1;
  } else {
    snapshot.paceScores.balanced += 1;
  }

  const nextSubjectAttempts = subjectState.attempts + 1;
  const nextSubjectCorrect = subjectState.correct + (signal.correct ? 1 : 0);
  const nextAccuracy = nextSubjectAttempts > 0 ? Math.round((nextSubjectCorrect / nextSubjectAttempts) * 100) : 0;

  snapshot.subjectStates[signal.subject] = {
    attempts: nextSubjectAttempts,
    correct: nextSubjectCorrect,
    accuracy: nextAccuracy,
    avgResponseMs: updateRollingAverage(subjectState.avgResponseMs, subjectState.attempts, boundedResponseMs),
    avgHintsUsed: updateRollingAverage(subjectState.avgHintsUsed, subjectState.attempts, boundedHints),
    confidenceEma: ema(subjectState.confidenceEma, confidenceObservation),
  };

  if (!signal.correct) {
    const mistakeKey = `${signal.subject}:${signal.skillFocus || "general"}:${signal.errorType || "incorrect"}`;
    snapshot.recurringMistakes[mistakeKey] = (snapshot.recurringMistakes[mistakeKey] ?? 0) + 1;
    const sortedMistakes = Object.entries(snapshot.recurringMistakes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    snapshot.recurringMistakes = Object.fromEntries(sortedMistakes);
  }

  snapshot.tutorPersona = deriveTutorPersona(snapshot);
  snapshot.recommendations = deriveRecommendations(snapshot);
  snapshot.updatedAt = new Date().toISOString();

  const nextProfile = {
    ...profile,
    learningDna: snapshot,
  };

  return {
    nextProfileJson: JSON.stringify(nextProfile),
    snapshot,
  };
}

export function buildCoachDirectiveFromLearningDna(snapshot: LearningDnaSnapshot): LearningDnaCoachDirective {
  const weakSkills = Object.entries(snapshot.recurringMistakes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => key.split(":").slice(0, 2).join(":"));

  const confidenceScore = clamp(
    snapshot.confidenceEma * 0.55 + snapshot.independenceEma * 0.35 + (1 - snapshot.guessingRiskEma) * 0.1,
    0,
    1,
  );

  const summary = [
    `Adaptive pace: ${snapshot.tutorPersona.pace}`,
    `Style: ${snapshot.tutorPersona.style.replace(/_/g, " ")}`,
    `Confidence trend ${Math.round(snapshot.confidenceEma * 100)}%`,
  ].join(". ");

  const reinforcementTip =
    snapshot.tutorPersona.tone === "calm"
      ? "Use reassurance and one-step prompts before challenge."
      : snapshot.tutorPersona.tone === "stretch"
        ? "Use challenge prompts and ask for independent reasoning."
        : "Use encouragement and targeted guiding questions.";

  return {
    confidenceScore,
    pace: snapshot.tutorPersona.pace,
    style: snapshot.tutorPersona.style,
    tone: snapshot.tutorPersona.tone,
    summary,
    reinforcementTip,
    priorityWeakSkills: weakSkills,
  };
}

export function buildParentLearningDnaSummary(snapshot: LearningDnaSnapshot): Record<string, unknown> {
  const enoughHistory = snapshot.totalAttempts >= 3;
  return {
    updatedAt: snapshot.updatedAt,
    totalAttempts: snapshot.totalAttempts,
    enoughHistory,
    readinessLabel: enoughHistory ? "Active" : "Not enough learning history yet",
    fallbackMessage: enoughHistory
      ? null
      : "Not enough learning history yet. The tutor will adapt as more activities are completed.",
    confidenceTrend: Math.round(snapshot.confidenceEma * 100),
    frustrationRisk: Math.round(snapshot.frustrationEma * 100),
    independenceLevel: Math.round(snapshot.independenceEma * 100),
    focusStability: Math.round(snapshot.focusEma * 100),
    guessingRisk: Math.round(snapshot.guessingRiskEma * 100),
    preferredPace: snapshot.tutorPersona.pace,
    preferredTeachingStyle: snapshot.tutorPersona.style,
    tutorTone: snapshot.tutorPersona.tone,
    subjectStates: snapshot.subjectStates,
    recommendations: snapshot.recommendations,
  };
}
