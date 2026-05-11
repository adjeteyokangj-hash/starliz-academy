import { SKILL_MAP } from "@/lib/skills";

type MissionItem = Record<string, unknown> & {
  id: string;
  type: "spelling" | "reading" | "math";
  word?: string;
  prompt: string;
  question?: string;
  passage?: string;
  answer: string | number;
  options: string[];
  hint: string;
  skillFocus: string;
  assessmentPrompt?: string;
  supportPrompt?: string;
  tapPrompt?: string;
  missionGroup: string;
};

export type InterventionMission = {
  title: string;
  introLine: string;
  outroLine: string;
  badge: string;
  subject: "spelling" | "reading" | "math";
  items: MissionItem[];
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function skillLabel(skill: string | null | undefined): string {
  const normalized = normalize(skill);
  return normalized ? (SKILL_MAP[normalized]?.label ?? normalized) : "target skill";
}

function letterItem(input: {
  id: string;
  word: string;
  options: string[];
  missionGroup: string;
  skillFocus: string;
}): MissionItem {
  const sound = input.word.toLowerCase();
  return {
    id: input.id,
    type: "spelling",
    word: sound,
    prompt: `Say ${sound}`,
    answer: sound,
    options: input.options,
    hint: "Listen, look, then say the sound clearly.",
    skillFocus: input.skillFocus,
    assessmentPrompt: `This letter says '${sound}'. Can you say '${sound}'?`,
    supportPrompt: `Let's try again. Listen... '${sound}'.`,
    tapPrompt: `Now tap the letter ${sound}.`,
    missionGroup: input.missionGroup,
  };
}

function wordItem(input: {
  id: string;
  word: string;
  options: string[];
  missionGroup: string;
  skillFocus: string;
  speechSound: string;
}): MissionItem {
  const target = input.word.toLowerCase();
  return {
    id: input.id,
    type: "spelling",
    word: target,
    prompt: `Say ${target}`,
    answer: target,
    options: input.options,
    hint: `Listen for the ${input.speechSound} sound, then say the whole word.`,
    skillFocus: input.skillFocus,
    assessmentPrompt: `This sound is '${input.speechSound}'. Say ${target}.`,
    supportPrompt: `Let's try again. Listen... ${target}.`,
    tapPrompt: `Now choose the word ${target}.`,
    missionGroup: input.missionGroup,
  };
}

function readingItem(input: {
  id: string;
  passage: string;
  prompt: string;
  answer: string;
  options: string[];
  skillFocus: string;
  missionGroup: string;
}): MissionItem {
  return {
    id: input.id,
    type: "reading",
    passage: input.passage,
    prompt: input.prompt,
    question: input.prompt,
    answer: input.answer,
    options: input.options,
    hint: "Read the sentence again and look for key words.",
    skillFocus: input.skillFocus,
    missionGroup: input.missionGroup,
  };
}

function mathsItem(input: {
  id: string;
  prompt: string;
  answer: number;
  options: number[];
  skillFocus: string;
  missionGroup: string;
  hint: string;
}): MissionItem {
  return {
    id: input.id,
    type: "math",
    prompt: input.prompt,
    question: input.prompt,
    answer: String(input.answer),
    options: input.options.map(String),
    hint: input.hint,
    skillFocus: input.skillFocus,
    missionGroup: input.missionGroup,
  };
}

export function isInterventionEligibleSkill(skill: string | null | undefined): boolean {
  const normalized = normalize(skill);
  if (!normalized) return false;
  if (normalized === "letter_sound" || normalized === "letter_recognition" || normalized === "digraphs") return true;
  const subject = SKILL_MAP[normalized]?.subject;
  return subject === "reading" || subject === "maths";
}

export function buildInterventionMission(input: {
  primarySkill: string | null | undefined;
  supportSkill?: string | null | undefined;
  accuracy?: number | null;
}): InterventionMission {
  const primarySkill = normalize(input.primarySkill) || "letter_sound";
  const supportSkill = normalize(input.supportSkill);
  const primaryLabel = skillLabel(primarySkill);
  const supportLabel = supportSkill ? skillLabel(supportSkill) : "Letter recognition";
  const level = (input.accuracy ?? 45) <= 50 ? 1 : 2;

  if (primarySkill === "digraphs") {
    return {
      title: `Sound Builder Mission: Level ${level}`,
      badge: "Intervention Mode",
      introLine: "Let's practise letter sounds together!",
      outroLine: "You're getting better at letter sounds! Let's practise again tomorrow!",
      subject: "spelling",
      items: [
        wordItem({ id: "mission-digraph-1", word: "ship", options: ["ship", "chip", "sip"], missionGroup: "Common sounds", skillFocus: primaryLabel, speechSound: "sh" }),
        wordItem({ id: "mission-digraph-2", word: "chat", options: ["chat", "that", "cat"], missionGroup: "Common sounds", skillFocus: primaryLabel, speechSound: "ch" }),
        wordItem({ id: "mission-digraph-3", word: "thin", options: ["thin", "chin", "tin"], missionGroup: "Common sounds", skillFocus: primaryLabel, speechSound: "th" }),
        wordItem({ id: "mission-digraph-4", word: "shop", options: ["shop", "chop", "stop"], missionGroup: "Common sounds", skillFocus: primaryLabel, speechSound: "sh" }),
        wordItem({ id: "mission-digraph-5", word: "chip", options: ["chip", "ship", "clip"], missionGroup: "Common sounds", skillFocus: primaryLabel, speechSound: "ch" }),
      ],
    };
  }

  if (SKILL_MAP[primarySkill]?.subject === "reading") {
    return {
      title: `Reading Rescue Mission: Level ${level}`,
      badge: "Intervention Mode",
      introLine: "Let's practise reading together!",
      outroLine: "You're getting stronger at reading! Let's practise again tomorrow!",
      subject: "reading",
      items: [
        readingItem({
          id: "mission-reading-1",
          passage: "Mia put a red hat and a blue book in her bag.",
          prompt: "What did Mia put in her bag?",
          answer: "a red hat and a blue book",
          options: ["a red hat and a blue book", "a green toy", "only a blue book"],
          skillFocus: primaryLabel,
          missionGroup: "Find details",
        }),
        readingItem({
          id: "mission-reading-2",
          passage: "Tom fed the cat before school and gave it water.",
          prompt: "What did Tom do before school?",
          answer: "fed the cat and gave it water",
          options: ["fed the cat and gave it water", "played football", "made a cake"],
          skillFocus: primaryLabel,
          missionGroup: "Find details",
        }),
        readingItem({
          id: "mission-reading-3",
          passage: "The sky turned dark, so Ava took an umbrella.",
          prompt: "Why did Ava take an umbrella?",
          answer: "because the sky turned dark",
          options: ["because the sky turned dark", "because it was hot", "because she was late"],
          skillFocus: primaryLabel,
          missionGroup: "Cause and effect",
        }),
        readingItem({
          id: "mission-reading-4",
          passage: "Dad made soup. Ben set the table. Then they ate together.",
          prompt: "What happened after Ben set the table?",
          answer: "they ate together",
          options: ["they ate together", "Ben went to bed", "Dad read a book"],
          skillFocus: primaryLabel,
          missionGroup: "Sequence",
        }),
        readingItem({
          id: "mission-reading-5",
          passage: "Nora smiled when she got a sticker for neat writing.",
          prompt: "How did Nora feel?",
          answer: "happy",
          options: ["happy", "angry", "sleepy"],
          skillFocus: primaryLabel,
          missionGroup: "Comprehension confidence",
        }),
      ],
    };
  }

  if (SKILL_MAP[primarySkill]?.subject === "maths") {
    return {
      title: `Number Builder Mission: Level ${level}`,
      badge: "Intervention Mode",
      introLine: "Let's practise number steps together!",
      outroLine: "You're getting stronger at maths! Let's practise again tomorrow!",
      subject: "math",
      items: [
        mathsItem({ id: "mission-math-1", prompt: "What is 6 + 2?", answer: 8, options: [7, 8, 9], skillFocus: primaryLabel, missionGroup: "Warm-up", hint: "Start at 6, count 2 more." }),
        mathsItem({ id: "mission-math-2", prompt: "What is 9 - 3?", answer: 6, options: [5, 6, 7], skillFocus: primaryLabel, missionGroup: "Step-by-step", hint: "Count back 3 from 9." }),
        mathsItem({ id: "mission-math-3", prompt: "What is 7 + 5?", answer: 12, options: [11, 12, 13], skillFocus: primaryLabel, missionGroup: "Make ten", hint: "Use 7 + 3 = 10, then +2." }),
        mathsItem({ id: "mission-math-4", prompt: "What is 14 - 6?", answer: 8, options: [7, 8, 9], skillFocus: primaryLabel, missionGroup: "Step-by-step", hint: "Subtract 4 then 2." }),
        mathsItem({ id: "mission-math-5", prompt: "What is 4 x 3?", answer: 12, options: [10, 11, 12], skillFocus: primaryLabel, missionGroup: "Confidence check", hint: "Think 3 + 3 + 3 + 3." }),
      ],
    };
  }

  return {
    title: `Sound Builder Mission: Level ${level}`,
    badge: "Intervention Mode",
    introLine: "Let's practise letter sounds together!",
    outroLine: "You're getting better at letter sounds! Let's practise again tomorrow!",
    subject: "spelling",
    items: [
      letterItem({ id: "mission-letter-1", word: "b", options: ["b", "d", "m"], missionGroup: "Single letters", skillFocus: primaryLabel }),
      letterItem({ id: "mission-letter-2", word: "m", options: ["m", "n", "s"], missionGroup: "Single letters", skillFocus: primaryLabel }),
      letterItem({ id: "mission-letter-3", word: "s", options: ["s", "c", "t"], missionGroup: "Single letters", skillFocus: primaryLabel }),
      letterItem({ id: "mission-letter-4", word: "d", options: ["d", "b", "p"], missionGroup: "Confusing pairs", skillFocus: supportLabel }),
      wordItem({ id: "mission-word-5", word: "ship", options: ["ship", "chip", "sip"], missionGroup: "Common sounds", skillFocus: primaryLabel, speechSound: "sh" }),
      wordItem({ id: "mission-word-6", word: "chat", options: ["chat", "cat", "that"], missionGroup: "Common sounds", skillFocus: primaryLabel, speechSound: "ch" }),
    ],
  };
}