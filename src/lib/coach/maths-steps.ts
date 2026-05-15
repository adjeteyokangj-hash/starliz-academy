// ─────────────────────────────────────────────────────────────────────────────
// Maths step-builder — deterministic, no AI calls
// Handles: linear equations, simple arithmetic, bracket expansion
// ─────────────────────────────────────────────────────────────────────────────

import { AgeBand, CoachContext, CoachFollowUp, CoachResponse, CoachStep } from "./types";

// ── Equation parsers ──────────────────────────────────────────────────────────
// ── Emotional field builder ───────────────────────────────────────────────────

function mathsEmotionalFields(ctx: CoachContext, shouldReveal: boolean, question: string, correctAnswer: string) {
  const hintCount = ctx.hintCount;
  const attemptCount = ctx.attemptCount;

  const emotionalTone =
    hintCount >= 3
      ? "You have been working hard — let's look at this from the very beginning."
      : attemptCount >= 3
      ? "Real persistence here. Let's find exactly where the calculation is going differently."
      : ctx.confidenceScore < 0.35
      ? "Take your time — there is no rush. Let's do this together."
      : "Good effort — here is the next step to help you think it through.";

  const waitPrompt = "Before reading — have another look at the equation and try to spot the first move.";

  const similarQuestion: { prompt: string; answer?: string } | undefined = shouldReveal
    ? (() => {
        // Linear: ax + b = c  → try ax + (b+2) = c+2
        const lm = question.match(/^(\d+)?\s*x\s*([+\-])\s*(\d+)\s*=\s*(\d+)$/i);
        if (lm) {
          const a = lm[1] ? Number(lm[1]) : 1;
          const sign = lm[2]!;
          const b = Number(lm[3]) + 2;
          const c = Number(lm[4]) + 2;
          return { prompt: `Now try: ${a === 1 ? "" : a}x ${sign} ${b} = ${c}`, answer: correctAnswer };
        }
        // Arithmetic: left OP right → (left+1) OP (right+1)
        const am = question.match(/(-?\d+(?:\.\d+)?)\s*([+\-×x\*÷\/])\s*(-?\d+(?:\.\d+)?)/);
        if (am) {
          const left = Number(am[1]) + 1;
          const op = am[2]!;
          const right = Number(am[3]) + 1;
          const ops: Record<string, string> = { "+": "+", "-": "−", "×": "×", "x": "×", "*": "×", "÷": "÷", "/": "÷" };
          return { prompt: `Now try: ${left} ${ops[op] ?? op} ${right}` };
        }
        return { prompt: "Try a similar problem on your own using the same method." };
      })()
    : undefined;

  return { emotionalTone, waitPrompt, similarQuestion };
}

// ── Equation parsers ──────────────────────────────────────────────────────────

type LinearEq = { type: "linear"; a: number; b: number; c: number; bSign: "+" | "-" };
type Arithmetic = { type: "arith"; left: number; right: number; op: "+" | "-" | "×" | "÷" };
type Bracket = { type: "bracket"; outer: number; inner: number; offset: number; total: number };
type Unknown = { type: "unknown" };
type MathPattern = LinearEq | Arithmetic | Bracket | Unknown;

const OP_MAP: Record<string, "+" | "-" | "×" | "÷"> = {
  "+": "+", "-": "-", "×": "×", "x": "×", "X": "×", "*": "×", "÷": "÷", "/": "÷",
};

