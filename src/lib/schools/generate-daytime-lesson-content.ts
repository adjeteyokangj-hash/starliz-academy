import { prisma } from "@/lib/db";
import { keyStageForYearGroup } from "@/lib/curriculum";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import {
  isPlayableDaytimeLessonType,
  preferredContentTypesForPeriod,
} from "@/lib/schools/start-daytime-period";
import {
  clearBlackBoxStaleMetadata,
  mergeBlackBoxGateMetadata,
  parseContentMetadataJson,
} from "@/lib/ai/content-black-box-gate";
import { buildDaytimeSessionPlan } from "@/lib/schools/daytime-session-plan";
import { estimatedMinutesForItemCount } from "@/lib/schools/school-day-period";
import {
  evaluateDaytimeLessonHealth,
  reviewStatusFromHealth,
  serializeMachineHealth,
  stagePacksFromContentRows,
} from "@/lib/schools/daytime-lesson-health";
import {
  serializeDaytimeStageContentJson,
} from "@/lib/schools/daytime-stage-validators";
import { estimateMinutesFromActivities } from "@/lib/schools/daytime-activity-types";
import { classifyDaytimeSubjectMode, contentTypeForSubjectMode } from "@/lib/schools/daytime-subject-mode";
import {
  generateDaytimeStageWithOpenAi,
  generateGuidedReadingSharedPassage,
} from "@/lib/schools/daytime-ai-stage-generator";
import {
  hasPassedDaytimeMachineBlackBox,
  runDaytimeSubjectBlackBox,
} from "@/lib/schools/daytime-black-box";
import {
  computeWeekDiversitySummary,
  DEFAULT_SCHOOL_TIMEZONE,
  loadWeeklyCurriculumMemory,
  resolveWeekStartIso,
  resolveWeeklyReviewPolicy,
  stampWeeklyMetadata,
  validateAgainstWeeklyMemory,
  weeklySequenceIndexForDay,
  type WeekDiversitySummary,
  type WeeklyCurriculumMemory,
} from "@/lib/schools/weekly-curriculum-memory";

export type GenerateDaytimeLessonContentInput = {
  schoolId: string;
  actorUserId: string;
  classroomId?: string | null;
  dayOfWeek?: number | null;
  /** When true, replace existing linked contentRefs with a fresh pack. */
  force?: boolean;
  /** When set, only regenerate this single period. */
  dayLessonId?: string | null;
  /** Optional teacher reason when regenerating from Lesson Review. */
  regenerateReason?: string | null;
  /** Explicit intentional review / consolidation for weekly uniqueness. */
  allowWeeklyReview?: boolean | null;
  reviewReason?: string | null;
  /** IANA timezone for week boundary (defaults Europe/London). */
  timezone?: string | null;
};

export type GenerateDaytimeLessonContentResult =
  | {
      ok: true;
      created: number;
      reused: number;
      skipped: number;
      blackBoxFailed: number;
      linkedLessonIds: string[];
      contentIds: string[];
    }
  | { ok: false; status: number; error: string };

type ContentPack = {
  contentType: string;
  level: number;
  topic: string;
  skillFocus: string;
  yearGroup: string;
  keyStage: string;
  contentJson: string;
  metadataJson: string;
};

function yearLevel(yearGroup: string | null | undefined): number {
  const match = String(yearGroup ?? "").match(/(\d{1,2})/);
  const year = match ? Number(match[1]) : 5;
  // Black-box difficulty estimates clamp to 1–5; keep declared levels in that band.
  if (year <= 2) return 2;
  if (year <= 4) return 4;
  if (year <= 6) return 5;
  return 5;
}

function resolveContentType(subject: string, skillFocus: string | null): string {
  const preferred = preferredContentTypesForPeriod(subject, skillFocus)[0] ?? "lesson";
  if (preferred === "maths") return "math";
  if (preferred === "english-language") return "reading";
  return preferred;
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "lesson";
}

function stableSeed(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) || 1;
}

function buildMathPack(input: {
  title: string;
  skillFocus: string;
  yearGroup: string;
  keyStage: string;
  level: number;
  itemCount?: number;
  stageSeed?: string;
}): ContentPack {
  const seed = stableSeed(`${input.title}|${input.skillFocus}|${input.yearGroup}|${input.stageSeed ?? "core"}`);
  const base = Math.max(3, input.level + 1 + (seed % 4));
  const focus = input.skillFocus.trim() || "number";
  const title = input.title.trim() || "Maths";
  const focusKey = focus.toLowerCase();
  const itemCount = Math.max(3, Math.min(18, input.itemCount ?? 8));

  const scenarioBanks = [
    {
      match: /place|value|digit/,
      items: [
        (g: number, e: number, l: number) => ({
          question: `In “${title}” place-value practice, ${g} tens frames each show ${e} counters. ${l} extra counters sit beside them. Explain the method: how many counters are on the tens frames only?`,
          answer: g * e,
          explanation: `Multiply ${g} tens frames by ${e} counters each for ${title}. The leftover ${l} are not on the frames, so the reasoned answer is ${g * e}.`,
        }),
        (g: number, e: number, l: number) => ({
          question: `For ${focus} in “${title}”, a number is made from ${g} hundreds and ${e} tens, then ${l} ones are removed from a matching set of ${g * e + l} ones. Explain the method: how many ones remain after the removal?`,
          answer: g * e,
          explanation: `Start from ${g * e + l} ones, subtract ${l}, and keep the ${focus} total ${g * e} for ${title} because that matches the equal-group method.`,
        }),
      ],
    },
    {
      match: /reason|multi|problem|stretch/,
      items: [
        (g: number, e: number, l: number) => ({
          question: `During “${title}” multi-step reasoning, a shop packs ${g} gift bags with ${e} stickers in each bag. ${l} stickers are kept for samples. Explain why the packed total is not the sample count: how many stickers were packed into bags?`,
          answer: g * e,
          explanation: `Multiply ${g} bags by ${e} stickers. Samples (${l}) are separate, so the packed total for ${focus} is ${g * e}.`,
        }),
        (g: number, e: number, l: number) => ({
          question: `In ${focus} for “${title}”, ${g * e + l} team points are shared into ${g} equal groups with ${l} points left over. Explain why ${g * e} is the total placed into the equal groups.`,
          answer: g * e,
          explanation: `Subtract leftover ${l} from ${g * e + l}. The equal-group total for ${title} is ${g * e} because the leftover is not shared.`,
        }),
      ],
    },
    {
      match: /fluency|recall|mental|tables/,
      items: [
        (g: number, e: number, l: number) => ({
          question: `In “${title}” number fluency, a pupil completes ${g} rows of ${e} facts. ${l} facts are marked for a second check. How many facts were completed in the first pass?`,
          answer: g * e,
          explanation: `Multiply ${g} rows by ${e} facts for the first-pass fluency total ${g * e}. The ${l} rechecks are separate.`,
        }),
        (g: number, e: number, l: number) => ({
          question: `For ${focus} in “${title}”, ${g * e + l} mental questions are queued. After ${l} warm-ups, the rest are split into ${g} equal practice sets. Explain the method: how many questions are in those equal sets altogether?`,
          answer: g * e,
          explanation: `Remove ${l} warm-ups from ${g * e + l}. The remaining fluency set total is ${g * e} because warm-ups are not part of the equal sets.`,
        }),
      ],
    },
    {
      match: /measure|length|time|money/,
      items: [
        (g: number, e: number, l: number) => ({
          question: `In “${title}” measures work, ${g} trays each hold ${e} centimetre rods. ${l} rods are spare. Explain the method: how many rods are in the trays?`,
          answer: g * e,
          explanation: `Multiply ${g} trays by ${e} rods. Spare rods (${l}) are not in trays, so the tray total is ${g * e}.`,
        }),
        (g: number, e: number, l: number) => ({
          question: `For ${focus} in “${title}”, a length of ${g * e + l} centimetres is cut into ${g} equal pieces with ${l} centimetres left. Explain the method: what length is used in the equal pieces altogether?`,
          answer: g * e,
          explanation: `Subtract leftover ${l} cm from ${g * e + l} cm. The equal-piece total is ${g * e} cm because the leftover is not used in the pieces.`,
        }),
      ],
    },
  ] as const;

  const bank = scenarioBanks.find((entry) => entry.match.test(focusKey)) ?? scenarioBanks[seed % scenarioBanks.length];

  const items = Array.from({ length: itemCount }, (_, index) => {
    const groups = base + ((index + seed) % 5);
    const each = base + ((index * 2 + seed) % 6) + 2;
    const leftover = ((index + seed) % 4) + 1;
    const builder = bank.items[index % bank.items.length];
    const built = builder(groups, each, leftover);
    const choices = Array.from(
      new Set([
        built.answer,
        built.answer + leftover,
        built.answer - 1,
        built.answer + each,
        Math.max(1, built.answer - groups),
      ]),
    ).slice(0, 4);
    return {
      id: `daytime-math-${slugPart(focus)}-${slugPart(title)}-${index + 1}`,
      question: built.question,
      prompt: built.question,
      answer: built.answer,
      choices,
      explanation: built.explanation,
      hints: [
        `Show your working for ${focus} in two steps before choosing an answer.`,
        `Check the answer with the inverse operation and explain why it fits ${title}.`,
      ],
      yearGroup: input.yearGroup,
      skillFocus: focus,
      difficulty: Math.min(5, input.level),
      topic: title,
      subject: "maths",
    };
  });

  return {
    contentType: "math",
    level: Math.min(5, input.level),
    topic: title,
    skillFocus: focus,
    yearGroup: input.yearGroup,
    keyStage: input.keyStage,
    contentJson: JSON.stringify(items),
    metadataJson: JSON.stringify({
      source: "daytime_school_timetable",
      title,
      subject: "maths",
      strand: "number",
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
      skillFocus: focus,
      difficulty: Math.min(5, input.level),
      questionType: "multiple choice",
      targetLearningYearGroup: input.yearGroup,
      targetLearningKeyStage: input.keyStage,
    }),
  };
}

