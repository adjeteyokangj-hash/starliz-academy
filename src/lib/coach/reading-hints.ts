// ─────────────────────────────────────────────────────────────────────────────
// Reading coach — deterministic hint builder
// Works for comprehension, inference, vocabulary, and structure questions
// ─────────────────────────────────────────────────────────────────────────────

import { AgeBand, CoachContext, CoachFollowUp, CoachResponse, CoachStep } from "./types";

// ── Skill detection ───────────────────────────────────────────────────────────

type ReadingSkill =
  | "literal"     // direct retrieval from text
  | "inference"   // implied meaning / reading between the lines
  | "vocabulary"  // word meaning in context
  | "structure"   // author technique, form, language features
  | "summary";    // main idea / purpose

function detectReadingSkill(skillFocus?: string, question?: string): ReadingSkill {
  const combined = `${skillFocus ?? ""} ${question ?? ""}`.toLowerCase();
  if (/infer|suggest|imply|think|feel|why|because|attitude|tone|mood/.test(combined)) return "inference";
  if (/mean|definition|word|phrase|vocabulary|synonym/.test(combined)) return "vocabulary";
  if (/technique|language|structure|feature|effect|method|author|writer/.test(combined)) return "structure";
  if (/summary|main idea|overall|purpose|theme/.test(combined)) return "summary";
  return "literal";
}

// ── Passage snippet extractor ─────────────────────────────────────────────────

/** Pull the most relevant sentence from the passage based on the question keywords. */
function findRelevantSentence(passage: string, question: string): string | null {
  if (!passage || !question) return null;
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !["what", "which", "where", "when", "does", "from", "about", "have", "that", "this", "with"].includes(w));

  const sentences = passage.match(/[^.!?]+[.!?]+/g) ?? [];
  let best: string | null = null;
  let bestScore = 0;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = sentence.trim();
    }
  }
  return best;
}

// ── Follow-up builders ────────────────────────────────────────────────────────

function literalFollowUp(question: string, passageSentence: string | null): CoachFollowUp {
  return {
    question: `In which part of the passage would you look to answer this?`,
    options: [
      passageSentence ? `Near: "${passageSentence.slice(0, 60)}…"` : "Near the beginning",
      "Anywhere in the passage",
      "In the question itself",
      "It is not in the passage",
    ],
    correctIndex: 0,
    onCorrect: "Good — that sentence contains the evidence. Read it again carefully.",
    onWrong: "For retrieval questions, the answer is always directly stated in the passage. Scan for the key nouns from the question.",
  };
}

function inferenceFollowUp(ageBand: AgeBand): CoachFollowUp {
  if (ageBand === "foundation" || ageBand === "primary") {
    return {
      question: "What clues tell you how the character is feeling?",
      options: [
        "Their words, actions, or the words around them",
        "The chapter heading",
        "What I think without reading",
        "The punctuation only",
      ],
      correctIndex: 0,
      onCorrect: "Exactly — writers show feelings through words, actions, and descriptions. Look for those clues.",
      onWrong: "Inference means using the evidence in the text. Look at what the character does or says — it reveals how they feel.",
    };
  }
  return {
    question: "What technique does the writer use to convey this idea?",
    options: [
      "Word choice and connotation",
      "Random description",
      "The title only",
      "Rhyme scheme",
    ],
    correctIndex: 0,
    onCorrect: "Correct — word choice carries meaning. Now identify the specific words and explain the effect.",
    onWrong: "Writers carefully choose every word. Think about what feeling or image each key word creates in the reader's mind.",
  };
}

function vocabularyFollowUp(_question: string): CoachFollowUp {
  return {
    question: `How can you work out the meaning of an unknown word?`,
    options: [
      "Read the words before and after it in the sentence",
      "Guess based on the letter it starts with",
      "Skip it",
      "Look at the title",
    ],
    correctIndex: 0,
    onCorrect: "Yes — context clues are the most reliable method. The surrounding sentence almost always gives the meaning away.",
    onWrong: "Context clues work: the words around an unknown word nearly always hint at its meaning. Try re-reading that sentence.",
  };
}

function structureFollowUp(): CoachFollowUp {
  return {
    question: "When analysing a language feature, what three things must you cover?",
    options: [
      "The technique, the quotation, and the effect on the reader",
      "The page number, the character, and the plot",
      "The technique and nothing else",
      "The author's name, the technique, and the genre",
    ],
    correctIndex: 0,
    onCorrect: "Perfect — technique + quotation + effect. This is the core of any language analysis answer.",
    onWrong: "Always: name the technique → quote the evidence → explain the effect. A missing piece loses marks.",
  };
}

// ── Step builders ─────────────────────────────────────────────────────────────

