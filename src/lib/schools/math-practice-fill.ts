import { itemCountForMinutes } from "@/lib/schools/daytime-session-plan";

export type MathPracticeQuestion = {
  id: string;
  prompt: string;
  question: string;
  answer: string | number;
  choices: Array<string | number>;
  options: Array<string | number>;
  explanation: string;
  hints: string[];
  skillFocus: string;
  kind: "multiple-choice";
};

export type MathPracticeTopic =
  | "addition"
  | "multiplication"
  | "fractions"
  | "decimals"
  | "percentages"
  | "algebra";

function yearNumber(yearGroup: string | null | undefined): number {
  const match = /(\d{1,2})/.exec(yearGroup ?? "");
  const year = match ? Number(match[1]) : 4;
  if (!Number.isFinite(year) || year < 1) return 1;
  return Math.min(11, year);
}

function skillKey(skillFocus: string | null | undefined): string {
  return (skillFocus ?? "").toLowerCase();
}

function pick<T>(list: readonly T[], variant: number, offset = 0): T {
  return list[(variant + offset) % list.length]!;
}

function uniqueChoices(answer: number, extras: number[], seed?: string): number[] {
  const padded = [...extras];
  let step = 1;
  while (new Set([answer, ...padded.filter((value) => value !== answer && Number.isFinite(value))]).size < 4 && step < 25) {
    padded.push(answer + step, Math.max(0, answer - step), answer + 10 * step, answer + step * 2);
    step += 1;
  }
  const values = padded.filter((value) => Number.isFinite(value) && value !== answer);
  const unique = Array.from(new Set([answer, ...values])).slice(0, 4).map(String);
  return shuffleChoices(unique, seed ?? `n:${answer}:${extras.join(",")}`, String(answer))
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

function uniqueStringChoices(answer: string, extras: string[], seed: string): string[] {
  const padded = [...extras];
  let n = 1;
  while (new Set([answer, ...padded].map((value) => value.trim().toLowerCase()).filter(Boolean)).size < 4 && n < 8) {
    padded.push(`${answer} + ${n}`, String(n), `${n} × ${n}`);
    n += 1;
  }
  const seen = new Set<string>([answer.trim().toLowerCase()]);
  const rest: string[] = [];
  for (const value of padded) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rest.push(trimmed);
    if (rest.length >= 3) break;
  }
  return shuffleChoices([answer, ...rest], seed, answer);
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleChoices(values: string[], seed: string, correct?: string): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  if (unique.length <= 1) return unique;

  const answerKey = (correct ?? unique[0] ?? "").trim().toLowerCase();
  const answer = unique.find((value) => value.toLowerCase() === answerKey) ?? unique[0]!;
  const rest = unique.filter((value) => value.toLowerCase() !== answerKey);
  let state = hashSeed(seed) || 1;
  for (let index = rest.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapWith = state % (index + 1);
    const current = rest[index]!;
    rest[index] = rest[swapWith]!;
    rest[swapWith] = current;
  }
  const slot = hashSeed(`${seed}:slot`) % unique.length;
  rest.splice(slot, 0, answer);
  return rest;
}

function multiplicationTraps(rows: number, cols: number): number[] {
  const product = rows * cols;
  return [
    rows * Math.max(1, cols - 1),
    rows * (cols + 1),
    Math.max(1, rows - 1) * cols,
    (rows + 1) * cols,
    product + cols,
  ].filter((value) => value > 0 && value !== product);
}

function nearTraps(answer: number, extras: number[] = []): number[] {
  return [...extras, answer + 1, answer - 1, answer + 2, answer + 10, Math.max(0, answer - 10), answer * 2]
    .filter((value) => Number.isFinite(value) && value !== answer && value >= 0);
}

/**
 * Year-appropriate extra Maths practice so a thin generated pack still fills
 * an 18-minute Short Learning block instead of ending after 2–3 items.
 */