function buildSpellingPack(input: {
  title: string;
  skillFocus: string;
  yearGroup: string;
  keyStage: string;
  level: number;
  itemCount?: number;
  stageSeed?: string;
}): ContentPack {
  const banks: Record<number, string[]> = {
    1: ["ship", "chat", "frog", "jump", "bell", "nest", "rain", "play"],
    2: ["bright", "friend", "school", "because", "people", "should", "could", "would"],
    3: ["separate", "necessary", "environment", "government", "temperature", "conscience", "privilege", "rhythm"],
    4: ["accommodate", "embarrass", "harassment", "millennium", "occurrence", "questionnaire", "recommend", "sufficient"],
    5: ["conscience", "miscellaneous", "pronunciation", "reconnaissance", "supersede", "unforeseen", "vocabulary", "zealous"],
  };
  const spellLevel = Math.min(3, Math.max(1, input.level));
  const seed = stableSeed(`${input.title}|${input.skillFocus}|spelling|${input.stageSeed ?? "core"}`);
  const sourceWords = banks[Math.min(5, Math.max(1, input.level))] ?? banks[3];
  const allWords = Object.values(banks).flat();
  const itemCount = Math.max(3, Math.min(18, input.itemCount ?? sourceWords.length));
  const words = Array.from({ length: itemCount }, (_, index) => {
    const pool = index < sourceWords.length ? sourceWords : allWords;
    return pool[(seed + index) % pool.length] ?? sourceWords[index % sourceWords.length];
  });
  const items = words.map((word, index) => ({
    id: `daytime-spell-${slugPart(input.skillFocus)}-${slugPart(input.title)}-${slugPart((input.stageSeed ?? "core").split("-")[0] || "core")}-${slugPart(word)}-${index + 1}`,
    word,
    prompt: `In “${input.title}” (${input.skillFocus}), spell the word carefully: ${word}`,
    question: `In “${input.title}” (${input.skillFocus}), spell the word carefully: ${word}`,
    answer: word,
    hint: `Listen for the sounds in “${word}” and check the letter pattern for ${input.skillFocus}.`,
    sentenceContext: `Write the word “${word}” carefully in a full sentence about ${input.title}.`,
    explanation: `In ${input.title}, the correct spelling is ${word} because the letter pattern matches the spoken sounds in order.`,
    categoryHint: input.skillFocus,
    yearGroup: input.yearGroup,
    skillFocus: input.skillFocus,
    difficulty: spellLevel,
    syllables: String(Math.max(1, Math.ceil(word.length / 3))),
    emoji: "✏️",
  }));

  return {
    contentType: "spelling",
    level: spellLevel,
    topic: input.title,
    skillFocus: input.skillFocus,
    yearGroup: input.yearGroup,
    keyStage: input.keyStage,
    contentJson: JSON.stringify(items),
    metadataJson: JSON.stringify({
      source: "daytime_school_timetable",
      title: input.title,
      subject: "spelling",
      strand: "spelling",
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
      skillFocus: input.skillFocus,
      difficulty: spellLevel,
      questionType: "spelling word",
      targetLearningYearGroup: input.yearGroup,
      targetLearningKeyStage: input.keyStage,
    }),
  };
}

