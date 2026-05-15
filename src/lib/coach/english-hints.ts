// ─────────────────────────────────────────────────────────────────────────────
// English / Literature coach — deterministic hint builder
// Skills: language analysis, structure, themes, character, essay writing, SPaG
// ─────────────────────────────────────────────────────────────────────────────

import { AgeBand, CoachContext, CoachFollowUp, CoachResponse, CoachStep } from "./types";

// ── Skill detection ───────────────────────────────────────────────────────────

type EnglishSkill =
  | "language_analysis"  // AQA Q2/Q3 style — identify technique + effect
  | "structure"          // how the text is organised, form, order of ideas
  | "character"          // character analysis, motivation, development
  | "theme"              // recurring ideas, writer's message
  | "essay_writing"      // planning, structure, P-E-E, argument
  | "vocabulary"         // word meaning, connotation, register
  | "grammar_spag"       // SPaG: sentence types, punctuation, tense
  | "creative_writing"   // descriptive, narrative, structural choices
  | "general";

function detectEnglishSkill(skillFocus?: string, question?: string): EnglishSkill {
  const combined = `${skillFocus ?? ""} ${question ?? ""}`.toLowerCase();
  if (/language|technique|method|device|metaphor|simile|alliter|personif|imagery|connotation|effect/.test(combined)) return "language_analysis";
  if (/structure|form|whole text|order|beginning|end|paragraph|layout|organisation/.test(combined)) return "structure";
  if (/character|person|protagonist|attitude|motivation|change|develop|feel|think/.test(combined)) return "character";
  if (/theme|idea|message|writer|author|purpose|overall|society|class|power|gender/.test(combined)) return "theme";
  if (/essay|argument|plan|point|evidence|explain|p-e-e|pee|pqc|analyse|evaluate/.test(combined)) return "essay_writing";
  if (/word|mean|definition|vocabulary|register|formal|informal|synonym|tone/.test(combined)) return "vocabulary";
  if (/grammar|punctuation|tense|sentence|clause|comma|apostrophe|spag/.test(combined)) return "grammar_spag";
  if (/creative|descri|narrat|story|imagine|write|setting|atmosphere/.test(combined)) return "creative_writing";
  return "general";
}

// ── Literary techniques reference ─────────────────────────────────────────────

const TECHNIQUES: Record<string, string> = {
  "metaphor": "A direct comparison without 'like' or 'as'. Creates a vivid image — 'Life is a journey'.",
  "simile": "A comparison using 'like' or 'as'. Shows resemblance — 'She was as cold as ice'.",
  "alliteration": "Repeated consonant sounds at the start of words — creates rhythm or emphasis.",
  "personification": "Giving human qualities to non-human things — 'The wind howled in anger'.",
  "sibilance": "Repeated 's' sounds — creates a soft, hissing, or sinister effect.",
  "hyperbole": "Deliberate exaggeration — 'I've told you a million times'. Creates emphasis.",
  "oxymoron": "Contradictory terms placed together — 'deafening silence', 'bittersweet'.",
  "juxtaposition": "Placing contrasting ideas side by side — highlights the difference.",
  "repetition": "Repeating a word/phrase for emphasis or to build tension/rhythm.",
  "rhetorical question": "A question not expecting an answer — engages the reader directly.",
  "enjambment": "Running a line of poetry into the next without a pause — creates momentum.",
  "caesura": "A deliberate pause within a line (often shown with punctuation) — creates tension.",
};

// ── Follow-up builders ────────────────────────────────────────────────────────

function languageFollowUp(): CoachFollowUp {
  return {
    question: "When analysing a language technique, which three things must your answer include?",
    options: [
      "Technique → Quotation → Effect on reader",
      "Technique → Page number → Opinion",
      "Quotation alone is enough",
      "Introduction → Description → Conclusion",
    ],
    correctIndex: 0,
    onCorrect: "Perfect — Technique + Quotation + Effect is the foundation of every language analysis mark.",
    onWrong: "Always: 1) Name the technique, 2) Quote the evidence, 3) Explain the effect on the reader.",
  };
}

