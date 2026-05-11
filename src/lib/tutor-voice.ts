import { speakWithContext, type TutorSpeakContext } from "@/lib/voice";

export type TutorSubject = "spelling" | "reading" | "math";

export type TutorFeedbackParams = {
  childId?: string;
  subject?: TutorSubject;
  correct: boolean;
  answer?: string;
  response?: string;
  improvement?: boolean;
  questionType?: "literal" | "inference";
  consecutiveCorrect?: number;
  consecutiveMistakes?: number;
  responseMs?: number;
  usedHint?: boolean;
  coachingStylePreference?: "gentle" | "balanced" | "stretch";
};

export type TutorFeedbackPlan = {
  text: string;
  voiceContext: TutorSpeakContext;
};

type TutorPace = "slow" | "balanced" | "challenge";

type TutorChildMemory = {
  confidence: number;
  pace: TutorPace;
  updatedAt: string;
};

const TUTOR_MEMORY_KEY = "starliz_tutor_memory_v1";

// ── Server sync helpers ──────────────────────────────────────────────
// We debounce server writes so we only call the API once per question,
// not once per keystroke. Reads pull server state on first access and
// merge it into localStorage so offline still works.

const _serverSyncTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function syncMemoryToServer(childId: string, memory: TutorChildMemory): void {
  if (typeof window === "undefined") return;
  clearTimeout(_serverSyncTimers[childId]);
  _serverSyncTimers[childId] = setTimeout(() => {
    void fetch(`/api/children/${childId}/coaching-memory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(memory),
    }).catch(() => {
      // Non-critical — localStorage already persisted it.
    });
  }, 1500);
}

/**
 * Called once per child on first load. Fetches server memory and merges
 * it into localStorage if the server copy is newer.
 */
export async function hydrateCoachingMemoryFromServer(childId: string): Promise<void> {
  if (typeof window === "undefined" || !childId) return;
  try {
    const res = await fetch(`/api/children/${childId}/coaching-memory`, { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { memory: TutorChildMemory | null };
    if (!data.memory) return;
    const map = readTutorMemoryMap();
    const local = map[childId];
    // Prefer whichever is more recently updated.
    if (!local || new Date(data.memory.updatedAt) > new Date(local.updatedAt)) {
      map[childId] = data.memory;
      writeTutorMemoryMap(map);
    }
  } catch {
    // Network unavailable — local cache is the fallback.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readTutorMemoryMap(): Record<string, TutorChildMemory> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TUTOR_MEMORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TutorChildMemory>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeTutorMemoryMap(map: Record<string, TutorChildMemory>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TUTOR_MEMORY_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota/storage errors; coaching can still run without persistence.
  }
}

function getTutorMemory(childId: string | undefined): TutorChildMemory {
  if (!childId) {
    return { confidence: 0.58, pace: "balanced", updatedAt: new Date().toISOString() };
  }
  const map = readTutorMemoryMap();
  const fromStore = map[childId];
  if (fromStore) {
    return fromStore;
  }
  return { confidence: 0.58, pace: "balanced", updatedAt: new Date().toISOString() };
}

function updateTutorMemory(params: TutorFeedbackParams): TutorChildMemory {
  const current = getTutorMemory(params.childId);
  let confidence = current.confidence;

  confidence += params.correct ? 0.04 : -0.06;
  if ((params.responseMs ?? 0) > 20000) confidence -= 0.04;
  if (params.usedHint) confidence -= 0.02;
  if ((params.consecutiveCorrect ?? 0) >= 3) confidence += 0.03;
  if ((params.consecutiveMistakes ?? 0) >= 2) confidence -= 0.03;

  confidence = clamp(confidence, 0.2, 0.95);

  let pace: TutorPace = "balanced";
  if ((params.consecutiveMistakes ?? 0) >= 2 || confidence < 0.45 || (params.responseMs ?? 0) > 22000) {
    pace = "slow";
  } else if ((params.consecutiveCorrect ?? 0) >= 4 && !params.usedHint && confidence >= 0.72) {
    pace = "challenge";
  }

  if (params.coachingStylePreference === "gentle") {
    pace = "slow";
  } else if (params.coachingStylePreference === "stretch" && pace !== "slow") {
    pace = "challenge";
  }

  const next: TutorChildMemory = {
    confidence,
    pace,
    updatedAt: new Date().toISOString(),
  };

  if (params.childId && typeof window !== "undefined") {
    const map = readTutorMemoryMap();
    map[params.childId] = next;
    writeTutorMemoryMap(map);
    syncMemoryToServer(params.childId, next);
  }

  return next;
}

// ── Subject-specific praise pools ─────────────────────────────────────────
const PRAISE_PATIENT = [
  "Lovely work — you took your time and got it!",
  "Well done for keeping going at your own pace!",
  "That is really good — I am so proud of you!",
  "You are doing wonderfully. Keep it up!",
] as const;

const PRAISE_CHALLENGE = [
  "Nailed it! You are getting faster and smarter!",
  "Brilliant — you barely needed a moment to think!",
  "Correct! You are really pushing yourself now!",
  "Excellent! That one would have tripped many people up!",
] as const;

const PRAISE_STEPBYSTEP = [
  "Perfect — you worked through each step beautifully!",
  "Correct! Breaking it down really helped you there!",
  "Excellent step-by-step thinking!",
  "Great job — your method was spot on!",
] as const;

const PRAISE_PROBLEMSOLVING = [
  "Outstanding! You figured that out all by yourself!",
  "Brilliant reasoning — you worked it out independently!",
  "Correct! That shows real problem-solving skills!",
  "Excellent — you tackled that challenge head on!",
] as const;

const PRAISE_STORYTELLING = [
  "Wonderful — you really listened to the story!",
  "Lovely answer — you followed the tale so carefully!",
  "Great reading — you picked up on all the details!",
  "Brilliant — you understood the story beautifully!",
] as const;

const PRAISE_COMPREHENSION = [
  "Excellent! You dug deep into the meaning!",
  "Brilliant analysis — you understood the text precisely!",
  "Correct! Your comprehension is getting really sharp!",
  "Outstanding — you read between the lines perfectly!",
] as const;

const PRAISE_STANDARD = [
  "Beautiful thinking!",
  "Amazing effort!",
  "Brilliant work!",
  "Super focus!",
  "You are doing so well!",
] as const;

const IMPROVEMENT_LINES = [
  "I can really see your progress.",
  "You are getting stronger every round.",
  "That was an even better answer than before.",
] as const;

function pickPraiseLines(params: TutorFeedbackParams): readonly string[] {
  const style = params.coachingStylePreference;
  const subject = params.subject;
  if (subject === "spelling") {
    if (style === "gentle") return PRAISE_PATIENT;
    if (style === "stretch") return PRAISE_CHALLENGE;
  }
  if (subject === "math") {
    if (style === "gentle") return PRAISE_STEPBYSTEP;
    if (style === "stretch") return PRAISE_PROBLEMSOLVING;
  }
  if (subject === "reading") {
    if (style === "gentle") return PRAISE_STORYTELLING;
    if (style === "stretch") return PRAISE_COMPREHENSION;
  }
  return PRAISE_STANDARD;
}

function pickFromLines(lines: readonly string[], seed: string): string {
  let total = 0;
  for (let index = 0; index < seed.length; index += 1) {
    total += seed.charCodeAt(index) * (index + 1);
  }
  return lines[total % lines.length] ?? lines[0] ?? "Great job!";
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function sortLetters(value: string): string {
  return value.replace(/\s+/g, "").split("").sort().join("");
}

function inferSpellingMistake(response: string, answer: string): "missing" | "extra" | "swapped" | "sound" | "general" {
  if (!response) return "general";
  if (sortLetters(response) === sortLetters(answer) && response !== answer) return "swapped";
  if (response.length + 1 === answer.length) return "missing";
  if (response.length === answer.length + 1) return "extra";
  if (response.length === answer.length) {
    let mismatches = 0;
    for (let index = 0; index < response.length; index += 1) {
      if (response[index] !== answer[index]) mismatches += 1;
      if (mismatches > 2) break;
    }
    if (mismatches <= 2) return "sound";
  }
  return "general";
}

function buildCorrectFeedback(params: TutorFeedbackParams): TutorFeedbackPlan {
  const seed = `${params.subject ?? "general"}:${params.answer ?? ""}`;
  const praise = pickFromLines(pickPraiseLines(params), seed);
  const progress = params.improvement ? ` ${pickFromLines(IMPROVEMENT_LINES, seed + ":improved")}` : "";
  const answerLine = params.answer ? ` ${params.answer} is correct.` : " That is correct.";
  return {
    text: `${praise}${progress}${answerLine}`,
    voiceContext: "encouragement",
  };
}

function buildSpellingRetry(response: string, answer: string, style?: "gentle" | "balanced" | "stretch"): TutorFeedbackPlan {
  const mistakeType = inferSpellingMistake(response, answer);

  // Patient coach: break it into phonics steps, never rush
  if (style === "gentle") {
    if (mistakeType === "missing") {
      return { text: `No worries at all. You are very close — just one sound is missing. The correct spelling is ${answer}. Let us say each sound together very slowly: ${answer.split("").join(", ")}. Take your time and try again.`, voiceContext: "spelling_instruction" };
    }
    if (mistakeType === "extra") {
      return { text: `Great effort! You added one extra letter. Have a listen to the sounds in ${answer} and feel free to spell it out letter by letter at your own pace.`, voiceContext: "spelling_instruction" };
    }
    if (mistakeType === "swapped") {
      return { text: `You had almost all the right letters! Two just swapped places. The correct word is ${answer}. No rush — take a deep breath and try again.`, voiceContext: "spelling_instruction" };
    }
    if (mistakeType === "sound") {
      return { text: `You heard most of the sounds right — well done for trying! The correct spelling is ${answer}. Listen to each sound carefully and give it another go whenever you are ready.`, voiceContext: "spelling_instruction" };
    }
    return { text: `That is okay. The correct spelling is ${answer}. I am right here with you. Let us try again together — you can do this!`, voiceContext: "spelling_instruction" };
  }

  // Challenge coach: give the answer but push for speed and independence
  if (style === "stretch") {
    if (mistakeType === "missing") {
      return { text: `Nearly — one sound missing. It is ${answer}. Remember it fast and let us keep the pace up!`, voiceContext: "spelling_instruction" };
    }
    if (mistakeType === "extra") {
      return { text: `Almost — one letter too many. The word is ${answer}. Quick, picture it and move on!`, voiceContext: "spelling_instruction" };
    }
    if (mistakeType === "swapped") {
      return { text: `So close — letters swapped. The correct order is ${answer}. Lock it in and let us go!`, voiceContext: "spelling_instruction" };
    }
    if (mistakeType === "sound") {
      return { text: `Good attempt but the sound pattern is slightly off. It is ${answer}. Remember the pattern and push forward!`, voiceContext: "spelling_instruction" };
    }
    return { text: `Not quite — the correct spelling is ${answer}. Commit it to memory and let us keep moving!`, voiceContext: "spelling_instruction" };
  }

  // Standard coach (original behaviour)
  if (mistakeType === "missing") {
    return { text: `Good try. You are very close. One sound is missing. The correct spelling is ${answer}. Say it slowly with me, then try again.`, voiceContext: "spelling_instruction" };
  }
  if (mistakeType === "extra") {
    return { text: `Nice attempt. You added one extra letter. The correct spelling is ${answer}. Let us listen carefully and spell it again.`, voiceContext: "spelling_instruction" };
  }
  if (mistakeType === "swapped") {
    return { text: `Great effort. Your letters are almost right, but two are in the wrong order. The correct word is ${answer}.`, voiceContext: "spelling_instruction" };
  }
  if (mistakeType === "sound") {
    return { text: `Good try. You heard most of the sounds correctly. The correct spelling is ${answer}. Listen to each sound and try once more.`, voiceContext: "spelling_instruction" };
  }
  return { text: `Good try. Let us slow down and try again. The correct spelling is ${answer}.`, voiceContext: "spelling_instruction" };
}

function buildReadingRetry(params: TutorFeedbackParams): TutorFeedbackPlan {
  const answer = params.answer ?? "the correct answer";
  const style = params.coachingStylePreference;

  // Storytelling coach: warm, narrative-led, re-read the passage
  if (style === "gentle") {
    if (params.questionType === "inference") {
      return { text: `That is a lovely try! This question asks us to read between the lines of the story. The answer the author hints at is ${answer}. Let us go back and find the clues together.`, voiceContext: "reading_question" };
    }
    return { text: `No worries! The story gives us a little clue if we look carefully. The correct answer is ${answer}. Would you like to hear the passage again and spot it yourself?`, voiceContext: "reading_question" };
  }

  // Comprehension coach: analytical, push for evidence-based thinking
  if (style === "stretch") {
    if (params.questionType === "inference") {
      return { text: `Close — but this inference question needs you to pick up the subtle signals in the text. The best answer is ${answer}. What specific words in the passage could have led you there?`, voiceContext: "reading_question" };
    }
    return { text: `Not quite — look back at the exact wording in the passage. The correct answer is ${answer}. Try to find the sentence that confirms it before moving on.`, voiceContext: "reading_question" };
  }

  // Standard coach
  if (params.questionType === "inference") {
    return { text: `Nice effort. This one is an inference question, so we use clues from the passage. The best answer is ${answer}.`, voiceContext: "reading_question" };
  }
  return { text: `Good try. Let us look for exact clues in the passage. The correct answer is ${answer}.`, voiceContext: "reading_question" };
}

function buildMathRetry(response: string, answer: string, style?: "gentle" | "balanced" | "stretch"): TutorFeedbackPlan {
  const guessed = Number(response);
  const correct = Number(answer);

  // Step-by-step coach: walk through each stage, heavy scaffolding
  if (style === "gentle") {
    if (!Number.isFinite(guessed)) {
      return { text: `That is okay! Let us answer with a number this time. The correct answer is ${answer}. Would you like me to walk you through each step before we try the next one?`, voiceContext: "math_hint" };
    }
    const distance = Math.abs(guessed - correct);
    if (distance <= 2) {
      return { text: `You were so close — just ${distance} away! The answer is ${answer}. Let us count each step together very carefully next time and you will definitely get it!`, voiceContext: "math_hint" };
    }
    return { text: `Great effort for trying. The correct answer is ${answer}. Let us slow right down and break this into tiny steps — I will help you through each part.`, voiceContext: "math_hint" };
  }

  // Problem-solving coach: minimal scaffolding, push for independence
  if (style === "stretch") {
    if (!Number.isFinite(guessed)) {
      return { text: `Remember — a number is what we need here. The answer is ${answer}. Before I give clues, can you figure out why that is the answer?`, voiceContext: "math_hint" };
    }
    const distance = Math.abs(guessed - correct);
    if (distance <= 2) {
      return { text: `Very close — the answer is ${answer}. You almost had it! Think about which step caused the small error and see if you can self-correct next time.`, voiceContext: "math_hint" };
    }
    return { text: `The correct answer is ${answer}. Before I explain, try to work backwards from that answer and see where your method went differently. Challenge accepted?`, voiceContext: "math_hint" };
  }

  // Standard coach (original behaviour)
  if (!Number.isFinite(guessed)) {
    return { text: `Good effort. Let us answer with a number. The correct answer is ${answer}. We can solve the next one together.`, voiceContext: "math_hint" };
  }
  const distance = Math.abs(guessed - correct);
  if (distance <= 2) {
    return { text: `You were very close. The correct answer is ${answer}. Check each step slowly and you will get it.`, voiceContext: "math_hint" };
  }
  return { text: `Good try. The correct answer is ${answer}. Break the problem into smaller steps and try another one.`, voiceContext: "math_hint" };
}

function withAdaptiveTone(plan: TutorFeedbackPlan, params: TutorFeedbackParams, memory: TutorChildMemory): TutorFeedbackPlan {
  const additions: string[] = [];
  const style = params.coachingStylePreference;

  if (style === "gentle") {
    additions.push("I am right here with you. We will learn at your pace.");
  }
  if (style === "stretch" && params.correct) {
    additions.push("Let us push a little further on the next one.");
  }

  if (params.correct) {
    if (params.usedHint) {
      if (style === "gentle") {
        additions.push("Using your hint showed great thinking.");
      } else if (style === "stretch") {
        additions.push("Hint used — next time see if you can manage without one!");
      } else {
        additions.push("Great use of your hint strategy.");
      }
    }
    if ((params.consecutiveCorrect ?? 0) >= 3) {
      if (style === "stretch") {
        additions.push("Three in a row — time to crank up the difficulty!");
      } else {
        additions.push("You are on a streak. Ready for a slightly bigger challenge next?");
      }
    }
    if ((params.responseMs ?? 0) > 18000) {
      if (style === "gentle") {
        additions.push("I love the patience you showed working through that.");
      } else {
        additions.push("I love how patiently you worked through that.");
      }
    }
    if (memory.pace === "challenge") {
      additions.push("You are ready for a bigger challenge now.");
    }
  } else {
    if ((params.consecutiveMistakes ?? 0) >= 2) {
      if (style === "gentle") {
        additions.push("You are doing really well just for trying. Let us take it one tiny step at a time.");
      } else if (style === "stretch") {
        additions.push("Two in a row — let us diagnose exactly where the error crept in.");
      } else {
        additions.push("It is okay to take your time. We can do this step by step.");
      }
    }
    if ((params.responseMs ?? 0) > 20000) {
      if (style === "gentle") {
        additions.push("Take all the time you need — there is absolutely no rush.");
      } else {
        additions.push("Take a calm breath. We will solve the next one together.");
      }
    }
    if (memory.pace === "slow") {
      additions.push("We are not in a rush. One small step at a time.");
    }
  }

  if (!additions.length) {
    return plan;
  }

  return {
    ...plan,
    text: `${plan.text} ${additions.join(" ")}`,
  };
}

export function getTutorFeedbackPlan(params: TutorFeedbackParams): TutorFeedbackPlan {
  const memory = updateTutorMemory(params);

  if (params.correct) {
    return withAdaptiveTone(buildCorrectFeedback(params), params, memory);
  }

  const subject = params.subject ?? "spelling";
  const answer = params.answer ?? "";
  const response = normalize(params.response);

  if (subject === "reading") {
    return withAdaptiveTone(buildReadingRetry(params), params, memory);
  }
  if (subject === "math") {
    return withAdaptiveTone(buildMathRetry(response, answer, params.coachingStylePreference), params, memory);
  }
  return withAdaptiveTone(buildSpellingRetry(response, answer, params.coachingStylePreference), params, memory);
}

export function getTutorFeedback(params: TutorFeedbackParams): string {
  return getTutorFeedbackPlan(params).text;
}

export function speakTutorFeedback(plan: string | TutorFeedbackPlan) {
  const resolvedPlan: TutorFeedbackPlan = typeof plan === "string"
    ? { text: plan, voiceContext: "encouragement" }
    : plan;
  void speakWithContext(resolvedPlan.text, resolvedPlan.voiceContext);
}