export function minMathQuestionsForMinutes(targetMinutes: number | null | undefined, title?: string | null): number {
  const label = (title ?? "").toLowerCase();
  if (label.includes("recap") || label.includes("review")) {
    return Math.max(4, itemCountForMinutes(Math.max(5, targetMinutes ?? 5)));
  }
  return Math.max(8, itemCountForMinutes(Math.max(10, targetMinutes ?? 18)));
}

/** National Curriculum topic for this year group and skill focus. */
export function resolveMathPracticeTopic(yearGroup: string | null | undefined, skillFocus?: string | null): MathPracticeTopic {
  const year = yearNumber(yearGroup);
  const skill = skillKey(skillFocus);
  if (/percent/.test(skill)) return "percentages";
  if (/decimal/.test(skill)) return "decimals";
  if (/fraction/.test(skill)) return "fractions";
  if (/algebra|equation|ratio|proportional/.test(skill)) return "algebra";
  if (/array|multipl|times table|equal group/.test(skill)) return "multiplication";
  if (/divis/.test(skill) && year >= 3) return "multiplication";
  if (/add|bond|count|subtract|difference/.test(skill)) return "addition";
  if (year <= 2) return "addition";
  if (year <= 4) return "multiplication";
  if (year === 5) return "fractions";
  if (year === 6) return "percentages";
  return "algebra";
}

export function buildMathPracticeFillItems(input: {
  yearGroup?: string | null;
  skillFocus?: string | null;
  existingPrompts?: string[];
  count: number;
  idPrefix?: string;
}): MathPracticeQuestion[] {
  const year = yearNumber(input.yearGroup);
  const topic = resolveMathPracticeTopic(input.yearGroup, input.skillFocus);
  const used = new Set((input.existingPrompts ?? []).map((prompt) => prompt.trim().toLowerCase()));
  const builders = buildersForTopic(year, topic);

  const items: MathPracticeQuestion[] = [];
  let cursor = 0;
  while (items.length < input.count && cursor < builders.length * 4) {
    const built = builders[cursor % builders.length]!(Math.floor(cursor / builders.length));
    cursor += 1;
    const key = built.prompt.trim().toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    const id = `${input.idPrefix ?? "math-fill"}-${items.length + 1}`;
    items.push({
      id,
      prompt: built.prompt,
      question: built.prompt,
      answer: built.answer,
      choices: built.choices,
      options: built.choices,
      explanation: built.explanation,
      hints: built.hints,
      skillFocus: input.skillFocus?.trim() || built.skillFocus,
      kind: "multiple-choice",
    });
  }
  return items;
}

export function ensureMinimumMathQuestions<T extends Record<string, unknown>>(input: {
  questions: T[];
  yearGroup?: string | null;
  skillFocus?: string | null;
  title?: string | null;
  estimatedMinutes?: number | null;
}): T[] {
  const minCount = minMathQuestionsForMinutes(input.estimatedMinutes, input.title);
  if (input.questions.length >= minCount) return input.questions;
  const existingPrompts = input.questions.map((row) => String(row.prompt ?? row.question ?? ""));
  const extras = buildMathPracticeFillItems({
    yearGroup: input.yearGroup,
    skillFocus: input.skillFocus,
    existingPrompts,
    count: minCount - input.questions.length,
  });
  return [...input.questions, ...(extras as unknown as T[])];
}

type Built = {
  prompt: string;
  answer: string | number;
  choices: Array<string | number>;
  explanation: string;
  hints: string[];
  skillFocus: string;
};

function buildersForTopic(year: number, topic: MathPracticeTopic): Array<(variant: number) => Built> {
  if (topic === "addition") return additionBuilders(year);
  if (topic === "fractions") return fractionBuilders(year);
  if (topic === "decimals") return decimalBuilders(year);
  if (topic === "percentages") return percentageBuilders(year);
  if (topic === "algebra") return algebraBuilders(year);
  return arrayBuilders(year);
}