function buildReadingPack(input: {
  title: string;
  skillFocus: string;
  yearGroup: string;
  keyStage: string;
  level: number;
  subject: string;
  itemCount?: number;
  stageSeed?: string;
  stageLabel?: string;
  lessonTitle?: string;
}): ContentPack {
  const focus = input.skillFocus.toLowerCase();
  const stageKey = (input.stageSeed ?? "core").split("-")[0] || "core";
  const stageLabel = input.stageLabel?.trim() || (
    stageKey === "warmup" ? "warm-up" : stageKey === "stretch" ? "stretch" : "core practice"
  );
  const lessonTitle = input.lessonTitle?.trim()
    || input.title.replace(/\s·\s(Warm-up|Core practice|Stretch)$/i, "").trim()
    || input.title;
  const isOracy = focus.includes("oracy") || focus.includes("spoken") || focus.includes("debate");
  const isWriting = focus.includes("writing") || focus.includes("sentence") || focus.includes("narrative");
  const passage = isOracy
    ? `In today's oracy workshop for “${lessonTitle}”, Year group learners practise clear speaking and careful listening. A good speaker should greet the audience and state one main idea, then give a reason. A good listener should look at the speaker and ask a thoughtful question. Debates work best when every voice is respected. Use evidence from the text when you choose an answer. Practising Spoken language with evidence from the text helps the whole class improve during this ${stageLabel}.`
    : isWriting
      ? `Strong writing for “${lessonTitle}” starts when you decide what you want to say before drafting. First, choose precise words. Next check capital letters and full stops. Finally, read your sentence aloud to hear whether it sounds complete and confident. Good writers use evidence from their plan before they publish. Practising writing with evidence from the text keeps each paragraph clear and purposeful in this ${stageLabel}.`
      : `Reading fluency for “${lessonTitle}” means smooth reading with expression and understanding. When you read a short passage, notice punctuation because it helps you pause and read with expression. Emphasise important words. Then answer questions and use evidence from the text so your point is supported by a detail. Practising reading with evidence from the text builds confident comprehension in this ${stageLabel}.`;

  const questionRows = [
    {
      question: isOracy
        ? "According to the passage, what should a good speaker do first?"
        : isWriting
          ? "According to the passage, what is the first step in strong writing?"
          : "According to the passage, what does reading fluency include?",
      options: isOracy
        ? ["Greet the audience and state one main idea", "Speak as quickly as possible without pausing", "Interrupt other speakers during every turn", "Avoid eye contact with the audience"]
        : isWriting
          ? ["Decide what you want to say before drafting", "Ignore punctuation and keep writing", "Use only one long word in each line", "Skip reading aloud at the end"]
          : ["Smooth reading with expression and understanding", "Skipping hard words without checking meaning", "Reading only titles and ignoring paragraphs", "Memorising lines without understanding meaning"],
      answer: isOracy
        ? "Greet the audience and state one main idea"
        : isWriting
          ? "Decide what you want to say before drafting"
          : "Smooth reading with expression and understanding",
    },
    {
      question: isOracy
        ? "Which detail from the text describes a good listener?"
        : "Which detail from the text explains why punctuation matters when reading?",
      options: isOracy
        ? ["Look at the speaker and ask a thoughtful question", "Talk over the speaker before they finish", "Leave the room during every discussion", "Ignore the main idea and stay silent"]
        : ["It helps you pause and read with expression", "It makes the text longer without purpose", "It hides the meaning of every sentence", "It replaces vocabulary learning completely"],
      answer: isOracy
        ? "Look at the speaker and ask a thoughtful question"
        : "It helps you pause and read with expression",
    },
    {
      question: "Which choice best matches the passage advice about evidence?",
      options: [
        "Use evidence from the text",
        "A guess with no link to the text",
        "An unrelated personal story only",
        "Copying a word at random from the page",
      ],
      answer: "Use evidence from the text",
    },
    {
      question: "Which skill focus does this lesson practise, according to the passage?",
      options: [
        `Practising ${input.skillFocus} with evidence from the text`,
        "Times tables practice with no reading",
        "Silent reading of maps only",
        "PE warm-up routines outdoors",
      ],
      answer: `Practising ${input.skillFocus} with evidence from the text`,
    },
    {
      question: `According to the passage, what helps most during the ${stageLabel}?`,
      options: [
        "Choose an answer using evidence from the text",
        "Ignore the passage and guess quickly",
        "Skip checking your understanding",
        "Only read the title and stop",
      ],
      answer: "Choose an answer using evidence from the text",
    },
    {
      question: "Which detail from the text best supports careful checking?",
      options: [
        "Check the final answer before moving on",
        "Never re-read a sentence",
        "Avoid listening to others",
        "Hide your work from the teacher",
      ],
      answer: "Check the final answer before moving on",
    },
  ];

  const itemCount = Math.max(3, Math.min(18, input.itemCount ?? questionRows.length));
  const items = Array.from({ length: itemCount }, (_, index) => {
    const row = questionRows[index % questionRows.length];
    const question = index < questionRows.length
      ? row.question
      : `${row.question} (Round ${Math.floor(index / questionRows.length) + 1})`;
    return {
      id: `daytime-read-${slugPart(stageKey)}-${slugPart(lessonTitle)}-${index + 1}`,
      passage,
      title: lessonTitle,
      question,
      prompt: question,
      options: row.options,
      choices: row.options,
      answer: row.answer,
      correctAnswer: row.answer,
      explanation: `Use evidence from the passage about ${input.skillFocus.toLowerCase()} to justify your answer because the text supports this choice.`,
      hint: "Look back at the passage and find a matching detail before you choose.",
      yearGroup: input.yearGroup,
      skillFocus: input.skillFocus,
      difficulty: Math.min(5, input.level),
      topic: lessonTitle,
      subject: "reading",
    };
  });

  return {
    contentType: "reading",
    level: input.level,
    topic: input.title,
    skillFocus: input.skillFocus,
    yearGroup: input.yearGroup,
    keyStage: input.keyStage,
    contentJson: JSON.stringify(items),
    metadataJson: JSON.stringify({
      source: "daytime_school_timetable",
      title: input.title,
      subject: "reading",
      schoolSubject: input.subject,
      strand: "reading",
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
      skillFocus: input.skillFocus,
      difficulty: input.level,
      questionType: "multiple choice",
      targetLearningYearGroup: input.yearGroup,
      targetLearningKeyStage: input.keyStage,
    }),
  };
}

function padPassage(passage: string, minWords = 42): string {
  const words = passage.split(/\s+/).filter(Boolean);
  if (words.length >= minWords) return passage.trim();
  return `${passage.trim()} Learners re-read the passage carefully, underline key ideas, compare each choice with evidence from the text, and check the final answer before moving on.`;
}