function essayFollowUp(ageBand: AgeBand): CoachFollowUp {
  if (ageBand === "gcse" || ageBand === "secondary") {
    return {
      question: "What does a high-band P-E-E paragraph always include?",
      options: [
        "A clear Point, an embedded Quotation, and a multi-layered Explanation",
        "A point and one example",
        "Three quotations in a row",
        "A long introduction before the point",
      ],
      correctIndex: 0,
      onCorrect: "Exactly — the Explanation is where marks are won. Analyse the language, not just the plot.",
      onWrong: "P-E-E: Point (what you are arguing), Evidence (a precise quotation), Explanation (what the language does to the reader).",
    };
  }
  return {
    question: "What is the first thing you write in a paragraph?",
    options: [
      "Your main point in one clear sentence",
      "A quotation",
      "Background information",
      "Your opinion",
    ],
    correctIndex: 0,
    onCorrect: "Correct — the point tells the reader what this paragraph will prove.",
    onWrong: "Start with your POINT — the clear argument for that paragraph. Then provide evidence.",
  };
}

function characterFollowUp(): CoachFollowUp {
  return {
    question: "What is the best way to show a character's personality in analysis?",
    options: [
      "Zoom in on specific words the writer uses and explain their effect",
      "Describe what the character looks like",
      "Retell what the character does",
      "State your personal opinion without quoting",
    ],
    correctIndex: 0,
    onCorrect: "Yes — close language analysis with specific quotations always produces better answers than retelling plot.",
    onWrong: "Character analysis needs: quotation → language technique → what it reveals about the character.",
  };
}

function grammarFollowUp(): CoachFollowUp {
  return {
    question: "Which sentence is a complex sentence?",
    options: [
      "Although it was raining, she walked to school.",
      "She walked to school.",
      "She walked. It was raining.",
      "Walking in the rain.",
    ],
    correctIndex: 0,
    onCorrect: "Correct — a complex sentence has a main clause and at least one subordinate clause.",
    onWrong: "A complex sentence = main clause + subordinate clause. 'Although it was raining' is the subordinate clause.",
  };
}

// ── Step builders ─────────────────────────────────────────────────────────────