function parsePattern(question: string): MathPattern {
  const q = question.trim();

  // Bracket expansion: a(x + b) = c  or  a(x - b) = c
  const bracketMatch = q.match(/(\d+)\s*\(\s*x\s*([+\-])\s*(\d+)\s*\)\s*=\s*(\d+)/i);
  if (bracketMatch) {
    const outer = Number(bracketMatch[1]);
    const sign = bracketMatch[2] as "+" | "-";
    const inner = Number(bracketMatch[3]);
    const total = Number(bracketMatch[4]);
    const offset = sign === "+" ? inner : -inner;
    return { type: "bracket", outer, inner, offset, total };
  }

                tryAgainPrompt: shouldReveal ? "Try a similar question on your own before asking for help again." : null,
                masterySignal: null,
                ...emotFields,
  if (linearMatch) {
    return {
      type: "linear",
      a: linearMatch[1] ? Number(linearMatch[1]) : 1,
      b: Number(linearMatch[3]),
      c: Number(linearMatch[4]),
      bSign: linearMatch[2] as "+" | "-",
    };
  }

  // Arithmetic: left OP right
  const arithMatch = q.match(/(-?\d+(?:\.\d+)?)\s*([+\-×x\*÷\/])\s*(-?\d+(?:\.\d+)?)/);
  if (arithMatch) {
    return {
      type: "arith",
      left: Number(arithMatch[1]),
      right: Number(arithMatch[3]),
      op: OP_MAP[arithMatch[2]] ?? "+",
    };
  }

  return { type: "unknown" };
}

// ── Step builders ─────────────────────────────────────────────────────────────

function linearSteps(eq: LinearEq, hintLevel: number): CoachStep[] {
  const { a, b, c, bSign } = eq;
  const step1rhs = bSign === "+" ? c - b : c + b;
  const step1op = bSign === "+" ? `− ${b}` : `+ ${b}`;
  const step1display = bSign === "+" ? `${a}x + ${b} − ${b} = ${c} − ${b}` : `${a}x − ${b} + ${b} = ${c} + ${b}`;
  const xValue = step1rhs / a;

  const stepsAll: CoachStep[] = [
    { expression: `${a === 1 ? "" : a}x ${bSign} ${b} = ${c}`, explanation: "Our equation — we need to isolate x" },
    { expression: step1display, explanation: `${bSign === "+" ? "Subtract" : "Add"} ${b} ${bSign === "+" ? "from" : "to"} both sides` },
    { expression: `${a === 1 ? "" : a}x = ${step1rhs}`, explanation: "Simplify" },
    ...(a > 1
      ? [
          { expression: `x = ${step1rhs} ÷ ${a}`, explanation: `Divide both sides by ${a}` },
          { expression: `x = ${xValue}`, explanation: "Solution" },
        ]
      : [{ expression: `x = ${step1rhs}`, explanation: "Solution" }]),
  ];

  if (hintLevel <= 1) return stepsAll.slice(0, 1); // just show the equation
  if (hintLevel === 2) return stepsAll.slice(0, 3); // up to simplify
  return stepsAll; // full
}

function bracketSteps(b: Bracket): CoachStep[] {
  const expanded = b.outer * b.inner;
  const xTerm = b.outer;
  const xVal = (b.total - (b.outer * b.offset)) / xTerm;
  const offsetSign = b.offset >= 0 ? "+" : "−";
  const expandedRhs = b.total - b.outer * b.offset;

  return [
    { expression: `${b.outer}(x ${b.offset >= 0 ? "+" : "−"} ${Math.abs(b.offset)}) = ${b.total}`, explanation: "Original equation" },
    { expression: `${xTerm}x ${offsetSign} ${Math.abs(expanded)} = ${b.total}`, explanation: `Expand: ${b.outer} × x and ${b.outer} × ${Math.abs(b.offset)}` },
    { expression: `${xTerm}x = ${expandedRhs}`, explanation: `${b.offset >= 0 ? "Subtract" : "Add"} ${Math.abs(expanded)} from both sides` },
    { expression: `x = ${xVal}`, explanation: `Divide both sides by ${xTerm}` },
  ];
}