function additionBuilders(year: number): Array<(variant: number) => Built> {
  const maxAdd = year <= 1 ? 10 : year === 2 ? 20 : 50;
  const bonds = year <= 1 ? 10 : 20;
  return [
    (variant) => {
      const a = 2 + (variant % Math.max(3, maxAdd - 4));
      const b = Math.max(1, (variant * 2 + 1) % (maxAdd - a || 4));
      const answer = a + b;
      return {
        prompt: `What is ${a} + ${b}?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [a, b, Math.abs(a - b)]), `add:${a}+${b}`),
        explanation: `${a} plus ${b} is ${answer}.`,
        hints: [`Start at ${a} and count on ${b}.`, "Check by adding the other way round."],
        skillFocus: "addition",
      };
    },
    (variant) => {
      const a = 3 + (variant % (bonds - 3));
      const answer = bonds - a;
      return {
        prompt: `Which number bond with ${a} makes ${bonds}?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [a, bonds, a + bonds]), `bond:${a}+${bonds}`),
        explanation: `${a} + ${answer} = ${bonds}.`,
        hints: [`${bonds} take away ${a} is the missing number.`, "Number bonds are pairs that make a total."],
        skillFocus: "number bonds",
      };
    },
    (variant) => {
      const start = year <= 1 ? 4 + (variant % 6) : 12 + (variant % 20);
      const answer = start + 1;
      return {
        prompt: `What is 1 more than ${start}?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [start, start - 1]), `more:${start}`),
        explanation: `One more than ${start} is ${answer}.`,
        hints: ["Count on one.", `${start} + 1 = ${answer}.`],
        skillFocus: "one more and one less",
      };
    },
    (variant) => {
      const red = 2 + (variant % 6);
      const blue = 3 + ((variant * 2) % 5);
      const answer = red + blue;
      return {
        prompt: `There are ${red} red cubes and ${blue} blue cubes. How many cubes are there altogether?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [red, blue, Math.abs(red - blue)]), `cubes:${red}+${blue}`),
        explanation: `Altogether means add: ${red} + ${blue} = ${answer}.`,
        hints: ["Put the two groups together.", `Add ${red} and ${blue}.`],
        skillFocus: "addition word problems",
      };
    },
    (variant) => {
      const total = year <= 1 ? 8 + (variant % 5) : 14 + (variant % 10);
      const taken = 2 + (variant % 4);
      const answer = total - taken;
      return {
        prompt: `There are ${total} apples. ${taken} are eaten. How many are left?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [total, taken, total + taken]), `left:${total}-${taken}`),
        explanation: `${total} − ${taken} = ${answer}.`,
        hints: ["This is a take-away problem.", `Start at ${total} and count back ${taken}.`],
        skillFocus: "subtraction",
      };
    },
  ];
}

function arrayBuilders(year: number): Array<(variant: number) => Built> {
  const rows = year >= 6 ? [6, 7, 8, 9, 12] : year >= 5 ? [6, 7, 8, 9] : year >= 4 ? [3, 4, 5, 6, 7, 8] : [2, 3, 4, 5];
  const cols = year >= 6 ? [6, 7, 8, 9, 12] : year >= 5 ? [6, 7, 8, 9] : year >= 4 ? [4, 5, 6, 8, 10] : [2, 3, 4, 5];
  return [
    (variant) => {
      const r = pick(rows, variant);
      const c = pick(cols, variant, 1);
      const answer = r * c;
      return {
        prompt: `An array has ${r} rows with ${c} counters in each row. How many counters are there in total?`,
        answer,
        choices: uniqueChoices(answer, multiplicationTraps(r, c), `array-total:${r}x${c}`),
        explanation: `Multiply the rows by the counters in each row. ${r} × ${c} = ${answer}.`,
        hints: [`This array is ${r} groups of ${c}.`, `Work out ${r} × ${c}.`],
        skillFocus: "multiplication using arrays",
      };
    },
    (variant) => {
      const r = pick(rows, variant, 2);
      const c = pick(cols, variant, 3);
      const answer = r * c;
      return {
        prompt: `What is ${r} × ${c}? Use an array or equal groups to help you.`,
        answer,
        choices: uniqueChoices(answer, multiplicationTraps(r, c), `times:${r}x${c}`),
        explanation: `${r} equal groups of ${c} make ${answer}.`,
        hints: [`Think of ${r} groups of ${c}.`, `${r} × ${c} is the same as ${c} added ${r} times.`],
        skillFocus: "multiplication facts",
      };
    },
    (variant) => {
      const r = pick(rows, variant, 1);
      const c = pick(cols, variant);
      const answer = r * c;
      return {
        prompt: `A baker packs ${r} trays with ${c} buns on each tray. How many buns is that altogether?`,
        answer,
        choices: uniqueChoices(answer, multiplicationTraps(r, c), `buns:${r}x${c}`),
        explanation: `Each tray is a group of ${c}. ${r} trays make ${r} × ${c} = ${answer} buns.`,
        hints: ["This is equal groups, so multiply.", `Multiply the number of trays by ${c}.`],
        skillFocus: "multiplication word problems",
      };
    },
    (variant) => {
      const r = pick(rows, variant, 3);
      const c = pick(cols, variant, 2);
      const answer = c;
      return {
        prompt: `An array shows ${r} rows and ${r * c} counters in total. How many counters are in each row?`,
        answer,
        choices: uniqueChoices(answer, [r, Math.max(1, c - 1), c + 1, r * c], `per-row:${r}x${c}`),
        explanation: `Divide the total by the number of rows: ${r * c} ÷ ${r} = ${c}.`,
        hints: ["Use the inverse of multiplication.", `How many equal groups of ${r} fit into ${r * c}?`],
        skillFocus: "division as inverse of multiplication",
      };
    },
    (variant) => {
      const r = pick(rows, variant);
      const c = pick(cols, variant, 4);
      const answer = `${r} × ${c}`;
      return {
        prompt: `Which calculation matches an array of ${r} rows of ${c}?`,
        answer,
        choices: uniqueStringChoices(
          answer,
          [`${r} + ${c}`, `${c} × ${c}`, `${r} × ${r}`, `${r} × ${Math.max(1, c - 1)}`, `${r + 1} × ${c}`, `${c} + ${c}`],
          `match:${r}x${c}`,
        ),
        explanation: `Rows × items in each row is ${r} × ${c}.`,
        hints: ["Arrays show multiplication, not addition.", `There are ${r} rows of ${c}.`],
        skillFocus: "multiplication using arrays",
      };
    },
    (variant) => {
      const r = pick(rows, variant, 4);
      const c = pick(cols, variant, 1);
      const answer = r;
      return {
        prompt: `? × ${c} = ${r * c}. What number is missing?`,
        answer,
        choices: uniqueChoices(answer, [c, r + c, Math.max(1, r - 1), r + 1], `missing:${r}x${c}`),
        explanation: `${r} × ${c} = ${r * c}, so the missing number is ${r}.`,
        hints: ["This is the inverse of multiplication.", `How many groups of ${c} make ${r * c}?`],
        skillFocus: "missing numbers in multiplication",
      };
    },
  ];
}

function fractionBuilders(year: number): Array<(variant: number) => Built> {
  const wholes = year >= 6 ? [12, 16, 20, 24, 40, 48] : [8, 12, 16, 20, 24];
  const unit = year >= 6 ? [2, 3, 4, 5, 8] : year >= 5 ? [2, 3, 4, 5] : [2, 4];
  return [
    (variant) => {
      const denominator = pick(unit, variant);
      const whole = pick(wholes, variant, 1);
      const usable = whole % denominator === 0 ? whole : denominator * (2 + (variant % 6));
      const answer = usable / denominator;
      return {
        prompt: `What is 1/${denominator} of ${usable}?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [denominator, usable, usable - denominator]), `frac:${usable}/${denominator}`),
        explanation: `Share ${usable} into ${denominator} equal parts: ${usable} ÷ ${denominator} = ${answer}.`,
        hints: [`Divide ${usable} by ${denominator}.`, "A unit fraction is one equal part of the whole."],
        skillFocus: "fractions of amounts",
      };
    },
    (variant) => {
      const denominator = pick([2, 4, 5], variant);
      const whole = pick([12, 20, 24, 40], variant, 2);
      const usable = whole % denominator === 0 ? whole : denominator * 8;
      const numerator = denominator === 2 ? 1 : 3;
      if (usable % denominator !== 0) {
        const fallback = 24;
        const answer = (fallback / 4) * 3;
        return {
          prompt: `What is 3/4 of ${fallback}?`,
          answer,
          choices: uniqueChoices(answer, nearTraps(answer, [fallback / 4, fallback, 4]), `three-quarters:${fallback}`),
          explanation: `1/4 of ${fallback} is ${fallback / 4}, so 3/4 is ${answer}.`,
          hints: ["Find one quarter first, then multiply by 3.", `${fallback} ÷ 4 = ${fallback / 4}.`],
          skillFocus: "non-unit fractions",
        };
      }
      const answer = (usable / denominator) * Math.min(numerator, denominator - 1);
      const usedNumerator = Math.min(numerator, denominator - 1);
      return {
        prompt: `What is ${usedNumerator}/${denominator} of ${usable}?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [usable / denominator, usable, usedNumerator]), `nfrac:${usedNumerator}/${denominator}*${usable}`),
        explanation: `1/${denominator} of ${usable} is ${usable / denominator}, so ${usedNumerator}/${denominator} is ${answer}.`,
        hints: [`Divide ${usable} by ${denominator} first.`, `Then multiply by ${usedNumerator}.`],
        skillFocus: "fractions of amounts",
      };
    },
    (variant) => {
      const pairs: Array<[string, string, string[]]> = [
        ["1/2", "2/4", ["1/3", "2/3", "1/4"]],
        ["1/2", "3/6", ["1/3", "2/5", "3/5"]],
        ["1/4", "2/8", ["1/3", "3/4", "1/8"]],
        ["1/3", "2/6", ["1/2", "1/6", "3/6"]],
      ];
      const [from, answer, extras] = pick(pairs, variant);
      return {
        prompt: `Which fraction is equivalent to ${from}?`,
        answer,
        choices: uniqueStringChoices(answer, extras, `equiv:${from}:${answer}`),
        explanation: `${from} and ${answer} name the same part of a whole.`,
        hints: ["Multiply the numerator and denominator by the same number.", `${from} of a shape looks the same as ${answer}.`],
        skillFocus: "equivalent fractions",
      };
    },
    (variant) => {
      const value = 23 + variant * 7;
      const answer = Math.round(value / 10) * 10;
      return {
        prompt: `Round ${value} to the nearest 10.`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [value, Math.floor(value / 10) * 10, value + 10]), `round10:${value}`),
        explanation: `${value} is closer to ${answer} than to the other tens.`,
        hints: ["Look at the ones digit.", "5 or more rounds up."],
        skillFocus: "rounding",
      };
    },
  ];
}

function decimalBuilders(year: number): Array<(variant: number) => Built> {
  void year;
  return [
    (variant) => {
      const tenths = [3, 5, 7, 9][variant % 4]!;
      const answer = `0.${tenths}`;
      return {
        prompt: `What is ${tenths}/10 as a decimal?`,
        answer,
        choices: uniqueStringChoices(answer, [`0.0${tenths}`, `1.${tenths}`, `${tenths}.0`, `0.${tenths + 1}`], `dec-tenth:${tenths}`),
        explanation: `${tenths} tenths is written ${answer}.`,
        hints: ["The first digit after the decimal point is tenths.", `${tenths}/10 = ${answer}.`],
        skillFocus: "decimals as tenths",
      };
    },
    (variant) => {
      const a = [1.4, 2.3, 3.6, 4.1][variant % 4]!;
      const b = [0.5, 1.2, 0.4, 2.3][variant % 4]!;
      const answer = Number((a + b).toFixed(1));
      return {
        prompt: `What is ${a} + ${b}?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [a, b, Number((a - b).toFixed(1))]), `dec-add:${a}+${b}`),
        explanation: `Add the ones, then the tenths. ${a} + ${b} = ${answer}.`,
        hints: ["Line up the decimal points.", "Add tenths and ones separately."],
        skillFocus: "adding decimals",
      };
    },
    (variant) => {
      const pairs: Array<[string, string, string[]]> = [
        ["0.5", "1/2", ["1/5", "5/1", "1/4"]],
        ["0.25", "1/4", ["1/25", "2/5", "1/2"]],
        ["0.1", "1/10", ["1/1", "10/1", "1/2"]],
      ];
      const [decimal, answer, extras] = pick(pairs, variant);
      return {
        prompt: `Which fraction is the same as ${decimal}?`,
        answer,
        choices: uniqueStringChoices(answer, extras, `dec-frac:${decimal}`),
        explanation: `${decimal} is the same as ${answer}.`,
        hints: ["Think about tenths or hundredths.", "0.5 is one half."],
        skillFocus: "decimals and fractions",
      };
    },
  ];
}