function buildEnglishSteps(skill: EnglishSkill, ageBand: AgeBand, hintLevel: number, question: string): CoachStep[] {
  const allSteps: Record<EnglishSkill, CoachStep[]> = {
    language_analysis: [
      { expression: "Step 1: Identify the technique", explanation: "Name the device: metaphor, simile, alliteration, etc." },
      { expression: "Step 2: Quote precisely", explanation: "Use exact words — embedded in your sentence, not dropped in alone." },
      { expression: "Step 3: Explain the effect", explanation: "'This suggests…', 'This creates a sense of…', 'The reader feels…'" },
      { expression: "Step 4: Explore further (GCSE)", explanation: "What else could this mean? Is there ambiguity? What was the writer's intention?" },
    ],
    structure: [
      { expression: "Step 1: Identify the structural feature", explanation: "Beginning/end, order of ideas, sentence length variation, paragraph breaks." },
      { expression: "Step 2: Explain the effect of position", explanation: "Why is this idea placed here? What effect does the order create?" },
      { expression: "Step 3: Link to whole-text effect", explanation: "How does this structural choice affect the reader's journey through the text?" },
      { expression: "Step 4: Use structural vocabulary", explanation: "Cyclical structure, non-linear narrative, contrast between opening and closing." },
    ],
    character: [
      { expression: "Step 1: State the character trait", explanation: "e.g. 'Macbeth is presented as ambitious'" },
      { expression: "Step 2: Quote the evidence", explanation: "Choose precise language: a single powerful word is often better than a long quotation." },
      { expression: "Step 3: Analyse the language", explanation: "What technique does the writer use? What does the word choice imply?" },
      { expression: "Step 4: Develop (GCSE)", explanation: "How does this trait change through the text? What is the writer saying about human nature?" },
    ],
    theme: [
      { expression: "Step 1: State the theme clearly", explanation: "e.g. 'The writer explores the theme of power through…'" },
      { expression: "Step 2: Find evidence in the text", explanation: "Quote language that represents the theme." },
      { expression: "Step 3: Explain the method", explanation: "How does the writer present this theme? What language choices do they make?" },
      { expression: "Step 4: Context (GCSE)", explanation: "Why might the writer have explored this theme? Historical/social context?" },
    ],
    essay_writing: [
      { expression: "Introduction: Address the question", explanation: "Directly answer the question in your first sentence." },
      { expression: "Body paragraphs: P-E-E structure", explanation: "Point → Embedded quotation → Explanation of language effect." },
      { expression: "Develop each paragraph", explanation: "Don't just explain once. Zoom in on a specific word. Offer an alternative interpretation." },
      { expression: "Conclusion: Summarise your argument", explanation: "Refer back to the question. Avoid introducing new ideas." },
    ],
    vocabulary: [
      { expression: "Step 1: Read the context", explanation: "Read the full sentence containing the word — context reveals meaning." },
      { expression: "Step 2: Identify the tone", explanation: "Is this a positive, negative, or neutral context? That narrows the meaning." },
      { expression: "Step 3: Think about connotations", explanation: "What feelings or associations does this word carry beyond its basic meaning?" },
      { expression: "Step 4: Try substituting", explanation: "Replace the word with each answer option — which keeps the sentence's tone?" },
    ],
    grammar_spag: [
      { expression: "Identify sentence type", explanation: "Simple (one clause), Compound (two main clauses joined by 'and/but/so'), Complex (main + subordinate clause)." },
      { expression: "Check punctuation", explanation: "Commas separate clauses. Full stops end sentences. Apostrophes show possession or omission." },
      { expression: "Verify tense consistency", explanation: "Fiction: use past tense. Present tense creates immediacy. Don't switch mid-paragraph." },
      { expression: "Vary sentence openings", explanation: "Don't start every sentence with 'I' or 'The'. Use adverbs, subordinate clauses, or noun phrases." },
    ],
    creative_writing: [
      { expression: "Step 1: Establish setting", explanation: "Use sensory details — sight, sound, smell, touch, taste. Show, don't tell." },
      { expression: "Step 2: Create atmosphere", explanation: "Your language choices determine mood. Dark adjectives for tension, light for hope." },
      { expression: "Step 3: Structure for effect", explanation: "Short sentences = tension. Long sentences = reflection or calm." },
      { expression: "Step 4: End with impact", explanation: "Cyclical structure, surprising twist, or resonant final image." },
    ],
    general: [
      { expression: "Step 1: Read the question carefully", explanation: "Identify the command word: analyse, explore, how, why, what effect." },
      { expression: "Step 2: Find your evidence", explanation: "Go back to the text — your answer must be rooted in evidence." },
      { expression: "Step 3: Explain, don't describe", explanation: "Don't just say what happens. Say why it matters and what effect it creates." },
    ],
  };

  // Surface relevant technique note if a known technique is mentioned in the question
  const techniqueName = Object.keys(TECHNIQUES).find((t) => question.toLowerCase().includes(t));
  const techniqueNote = techniqueName ? { expression: `${techniqueName}: ${TECHNIQUES[techniqueName] ?? ""}`, explanation: "Remember this definition." } : null;

  const baseSteps = (allSteps[skill] ?? allSteps.general).slice(0, hintLevel + 1);
  if (techniqueNote && hintLevel >= 2 && !baseSteps.some((s) => s.expression.includes(techniqueName ?? ""))) {
    baseSteps.push(techniqueNote);
  }
  return baseSteps;
}

// ── Reinforcement notes ───────────────────────────────────────────────────────

