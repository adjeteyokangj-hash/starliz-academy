// ─────────────────────────────────────────────────────────────────────────────
// Real-Life Context Injectors — connect learning to real-world scenarios
// Makes coaching more relatable and improves retention
// ─────────────────────────────────────────────────────────────────────────────

import { CoachSubject, AgeBand } from "./types";

export type RealLifeContext = {
  scenario: string;      // short real-world scenario (1–2 sentences)
  connection: string;    // how this skill applies in real life
  example?: string;      // concrete example the student recognizes
};

// ─ Maths contexts ─────────────────────────────────────────────────────────

const MATHS_CONTEXTS: RealLifeContext[] = [
  {
    scenario: "You're at the shops with £20.",
    connection: "You need to work out if you have enough money for what you want to buy.",
    example: "If a toy costs £7.50 and a book costs £5.99, do you have enough?",
  },
  {
    scenario: "Sharing pizza fairly at a party.",
    connection: "You need to divide equally so everyone gets the same amount.",
    example: "If 8 people share 2 pizzas with 8 slices each, how many slices per person?",
  },
  {
    scenario: "Scoring goals in football.",
    connection: "You track your team's score and work out who's winning.",
    example: "If one team scores 3 and the other scores 5, how many behind are you?",
  },
  {
    scenario: "Measuring ingredients to bake a cake.",
    connection: "You follow a recipe and measure correctly so it turns out right.",
    example: "If a recipe needs 200g flour but you want to make double, how much do you use?",
  },
  {
    scenario: "Planning a birthday party.",
    connection: "You work out costs: how many invitations, how much food, what it costs.",
    example: "If invitations cost 50p each and you invite 12 people, what's the total?",
  },
];

// ─ Reading contexts ──────────────────────────────────────────────────────

const READING_CONTEXTS: RealLifeContext[] = [
  {
    scenario: "Reading a book to find out what happens next.",
    connection: "Good readers notice clues the author leaves to guess what will happen.",
    example: "If the character is sneaking around at midnight, what might happen?",
  },
  {
    scenario: "Understanding a friend's feelings when they write a message.",
    connection: "You read between the lines to know if they're happy, upset, or joking.",
    example: "If a friend says 'Sure, FINE, whatever' — are they really fine?",
  },
  {
    scenario: "Reading instructions to build something.",
    connection: "You need to find the key information and ignore the details you don't need.",
    example: "Instruction says 'Use only red bricks, ignore blue bricks' — why does that matter?",
  },
  {
    scenario: "Reading news or social media.",
    connection: "You figure out if something is opinion or fact, and whether to trust it.",
    example: "Does the headline tell you what happened, or what the writer thinks?",
  },
];

// ─ Spelling contexts ─────────────────────────────────────────────────────

const SPELLING_CONTEXTS: RealLifeContext[] = [
  {
    scenario: "Writing a message to a friend.",
    connection: "Correct spelling means your friend understands you easily.",
    example: "Spelling 'their' wrong might confuse the meaning completely.",
  },
  {
    scenario: "Filling in a school form with your name.",
    connection: "Your name needs to match records exactly or mail might get lost.",
    example: "If you spell it differently each time, the school gets confused.",
  },
  {
    scenario: "Reading labels on food in a shop.",
    connection: "You need to spot ingredients and labels you care about.",
    example: "Spotting 'allergy' warnings means reading carefully and correctly.",
  },
];

// ─ Science contexts ──────────────────────────────────────────────────────

const SCIENCE_CONTEXTS: RealLifeContext[] = [
  {
    scenario: "Weather and choosing what to wear.",
    connection: "Understanding temperature, pressure, and moisture affects your day.",
    example: "If it's 5°C outside, do you need a coat? Why?",
  },
  {
    scenario: "Cooking or baking at home.",
    connection: "Heat changes materials — melting, mixing, cooking food.",
    example: "Why does ice melt in a warm room but stay frozen in a freezer?",
  },
  {
    scenario: "Playing sports or exercise.",
    connection: "Your body uses energy, your muscles work, you get tired and breathe harder.",
    example: "Why do you get out of breath when running? What's happening in your body?",
  },
  {
    scenario: "Keeping plants alive at home.",
    connection: "Plants need light, water, and soil — understanding growth and life.",
    example: "Why does a plant die without water but grow with it?",
  },
  {
    scenario: "How your phone battery works.",
    connection: "Energy is stored and transferred to power the device.",
    example: "Why does your phone battery drain faster when you use it a lot?",
  },
];

// ─ English / Literature contexts ─────────────────────────────────────────

const ENGLISH_CONTEXTS: RealLifeContext[] = [
  {
    scenario: "Understanding a film or TV show.",
    connection: "Writers use techniques (music, camera angles, dialogue) to affect how you feel.",
    example: "Scary music makes you tense even before something scary happens.",
  },
  {
    scenario: "A character in a story reminds you of someone you know.",
    connection: "Writers make characters feel real by showing how they think and act.",
    example: "You might recognise a friend's stubbornness in a character.",
  },
  {
    scenario: "Writing an argument with someone.",
    connection: "Good communication uses evidence and reasoning, not just opinion.",
    example: "Saying 'you're wrong' is weaker than saying 'because X, Y, and Z.'",
  },
  {
    scenario: "A poem or song lyric that moves you.",
    connection: "Writers use language carefully to create emotion and meaning.",
    example: "A short line might hit harder than a long one — that's craft.",
  },
];

// ─ Selector and injector ──────────────────────────────────────────────────

function getContextsForSubject(subject: CoachSubject, ageBand: AgeBand): RealLifeContext[] {
  if (subject === "maths") return MATHS_CONTEXTS;
  if (subject === "reading") return READING_CONTEXTS;
  if (subject === "spelling") return SPELLING_CONTEXTS;
  if (subject === "science") return SCIENCE_CONTEXTS;
  if (subject === "english") return ENGLISH_CONTEXTS;
  return [];
}

/**
 * Inject a real-life context into a coaching message.
 * Picks a relevant scenario based on subject and hint level.
 * Returns null if no context is suitable for this turn.
 */
export function injectRealLifeContext(
  subject: CoachSubject,
  ageBand: AgeBand,
  hintLevel: number,
  skillFocus?: string,
): RealLifeContext | null {
  // Only inject at hint levels 1–2 (too early = overwhelming; too late = too late)
  if (hintLevel > 2) return null;

  // Foundation students respond better to concrete examples
  if (ageBand === "foundation" && hintLevel === 1) {
    const contexts = getContextsForSubject(subject, ageBand);
    if (contexts.length === 0) return null;
    // Pick one at random or based on skill
    return contexts[Math.floor(Math.random() * contexts.length)] || null;
  }

  // Primary students benefit from real-world connection at level 2
  if (ageBand === "primary" && hintLevel === 2) {
    const contexts = getContextsForSubject(subject, ageBand);
    if (contexts.length === 0) return null;
    return contexts[Math.floor(Math.random() * contexts.length)] || null;
  }

  // Secondary/GCSE less often (they want direct method instruction)
  if ((ageBand === "secondary" || ageBand === "gcse") && hintLevel === 1 && subject === "science") {
    const contexts = getContextsForSubject(subject, ageBand);
    return contexts.length > 0 ? contexts[0]! : null;
  }

  return null;
}

/**
 * Format a real-life context as a coachable sentence.
 * Returns a line that can be included in the coaching message.
 */
export function formatContextAsCoachingLine(context: RealLifeContext): string {
  return `${context.scenario} — ${context.connection}${context.example ? ` For example: ${context.example}` : ""}`;
}
