import { ActivityArea, ChildProfile } from "@/lib/store";
import { LearningEvent } from "@/lib/history_api";
import { SPELLING_WORD_BANK } from "@/lib/spelling_words";

export function getSpellingWords(difficulty: number): string[] {
  const safe = Math.max(1, Math.min(5, difficulty));
  return SPELLING_WORD_BANK.filter((entry) => entry.level === safe).map((entry) => entry.word);
}

export type SpellingWord = {
  id: string;
  word: string;
  level: 1 | 2 | 3 | 4 | 5;
  promptType?: "voice" | "text" | "image";
  imageUrl?: string;
  hint: string;
  categoryHint: string;
  syllables: string;
  sentenceContext: string;
  emoji: string;
  patterns: string[];
};

export type MathQuestion = {
  id: string;
  prompt: string;
  answer: number;
  topic: string;
  hints: string[];
  visual?: string;
  choices?: number[];
};

export type ReadingPassage = {
  id: string;
  passage: string;
  question: string;
  choices: string[];
  answer: string;
};

function ensureMinimumMathQuestions(questions: MathQuestion[], minCount = 12): MathQuestion[] {
  if (questions.length >= minCount) return questions;
  if (!questions.length) return [];

  const filled = [...questions];
  let cloneIndex = 0;
  while (filled.length < minCount) {
    const source = questions[cloneIndex % questions.length];
    const cycle = Math.floor(cloneIndex / questions.length) + 1;
    filled.push({
      ...source,
      id: `${source.id}-session-${cycle}-${cloneIndex}`,
    });
    cloneIndex += 1;
  }

  return filled;
}