function arithSteps(a: Arithmetic, ageBand: AgeBand): CoachStep[] {
  const { left, right, op } = a;
  if (ageBand === "foundation") {
    if (op === "+") return [{ expression: `${left} + ${right}`, explanation: `Start at ${left}, count on ${right} more` }];
    if (op === "-") return [{ expression: `${left} − ${right}`, explanation: `Start at ${left}, count back ${right}` }];
  }
  if (ageBand === "primary") {
    if (op === "×") {
      const partial1 = Math.floor(left / 10) * 10;
      const partial2 = left - partial1;
      return [
        { expression: `${left} × ${right}`, explanation: "Split the first number" },
        { expression: `= (${partial1} + ${partial2}) × ${right}`, explanation: `Break ${left} into ${partial1} and ${partial2}` },
        { expression: `= ${partial1 * right} + ${partial2 * right}`, explanation: "Multiply each part by " + right },
        { expression: `= ${left * right}`, explanation: "Add the results" },
      ];
    }
    if (op === "÷") {
      const quotient = Math.floor(left / right);
      return [
        { expression: `${left} ÷ ${right}`, explanation: `How many groups of ${right} fit into ${left}?` },
        { expression: `${right} × ${quotient} = ${quotient * right}`, explanation: "Build up using multiplication" },
        { expression: `${left} ÷ ${right} = ${quotient}`, explanation: "Answer" },
      ];
    }
  }
  return [{ expression: `${left} ${op} ${right} = ${left * (op === "×" ? right : 0)}`, explanation: "Work through each step carefully" }];
}

// ── Follow-up builders ────────────────────────────────────────────────────────

function linearFollowUp1(eq: LinearEq): CoachFollowUp {
  const action = eq.bSign === "+" ? `Subtract ${eq.b}` : `Add ${eq.b}`;
  const wrong1 = eq.bSign === "+" ? `Add ${eq.b}` : `Subtract ${eq.b}`;
  return {
    question: `What should we do first to get x by itself?`,
    options: [action, wrong1, `Multiply by ${eq.a}`, `Divide by ${eq.a}`],
    correctIndex: 0,
    onCorrect: `Yes! We ${action.toLowerCase()} from both sides — because ${eq.bSign === "+" ? "subtraction undoes addition" : "addition undoes subtraction"}.`,
    onWrong: `We need to undo the ${eq.bSign} ${eq.b}. The inverse of ${eq.bSign === "+" ? "adding" : "subtracting"} is ${eq.bSign === "+" ? "subtracting" : "adding"}.`,
  };
}

function linearFollowUp2(eq: LinearEq): CoachFollowUp | null {
  if (eq.a <= 1) return null;
  const step1rhs = eq.bSign === "+" ? eq.c - eq.b : eq.c + eq.b;
  return {
    question: `We now have ${eq.a}x = ${step1rhs}. What is the next step?`,
    options: [
      `Divide both sides by ${eq.a}`,
      `Subtract ${eq.a} from both sides`,
      `Multiply both sides by ${eq.a}`,
    ],
    correctIndex: 0,
    onCorrect: `Correct — dividing both sides by ${eq.a} isolates x.`,
    onWrong: `When a number is multiplied by x, we divide to undo it. ${eq.a}x ÷ ${eq.a} = x.`,
  };
}

function arithFollowUp(a: Arithmetic, ageBand: AgeBand): CoachFollowUp {
  if (ageBand === "foundation" && a.op === "+") {
    return {
      question: `If you start at ${a.left} and count on ${a.right} more, what do you get?`,
      options: [String(a.left + a.right), String(a.left - a.right), String(a.left + a.right + 1), String(a.right)],
      correctIndex: 0,
      onCorrect: `Well done! ${a.left} + ${a.right} = ${a.left + a.right}. You counted on perfectly!`,
      onWrong: `Let's try again. Start at ${a.left} and count on ${a.right}: ${Array.from({ length: a.right }, (_, i) => a.left + i + 1).join(", ")}.`,
    };
  }
  if (ageBand === "primary" && a.op === "×") {
    const partial1 = Math.floor(a.left / 10) * 10;
    return {
      question: `What is ${partial1} × ${a.right}?`,
      options: [String(partial1 * a.right), String(partial1 + a.right), String(partial1 * a.right + 10), String(partial1)],
      correctIndex: 0,
      onCorrect: `Exactly! ${partial1} × ${a.right} = ${partial1 * a.right}. Now add the other part.`,
      onWrong: `Think of ${partial1} as ${partial1 / 10} tens. ${partial1 / 10} × ${a.right} = ${(partial1 / 10) * a.right}, so ${partial1} × ${a.right} = ${partial1 * a.right}.`,
    };
  }
  return {
    question: `What method would you use to solve ${a.left} ${a.op} ${a.right}?`,
    options: ["Break it into smaller parts", "Guess and check", "Use a completely different operation"],
    correctIndex: 0,
    onCorrect: "Good thinking! Breaking it down makes the calculation manageable.",
    onWrong: "The safest method is to break the numbers into parts you know — it always works.",
  };
}