function lessonPromptBank(input: {
  schoolSubject: string;
  title: string;
  focus: string;
}): Array<{ question: string; choices: string[]; answer: string; passage: string }> {
  const subject = input.schoolSubject;
  const focus = input.focus;
  const title = input.title;
  const s = subject.toLowerCase();

  if (s.includes("comput") || s.includes("ict") || s.includes("digital")) {
    return [
      {
        question: `According to the Computing passage on “${title}”, which online-safety habit best matches ${focus}?`,
        choices: [
          `Keep personal details private while practising ${focus}`,
          "Share passwords with friends for faster login",
          "Click unknown links without checking the sender",
          "Post a home address in a class chat group",
        ],
        answer: `Keep personal details private while practising ${focus}`,
        passage: padPassage(
          `In Computing, ${title} centres on ${focus}. The class learns to keep personal details private while practising ${focus}, pause before clicking unknown links, and explain one safe digital choice with evidence from this passage. Pupils also discuss trusted adults and school rules for devices.`,
        ),
      },
      {
        question: `Which Computing detail from the text shows careful digital citizenship for ${title}?`,
        choices: [
          "Report a worrying message and tell a trusted adult",
          "Reply angrily to every online comment",
          "Download unknown apps during the lesson",
          "Ignore the school acceptable-use agreement",
        ],
        answer: "Report a worrying message and tell a trusted adult",
        passage: padPassage(
          `Digital citizenship in ${title} means respecting others online and protecting devices. The text says learners should report a worrying message and tell a trusted adult when something feels unsafe while practising ${focus}. Clear rules help everyone stay safer on shared computers.`,
        ),
      },
      {
        question: `Which statement best matches the Computing advice about ${focus} in ${title}?`,
        choices: [
          `It helps you make safer choices with technology during ${title}`,
          "It replaces handwriting lessons forever",
          "It means classroom games have no rules",
          "It only matters after the school day ends",
        ],
        answer: `It helps you make safer choices with technology during ${title}`,
        passage: padPassage(
          `Today’s Computing focus is ${focus}. The passage explains that ${focus} helps you make safer choices with technology during ${title}. Pupils compare safe and unsafe digital habits, then justify answers with a detail from this Computing discussion.`,
        ),
      },
      {
        question: `If a Computing task about ${focus} is unclear, which action does the passage recommend first?`,
        choices: [
          "Re-read the success criteria and ask a precise question",
          "Close the device and stop trying completely",
          "Guess randomly so you finish first",
          "Change someone else’s account settings",
        ],
        answer: "Re-read the success criteria and ask a precise question",
        passage: padPassage(
          `When Computing work on ${focus} feels unclear, the passage says re-read the success criteria and ask a precise question. Slowing down on ${title} helps pupils fix mistakes and keep practising carefully with support from the teacher.`,
        ),
      },
      {
        question: `Which reflection best shows progress in Computing (${title}) according to the text?`,
        choices: [
          `I can explain one safer digital habit linked to ${focus}`,
          "I skipped every online-safety check today",
          "I used a classmate’s login without asking",
          "I ignored the Computing learning objective",
        ],
        answer: `I can explain one safer digital habit linked to ${focus}`,
        passage: padPassage(
          `Progress in ${title} means naming one safer digital habit linked to ${focus}. Learners use evidence from the Computing discussion, check their understanding, and explain what they will do differently next time they go online.`,
        ),
      },
    ];
  }

  if (s.includes("pshe") || s.includes("assembly") || s.includes("wellbeing") || s.includes("citizenship") || s.includes("rse")) {
    return [
      {
        question: `According to the Assembly / PSHE passage, what is the main wellbeing focus of “${title}”?`,
        choices: [
          `Practising ${focus} with kindness and respect`,
          "Winning every argument in circle time",
          "Ignoring other people’s feelings completely",
          "Skipping discussion and staying silent forever",
        ],
        answer: `Practising ${focus} with kindness and respect`,
        passage: padPassage(
          `In Assembly / PSHE, ${title} explores practising ${focus} with kindness and respect. Learners listen carefully, share one thoughtful idea, and use kind words when they talk about feelings and choices. The class connects the assembly message to real moments in school.`,
        ),
      },
      {
        question: `Which action best supports ${focus} during ${title}, according to the text?`,
        choices: [
          "Listen carefully and respond with respect",
          "Talk over quieter classmates every time",
          "Make jokes about someone’s private worry",
          "Leave the discussion unfinished on purpose",
        ],
        answer: "Listen carefully and respond with respect",
        passage: padPassage(
          `Wellbeing lessons on ${focus} work best when everyone listens carefully and responds with respect. During ${title}, pupils wait for a turn, choose kind words, and check that each person feels safe to share a smaller idea.`,
        ),
      },
      {
        question: `Which detail from the passage explains the value of ${focus.toLowerCase()} in today’s session?`,
        choices: [
          `It helps the class practise ${focus.toLowerCase()} together with care`,
          "It replaces all maths lessons this week",
          "It means feelings do not matter at school",
          "It only applies at home after dinner",
        ],
        answer: `It helps the class practise ${focus.toLowerCase()} together with care`,
        passage: padPassage(
          `Today’s Assembly / PSHE theme is ${focus}. The passage says it helps the class practise ${focus.toLowerCase()} together with care. Pupils link the message of ${title} to real choices they can make with friends and teachers.`,
        ),
      },
      {
        question: `If you feel unsure during a PSHE talk about ${focus}, which step does the passage recommend?`,
        choices: [
          "Ask a clarifying question or share a smaller idea",
          "Leave the room without telling anyone at all",
          "Distract a classmate so nobody notices",
          "Pretend you understand and never speak again",
        ],
        answer: "Ask a clarifying question or share a smaller idea",
        passage: padPassage(
          `In ${title}, it is okay to feel unsure. The passage recommends that you ask a clarifying question or share a smaller idea about ${focus}. Clear questions help the whole group learn and keep the conversation respectful.`,
        ),
      },
      {
        question: `Which reflection shows progress in Assembly / PSHE (${title}) using evidence from the text?`,
        choices: [
          `I can name one kind choice linked to ${focus}`,
          "I refused to listen to anyone else’s ideas",
          "I ignored the assembly message completely",
          "I finished without thinking about kindness",
        ],
        answer: `I can name one kind choice linked to ${focus}`,
        passage: padPassage(
          `Progress in ${title} means you can name one kind choice linked to ${focus}. Learners use evidence from the Assembly / PSHE talk, explain what they practised, and plan one caring action for later in the day.`,
        ),
      },
    ];
  }

  if (s.includes("histor") || s.includes("geograph") || s.includes("humanit") || s.includes("re ") || s === "re" || s.includes("religious")) {
    return [
      {
        question: `According to the ${subject} passage on “${title}”, which detail best matches the enquiry focus “${focus}”?`,
        choices: [
          `Use evidence from sources to explain ${focus}`,
          "Invent facts without checking any source",
          "Ignore dates, places, and people completely",
          "Copy a caption without reading the clue",
        ],
        answer: `Use evidence from sources to explain ${focus}`,
        passage: padPassage(
          `In ${subject}, ${title} asks learners to investigate ${focus}. The passage says use evidence from sources to explain ${focus}. Pupils read carefully, pick out clues, and explain ideas in their own words with support from the enquiry question.`,
        ),
      },
      {
        question: `Which enquiry habit best supports ${subject} learning in ${title}?`,
        choices: [
          "Compare two pieces of evidence before deciding",
          "Guess the answer from the first word only",
          "Skip the source and write anything quickly",
          "Change the question to avoid hard thinking",
        ],
        answer: "Compare two pieces of evidence before deciding",
        passage: padPassage(
          `Good ${subject} enquiry for ${focus} means compare two pieces of evidence before deciding. During ${title}, pupils weigh clues, explain which detail is stronger, and check that their claim matches the source text.`,
        ),
      },
      {
        question: `Which statement best matches the ${subject} advice about ${focus.toLowerCase()}?`,
        choices: [
          `It helps you build a clearer explanation about ${title}`,
          "It means sources are never useful in lessons",
          "It replaces listening carefully in class",
          "It only matters during end-of-year tests",
        ],
        answer: `It helps you build a clearer explanation about ${title}`,
        passage: padPassage(
          `Today’s ${subject} focus is ${focus}. The passage explains that ${focus.toLowerCase()} helps you build a clearer explanation about ${title}. Pupils practise evidence-based answers and check each claim against the clue.`,
        ),
      },
      {
        question: `If a ${subject} source about ${focus} is confusing, which step does the passage recommend?`,
        choices: [
          "Re-read the clue and ask what it tells you about the past or place",
          "Give up and leave the page completely blank",
          "Copy a neighbour without reading the source",
          "Change the topic to something unrelated",
        ],
        answer: "Re-read the clue and ask what it tells you about the past or place",
        passage: padPassage(
          `When ${subject} work on ${focus} feels hard, the passage says re-read the clue and ask what it tells you about the past or place. Slowing down on ${title} helps pupils find evidence and ask one precise question.`,
        ),
      },
      {
        question: `Which reflection shows progress in ${subject} (${title}) with text evidence?`,
        choices: [
          `I can explain one evidence-based idea about ${focus}`,
          "I ignored every source in the lesson",
          "I wrote an answer with no reason at all",
          "I avoided the enquiry question completely",
        ],
        answer: `I can explain one evidence-based idea about ${focus}`,
        passage: padPassage(
          `Progress in ${title} means I can explain one evidence-based idea about ${focus}. Learners use clues from the ${subject} sources, justify their claim, and check that each detail supports the final answer.`,
        ),
      },
    ];
  }

  return [
    {
      question: `According to the ${subject} passage on “${title}”, what learning focus should guide your answers?`,
      choices: [
        `Practising ${focus} with evidence from the lesson`,
        "Ignoring the objective for the whole session",
        "Rushing answers without checking any detail",
        "Avoiding discussion and skipping feedback",
      ],
      answer: `Practising ${focus} with evidence from the lesson`,
      passage: padPassage(
        `In ${subject}, ${title} centres on practising ${focus} with evidence from the lesson. Learners read carefully, choose supporting details from this passage, and check their answers before moving on to the next question.`,
      ),
    },
    {
      question: `Which action best supports ${subject} learning during “${title}”?`,
      choices: [
        `Follow the ${focus} success criteria and check understanding`,
        "Guess without reading the question carefully",
        "Skip teacher feedback and keep guessing",
        "Copy without thinking about the topic",
      ],
      answer: `Follow the ${focus} success criteria and check understanding`,
      passage: padPassage(
        `Success in ${title} means follow the ${focus} success criteria and check understanding. Pupils link each choice to ${focus}, explain why it fits ${subject}, and use evidence from the lesson passage.`,
      ),
    },
    {
      question: `Which detail from the text explains the value of ${focus.toLowerCase()} in ${subject} today?`,
      choices: [
        `It helps you practise ${focus.toLowerCase()} with purpose in ${subject}`,
        "It replaces every other school subject forever",
        "It means there is no need to listen in class",
        "It only applies during break time outdoors",
      ],
      answer: `It helps you practise ${focus.toLowerCase()} with purpose in ${subject}`,
      passage: padPassage(
        `Today’s ${subject} lesson on ${title} uses ${focus}. The passage says it helps you practise ${focus.toLowerCase()} with purpose in ${subject}. Pupils justify answers with evidence from the text and check each choice carefully.`,
      ),
    },
    {
      question: `If you are unsure during ${subject} work on ${title}, which step does the passage recommend first?`,
      choices: [
        `Ask a clarifying question about ${focus} and try a smaller step`,
        "Give up immediately without asking for help",
        "Distract a classmate so the task is ignored",
        "Hide your work and wait until the end",
      ],
      answer: `Ask a clarifying question about ${focus} and try a smaller step`,
      passage: padPassage(
        `When ${subject} tasks about ${focus} feel unclear, the passage says ask a clarifying question about ${focus} and try a smaller step. Pausing on ${title} helps pupils re-read instructions and choose a precise next action.`,
      ),
    },
    {
      question: `Which reflection shows progress in ${subject} (${title}) using evidence from the text?`,
      choices: [
        `I can explain one new ${focus.toLowerCase()} idea I practised today`,
        "I did not attempt the task at any point",
        "I ignored the learning objective completely",
        "I finished without checking any answers",
      ],
      answer: `I can explain one new ${focus.toLowerCase()} idea I practised today`,
      passage: padPassage(
        `Progress in ${title} means I can explain one new ${focus.toLowerCase()} idea I practised today. Learners use evidence from the ${subject} passage, name what improved, and plan one next step for the following lesson.`,
      ),
    },
  ];
}