export function getMathQuestions(difficulty: number): MathQuestion[] {
  if (difficulty <= 1) {
    return ensureMinimumMathQuestions([
      {
        id: "math-1-3-plus-4",
        prompt: "Count the stars and solve: 3 + 4",
        answer: 7,
        topic: "counting",
        visual: "★★★ + ★★★★",
        choices: [6, 7, 8, 9],
        hints: ["Start with 3.", "Count 4 more: 4, 5, 6, 7.", "3 + 4 = 7."],
      },
      {
        id: "math-1-9-minus-2",
        prompt: "Take away 2 from 9",
        answer: 7,
        topic: "subtraction",
        visual: "●●●●●●●●● - ●●",
        choices: [6, 7, 8, 9],
        hints: ["Start with 9.", "Count back 2: 8, 7.", "9 - 2 = 7."],
      },
      {
        id: "math-1-5-plus-1",
        prompt: "5 + 1",
        answer: 6,
        topic: "number bonds",
        visual: "●●●●● + ●",
        choices: [5, 6, 7, 8],
        hints: ["Add one more to 5.", "One step after 5 is 6.", "5 + 1 = 6."],
      },
      {
        id: "math-1-2-plus-3",
        prompt: "2 + 3",
        answer: 5,
        topic: "counting",
        visual: "★★ + ★★★",
        choices: [4, 5, 6, 7],
        hints: ["Start with 2.", "Count 3 more.", "2 + 3 = 5."],
      },
      {
        id: "math-1-8-minus-3",
        prompt: "8 - 3",
        answer: 5,
        topic: "subtraction",
        visual: "●●●●●●●● - ●●●",
        choices: [4, 5, 6, 7],
        hints: ["Start with 8.", "Count back 3.", "8 - 3 = 5."],
      },
      {
        id: "math-1-4-plus-5",
        prompt: "4 + 5",
        answer: 9,
        topic: "counting",
        visual: "★★★★ + ★★★★★",
        choices: [8, 9, 10, 11],
        hints: ["Start with 4.", "Count 5 more.", "4 + 5 = 9."],
      },
      {
        id: "math-1-10-minus-4",
        prompt: "10 - 4",
        answer: 6,
        topic: "subtraction",
        visual: "●●●●●●●●●● - ●●●●",
        choices: [5, 6, 7, 8],
        hints: ["Start with 10.", "Count back 4.", "10 - 4 = 6."],
      },
      {
        id: "math-1-7-plus-2",
        prompt: "7 + 2",
        answer: 9,
        topic: "number bonds",
        visual: "●●●●●●● + ●●",
        choices: [8, 9, 10, 11],
        hints: ["Start with 7.", "Count 2 more.", "7 + 2 = 9."],
      },
    ]);
  }
  if (difficulty === 2) {
    return ensureMinimumMathQuestions([
      {
        id: "math-2-12-plus-8",
        prompt: "What is 12 + 8?",
        answer: 20,
        topic: "addition",
        hints: ["Make a 10 from 8.", "12 + 8 = 12 + 8.", "The answer is 20."],
      },
      {
        id: "math-2-18-minus-9",
        prompt: "What is 18 - 9?",
        answer: 9,
        topic: "subtraction",
        hints: ["Subtract 10 then add 1.", "18 - 10 = 8, then +1 = 9.", "The answer is 9."],
      },
      {
        id: "math-2-7-plus-15",
        prompt: "What is 7 + 15?",
        answer: 22,
        topic: "addition",
        hints: ["Add 3 to reach 10.", "Use 15 = 3 + 12, so 7 + 3 + 12.", "The answer is 22."],
      },
      {
        id: "math-2-16-plus-9",
        prompt: "What is 16 + 9?",
        answer: 25,
        topic: "addition",
        choices: [23, 24, 25, 26],
        hints: ["Make a ten with 9.", "16 + 4 = 20, then +5.", "The answer is 25."],
      },
      {
        id: "math-2-27-minus-8",
        prompt: "What is 27 - 8?",
        answer: 19,
        topic: "subtraction",
        choices: [18, 19, 20, 21],
        hints: ["Subtract 7 to get 20.", "Then subtract 1 more.", "The answer is 19."],
      },
      {
        id: "math-2-14-plus-13",
        prompt: "What is 14 + 13?",
        answer: 27,
        topic: "addition",
        choices: [25, 26, 27, 28],
        hints: ["Add tens and ones.", "14 + 10 = 24, then +3.", "The answer is 27."],
      },
      {
        id: "math-2-33-minus-7",
        prompt: "What is 33 - 7?",
        answer: 26,
        topic: "subtraction",
        choices: [24, 25, 26, 27],
        hints: ["Count back in steps.", "33 - 3 = 30, then -4.", "The answer is 26."],
      },
      {
        id: "math-2-11-plus-18",
        prompt: "What is 11 + 18?",
        answer: 29,
        topic: "addition",
        choices: [27, 28, 29, 30],
        hints: ["Add 9 to 11 to reach 20.", "Then add the remaining 9.", "The answer is 29."],
      },
      {
        id: "math-2-2x6",
        prompt: "Times table: 2 x 6",
        answer: 12,
        topic: "times_tables",
        choices: [10, 11, 12, 13],
        hints: ["2 groups of 6.", "6 + 6 = 12.", "The answer is 12."],
      },
      {
        id: "math-2-5x4",
        prompt: "Times table: 5 x 4",
        answer: 20,
        topic: "times_tables",
        choices: [18, 19, 20, 21],
        hints: ["5 groups of 4.", "4 + 4 + 4 + 4 + 4.", "The answer is 20."],
      },
    ]);
  }
  if (difficulty === 3) {
    return ensureMinimumMathQuestions([
      {
        id: "math-3-6x4",
        prompt: "What is 6 x 4?",
        answer: 24,
        topic: "multiplication",
        choices: [20, 22, 24, 26],
        hints: ["Think of 4 groups of 6.", "6 + 6 + 6 + 6 = 24.", "So 6 x 4 = 24."],
      },
      {
        id: "math-3-36-div-6",
        prompt: "What is 36 / 6?",
        answer: 6,
        topic: "division",
        choices: [4, 5, 6, 8],
        hints: ["How many 6s fit in 36?", "6 x 6 = 36.", "So 36 / 6 = 6."],
      },
      {
        id: "math-3-9x3",
        prompt: "What is 9 x 3?",
        answer: 27,
        topic: "multiplication",
        choices: [24, 25, 27, 30],
        hints: ["Think 9 + 9 + 9.", "9 + 9 = 18, then +9 = 27.", "So 9 x 3 = 27."],
      },
      {
        id: "math-3-8x5",
        prompt: "What is 8 x 5?",
        answer: 40,
        topic: "multiplication",
        choices: [35, 38, 40, 42],
        hints: ["Think 5 groups of 8.", "8 + 8 + 8 + 8 + 8.", "The answer is 40."],
      },
      {
        id: "math-3-45-div-5",
        prompt: "What is 45 / 5?",
        answer: 9,
        topic: "division",
        choices: [7, 8, 9, 10],
        hints: ["5 x what equals 45?", "Use your 5 times table.", "The answer is 9."],
      },
      {
        id: "math-3-7x6",
        prompt: "What is 7 x 6?",
        answer: 42,
        topic: "multiplication",
        choices: [40, 41, 42, 43],
        hints: ["Think 6 groups of 7.", "7 x 6 is in the 7 times table.", "The answer is 42."],
      },
      {
        id: "math-3-54-div-9",
        prompt: "What is 54 / 9?",
        answer: 6,
        topic: "division",
        choices: [5, 6, 7, 8],
        hints: ["9 x what equals 54?", "Use your 9 times table.", "The answer is 6."],
      },
      {
        id: "math-3-4x12",
        prompt: "What is 4 x 12?",
        answer: 48,
        topic: "multiplication",
        choices: [44, 46, 48, 50],
        hints: ["Think 12 + 12 + 12 + 12.", "Double 12 to get 24, then double again.", "The answer is 48."],
      },
      {
        id: "math-3-7x8",
        prompt: "Times table: 7 x 8",
        answer: 56,
        topic: "times_tables",
        choices: [54, 55, 56, 57],
        hints: ["Use the 7 times table.", "7 x 4 = 28, double it.", "The answer is 56."],
      },
      {
        id: "math-3-9x6",
        prompt: "Times table: 9 x 6",
        answer: 54,
        topic: "times_tables",
        choices: [52, 53, 54, 55],
        hints: ["Use 9 + 9 + 9 + 9 + 9 + 9.", "Or 10 x 6 minus 6.", "The answer is 54."],
      },
    ]);
  }
  if (difficulty === 4) {
    return ensureMinimumMathQuestions([
      {
        id: "math-4-14x3",
        prompt: "What is 14 x 3?",
        answer: 42,
        topic: "multiplication",
        choices: [38, 40, 42, 45],
        hints: ["Break 14 into 10 and 4.", "(10 x 3) + (4 x 3) = 30 + 12.", "30 + 12 = ?"],
      },
      {
        id: "math-4-81-div-9",
        prompt: "What is 81 / 9?",
        answer: 9,
        topic: "division",
        choices: [7, 8, 9, 10],
        hints: ["Which times table reaches 81?", "Try the 9 times table: 9 x ? = 81.", "9 x 9 = 81, so the answer is…"],
      },
      {
        id: "math-4-25-plus-37",
        prompt: "What is 25 + 37?",
        answer: 62,
        topic: "addition",
        choices: [58, 60, 62, 64],
        hints: ["Add the tens first: 20 + 30.", "Now add the ones: 5 + 7 = 12.", "50 + 12 = ?"],
      },
      {
        id: "math-4-18x6",
        prompt: "What is 18 x 6?",
        answer: 108,
        topic: "multiplication",
        choices: [102, 106, 108, 112],
        hints: ["Break 18 into 10 and 8.", "(10 x 6) + (8 x 6).", "The answer is 108."],
      },
      {
        id: "math-4-96-div-8",
        prompt: "What is 96 / 8?",
        answer: 12,
        topic: "division",
        choices: [10, 11, 12, 13],
        hints: ["8 x what equals 96?", "Use your 8 times table.", "The answer is 12."],
      },
      {
        id: "math-4-42-plus-29",
        prompt: "What is 42 + 29?",
        answer: 71,
        topic: "addition",
        choices: [69, 70, 71, 72],
        hints: ["Add tens and ones.", "42 + 20, then +9.", "The answer is 71."],
      },
      {
        id: "math-4-63-minus-28",
        prompt: "What is 63 - 28?",
        answer: 35,
        topic: "subtraction",
        choices: [33, 34, 35, 36],
        hints: ["Subtract 20 first.", "Then subtract 8.", "The answer is 35."],
      },
      {
        id: "math-4-36x4",
        prompt: "What is 36 x 4?",
        answer: 144,
        topic: "multiplication",
        choices: [136, 140, 144, 148],
        hints: ["Break 36 into 30 and 6.", "(30 x 4) + (6 x 4).", "The answer is 144."],
      },
      {
        id: "math-4-12x12",
        prompt: "Times table challenge: 12 x 12",
        answer: 144,
        topic: "times_tables",
        choices: [132, 140, 144, 148],
        hints: ["12 x 10 + 12 x 2.", "120 + 24.", "The answer is 144."],
      },
      {
        id: "math-4-11x9",
        prompt: "Times table challenge: 11 x 9",
        answer: 99,
        topic: "times_tables",
        choices: [88, 95, 99, 101],
        hints: ["11 groups of 9.", "10 x 9 + 1 x 9.", "The answer is 99."],
      },
    ]);
  }
  return ensureMinimumMathQuestions([
    {
      id: "math-5-125-div-5",
      prompt: "A team shares 125 stickers equally between 5 students. How many each?",
      answer: 25,
      topic: "word problems",
      choices: [20, 22, 25, 30],
      hints: ["What operation splits things equally? Division.", "Write it as 125 ÷ 5.", "125 ÷ 5 = ?"],
    },
    {
      id: "math-5-48x2",
      prompt: "A shop has 2 shelves with 48 books each. Total books?",
      answer: 96,
      topic: "word problems",
      choices: [86, 92, 96, 98],
      hints: ["Two shelves with the same number — that's multiplication.", "Write it as 48 × 2.", "48 × 2 = ?"],
    },
    {
      id: "math-5-144-div-12",
      prompt: "144 pencils are packed into boxes of 12. How many boxes are needed?",
      answer: 12,
      topic: "word problems",
      choices: [10, 11, 12, 14],
      hints: ["Packing into equal groups means division.", "Write it as 144 ÷ 12.", "144 ÷ 12 = ?"],
    },
    {
      id: "math-5-84-div-7",
      prompt: "84 apples are shared equally among 7 baskets. How many in each basket?",
      answer: 12,
      topic: "word problems",
      choices: [10, 11, 12, 13],
      hints: ["Shared equally means division.", "Write 84 ÷ 7.", "The answer is 12."],
    },
    {
      id: "math-5-15x9",
      prompt: "A class has 9 teams with 15 points each. Total points?",
      answer: 135,
      topic: "word problems",
      choices: [125, 130, 135, 140],
      hints: ["Equal teams means multiplication.", "Write 15 x 9.", "The answer is 135."],
    },
    {
      id: "math-5-180-div-6",
      prompt: "180 pages are read in 6 days equally. Pages per day?",
      answer: 30,
      topic: "word problems",
      choices: [28, 29, 30, 31],
      hints: ["Equal amount per day means division.", "Write 180 ÷ 6.", "The answer is 30."],
    },
    {
      id: "math-5-27x8",
      prompt: "A shop sells 8 boxes with 27 pencils each. How many pencils?",
      answer: 216,
      topic: "word problems",
      choices: [206, 210, 216, 222],
      hints: ["Equal boxes means multiplication.", "Write 27 x 8.", "The answer is 216."],
    },
    {
      id: "math-5-99-div-9",
      prompt: "99 stickers are put into packs of 9. How many packs?",
      answer: 11,
      topic: "word problems",
      choices: [9, 10, 11, 12],
      hints: ["Packs of equal size means division.", "Write 99 ÷ 9.", "The answer is 11."],
    },
  ]);
}