function percentageBuilders(year: number): Array<(variant: number) => Built> {
  const amounts = year >= 7 ? [40, 60, 80, 120, 200] : [20, 40, 60, 80, 100];
  return [
    (variant) => {
      const percent = pick([10, 25, 50], variant);
      const amount = pick(amounts, variant, 1);
      const answer = (amount * percent) / 100;
      return {
        prompt: `What is ${percent}% of ${amount}?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [percent, amount, amount - percent]), `pct:${percent}of${amount}`),
        explanation: `${percent}% means ${percent} in every 100. ${percent}% of ${amount} is ${answer}.`,
        hints: [
          percent === 50 ? "50% is half." : percent === 25 ? "25% is one quarter." : "10% is one tenth.",
          `Find ${percent}% of ${amount}.`,
        ],
        skillFocus: "percentages of amounts",
      };
    },
    (variant) => {
      const price = pick([20, 40, 50, 80], variant);
      const off = 10;
      const answer = price - price / 10;
      return {
        prompt: `A shop reduces £${price} by ${off}%. What is the new price?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [price, off, price / 10]), `sale:${price}`),
        explanation: `10% of £${price} is £${price / 10}, so the new price is £${answer}.`,
        hints: ["Find 10% first by dividing by 10.", "Subtract the 10% from the original price."],
        skillFocus: "percentage decrease",
      };
    },
    (variant) => {
      const whole = pick([12, 16, 20, 24, 40], variant);
      const answer = (whole / 4) * 3;
      return {
        prompt: `What is 3/4 of ${whole}?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [whole / 4, whole, 4]), `y6-frac:${whole}`),
        explanation: `1/4 of ${whole} is ${whole / 4}, so 3/4 is ${answer}.`,
        hints: ["Find one quarter, then multiply by 3.", "3/4 is the same as 75%."],
        skillFocus: "fractions of amounts",
      };
    },
    (variant) => {
      const a = 6 + (variant % 7);
      const b = 3 + (variant % 5);
      const c = 2 + (variant % 4);
      const answer = a * b + c;
      return {
        prompt: `Work out ${a} × ${b} + ${c}.`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [a * (b + c), a + b + c, a * b]), `order:${a}x${b}+${c}`),
        explanation: `Multiply first: ${a} × ${b} = ${a * b}, then add ${c} to make ${answer}.`,
        hints: ["Do multiplication before addition.", `${a} × ${b} is the first step.`],
        skillFocus: "multi-step problems",
      };
    },
  ];
}

function algebraBuilders(year: number): Array<(variant: number) => Built> {
  void year;
  return [
    (variant) => {
      const n = 2 + (variant % 8);
      const coeff = 3 + (variant % 4);
      const answer = coeff * n;
      return {
        prompt: `If n = ${n}, what is ${coeff}n?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [coeff + n, n, coeff]), `alg:${coeff}n=${n}`),
        explanation: `${coeff}n means ${coeff} × ${n} = ${answer}.`,
        hints: ["Replace n with the given number.", "3n means 3 times n."],
        skillFocus: "substitution",
      };
    },
    (variant) => {
      const a = 2 + (variant % 5);
      const b = 3 + (variant % 4);
      const answer = `${a + b}a`;
      return {
        prompt: `Simplify ${a}a + ${b}a.`,
        answer,
        choices: uniqueStringChoices(answer, [`${a * b}a`, `${a + b}`, `${a}a${b}`, `${Math.abs(a - b)}a`], `collect:${a}+${b}`),
        explanation: `Add the coefficients: ${a} + ${b} = ${a + b}, so the answer is ${answer}.`,
        hints: ["a and a are like terms.", "Add the numbers in front of a."],
        skillFocus: "collecting like terms",
      };
    },
    (variant) => {
      const amount = pick([40, 50, 80, 100], variant);
      const answer = amount / 10;
      return {
        prompt: `What is 10% of ${amount}?`,
        answer,
        choices: uniqueChoices(answer, nearTraps(answer, [10, amount, amount / 2]), `ks3-pct:${amount}`),
        explanation: `10% is one tenth, so ${amount} ÷ 10 = ${answer}.`,
        hints: ["Divide by 10 to find 10%.", "Move the digits one place to the right."],
        skillFocus: "percentages of amounts",
      };
    },
    ...arrayBuilders(Math.max(6, year)).slice(0, 2),
  ];
}