function buildLessonPack(input: {
  title: string;
  subject: string;
  skillFocus: string;
  yearGroup: string;
  keyStage: string;
  level: number;
  itemCount?: number;
  stageSeed?: string;
  stageLabel?: string;
  lessonTitle?: string;
}): ContentPack {
  const schoolSubject = input.subject.trim() || "Lesson";
  const focus = input.skillFocus.trim() || schoolSubject;
  const librarySubject = librarySubjectForSchoolSubject(schoolSubject);
  const stageKey = (input.stageSeed ?? "core").split("-")[0] || "core";
  const stageLabel = input.stageLabel?.trim() || (
    stageKey === "warmup" ? "warm-up" : stageKey === "stretch" ? "stretch" : "core practice"
  );
  const lessonTitle = input.lessonTitle?.trim()
    || input.title.replace(/\s·\s(Warm-up|Core practice|Stretch)$/i, "").trim()
    || input.title;
  const bank = lessonPromptBank({
    schoolSubject,
    title: lessonTitle,
    focus,
  });
  const itemCount = Math.max(3, Math.min(18, input.itemCount ?? bank.length));
  const prompts = Array.from({ length: itemCount }, (_, index) => {
    const row = bank[index % bank.length];
    const question = index < bank.length
      ? row.question
      : `${row.question} (${stageLabel} round ${Math.floor(index / bank.length) + 1})`;
    return {
      id: `daytime-lesson-${slugPart(schoolSubject)}-${slugPart(lessonTitle)}-${slugPart(stageKey)}-${index + 1}`,
      type: "multiple_choice",
      questionType: "multiple_choice",
      passage: row.passage,
      question,
      prompt: question,
      choices: row.choices,
      options: row.choices,
      answer: row.answer,
      correctAnswer: row.answer,
      explanation: `This item checks understanding of ${focus} in ${schoolSubject} using evidence from the ${lessonTitle} passage.`,
      hint: `Use the ${schoolSubject} passage about ${focus.toLowerCase()} to justify your answer.`,
      yearGroup: input.yearGroup,
      skillFocus: focus,
      difficulty: input.level,
      topic: lessonTitle,
      subject: librarySubject,
    };
  });

  return {
    contentType: "lesson",
    level: input.level,
    topic: input.title,
    skillFocus: focus,
    yearGroup: input.yearGroup,
    keyStage: input.keyStage,
    contentJson: JSON.stringify(prompts),
    metadataJson: JSON.stringify({
      source: "daytime_school_timetable",
      title: input.title,
      subject: librarySubject,
      schoolSubject,
      strand: librarySubject,
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
      skillFocus: focus,
      difficulty: input.level,
      questionType: "multiple choice",
      targetLearningYearGroup: input.yearGroup,
      targetLearningKeyStage: input.keyStage,
    }),
  };
}

/** Map school timetable labels onto Content Library curriculum subjects. */
function librarySubjectForSchoolSubject(subject: string): string {
  const s = subject.trim().toLowerCase();
  if (s.includes("math")) return "maths";
  if (s.includes("spell") || s.includes("phonic")) return "spelling";
  if (s.includes("science")) return "science";
  if (s.includes("grammar")) return "grammar";
  if (s.includes("writing")) return "writing";
  if (s.includes("vocabulary")) return "vocabulary";
  if (s.includes("punctuation")) return "punctuation";
  if (s.includes("comput") || s.includes("ict")) return "reading";
  if (s.includes("histor")) return "reading";
  if (s.includes("geograph")) return "reading";
  if (s.includes("pshe") || s.includes("assembly") || s.includes("wellbeing") || s.includes("citizenship")) return "reading";
  return "reading";
}