export function getReadingPassages(difficulty: number): ReadingPassage[] {
  if (difficulty <= 1) {
    return [
      {
        id: "read-1-mia-kite",
        passage: "Mia has a red kite. She runs in the park and the kite flies high.",
        question: "Where is Mia?",
        choices: ["At the park", "At school", "At home"],
        answer: "At the park",
      },
      {
        id: "read-1-ben-fish",
        passage: "Ben feeds his fish every morning before breakfast.",
        question: "When does Ben feed the fish?",
        choices: ["At night", "Before breakfast", "After school"],
        answer: "Before breakfast",
      },
      {
        id: "read-1-lia-library",
        passage: "Lia borrows a story book from the library on Saturday.",
        question: "Where does Lia get the book?",
        choices: ["From the park", "From the library", "From the shop"],
        answer: "From the library",
      },
      {
        id: "read-1-tom-rain",
        passage: "Tom puts on his raincoat when dark clouds cover the sky.",
        question: "Why does Tom wear a raincoat?",
        choices: ["It is sunny", "It might rain", "He is cold at night"],
        answer: "It might rain",
      },
      {
        id: "read-1-zoe-lunch",
        passage: "Zoe eats an apple and a sandwich at lunch time.",
        question: "What does Zoe eat?",
        choices: ["Apple and sandwich", "Only soup", "Cake and milk"],
        answer: "Apple and sandwich",
      },
      {
        id: "read-1-ian-boots",
        passage: "Ian puts his boots by the door after playing in the mud.",
        question: "Where does Ian put his boots?",
        choices: ["Under the bed", "By the door", "In the car"],
        answer: "By the door",
      },
      {
        id: "read-1-ella-cat",
        passage: "Ella fills the cat's water bowl before she leaves for school.",
        question: "What does Ella fill?",
        choices: ["The fish tank", "The water bowl", "The lunch box"],
        answer: "The water bowl",
      },
    ];
  }
  if (difficulty === 2) {
    return [
      {
        id: "read-2-ava-sunflower",
        passage: "Ava planted sunflower seeds in spring. By summer, the flowers were taller than her bike.",
        question: "When were the flowers tall?",
        choices: ["In winter", "In summer", "In autumn"],
        answer: "In summer",
      },
      {
        id: "read-2-leo-hike",
        passage: "Leo packed a map, water bottle, and snack before the family hike.",
        question: "What did Leo pack?",
        choices: ["A toy robot", "A map", "A blanket"],
        answer: "A map",
      },
      {
        id: "read-2-sam-poster",
        passage: "Sam made a poster about planets and used bright labels for each one.",
        question: "Why did Sam use labels?",
        choices: ["To hide the planets", "To name each planet", "To draw animals"],
        answer: "To name each planet",
      },
      {
        id: "read-2-maya-seed",
        passage: "Maya watered the seed every day, so the stem grew stronger each week.",
        question: "What helped the stem grow stronger?",
        choices: ["Daily watering", "Cold weather", "No sunlight"],
        answer: "Daily watering",
      },
      {
        id: "read-2-omar-museum",
        passage: "Omar visited a museum and wrote three facts in his notebook before leaving.",
        question: "What did Omar do before leaving?",
        choices: ["Bought lunch", "Wrote facts", "Called a friend"],
        answer: "Wrote facts",
      },
      {
        id: "read-2-rina-map",
        passage: "Rina checked the bus map twice so she would not miss her stop.",
        question: "Why did Rina check the map twice?",
        choices: ["To draw a new map", "To avoid missing her stop", "To count buses"],
        answer: "To avoid missing her stop",
      },
      {
        id: "read-2-joel-paint",
        passage: "Joel covered the table with newspaper before painting to keep it clean.",
        question: "Why did Joel use newspaper?",
        choices: ["To read stories", "To keep the table clean", "To wrap gifts"],
        answer: "To keep the table clean",
      },
    ];
  }
  if (difficulty === 3) {
    return [
      {
        id: "read-3-science-bridge",
        passage: "The science club built a small bridge from craft sticks. They tested it with coins to see how much weight it could hold.",
        question: "Why did they use coins?",
        choices: ["To decorate the bridge", "To test the bridge", "To pay for glue"],
        answer: "To test the bridge",
      },
      {
        id: "read-3-nora-mystery",
        passage: "Nora reread the final chapter because the mystery ending surprised her the first time.",
        question: "Why did Nora reread the chapter?",
        choices: ["She lost the book", "She was surprised by the ending", "She skipped the first chapter"],
        answer: "She was surprised by the ending",
      },
      {
        id: "read-3-eco-team",
        passage: "The eco team sorted paper, plastic, and cans into separate bins so recycling would be easier later.",
        question: "Why did they separate the bins?",
        choices: ["To make recycling easier", "To hide the bins", "To paint the room"],
        answer: "To make recycling easier",
      },
      {
        id: "read-3-kai-speech",
        passage: "Kai practised his class speech twice at home, so he felt calm during presentation time.",
        question: "How did practice help Kai?",
        choices: ["He forgot his lines", "He felt calm", "He skipped the speech"],
        answer: "He felt calm",
      },
      {
        id: "read-3-bridge-fix",
        passage: "After the first test, the team added extra supports under the bridge to stop it bending.",
        question: "What was the purpose of extra supports?",
        choices: ["To add color", "To stop bending", "To make it shorter"],
        answer: "To stop bending",
      },
      {
        id: "read-3-lab-notes",
        passage: "During the experiment, Iris wrote notes after each step so she could compare results later.",
        question: "Why did Iris write notes after each step?",
        choices: ["To compare results later", "To finish faster", "To avoid doing the experiment"],
        answer: "To compare results later",
      },
      {
        id: "read-3-market-list",
        passage: "Before going to the market, Theo grouped his list by fruits, vegetables, and dairy to shop more quickly.",
        question: "How did Theo's grouped list help?",
        choices: ["It made shopping slower", "It helped him shop faster", "It changed store prices"],
        answer: "It helped him shop faster",
      },
    ];
  }
  if (difficulty === 4) {
    return [
      {
        id: "read-4-library-corner",
        passage: "The class library used to be noisy during free reading. Ms. Patel moved soft chairs into a corner and added a sign asking for whisper voices, and more students finished their books.",
        question: "Why did more students finish their books?",
        choices: ["They had fewer books", "The space became calmer", "Reading time got shorter"],
        answer: "The space became calmer",
      },
      {
        id: "read-4-garden-measure",
        passage: "During science, Jalen measured the school garden every Friday. After six weeks, he noticed the bean plants grew fastest on the side that got morning sunlight.",
        question: "What helped Jalen reach his conclusion?",
        choices: ["Guessing once", "Repeated measurements over time", "A friend's opinion"],
        answer: "Repeated measurements over time",
      },
      {
        id: "read-4-team-practice",
        passage: "Before the debate, Ana's team practised answering hard questions. On competition day, they paused, shared evidence, and responded clearly even when surprised.",
        question: "How did practice affect the team?",
        choices: ["They ignored questions", "They handled surprises with evidence", "They talked less"],
        answer: "They handled surprises with evidence",
      },
      {
        id: "read-4-bike-route",
        passage: "Noah mapped two bike routes to the park. One route was shorter but had steep hills. The other was longer but flatter, so his younger sister preferred it.",
        question: "Why did Noah's sister choose the longer route?",
        choices: ["She liked extra distance", "It was easier to ride", "It had more traffic"],
        answer: "It was easier to ride",
      },
      {
        id: "read-4-recycle-drive",
        passage: "The student council announced a recycling drive and posted weekly totals. When classes saw the chart rising, they competed to contribute more paper and cans.",
        question: "What motivated classes to recycle more?",
        choices: ["Rising totals made progress visible", "They were given prizes daily", "They had less homework"],
        answer: "Rising totals made progress visible",
      },
      {
        id: "read-4-choir-timing",
        passage: "The choir kept losing timing in long songs. Their teacher asked them to mark breathing points in the lyrics, and their performances became steadier.",
        question: "Why did the choir improve?",
        choices: ["They sang fewer songs", "Marked breathing points improved coordination", "They sang louder"],
        answer: "Marked breathing points improved coordination",
      },
      {
        id: "read-4-storm-plan",
        passage: "Before the storm season, the town team reviewed old flood maps and moved supplies to higher shelves. Later, cleanup was faster after heavy rain.",
        question: "What best explains the faster cleanup?",
        choices: ["The rain was lighter", "Advance planning reduced damage", "People ignored warnings"],
        answer: "Advance planning reduced damage",
      },
    ];
  }
  if (difficulty === 5) {
    return [
    {
      id: "read-5-weather-report",
      passage: "For the weather project, Mina compared forecasts with actual rainfall for a month. She discovered predictions were usually accurate in the morning but less accurate for afternoon storms.",
      question: "What is the best inference from Mina's data?",
      choices: ["Forecasts are always wrong", "Forecast reliability changed by time of day", "Rain never came in the afternoon"],
      answer: "Forecast reliability changed by time of day",
    },
    {
      id: "read-5-robot-test",
      passage: "The coding club tested two robot paths. Path A finished faster on clear floors, but Path B avoided obstacles more reliably. They chose Path B for the final demo in a crowded room.",
      question: "Why was Path B the better choice for the demo?",
      choices: ["It was always faster", "Reliability mattered more in crowded conditions", "It used less battery"],
      answer: "Reliability mattered more in crowded conditions",
    },
    {
      id: "read-5-cafeteria-lines",
      passage: "At lunch, one serving line moved slowly because students asked many topping questions. The manager added a menu board with photos, and wait times dropped over the next week.",
      question: "Which claim is best supported by the passage?",
      choices: ["Photos caused confusion", "Clear information reduced decision delays", "Students stopped eating lunch"],
      answer: "Clear information reduced decision delays",
    },
    {
      id: "read-5-energy-audit",
      passage: "During an energy audit, Priya recorded classroom light use before and after teachers set a 'last out checks switches' routine. Electricity use fell, even though daylight hours stayed the same.",
      question: "What most likely explains the drop in electricity use?",
      choices: ["Days became longer", "The switch-check routine changed behavior", "Classrooms were empty all day"],
      answer: "The switch-check routine changed behavior",
    },
    {
      id: "read-5-history-exhibit",
      passage: "When planning a history exhibit, the team first arranged artifacts by color, but visitors seemed confused. After reorganizing by time period with short captions, visitors spent longer at each section.",
      question: "What conclusion fits the evidence?",
      choices: ["Color themes improve understanding", "Chronological structure with context improved engagement", "Captions make exhibits shorter"],
      answer: "Chronological structure with context improved engagement",
    },
    {
      id: "read-5-drone-mapping",
      passage: "For a geography project, students compared hand-drawn maps with drone photos. Hand maps were quicker to sketch, but drone maps helped teams locate trail markers more accurately.",
      question: "Which claim is best supported?",
      choices: ["Hand maps are always best", "Accuracy improved when detailed imagery was available", "Drone photos were never useful"],
      answer: "Accuracy improved when detailed imagery was available",
    },
    {
      id: "read-5-water-usage",
      passage: "The school tracked water use in two buildings. After one building installed faucet timers and reminder signs, its weekly usage dropped while the other building stayed the same.",
      question: "What is the strongest inference?",
      choices: ["Reminder systems influenced water-saving behavior", "Both buildings reduced usage equally", "Water use rises when signs are posted"],
      answer: "Reminder systems influenced water-saving behavior",
    },
    ];
  }
  if (difficulty === 6) {
    return [
      {
        id: "read-6-city-garden-data",
        passage: "A city garden group tested three watering schedules across identical planter boxes. The evening schedule used less water but produced slower growth. The morning schedule grew plants fastest, while alternating days gave moderate growth with the lowest labor time.",
        question: "Which conclusion best balances outcomes?",
        choices: ["Evening watering was best in every way", "Alternating days traded some growth for efficiency", "Morning watering required the least effort"],
        answer: "Alternating days traded some growth for efficiency",
      },
      {
        id: "read-6-bus-route-pilot",
        passage: "The transport club piloted a new bus stop order for two weeks. Travel time improved by six minutes, but late arrivals increased on rainy days because one stop lacked shelter.",
        question: "What is the strongest recommendation?",
        choices: ["Cancel the route change immediately", "Keep the new order and fix shelter access", "Ignore rainy-day data"],
        answer: "Keep the new order and fix shelter access",
      },
      {
        id: "read-6-reading-circle",
        passage: "In reading circle, students first discussed character motives before writing summaries. Their summaries became shorter but included more evidence from key scenes.",
        question: "What effect did discussion have on writing?",
        choices: ["It reduced evidence quality", "It helped students prioritize relevant evidence", "It removed all interpretation"],
        answer: "It helped students prioritize relevant evidence",
      },
      {
        id: "read-6-solar-kits",
        passage: "Two science teams built solar kits with different panel angles. Team A generated more power at noon, while Team B generated steadier power from morning to late afternoon.",
        question: "Which claim is best supported?",
        choices: ["Panel angle affects both peak and consistency", "Team A was better all day", "Sunlight did not matter"],
        answer: "Panel angle affects both peak and consistency",
      },
      {
        id: "read-6-cafeteria-posters",
        passage: "The cafeteria tested posters showing portion examples next to serving trays. Students wasted less food in classes that reviewed the poster during homeroom, but change was small in classes that skipped the review.",
        question: "What most likely increased the poster's impact?",
        choices: ["Larger tray sizes", "Brief teacher-led explanation", "Serving fewer menu options"],
        answer: "Brief teacher-led explanation",
      },
    ];
  }
  if (difficulty === 7) {
    return [
      {
        id: "read-7-river-study",
        passage: "Students measured river clarity upstream and downstream from a construction area. Clarity dropped after storms but rebounded within three dry days. Downstream values stayed lower overall.",
        question: "What interpretation best fits the evidence?",
        choices: ["Storms had no effect", "Construction and runoff likely both influenced clarity", "Upstream was always dirtier"],
        answer: "Construction and runoff likely both influenced clarity",
      },
      {
        id: "read-7-library-checkout",
        passage: "A school library removed overdue fines for one term and sent reminder messages instead. Checkout rates rose, and average return time improved slightly, though a small group remained chronically late.",
        question: "Which conclusion is most justified?",
        choices: ["Fines were necessary for all students", "Reminders supported access while preserving return habits for most users", "Late returns became universal"],
        answer: "Reminders supported access while preserving return habits for most users",
      },
      {
        id: "read-7-robotics-debug",
        passage: "During robotics trials, one team logged each software change before retesting. Another team changed multiple settings at once. The first team fixed errors faster despite making fewer total adjustments.",
        question: "Why was the first team's method more effective?",
        choices: ["They avoided testing", "They isolated variables and tracked outcomes", "They had better hardware only"],
        answer: "They isolated variables and tracked outcomes",
      },
      {
        id: "read-7-music-practice",
        passage: "Band members who split practice into two shorter sessions improved timing more than those who practiced once for the same total minutes. In reflection notes, students reported higher focus during shorter sessions.",
        question: "What factor most likely explains the improvement?",
        choices: ["More total time practiced", "Better sustained attention across sessions", "Different instruments"],
        answer: "Better sustained attention across sessions",
      },
      {
        id: "read-7-campus-traffic",
        passage: "When the school staggered dismissal by grade, hallway crowding decreased. However, pickup lines outside shifted later, increasing wait time for some families.",
        question: "What trade-off is described?",
        choices: ["Less hallway congestion but later pickup bottlenecks", "More hallway congestion and shorter pickup", "No meaningful change"],
        answer: "Less hallway congestion but later pickup bottlenecks",
      },
    ];
  }
  if (difficulty === 8) {
    return [
      {
        id: "read-8-archive-project",
        passage: "For a local history archive, students tagged photos by decade and neighborhood. Search speed improved, but some users still struggled because event names varied across sources. The team added synonym tags and searches became more consistent.",
        question: "What problem did synonym tags solve?",
        choices: ["Insufficient photo quality", "Vocabulary mismatch across records", "Missing decades"],
        answer: "Vocabulary mismatch across records",
      },
      {
        id: "read-8-energy-dashboard",
        passage: "A school dashboard displayed classroom energy use in real time. Initially, classes cut usage quickly, but savings plateaued after three weeks. Monthly goal check-ins then restored gradual improvement.",
        question: "Which explanation is best supported?",
        choices: ["Real-time feedback never works long-term", "Feedback worked best when paired with periodic goal resets", "Energy use changed only due to weather"],
        answer: "Feedback worked best when paired with periodic goal resets",
      },
      {
        id: "read-8-debate-sources",
        passage: "Debate teams that cited fewer but higher-quality sources scored better on rebuttal rounds than teams with long source lists. Judges noted stronger evidence integration, not just source count.",
        question: "What does this suggest about preparation?",
        choices: ["Quantity of sources is the key predictor", "Careful synthesis of strong sources improved performance", "Judges ignored evidence"],
        answer: "Careful synthesis of strong sources improved performance",
      },
      {
        id: "read-8-garden-pollinators",
        passage: "The ecology club planted three flower mixes to attract pollinators. Mix C drew the most species, but Mix B supported the highest number of visits over time because it bloomed longer.",
        question: "Which claim captures the contrast?",
        choices: ["Species variety and visit frequency measured different strengths", "Mix C outperformed on every metric", "Bloom length did not affect visits"],
        answer: "Species variety and visit frequency measured different strengths",
      },
      {
        id: "read-8-transit-survey",
        passage: "A student transit survey found most riders preferred fewer transfers even when total travel time increased slightly. Pilot schedules that reduced transfers improved satisfaction scores despite minor delays.",
        question: "What priority did riders reveal?",
        choices: ["Shortest possible time regardless of complexity", "Route simplicity over small time savings", "More transfers for flexibility"],
        answer: "Route simplicity over small time savings",
      },
    ];
  }
  if (difficulty === 9) {
    return [
      {
        id: "read-9-habitat-corridor",
        passage: "Conservation students compared wildlife camera data before and after adding a habitat corridor between two green spaces. Species movement increased overall, but gains were uneven by season and species type.",
        question: "Which inference is most careful?",
        choices: ["The corridor failed because effects were uneven", "The corridor helped, but outcomes depended on ecological context", "All species benefited equally"],
        answer: "The corridor helped, but outcomes depended on ecological context",
      },
      {
        id: "read-9-curriculum-pilot",
        passage: "A writing curriculum pilot improved thesis clarity scores in Grade 7 and Grade 8 classes, yet citation accuracy rose only in classes that included weekly peer review workshops.",
        question: "What does the evidence imply about implementation?",
        choices: ["The curriculum alone was sufficient for every outcome", "Peer review was a likely condition for citation gains", "Thesis clarity and citation accuracy are unrelated"],
        answer: "Peer review was a likely condition for citation gains",
      },
      {
        id: "read-9-aquifer-monitor",
        passage: "Students monitoring well data observed declining groundwater levels over summer despite average rainfall. Later analysis showed irrigation demand peaked during the same period.",
        question: "Which explanation best accounts for the decline?",
        choices: ["Rainfall data must be wrong", "Demand-side extraction likely offset rainfall inputs", "Groundwater never responds to rainfall"],
        answer: "Demand-side extraction likely offset rainfall inputs",
      },
      {
        id: "read-9-archive-ui",
        passage: "When redesigning the archive interface, the team replaced long filter menus with staged prompts. Novice users completed tasks faster, while expert users initially slowed until shortcut keys were introduced.",
        question: "What design principle is illustrated?",
        choices: ["One interface always serves all users equally", "Progressive guidance can aid novices but may require expert pathways", "Shortcuts only help beginners"],
        answer: "Progressive guidance can aid novices but may require expert pathways",
      },
      {
        id: "read-9-food-recovery",
        passage: "A district food-recovery program increased meal redistribution volume, but spoilage rates remained high at sites with delayed refrigeration pickup. Sites with scheduled pickup windows showed lower waste.",
        question: "Which conclusion is most defensible?",
        choices: ["Recovery volume alone ensures lower waste", "Logistics timing was critical to program effectiveness", "Refrigeration access had no impact"],
        answer: "Logistics timing was critical to program effectiveness",
      },
    ];
  }
  return [
    {
      id: "read-10-policy-simulation",
      passage: "In a civic policy simulation, teams proposed transit plans using the same budget. Plans that maximized speed served fewer neighborhoods, while plans prioritizing coverage required phased timelines. Final evaluations favored proposals that made trade-offs explicit and linked phases to measurable outcomes.",
      question: "What criterion most influenced evaluators?",
      choices: ["Highest speed only", "Transparent trade-off reasoning with measurable implementation", "Serving the fewest zones quickly"],
      answer: "Transparent trade-off reasoning with measurable implementation",
    },
    {
      id: "read-10-climate-model",
      passage: "Students compared two climate models against historical temperature records. Model X matched long-term trends, while Model Y better captured short-term swings. Their report combined both to discuss confidence and uncertainty by timescale.",
      question: "Which interpretation best reflects the report's approach?",
      choices: ["One model should replace all others", "Model usefulness depended on the prediction timescale", "Historical records were unnecessary"],
      answer: "Model usefulness depended on the prediction timescale",
    },
    {
      id: "read-10-health-campaign",
      passage: "A public health campaign used social media posts and community workshops. Engagement online was high, but behavior changes were strongest in neighborhoods where workshops included local leaders and follow-up visits.",
      question: "What does the evidence most strongly suggest?",
      choices: ["Online engagement guarantees behavior change", "Community-trusted, sustained contact strengthened impact", "Workshops reduced participation"],
      answer: "Community-trusted, sustained contact strengthened impact",
    },
    {
      id: "read-10-ethics-panel",
      passage: "An ethics panel reviewed student AI projects. Projects with detailed testing logs and bias checks received higher reliability ratings than projects with polished demos but limited documentation.",
      question: "Which value did the panel appear to prioritize?",
      choices: ["Presentation style over evidence", "Accountability through transparent validation", "Speed of completion only"],
      answer: "Accountability through transparent validation",
    },
    {
      id: "read-10-water-governance",
      passage: "Regional planners debated water-sharing rules during drought. A fixed quota system was simple but inflexible, while adaptive quotas required more monitoring yet reduced emergency restrictions over two years.",
      question: "Which conclusion is best supported?",
      choices: ["Simplicity always outperforms adaptability", "Adaptive governance can improve resilience when monitoring is feasible", "Monitoring increased emergency restrictions"],
      answer: "Adaptive governance can improve resilience when monitoring is feasible",
    },
  ];
}