const ENGLISH_TIPS: Record<EnglishSkill, Record<AgeBand, string>> = {
  language_analysis: {
    foundation: "Look for describing words — they help create a picture in your mind.",
    primary: "Ask: 'Why did the author choose THIS word and not a different one?'",
    secondary: "Zoom in on a single word and explain its connotations for the strongest analysis.",
    gcse: "AO2: explore language, form and structure. Name technique → quote → effect → alternative meaning.",
  },
  structure: {
    foundation: "Think about where in the story something happens — beginning, middle or end.",
    primary: "The order of events affects how the reader feels. Think: why is this here?",
    secondary: "Structural features: flashback, non-linear narrative, circular structure, change in perspective.",
    gcse: "Analyse both macro (whole-text) and micro (sentence/paragraph level) structural choices.",
  },
  character: {
    foundation: "What does the character say and do? That tells us about them.",
    primary: "Characters can change — look for how the author shows their development.",
    secondary: "Analyse HOW the writer presents the character, not just what the character does.",
    gcse: "Consider: how does context (historical/social) shape the character? What is the writer saying about people?",
  },
  theme: {
    foundation: "The theme is the big idea the story is about — like friendship or courage.",
    primary: "Themes are shown through what characters do, say, and experience.",
    secondary: "Link theme to specific language choices: how do word choices reflect the theme?",
    gcse: "Contextualise: why was this theme important to the writer at their time of writing?",
  },
  essay_writing: {
    foundation: "Always say WHAT and WHY — what happened, and why it matters.",
    primary: "P-E-E: Point, Evidence, Explanation. Every paragraph uses this.",
    secondary: "The best marks come from developed explanations — one example, analysed deeply.",
    gcse: "Embed quotations. Explore multiple interpretations. Reference context and whole-text meaning.",
  },
  vocabulary: {
    foundation: "If you don't know a word, look at what comes before and after it.",
    primary: "Words have extra meanings beyond their dictionary definition — these are connotations.",
    secondary: "Consider register: formal vs informal language tells us about the speaker's attitude.",
    gcse: "Connotation + denotation. Semantic fields: clusters of related words reveal the writer's focus.",
  },
  grammar_spag: {
    foundation: "Every sentence needs a capital letter at the start and a full stop at the end.",
    primary: "Varying sentence length makes writing interesting. Short for impact. Longer for detail.",
    secondary: "Accurate SPaG demonstrates control. Complex sentences show sophistication.",
    gcse: "SPaG marks: correct apostrophes, varied sentence structures, accurate tense, precise vocabulary.",
  },
  creative_writing: {
    foundation: "Good stories use describing words to help the reader imagine the scene.",
    primary: "Show feelings through actions and details — don't just say 'she was sad', show it.",
    secondary: "Structural choices are as powerful as language choices. Consider why each paragraph ends where it does.",
    gcse: "High-band creative writing: consistent voice, structural surprise, sophisticated control of tone.",
  },
  general: {
    foundation: "Every answer should say WHAT you noticed and WHY it matters.",
    primary: "Always go back to the text — your evidence is there.",
    secondary: "Explain your thinking, not just your observation.",
    gcse: "The examiner cannot give marks for what they have to assume. Make your thinking explicit.",
  },
};

// ── Main export ───────────────────────────────────────────────────────────────