export function buildDaytimeContentPack(input: {
  title: string;
  subject: string;
  skillFocus: string | null;
  yearGroup: string | null;
  itemCount?: number;
  stageSeed?: string;
  stageLabel?: string;
  lessonTitle?: string;
  daytimeSession?: {
    periodMinutes: number;
    stage: "warmup" | "core" | "stretch";
    stageIndex: 0 | 1 | 2;
    estimatedMinutes: number;
    role: "daytime_period_stage";
    label?: string;
  };
}): ContentPack {
  const yearGroup = input.yearGroup?.trim() || "Year 5";
  const keyStage = keyStageForYearGroup(yearGroup);
  const skillFocus = input.skillFocus?.trim() || input.subject.trim() || "Core learning";
  const level = yearLevel(yearGroup);
  const contentType = resolveContentType(input.subject, skillFocus);
  const itemCount = input.itemCount;
  const stageSeed = input.stageSeed;
  const stageLabel = input.stageLabel ?? input.daytimeSession?.label;
  const lessonTitle = input.lessonTitle;

  let pack: ContentPack;
  if (contentType === "math") {
    pack = buildMathPack({ title: input.title, skillFocus, yearGroup, keyStage, level, itemCount, stageSeed });
  } else if (contentType === "spelling") {
    pack = buildSpellingPack({ title: input.title, skillFocus, yearGroup, keyStage, level, itemCount, stageSeed });
  } else if (contentType === "reading") {
    pack = buildReadingPack({
      title: input.title,
      skillFocus,
      yearGroup,
      keyStage,
      level,
      subject: input.subject,
      itemCount,
      stageSeed,
      stageLabel,
      lessonTitle,
    });
  } else {
    pack = buildLessonPack({
      title: input.title,
      subject: input.subject,
      skillFocus,
      yearGroup,
      keyStage,
      level,
      itemCount,
      stageSeed,
      stageLabel,
      lessonTitle,
    });
  }

  if (input.daytimeSession) {
    const metadata = JSON.parse(pack.metadataJson) as Record<string, unknown>;
    metadata.daytimeSession = input.daytimeSession;
    metadata.estimatedMinutes = input.daytimeSession.estimatedMinutes;
    pack.metadataJson = JSON.stringify(metadata);
  }

  return pack;
}

async function contentRefsArePlayable(contentRefs: string | null | undefined): Promise<boolean> {
  const ids = (contentRefs ?? "")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!ids.length) return false;
  const rows = await prisma.aIContentCache.findMany({
    where: {
      id: { in: ids },
      status: { in: ["reviewed", "published"] },
    },
    select: { id: true, metadataJson: true },
  });
  if (rows.length < ids.length) return false;
  return rows.every((row) => hasPassedDaytimeMachineBlackBox(row.metadataJson));
}

async function runDaytimeBlackBoxGate(input: {
  contentId: string;
  contentType: string;
  level: number;
  topic: string;
  skillFocus: string;
  contentJson: string;
  metadataJson: string;
  actorUserId: string;
  mode: ReturnType<typeof classifyDaytimeSubjectMode>;
}): Promise<{ ok: true; metadataJson: string } | { ok: false; reason: string; metadataJson: string }> {
  const metadata = parseContentMetadataJson(input.metadataJson);
  const testedAt = new Date().toISOString();
  let blackBoxContentTest;
  try {
    blackBoxContentTest = runDaytimeSubjectBlackBox({
      contentJson: input.contentJson,
      mode: input.mode,
      contentType: input.contentType,
      level: input.level,
      topic: input.topic,
      skillFocus: input.skillFocus,
      metadataJson: input.metadataJson,
    });
  } catch {
    return { ok: false, reason: "Invalid content JSON for black box.", metadataJson: input.metadataJson };
  }

  const score = Math.round(blackBoxContentTest.passRate * 100);
  // Match Content Library POST /black-box scorecard shape so VIEW modal can parse it.
  const storedBlackBoxContentTest = {
    decision: blackBoxContentTest.decision,
    score,
    maxScore: 100,
    rawScore: blackBoxContentTest.score,
    rawMaxScore: blackBoxContentTest.maxScore,
    passRate: blackBoxContentTest.passRate,
    reasons: blackBoxContentTest.reasons,
    itemChecks: blackBoxContentTest.itemResults.map((result) => ({
      itemIndex: result.index,
      score: Math.round((result.score / result.maxScore) * 100),
      maxScore: 100,
      rawScore: result.score,
      rawMaxScore: result.maxScore,
      passRate: Number((result.score / result.maxScore).toFixed(3)),
      declaredLevel: result.declaredLevel,
      estimatedLevel: result.estimatedLevel,
      recommendedLevel: result.recommendedLevel,
      levelDelta: result.levelDelta,
      levelRecommendation: result.levelRecommendation,
      reasons: result.reasons,
      checks: Object.fromEntries(result.dimensions.map((dimension) => [
        dimension.dimension,
        {
          score: dimension.score,
          maxScore: dimension.maxScore,
          passed: dimension.passed,
          reasons: dimension.reasons,
        },
      ])),
    })),
    recommendation: blackBoxContentTest.recommendation ?? null,
    recalculatedAt: testedAt,
  };

  const livePassed = blackBoxContentTest.decision !== "REJECT";
  const nextMetadata = mergeBlackBoxGateMetadata(clearBlackBoxStaleMetadata(metadata), {
    blackBoxContentTest: storedBlackBoxContentTest,
    blackBoxContentRetestedAt: testedAt,
    blackBoxContentRetestedBy: input.actorUserId,
    blackBoxLiveTest: {
      status: livePassed ? "passed" : "failed",
      score,
      reasons: blackBoxContentTest.reasons,
      testedAt,
    },
    // Runtime runs when admin saves verification in the Content Library VIEW modal.
    blackBoxRuntimeTest: {
      status: "not_run",
      reasons: ["Runtime simulation will run when an admin saves verification."],
      testedAt,
    },
    blackBoxAdminVerification: {
      status: "pending",
      decision: "needs_changes",
      notes: livePassed
        ? "Awaiting admin verification in Content Library Review Workspace."
        : "Black box live test failed — open VIEW to repair, then re-run Black Box.",
      verifiedAt: null,
      verifiedBy: null,
    },
  });

  if (!livePassed) {
    return {
      ok: false,
      reason: blackBoxContentTest.reasons[0] ?? "Black box live test rejected this pack.",
      metadataJson: JSON.stringify(nextMetadata),
    };
  }

  return { ok: true, metadataJson: JSON.stringify(nextMetadata) };
}