export function getSpellingWordPool(difficulty: number): SpellingWord[] {
  const safe = Math.max(1, Math.min(5, difficulty)) as 1 | 2 | 3 | 4 | 5;
  return SPELLING_WORD_BANK
    .filter((entry) => entry.level === safe)
    .map((entry) => {
      const promptType = entry.promptType === "image" && !entry.imageUrl ? "voice" : (entry.promptType ?? "voice");
      return {
        id: entry.id,
        word: entry.word,
        level: entry.level,
        promptType,
        imageUrl: entry.imageUrl,
        hint: entry.hint,
        categoryHint: entry.categoryHint,
        syllables: entry.syllables,
        sentenceContext: entry.sentenceContext,
        emoji: entry.emoji,
        patterns: entry.patterns,
      };
    });
}

function accuracyByArea(history: LearningEvent[], area: ActivityArea): number {
  const rows = history.filter((h) => h.activity === area).slice(-20);
  if (!rows.length) return 1;
  const sum = rows.reduce((acc, row) => acc + row.score, 0);
  return sum / rows.length;
}

export function computeWeakAreas(history: LearningEvent[]): ActivityArea[] {
  const areas: ActivityArea[] = ["spelling", "math", "reading", "coding"];
  return areas.filter((a) => accuracyByArea(history, a) < 0.65);
}