function buildReadingSteps(
  skill: ReadingSkill,
  ageBand: AgeBand,
  hintLevel: number,
  passageSentence: string | null,
): CoachStep[] {
  if (skill === "literal") {
    return [
      { expression: "Step 1: Identify keywords in the question", explanation: "Underline or circle key nouns and verbs." },
      { expression: "Step 2: Scan the passage", explanation: "Look for those exact keywords — or synonyms of them." },
      ...(passageSentence ? [{ expression: `Relevant line: "${passageSentence.slice(0, 100)}…"`, explanation: "This sentence is likely to contain the answer." }] : []),
    ].slice(0, hintLevel);
  }

  if (skill === "inference") {
    if (ageBand === "foundation" || ageBand === "primary") {
      return [
        { expression: "Step 1: What does the character do or say?", explanation: "Actions and speech tell us feelings." },
        { expression: "Step 2: What words describe them?", explanation: "Adjectives and adverbs show the writer's view." },
        { expression: "Step 3: What do those clues add up to?", explanation: "Combine the clues to make your inference." },
      ].slice(0, hintLevel);
    }
    return [
      { expression: "Step 1: Find the relevant line(s)", explanation: "Locate the section of text the question refers to." },
      { expression: "Step 2: Identify word connotations", explanation: "Think about the feelings or images each key word creates." },
      { expression: "Step 3: Build an inference", explanation: "Link the connotations to answer the question — 'This suggests…'" },
      ...(ageBand === "gcse" ? [{ expression: "Step 4: Zoom in on one technique", explanation: "Name the device (e.g. metaphor, sibilance) and explain its effect." }] : []),
    ].slice(0, hintLevel);
  }

  if (skill === "vocabulary") {
    return [
      { expression: "Step 1: Isolate the word in the sentence", explanation: "Read the full sentence containing the unknown word." },
      { expression: "Step 2: Remove the word and guess the meaning", explanation: "What other word could fit here? That is likely its meaning." },
      { expression: "Step 3: Confirm with context", explanation: "Does your guess make the sentence logical? If yes, you are right." },
    ].slice(0, hintLevel);
  }

  if (skill === "structure") {
    return [
      { expression: "Step 1: Identify the technique", explanation: "Name the device: metaphor, simile, alliteration, repetition, etc." },
      { expression: "Step 2: Quote the evidence", explanation: "Write the exact word or phrase from the text." },
      { expression: "Step 3: Explain the effect", explanation: "What does it make the reader think, feel, or picture?" },
    ].slice(0, hintLevel);
  }

  // summary
  return [
    { expression: "Step 1: Read each paragraph's first sentence", explanation: "Topic sentences summarise the paragraph's main idea." },
    { expression: "Step 2: Find the repeated idea", explanation: "The theme running through most paragraphs is the main idea." },
    { expression: "Step 3: Write it in your own words", explanation: "Avoid copying the text — paraphrase to show you understand." },
  ].slice(0, hintLevel);
}

// ── Reinforcement notes ───────────────────────────────────────────────────────