export async function generateDaytimeLessonContent(
  input: GenerateDaytimeLessonContentInput,
): Promise<GenerateDaytimeLessonContentResult> {
  const school = await prisma.school.findUnique({
    where: { id: input.schoolId },
    select: { id: true, name: true },
  });
  if (!school) {
    return { ok: false, status: 404, error: "School not found." };
  }

  const timezone = input.timezone?.trim() || DEFAULT_SCHOOL_TIMEZONE;
  const weekStart = resolveWeekStartIso({ now: new Date(), timezone });

  const dayLessons = await prisma.schoolDayLesson.findMany({
    where: {
      schoolId: input.schoolId,
      ...(input.dayLessonId ? { id: input.dayLessonId } : {}),
      ...(input.classroomId && !input.dayLessonId ? { classroomId: input.classroomId } : {}),
      ...(input.dayOfWeek && input.dayOfWeek >= 1 && input.dayOfWeek <= 5 && !input.dayLessonId
        ? { dayOfWeek: input.dayOfWeek }
        : {}),
    },
    include: {
      lesson: {
        select: {
          id: true,
          title: true,
          subject: true,
          yearGroup: true,
          keyStage: true,
          skillFocus: true,
          contentRefs: true,
          status: true,
          reviewStatus: true,
        },
      },
      classroom: { select: { yearGroup: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { periodIndex: "asc" }],
  });

  const playable = dayLessons.filter((row) => isPlayableDaytimeLessonType(row.lessonType));
  if (!playable.length) {
    return {
      ok: false,
      status: 400,
      error: "No teaching periods found. Build the week timetable first.",
    };
  }

  let created = 0;
  let reused = 0;
  let skipped = 0;
  let blackBoxFailed = 0;
  const linkedLessonIds: string[] = [];
  const contentIds: string[] = [];
  const processedLessonIds = new Set<string>();

  for (const period of playable) {
    let lesson = period.lesson;
    const yearGroup = period.yearGroup
      ?? lesson?.yearGroup
      ?? period.classroom?.yearGroup
      ?? "Year 5";
    const skillFocus = period.skillFocus ?? lesson?.skillFocus ?? period.subject;
    const keyStage = period.keyStage ?? lesson?.keyStage ?? keyStageForYearGroup(yearGroup);

    if (!lesson) {
      lesson = await prisma.lesson.create({
        data: {
          title: period.title,
          subject: period.subject,
          yearGroup,
          keyStage,
          skillFocus,
          template: `daytime-generated:${slugPart(period.title)}`,
          difficultyBand: period.lessonType === "intervention" ? "support" : "core",
          status: "ready",
        },
        select: {
          id: true,
          title: true,
          subject: true,
          yearGroup: true,
          keyStage: true,
          skillFocus: true,
          contentRefs: true,
          status: true,
          reviewStatus: true,
        },
      });
      await prisma.schoolDayLesson.update({
        where: { id: period.id },
        data: { lessonId: lesson.id },
      });
    }

    if (processedLessonIds.has(lesson.id)) {
      skipped += 1;
      continue;
    }
    processedLessonIds.add(lesson.id);

    if (!input.force) {
      const existingIds = (lesson.contentRefs ?? "").split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean);
      const alreadyLinked = existingIds.length >= 2
        || (existingIds.length > 0 && (lesson.reviewStatus === "approved" || lesson.reviewStatus === "awaiting_review" || lesson.reviewStatus === "machine_failed"));
      if (alreadyLinked || await contentRefsArePlayable(lesson.contentRefs)) {
        reused += 1;
        linkedLessonIds.push(lesson.id);
        contentIds.push(...existingIds);
        if (lesson.reviewStatus !== "approved" && existingIds.length) {
          const rows = await prisma.aIContentCache.findMany({
            where: { id: { in: existingIds } },
            select: {
              id: true,
              contentType: true,
              skillFocus: true,
              contentJson: true,
              metadataJson: true,
            },
          });
          const byId = new Map(rows.map((row) => [row.id, row]));
          const ordered = existingIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row));
          const health = evaluateDaytimeLessonHealth({
            startsAt: period.startsAt,
            endsAt: period.endsAt,
            subject: period.subject,
            skillFocus,
            stages: stagePacksFromContentRows(ordered),
          });
          await prisma.lesson.update({
            where: { id: lesson.id },
            data: {
              reviewStatus: reviewStatusFromHealth(health),
              machineHealthJson: serializeMachineHealth(health),
              updatedAt: new Date(),
            },
          });
        }
        continue;
      }
    }

    const sessionPlan = buildDaytimeSessionPlan(period.startsAt, period.endsAt);
    const stageContentIds: string[] = [];
    const stageSnapshots: Array<{
      id: string;
      contentType: string;
      skillFocus: string | null;
      contentJson: string;
      metadataJson: string;
      blackBoxPassed: boolean;
    }> = [];
    let stageFailed = false;
    const subjectMode = classifyDaytimeSubjectMode(period.subject, skillFocus);
    const level = yearLevel(yearGroup);
    const contentType = contentTypeForSubjectMode(subjectMode);

    let sharedPassage: {
      title: string;
      text: string;
      paragraphs: string[];
      wordCount: number;
    } | null = null;
    let sharedVocabulary: Array<{ word: string; childFriendlyMeaning: string; example?: string }> = [];

    const weeklyReviewPolicy = resolveWeeklyReviewPolicy({
      lessonType: period.lessonType,
      skillFocus,
      lessonTitle: period.title,
      regenerateReason: input.regenerateReason,
      allowWeeklyReview: input.allowWeeklyReview,
      reviewReason: input.reviewReason,
    });

    const excludeContentIds = input.force
      ? (lesson.contentRefs ?? "").split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean)
      : [];

    const weeklyMemory: WeeklyCurriculumMemory = await loadWeeklyCurriculumMemory({
      schoolId: input.schoolId,
      classroomId: period.classroomId ?? input.classroomId ?? null,
      subject: period.subject,
      yearGroup,
      weekStart,
      timezone,
      excludeLessonId: lesson.id,
      excludeContentIds,
    });

    let weekDiversity: WeekDiversitySummary | null = null;
    const acceptedPacksForDiversity: Array<Parameters<typeof computeWeekDiversitySummary>[0]["packs"][number]> = [];

    if (subjectMode === "guided-reading") {
      const shared = await generateGuidedReadingSharedPassage({
        lessonTitle: period.title,
        skillFocus,
        yearGroup,
        keyStage,
        weeklyMemory,
        weeklyReviewPolicy,
      });
      if (shared.openAiSucceeded && shared.passage.wordCount >= 40) {
        sharedPassage = shared.passage;
        sharedVocabulary = shared.vocabulary;
      } else {
        stageFailed = true;
        if (shared.failureReason?.includes("weekly_duplicate")) {
          weekDiversity = computeWeekDiversitySummary({
            memory: weeklyMemory,
            packs: [{
              subjectType: "guided-reading",
              title: period.title,
              estimatedMinutes: 5,
              targetItems: 1,
              activities: [],
              questions: [],
              passage: shared.passage.wordCount
                ? shared.passage
                : undefined,
            }],
            issues: shared.failureReason
              ? [{ code: "weekly_duplicate_passage", message: shared.failureReason }]
              : [],
          });
        }
      }
    }

    for (const stageBudget of sessionPlan.stages) {
      const ai = await generateDaytimeStageWithOpenAi({
        mode: subjectMode,
        stage: stageBudget.stage,
        stageLabel: stageBudget.label,
        lessonTitle: period.title,
        subject: period.subject,
        skillFocus,
        yearGroup,
        keyStage,
        targetMinutes: stageBudget.estimatedMinutes || estimatedMinutesForItemCount(stageBudget.itemCount),
        targetItems: stageBudget.itemCount,
        sharedPassage,
        sharedVocabulary,
        regenerateReason: input.regenerateReason ?? null,
        weeklyMemory,
        weeklyReviewPolicy,
      });

      if (subjectMode === "guided-reading" && ai.openAiSucceeded) {
        if (!ai.pack.passage && sharedPassage) ai.pack.passage = sharedPassage;
        if (!ai.pack.vocabulary?.length && sharedVocabulary.length) {
          ai.pack.vocabulary = sharedVocabulary;
        }
      }

      const activityMinutes = estimateMinutesFromActivities(
        ai.pack.activities,
        ai.pack.questions.length || stageBudget.itemCount,
      );
      const estimatedMinutes = ai.pack.estimatedMinutes || activityMinutes
        || stageBudget.estimatedMinutes
        || estimatedMinutesForItemCount(stageBudget.itemCount);

      if (ai.openAiSucceeded) {
        acceptedPacksForDiversity.push(ai.pack);
      }
      const stageWeeklyIssues = ai.openAiSucceeded
        ? []
        : validateAgainstWeeklyMemory({
            pack: ai.pack,
            memory: weeklyMemory,
            mode: subjectMode,
            policy: weeklyReviewPolicy,
          });
      weekDiversity = computeWeekDiversitySummary({
        memory: weeklyMemory,
        packs: acceptedPacksForDiversity.length ? acceptedPacksForDiversity : [ai.pack],
        issues: stageWeeklyIssues.length
          ? stageWeeklyIssues
          : ai.validationIssues
              .filter((issue) => issue.includes("weekly_duplicate"))
              .map((issue) => {
                const code = issue.split(":")[0]?.trim() as "weekly_duplicate_passage";
                return { code, message: issue };
              }),
      });

      const metadata: Record<string, unknown> = stampWeeklyMetadata({
        source: "daytime_school_timetable",
        title: `${period.title} · ${stageBudget.label}`,
        subject: contentType === "math" ? "maths" : contentType,
        schoolSubject: period.subject,
        strand: contentType === "math" ? "maths" : contentType,
        yearGroup,
        keyStage,
        skillFocus,
        difficulty: level,
        questionType: subjectMode === "practical-pe"
          ? "practical"
          : subjectMode === "guided-reading"
            ? "reading response"
            : subjectMode === "spelling"
              ? "spelling word"
              : "free response",
        targetLearningYearGroup: yearGroup,
        targetLearningKeyStage: keyStage,
        subjectType: subjectMode,
        targetItems: stageBudget.itemCount,
        activities: ai.pack.activities,
        estimatedMinutes,
        daytimeSession: {
          periodMinutes: sessionPlan.periodMinutes,
          stage: stageBudget.stage,
          stageIndex: stageBudget.stageIndex,
          estimatedMinutes,
          role: "daytime_period_stage",
          label: stageBudget.label,
        },
        generationSource: ai.openAiSucceeded ? "openai" : "failed",
        provider: ai.openAiSucceeded ? "openai" : "local",
        model: ai.model,
        openAiAttempted: ai.openAiAttempted,
        openAiSucceeded: ai.openAiSucceeded,
        validationIssues: ai.validationIssues,
        regenerateReason: input.regenerateReason ?? null,
      }, {
        weekStart,
        schoolId: input.schoolId,
        classroomId: period.classroomId ?? input.classroomId ?? null,
        dayOfWeek: period.dayOfWeek,
        weeklySequenceIndex: weeklySequenceIndexForDay(period.dayOfWeek),
        allowWeeklyReview: weeklyReviewPolicy.allowWeeklyReview,
        reviewReason: weeklyReviewPolicy.reviewReason,
        weekDiversity,
      });

      const contentJson = serializeDaytimeStageContentJson(ai.pack);
      const estimatedCostPence = Math.max(
        0,
        Math.round(((ai.usageTokens || 0) / 1000) * 0.2),
      );

      const content = await prisma.aIContentCache.create({
        data: {
          contentType,
          level,
          topic: `${period.title} · ${stageBudget.label}`,
          contentJson,
          status: "generated",
          createdBy: input.actorUserId,
          model: ai.openAiSucceeded ? ai.model : "daytime-openai-failed",
          prompt: `Daytime OpenAI ${subjectMode} ${stageBudget.stage} for ${period.title} (${sessionPlan.periodMinutes}m period)`,
          keyStage,
          yearGroup,
          skillFocus,
          metadataJson: JSON.stringify(metadata),
          estimatedCostPence,
        },
        select: { id: true },
      });

      const gated = ai.openAiSucceeded
        ? await runDaytimeBlackBoxGate({
            contentId: content.id,
            contentType,
            level,
            topic: `${period.title} · ${stageBudget.label}`,
            skillFocus,
            contentJson,
            metadataJson: JSON.stringify(metadata),
            actorUserId: input.actorUserId,
            mode: subjectMode,
          })
        : {
            ok: false as const,
            reason: ai.validationIssues[0] || "OpenAI stage generation failed.",
            metadataJson: JSON.stringify({
              ...metadata,
              blackBoxLiveTest: {
                status: "failed",
                score: 0,
                reasons: ai.validationIssues.length
                  ? ai.validationIssues
                  : ["OpenAI unavailable or returned invalid stage content."],
                testedAt: new Date().toISOString(),
              },
            }),
          };

      await prisma.aIContentCache.update({
        where: { id: content.id },
        data: {
          status: "generated",
          metadataJson: gated.metadataJson,
        },
      });

      stageContentIds.push(content.id);
      contentIds.push(content.id);
      stageSnapshots.push({
        id: content.id,
        contentType,
        skillFocus,
        contentJson,
        metadataJson: gated.metadataJson,
        blackBoxPassed: gated.ok,
      });
      if (!gated.ok || !ai.openAiSucceeded) {
        stageFailed = true;
      }

      // Carry passage forward for later guided-reading stages.
      if (subjectMode === "guided-reading" && ai.pack.passage?.wordCount) {
        sharedPassage = ai.pack.passage;
      }
    }

    const health = evaluateDaytimeLessonHealth({
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      subject: period.subject,
      skillFocus,
      stages: stageSnapshots,
      weekDiversity: weekDiversity ?? undefined,
    });
    const reviewStatus = reviewStatusFromHealth(health);

    if (stageFailed || health.overall === "FAIL") {
      blackBoxFailed += 1;
    } else {
      created += 1;
    }

    await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        contentRefs: stageContentIds.join(","),
        status: "draft",
        skillFocus,
        yearGroup,
        keyStage,
        reviewStatus,
        machineHealthJson: serializeMachineHealth(health),
        teacherReviewedAt: null,
        teacherReviewedBy: null,
        updatedAt: new Date(),
      },
    });

    linkedLessonIds.push(lesson.id);
  }

  await writeSchoolAuditLog({
    schoolId: school.id,
    actorUserId: input.actorUserId,
    action: "daytime_lesson_content_generated",
    entityType: "assignment",
    entityId: school.id,
    metadata: {
      created,
      reused,
      skipped,
      blackBoxFailed,
      linkedLessonCount: linkedLessonIds.length,
      contentCount: contentIds.length,
      classroomId: input.classroomId ?? null,
      dayOfWeek: input.dayOfWeek ?? null,
      force: Boolean(input.force),
      weekStart,
      weeklyMemoryVersion: 1,
    },
  });

  return {
    ok: true,
    created,
    reused,
    skipped,
    blackBoxFailed,
    linkedLessonIds,
    contentIds,
  };
}