export function recommendNextActivity(profile: ChildProfile, history: LearningEvent[]): string {
  const weak = computeWeakAreas(history);
  if (weak.includes("spelling")) return "Spelling Quest (focus mode)";
  if (weak.includes("math")) return "Math Mission (adaptive warm-up)";
  if (weak.includes("reading")) return "Reading Journey (comprehension boost)";
  if (profile.adaptive.spellingDifficulty < 3) return "Spelling Quest (build level)";
  if (profile.adaptive.mathDifficulty < 3) return "Math Mission (build level)";
  if (profile.coins < 30) return "Daily Quest for bonus coins";
  return "Reading Sprint challenge";
}

export function nextVoiceMessage(profile: ChildProfile, correct: boolean): string {
  if (correct && profile.adaptive.spellingDifficulty >= 4) {
    return "Amazing focus. You are mastering advanced words!";
  }
  if (correct) {
    return "Great job! Keep going, you are getting stronger every word.";
  }
  return "Nice effort. Take a breath and try the next word. You've got this.";
}

// ─── Learning Memory: Weighted Question Selection ────────────────────────────

/**
 * Returns the next spelling word ID using the weakness-weighted algorithm.
 * 40% chance to force a weak word (highest weight first) when any exist.
 * Falls back to normal pool when no weak words are present.
 */