// ── Reinforcement notes ───────────────────────────────────────────────────────

function reinforcementNote(pattern: MathPattern, ageBand: AgeBand): string {
  if (ageBand === "gcse") {
    if (pattern.type === "linear") return "In an exam, show each step on a new line — you earn method marks even if your final answer slips.";
    if (pattern.type === "bracket") return "Always expand brackets before collecting terms. Examiners look for correct expansion first.";
  }
  if (ageBand === "secondary") {
    return "Check your answer by substituting it back into the original equation.";
  }
  if (ageBand === "primary") {
    return "Checking by working backwards is a great habit — it builds confidence in your method.";
  }
  return "Say the problem out loud while you work — it helps you keep track.";
}

// ── Visual aid (foundation only) ─────────────────────────────────────────────

function visualDots(n: number): string {
  return "●".repeat(Math.min(n, 20));
}

function foundationVisual(a: Arithmetic): string | null {
  const { left, right, op } = a;
  if (left > 20 || right > 20) return null;
  if (op === "+") return `${visualDots(left)}  +  ${visualDots(right)}  =  ?`;
  if (op === "-") return `${visualDots(left)}  →  cross out ${right}  =  ?`;
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildMathsCoachResponse(ctx: CoachContext): CoachResponse {
  const pattern = parsePattern(ctx.question);
  const hintLevel = Math.min(ctx.hintCount + 1, 4);
  const shouldReveal = hintLevel >= 4;
  const { ageBand } = ctx;
  const emotFields = mathsEmotionalFields(ctx, shouldReveal, ctx.question, ctx.correctAnswer);

  // ── mistake recovery takes priority ──────────────────────────────────────
  if (ctx.studentAnswer !== undefined && ctx.studentAnswer !== "") {
    const wrongNum = Number(ctx.studentAnswer);
    const rightNum = Number(ctx.correctAnswer);
    const diff = Math.abs(wrongNum - rightNum);

    let recoveryMsg = "Let's look at where things went wrong.";
    if (Number.isFinite(wrongNum) && Number.isFinite(rightNum)) {
      if (diff === 1) recoveryMsg = "You are only 1 away — double-check the last step.";
      else if (diff % 10 === 0) recoveryMsg = "It looks like there may be a place value slip. Check the tens and ones columns separately.";
      else if (wrongNum === rightNum * 2 || wrongNum === rightNum / 2) recoveryMsg = "It looks like you may have multiplied or divided when the opposite was needed — check the operation sign.";
      else if (pattern.type === "linear") {
        const eq = pattern;
        const signText = eq.bSign === "+" ? `forgotten to subtract ${eq.b}` : `forgotten to add ${eq.b}`;
        recoveryMsg = `Check whether you ${signText} from both sides first.`;
      }
    }

    const steps = pattern.type === "linear"
      ? linearSteps(pattern, 3)
      : pattern.type === "bracket"
        ? bracketSteps(pattern)
        : pattern.type === "arith"
          ? arithSteps(pattern, ageBand)
          : [];

    return {
      mode: "mistake_recovery",
      ageBand,
      message: recoveryMsg,
      steps: shouldReveal ? steps : steps.slice(0, Math.max(1, steps.length - 1)),
      followUp: pattern.type === "linear" ? linearFollowUp1(pattern) : null,
      hintLevel,
      shouldReveal,
      reinforcementNote: reinforcementNote(pattern, ageBand),
      tryAgainPrompt: shouldReveal ? "Try a similar question on your own before asking for help again." : null,
      masterySignal: null,
    };
  }

  // ── hint / guided mode ────────────────────────────────────────────────────

      ...emotFields,
    };
  }

  // ── hint / guided mode ────────────────────────────────────────────────────
  if (pattern.type === "linear") {
    const eq = pattern;
    const steps = linearSteps(eq, hintLevel);
    const followUp = hintLevel === 2 ? linearFollowUp1(eq) : hintLevel >= 3 ? (linearFollowUp2(eq) ?? linearFollowUp1(eq)) : null;

    const messages: Record<number, string> = {
      1: ageBand === "foundation" || ageBand === "primary"
        ? `We need x on its own. Can you spot what is being added or taken away from x?`
        : `We need to isolate x. Think about what operation would undo the ${eq.bSign === "+" ? "addition" : "subtraction"} of ${eq.b}.`,
      2: `Good — let's work it out. ${eq.bSign === "+" ? "Subtracting" : "Adding"} ${eq.b} from both sides is the first move.`,
      3: ageBand === "gcse"
        ? `Here is the working so far. Each step keeps the equation balanced. What comes next?`
        : `Look at the steps. Each one gets us closer to x. Can you complete the final step?`,
      4: `Here is the complete solution. Study each step, then try a similar problem without help.`,
    };

    return {
      mode: hintLevel === 1 ? "hint" : hintLevel <= 3 ? "guided_steps" : "reveal",
      ageBand,
      message: messages[hintLevel] ?? messages[4]!,
      steps: shouldReveal ? linearSteps(eq, 4) : steps,
      followUp,
      hintLevel,
      shouldReveal,
      reinforcementNote: reinforcementNote(eq, ageBand),
      tryAgainPrompt: shouldReveal
        ? ageBand === "gcse"
          ? "Check: substitute your answer back in. Does it balance? Now attempt a fresh equation on your own."
          : "Can you spot a similar equation? Try it before asking for the next hint."
        : null,
      masterySignal: null,
      ...emotFields,
    };
  }

  if (pattern.type === "bracket") {
    const steps = bracketSteps(pattern);
    const message =
      hintLevel === 1
        ? `Expand the bracket first — multiply everything inside by ${pattern.outer}.`
        : hintLevel === 2
          ? `After expanding: ${pattern.outer}x ${pattern.offset >= 0 ? "+" : "−"} ${Math.abs(pattern.outer * pattern.offset)} = ${pattern.total}. Now solve for x.`
          : `Here is the full working. Each step isolates x.`;

    return {
      mode: hintLevel === 1 ? "hint" : hintLevel <= 3 ? "guided_steps" : "reveal",
      ageBand,
      message,
      steps: shouldReveal ? steps : steps.slice(0, hintLevel),
      followUp: hintLevel === 2 ? {
        question: `What is ${pattern.outer} × ${pattern.inner}?`,
        options: [String(pattern.outer * pattern.inner), String(pattern.outer + pattern.inner), String(pattern.inner), String(pattern.outer)],
        correctIndex: 0,
        onCorrect: `Exactly! ${pattern.outer} × ${pattern.inner} = ${pattern.outer * pattern.inner}. That's the expanded bracket.`,
        onWrong: `Multiply means repeated addition: ${Array.from({ length: Math.min(pattern.outer, 5) }, (_, i) => pattern.inner + " × " + (i + 1) + " = " + pattern.inner * (i + 1)).join(", ")}.`,
      } : null,
      hintLevel,
      shouldReveal,
      reinforcementNote: reinforcementNote(pattern, ageBand),
      tryAgainPrompt: shouldReveal ? "Try another bracket equation on your own." : null,
      masterySignal: null,
      ...emotFields,
    };
  }

  if (pattern.type === "arith") {
    const steps = arithSteps(pattern, ageBand);
    const visualAid = ageBand === "foundation" ? foundationVisual(pattern) : null;
    const messages: Record<AgeBand, Record<number, string>> = {
      foundation: {
        1: `Let's count together. ${visualAid ?? `Start at ${pattern.left} and count on ${pattern.right}.`}`,
        2: `Good try! Watch the steps — each one brings us closer.`,
        3: "Here is each step. Follow along and try the last one.",
        4: "Here is the complete working. Say it out loud.",
      },
      primary: {
        1: `Break the numbers into parts you know. Can you split ${pattern.left} into tens and ones?`,
        2: "Let's do it together. First part is ${Math.floor(pattern.left / 10) * 10} × ${pattern.right}.".replace("${Math.floor(pattern.left / 10) * 10}", String(Math.floor(pattern.left / 10) * 10)).replace("${pattern.right}", String(pattern.right)),
        3: "Here is the full method. Can you see the pattern?",
        4: "Full worked example below. Try the next one using the same method.",
      },
      secondary: {
        1: "Identify the method — then apply it step by step.",
        2: "Here are the first steps. Can you spot where to go next?",
        3: "Almost there — one step left.",
        4: "Complete working shown. Make sure you understand why each step works.",
      },
      gcse: {
        1: "Show your working from the start — even simple arithmetic earns method marks.",
        2: "Check your method before committing. One wrong sign can cascade.",
        3: "Nearly complete — verify each step before moving on.",
        4: "Full solution shown. Always check by substituting back in.",
      },
    };

    return {
      mode: hintLevel === 1 ? "hint" : hintLevel <= 3 ? "guided_steps" : "reveal",
      ageBand,
      message: messages[ageBand]?.[hintLevel] ?? "Work through each step carefully.",
      steps: shouldReveal ? steps : steps.slice(0, hintLevel),
      followUp: hintLevel >= 2 ? arithFollowUp(pattern, ageBand) : null,
      hintLevel,
      shouldReveal,
      reinforcementNote: reinforcementNote(pattern, ageBand),
      tryAgainPrompt: shouldReveal ? "Now try a similar question without hints." : null,
      masterySignal: null,
      ...emotFields,
    };
  }

  // ── Unknown / word problem fallback ──────────────────────────────────────
  const genericMessages: Record<number, string> = {
    1: "Look at the key words in the question — they tell you what operation to use.",
    2: "Break it into smaller parts. What information do you already know?",
    3: "Write out what you know and what you need to find. Then choose an operation.",
    4: `The answer is ${ctx.correctAnswer}. Work backwards from this to understand each step.`,
  };
  return {
    mode: hintLevel === 1 ? "hint" : hintLevel <= 3 ? "guided_steps" : "reveal",
    ageBand,
    message: genericMessages[hintLevel] ?? genericMessages[4]!,
    steps: shouldReveal ? [{ expression: ctx.question, explanation: `Answer: ${ctx.correctAnswer}` }] : [],
    followUp: hintLevel === 2 ? {
      question: "What is the most important number or keyword in this question?",
      options: ["I found it — it tells me the operation to use", "I am not sure yet", "There are no keywords"],
      correctIndex: 0,
      onCorrect: "Good instinct! Keywords like 'more', 'share', 'product' signal which operation to apply.",
      onWrong: "Look for words like 'total', 'difference', 'times', 'share equally' — they map directly to operations.",
    } : null,
    hintLevel,
    shouldReveal,
    reinforcementNote: reinforcementNote({ type: "unknown" }, ageBand),
    tryAgainPrompt: shouldReveal ? "Try reading the question again on your own now that you have seen the answer." : null,
    masterySignal: null,
    ...emotFields,
  };
}

/** Returns the "Slow / break into parts" coaching line — used by the Slow button. */
export function buildSlowBreakdown(question: string, ageBand: AgeBand): string {
  const pattern = parsePattern(question);
  if (pattern.type === "linear") {
    const eq = pattern;
    return `Let's read this in plain language: "${eq.a === 1 ? "" : eq.a} times a number, ${eq.bSign === "+" ? "plus" : "minus"} ${eq.b}, equals ${eq.c}." The number we are looking for is x.`;
  }
  if (pattern.type === "arith") {
    const { left, right, op } = pattern;
    const opWord = { "+": "plus", "-": "minus", "×": "times", "÷": "divided by" }[op] ?? op;
    return ageBand === "foundation"
      ? `We have ${left}, and we are adding ${right}. Start at ${left} and count on ${right}.`
      : `The question is: what is ${left} ${opWord} ${right}? Break ${left} into tens and ones first.`;
  }
  return `Read the question carefully. Identify the numbers and the operation, then work one step at a time.`;
}