function readingReinforcement(skill: ReadingSkill, ageBand: AgeBand): string {
  if (ageBand === "gcse") {
    if (skill === "inference") return "In the exam, always zoom in on a specific word or phrase. Vague references lose AO2 marks.";
    if (skill === "structure") return "Use the P-E-E or P-Q-C framework: Point → Evidence → Explanation/Comment.";
    return "Mark schemes reward evidence-based answers. Avoid saying 'I think' without a quotation.";
  }
  if (ageBand === "secondary") {
    return "Support every inference with a quotation. No quote = no mark.";
  }
  if (ageBand === "primary") {
    return "After answering, check: can you find the sentence in the passage that proves your answer?";
  }
  return "Always go back to the words in the book — they have the answer!";
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildReadingCoachResponse(ctx: CoachContext): CoachResponse {
  const skill = detectReadingSkill(ctx.skillFocus, ctx.question);
  const hintLevel = Math.min(ctx.hintCount + 1, 4);
  const shouldReveal = hintLevel >= 4;
  const { ageBand } = ctx;

  const passageSentence = ctx.passageText
    ? findRelevantSentence(ctx.passageText, ctx.question)
    : null;

  const steps = buildReadingSteps(skill, ageBand, shouldReveal ? 4 : hintLevel, passageSentence);

  const messages: Record<ReadingSkill, Record<number, string>> = {
    literal: {
      1: "The answer is in the passage — look for the key words from the question.",
      2: `Find where the passage talks about "${ctx.question.split(" ").slice(0, 5).join(" ")}…" — your answer is there.`,
      3: passageSentence
        ? `Focus on this part: "${passageSentence.slice(0, 80)}…" — what does it tell you?`
        : "Scan each paragraph's first and last sentence — that is where key information sits.",
      4: `The answer is: "${ctx.correctAnswer}". Re-read the passage section to see why.`,
    },
    inference: {
      1: ageBand === "foundation"
        ? "Look at what the character is doing. How do you think they feel?"
        : "What do the writer's word choices tell you — even if it is not directly stated?",
      2: "Find the key words in that section. Think about what feelings or images they create.",
      3: "Your inference should be: [key word] suggests [feeling/idea] because [explanation of connotation].",
      4: `The intended answer is: "${ctx.correctAnswer}". Notice which words in the text led to that inference.`,
    },
    vocabulary: {
      1: "Look at the words either side of it — they usually give the meaning away.",
      2: "Try replacing the unknown word with each answer option. Which one keeps the sentence making sense?",
      3: "Think about whether the context is positive or negative — that narrows it down immediately.",
      4: `The word means: "${ctx.correctAnswer}". Read that sentence again with this meaning in mind.`,
    },
    structure: {
      1: ageBand === "gcse" || ageBand === "secondary"
        ? "Identify the specific technique being used — then find the effect it creates on the reader."
        : "Look at the special or unusual words the writer has chosen — why those words?",
      2: "Quote the exact words from the text, then explain the effect they have on you as a reader.",
      3: "Your answer needs: technique + quotation + effect. Which part are you missing?",
      4: `A strong answer is: "${ctx.correctAnswer}". Compare it with what you wrote.`,
    },
    summary: {
      1: "What is the main point the writer is making in most paragraphs?",
      2: "Ignore specific details — focus only on the big, repeated idea across the whole passage.",
      3: "In one sentence: what is this passage mainly about? Start with 'The writer is arguing that…'",
      4: `The main idea is: "${ctx.correctAnswer}". Check whether the passage keeps returning to this point.`,
    },
  };

  const followUpMap: Record<ReadingSkill, CoachFollowUp | null> = {
    literal: hintLevel >= 2 ? literalFollowUp(ctx.question, passageSentence) : null,
    inference: hintLevel >= 2 ? inferenceFollowUp(ageBand) : null,
    vocabulary: hintLevel >= 2 ? vocabularyFollowUp(ctx.question) : null,
    structure: hintLevel >= 2 ? structureFollowUp() : null,
    summary: null,
  };

  return {
    mode: hintLevel === 1 ? "hint" : hintLevel <= 3 ? "guided_steps" : "reveal",
    ageBand,
    message: messages[skill]?.[hintLevel] ?? messages[skill]?.[4] ?? "Look back at the passage for clues.",
    steps,
    followUp: followUpMap[skill],
    hintLevel,
    shouldReveal,
    reinforcementNote: readingReinforcement(skill, ageBand),
    tryAgainPrompt: shouldReveal
      ? "Now re-read that section of the passage — can you explain in your own words why that is the answer?"
      : null,
    masterySignal: null,
  emotionalTone: ctx.attemptCount > 1
    ? "Good persistence — let's look at this from a different angle."
    : hintLevel >= 3
    ? "You are working hard on this — let's break it down clearly."
    : "Let's look for the clues in the text.",
  waitPrompt: "Before reading the hint — re-read the relevant part of the passage first.",
  similarQuestion: shouldReveal
    ? { prompt: `Find another sentence in the text that relates to "${ctx.skillFocus ?? "the same skill"}" and explain it in your own words.` }
    : undefined,
  };
}

/** The "clue" shown without opening the full coach panel (maps to old "Give clue" button). */
export function buildReadingClue(skillFocus: string | undefined, question: string, ageBand: AgeBand): string {
  const skill = detectReadingSkill(skillFocus, question);
  const clues: Record<ReadingSkill, Record<AgeBand, string>> = {
    literal: {
      foundation: "The answer is a word in the story. Can you spot it?",
      primary: "Find the sentence in the passage that mentions the same thing the question asks about.",
      secondary: "Scan for keywords from the question — the answer is a direct retrieval.",
      gcse: "Retrieval: locate and lift the relevant phrase from the text.",
    },
    inference: {
      foundation: "How does the character act? That tells us how they feel.",
      primary: "The writer does not say it directly — look at what the character does or says.",
      secondary: "Which words carry emotion? Their connotations point to the answer.",
      gcse: "Identify the connotations of the key words — what do they collectively imply?",
    },
    vocabulary: {
      foundation: "The words around the tricky word will tell you what it means.",
      primary: "Replace the unknown word with each option — which one makes the most sense?",
      secondary: "Think: is the context positive or negative? That narrows the options.",
      gcse: "Context + connotation: the tone of the sentence signals the word's meaning.",
    },
    structure: {
      foundation: "Why did the writer choose those special words?",
      primary: "What feeling do those words give you? That is the effect.",
      secondary: "Name the technique, quote it, then say what effect it has on the reader.",
      gcse: "Technique → embedded quotation → effect on reader → link to writer's purpose.",
    },
    summary: {
      foundation: "What is the story mainly about?",
      primary: "What point does the writer keep coming back to?",
      secondary: "Ignore details — what is the central argument or idea?",
      gcse: "Synthesise: what overarching message runs through the whole text?",
    },
  };
  return clues[skill]?.[ageBand] ?? "Re-read the relevant section of the passage carefully.";
}