export function getWeightedSpellingWordId(
  profile: ChildProfile,
  wordPool: SpellingWord[],
  excludedIds: string[] = []
): string | null {
  if (!wordPool.length) return null;
  const excluded = new Set(excludedIds);
  const usable = wordPool.filter((w) => !excluded.has(w.id));
  const pool = usable.length ? usable : wordPool;
  const map = profile.weaknessMap ?? {};
  const weakWords = pool.filter((w) => (map[w.word.toLowerCase()] ?? 0) > 0);

  if (weakWords.length > 0 && Math.random() < 0.4) {
    // Weighted weak selection: higher weakness weight appears more often, without hard-locking one word.
    const bag: SpellingWord[] = [];
    for (const word of weakWords) {
      const weight = Math.max(1, Math.min(5, map[word.word.toLowerCase()] ?? 1));
      for (let i = 0; i < weight; i += 1) bag.push(word);
    }
    return bag[Math.floor(Math.random() * bag.length)]?.id ?? weakWords[0]?.id ?? null;
  }
  return pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
}

/**
 * Returns only the words the learner has struggled with (weaknessMap weight ≥ 1).
 * Used for Review Mode. Returns empty array when nothing to review.
 */
export function getReviewWords(profile: ChildProfile, difficulty: number): SpellingWord[] {
  const map = profile.weaknessMap ?? {};
  // difficulty param is accepted for API consistency; we expand all levels for review
  void difficulty;
  // Expand to all difficulties so weak words from any level appear in review
  const allLevels: SpellingWord[] = [];
  for (let d = 1; d <= 5; d++) {
    for (const w of getSpellingWordPool(d)) {
      allLevels.push(w);
    }
  }
  const seen = new Set<string>();
  return allLevels
    .filter((w) => {
      const key = w.word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return (map[key] ?? 0) > 0;
    })
    .sort((a, b) => (map[b.word.toLowerCase()] ?? 0) - (map[a.word.toLowerCase()] ?? 0));
}