export function mathExplanationDistractors(prompt: string, answer: string): string[] {
  const numbers = prompt.match(/\d+/g)?.map((value) => Number(value)).filter((value) => Number.isFinite(value)) ?? [];
  const left = numbers[0];
  const right = numbers[1];
  if (left != null && right != null) {
    return [
      `Add ${left} and ${right} instead of multiplying.`,
      `Draw ${right} rows with ${left} extra items left over.`,
      `Count on in ones from ${left} and stop when it looks close.`,
    ].filter((row) => row.toLowerCase() !== answer.trim().toLowerCase());
  }
  return [
    "Add the two numbers instead of multiplying.",
    "Draw one row only and guess the rest.",
    "Count on in ones and stop when it looks about right.",
  ].filter((row) => row.toLowerCase() !== answer.trim().toLowerCase());
}

/** Always give Maths questions four distinct choices, including explain-how items. */
export function padMathAnswerChoices(input: {
  prompt: string;
  answer: string | number;
  existing?: Array<string | number>;
}): string[] {
  const answer = String(input.answer ?? "").trim();
  const unique: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(trimmed);
  };
  for (const value of input.existing ?? []) push(String(value ?? ""));
  if (answer) push(answer);

  const numeric = Number(answer.replace(/[£$,\s]/g, ""));
  if (answer && Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(answer)) {
    for (const extra of [numeric + 1, numeric - 1, numeric + 2, numeric - 2, numeric + 10, Math.max(0, numeric * 2)]) {
      if (unique.length >= 4) break;
      push(String(extra));
    }
    return shuffleChoices(unique.slice(0, 6), `${input.prompt}:${answer}`, answer);
  }

  for (const extra of mathExplanationDistractors(input.prompt, answer)) {
    if (unique.length >= 4) break;
    push(extra);
  }
  return shuffleChoices(unique.slice(0, 6), `${input.prompt}:${answer}`, answer);
}