export function buildEnglishCoachResponse(ctx: CoachContext): CoachResponse {
  const skill = detectEnglishSkill(ctx.skillFocus, ctx.question);
  const hintLevel = Math.min(ctx.hintCount + 1, 4);
  const shouldReveal = hintLevel >= 4;
  const { ageBand } = ctx;

  const steps = buildEnglishSteps(skill, ageBand, shouldReveal ? 4 : hintLevel, ctx.question);

  const followUpMap: Record<EnglishSkill, CoachFollowUp | null> = {
    language_analysis: hintLevel >= 2 ? languageFollowUp() : null,
    essay_writing: hintLevel >= 2 ? essayFollowUp(ageBand) : null,
    character: hintLevel >= 2 ? characterFollowUp() : null,
    grammar_spag: hintLevel >= 2 ? grammarFollowUp() : null,
    structure: null,
    theme: null,
    vocabulary: null,
    creative_writing: null,
    general: null,
  };

  const messages: Record<EnglishSkill, Record<number, string>> = {
    language_analysis: {
      1: ageBand === "foundation"
        ? "Look at the describing words the author uses — why did they pick those specific words?"
        : "Find the technique first. What does the writer do? Then ask: what effect does this create on the reader?",
      2: "Good — now go deeper. Quote the specific word or phrase and explain what feelings or images it creates.",
      3: ageBand === "gcse"
        ? "Your analysis needs: technique → precise quote → effect on reader → alternative/deeper interpretation."
        : "Use the P-E-E structure: Point, then Evidence (quote), then Explanation of the effect.",
      4: `Model answer approach: "${ctx.correctAnswer}". Study how the explanation links technique to effect.`,
    },
    essay_writing: {
      1: "Start by identifying your main argument. What point will this paragraph prove?",
      2: "State your point, find the strongest quotation to support it, then explain the language.",
      3: "Your paragraph needs: clear point → embedded quotation → language analysis → link back to question.",
      4: `Here is how to approach this: "${ctx.correctAnswer}".`,
    },
    character: {
      1: "What does this character say or do that reveals something about them? Look for specific word choices.",
      2: "Quote the evidence, then ask: what does this language choice tell us about the character's feelings or motives?",
      3: ageBand === "gcse"
        ? "Go beyond what is obvious: how does the writer use language to reveal something beneath the surface?"
        : "Good character analysis shows HOW the author writes about the character, not just WHAT they do.",
      4: `Model approach: "${ctx.correctAnswer}".`,
    },
    structure: {
      1: "Think about WHERE in the text this moment appears. Why has the writer placed it here?",
      2: "Consider the effect of the order: does moving from X to Y create contrast, build tension, or show change?",
      3: "Name the structural feature, then explain its effect on the reader's experience of the text as a whole.",
      4: `Structural analysis approach: "${ctx.correctAnswer}".`,
    },
    theme: {
      1: "What is the big idea this question, character, or moment is connected to?",
      2: "Find language that represents this theme — what words does the writer use when exploring it?",
      3: "Link theme to language and context: why does this theme matter in this text, at this time?",
      4: `Thematic analysis: "${ctx.correctAnswer}".`,
    },
    vocabulary: {
      1: "Read the full sentence around the word. Does the context feel positive, negative, or neutral?",
      2: "Think about what the word makes you feel or picture. Those associations are its connotations.",
      3: "Replace the word with each option and see which preserves the meaning and tone of the sentence.",
      4: `The word means: "${ctx.correctAnswer}". Re-read the sentence with this meaning to confirm it makes sense.`,
    },
    grammar_spag: {
      1: "Identify the sentence type first: simple, compound, or complex?",
      2: "Look at the clauses — how many are there? Are they joined with a coordinating or subordinating conjunction?",
      3: "Complex sentences always have a main clause (can stand alone) + a subordinate clause (cannot stand alone).",
      4: `The answer is: "${ctx.correctAnswer}".`,
    },
    creative_writing: {
      1: "Engage the senses — what would your reader see, hear, smell, feel? That is where great description comes from.",
      2: "Every sentence should either create atmosphere, reveal character, or move the narrative forward.",
      3: "Vary your sentence lengths deliberately: short for impact, long for building a detailed image.",
      4: "Strong creative writing shows, not tells. Instead of 'she was scared', show the shaking hands, the dry mouth.",
    },
    general: {
      1: "Read the question carefully — what is it actually asking you to do?",
      2: "Go back to the text. Your evidence is there — find the specific word or line that answers this.",
      3: "Explain your thinking: don't just say what you noticed — say why it matters.",
      4: `The expected response is: "${ctx.correctAnswer}".`,
    },
  };

  const emotionalTones: Record<number, string> = {
    1: ctx.attemptCount > 1 ? "Good persistence — let's look at this from a different angle." : "Let's think through this carefully.",
    2: "You're building toward the answer — each step gets you closer.",
    3: ctx.confidenceScore < 0.4 ? "Take it one step at a time — you're doing well." : "Almost there — one more guided step.",
    4: "You've worked hard for this — study the full answer, then try to reproduce it.",
  };

  return {
    mode: hintLevel === 1 ? "hint" : hintLevel <= 3 ? "guided_steps" : "reveal",
    ageBand,
    message: messages[skill]?.[hintLevel] ?? messages.general?.[hintLevel] ?? "",
    steps,
    followUp: followUpMap[skill] ?? null,
    hintLevel,
    shouldReveal,
    reinforcementNote: ENGLISH_TIPS[skill]?.[ageBand] ?? "",
    tryAgainPrompt: shouldReveal
      ? "Now attempt a similar question — apply the same technique to a different text or example."
      : null,
    masterySignal: null,
    emotionalTone: emotionalTones[hintLevel] ?? "Let's work through this together.",
    waitPrompt: "Before reading the hint — re-read the relevant part of the text first.",
    similarQuestion: shouldReveal
      ? { prompt: `Apply the same technique to this: find another example of ${ctx.skillFocus ?? "this skill"} in the text and explain its effect.` }
      : undefined,
  };
}