/**
 * Returns math questions sorted so weaker topics come first.
 * Topics with score < 0.6 are treated as needing more practice.
 */
export function getWeightedMathQuestions(
  profile: ChildProfile,
  questions: MathQuestion[]
): MathQuestion[] {
  const skills = profile.mathSkills ?? {};
  return [...questions].sort((a, b) => {
    const sa = skills[a.topic]?.score ?? 0.5;
    const sb = skills[b.topic]?.score ?? 0.5;
    return sa - sb; // lowest score first
  });
}

/**
 * Generates a human-readable insight string based on the learner's mathSkills.
 * Returns null when there is not enough data.
 */
export function getMathInsight(profile: ChildProfile): string | null {
  const skills = profile.mathSkills ?? {};
  const entries = Object.entries(skills).filter(([, v]) => v.attempts >= 3);
  if (!entries.length) return null;
  const best = entries.sort(([, a], [, b]) => b.score - a.score)[0];
  const worst = entries.sort(([, a], [, b]) => a.score - b.score)[0];
  if (best && best[1].score >= 0.8) {
    return `You are getting really good at ${best[0]}! Keep it up!`;
  }
  if (worst && worst[1].score <= 0.4) {
    return `Let's keep practising ${worst[0]} — you are improving!`;
  }
  return null;
}

/**
 * Generates a human-readable insight based on the learner's spelling patterns.
 * Returns null when there is not enough data.
 */
export function getSpellingPatternInsight(profile: ChildProfile): string | null {
  const patterns = profile.spellingPatterns ?? {};
  const entries = Object.entries(patterns).filter(([, v]) => v >= 2);
  if (!entries.length) return null;
  const top = entries.sort(([, a], [, b]) => b - a)[0];
  const friendly: Record<string, string> = {
    ough: "words with 'ough' (like enough, rough)",
    ph: "words with 'ph' (like phone, elephant)",
    tion: "words ending in 'tion' (like imagination)",
    ight: "words with 'ight' (like light, knight)",
    silent_e: "silent-e words (like telescope, adventure)",
    double_letter: "double-letter words (like puzzle, rabbit)",
    ck_end: "words ending in 'ck' (like duck, rocket)",
    wr: "words starting with 'wr' (like write)",
    kn: "words starting with 'kn' (like knowledge)",
  };
  const label = top ? (friendly[top[0]] ?? top[0]) : null;
  if (!label) return null;
  return `Let's practise ${label} — those are your trickiest patterns right now.`;
}
