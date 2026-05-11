"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import { speak, stopVoicePlayback } from "@/lib/voice";

type JourneyPayload = {
  journey?: {
    warmupSkill: string;
    focusSkill: string;
    weakSkill: string | null;
    reviewSkills: string[];
    bossTestSkills: string[];
  };
};

type AssignmentPayload = {
  id: string;
  subject: string;
  title: string;
  items: LessonItem[];
};

type BossStatusPayload = {
  unlocked?: boolean;
  lockReason?: string | null;
  alreadyPlayedToday?: boolean;
  lessonAssignmentId?: string | null;
  previousBattle?: {
    rewards?: {
      xpEarned?: number;
      coinsEarned?: number;
      starsEarned?: number;
    };
    win?: boolean;
    perfectWin?: boolean;
    badge?: string | null;
  } | null;
  error?: string;
};

type BossCompletePayload = {
  ok?: boolean;
  alreadyClaimed?: boolean;
  rewards?: {
    xpEarned: number;
    coinsEarned: number;
    starsEarned: number;
  };
  win?: boolean;
  perfectWin?: boolean;
  badge?: string | null;
  error?: string;
};

type LessonItem = Record<string, unknown> & {
  id?: string;
  type?: string;
  word?: string;
  prompt?: string;
  question?: string;
  passage?: string;
  answer?: unknown;
  options?: unknown[];
  choices?: unknown[];
  skillFocus?: string;
};

type BossQuestion = {
  id: string;
  slot: "warmup" | "focus" | "weak" | "mixed" | "final";
  slotLabel: string;
  item: LessonItem;
  section: "spelling" | "math" | "reading";
};

type BattleResult = {
  win: boolean;
  perfectWin: boolean;
  rewards: {
    xpEarned: number;
    coinsEarned: number;
    starsEarned: number;
  };
  badge: string | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getItemSection(item: LessonItem, fallback: string): "spelling" | "math" | "reading" {
  const type = String(item.type ?? fallback).toLowerCase();
  if (type === "math" || type === "maths") return "math";
  if (type === "reading" || item.passage) return "reading";
  return "spelling";
}

function getPrompt(item: LessonItem, section: string): string {
  if (section === "spelling") return String(item.word ?? item.answer ?? item.prompt ?? "").trim();
  return String(item.prompt ?? item.question ?? item.word ?? "").trim();
}

function getAnswer(item: LessonItem): string {
  return String(item.answer ?? item.word ?? "").trim();
}

function getOptions(item: LessonItem): string[] {
  const options = Array.isArray(item.options) ? item.options : Array.isArray(item.choices) ? item.choices : [];
  return options.map(String).map((value) => value.trim()).filter(Boolean);
}

function toQuestionId(item: LessonItem, index: number): string {
  const id = String(item.id ?? "").trim();
  if (id) return id;
  return `lesson-item-${index}`;
}

function skillMatches(item: LessonItem, skill: string | null | undefined): boolean {
  const target = normalize(skill);
  if (!target) return false;
  return normalize(String(item.skillFocus ?? "")).includes(target);
}

function firstUnusedBy(
  items: LessonItem[],
  used: Set<string>,
  predicate: (item: LessonItem, index: number) => boolean,
): { item: LessonItem; id: string; index: number } | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const id = toQuestionId(item, index);
    if (used.has(id)) continue;
    if (predicate(item, index)) return { item, id, index };
  }
  return null;
}

function takeAnyUnused(items: LessonItem[], used: Set<string>): { item: LessonItem; id: string; index: number } | null {
  return firstUnusedBy(items, used, () => true);
}

function pickDifferentFromPool(current: string, pool: string[], fallback: string): string {
  const found = pool.find((entry) => normalize(entry) !== normalize(current));
  return found ?? fallback;
}

function buildChallengeItem(section: "spelling" | "math" | "reading", slot: BossQuestion["slot"], source: LessonItem): LessonItem {
  if (section === "spelling") {
    const sourceAnswer = getAnswer(source).toLowerCase();
    if (sourceAnswer.length === 1) {
      const letter = pickDifferentFromPool(sourceAnswer, ["m", "s", "t", "c", "d", "a"], "m");
      const upper = letter.toUpperCase();
      return {
        id: `boss-letter-${slot}`,
        type: "spelling",
        word: letter,
        answer: letter,
        prompt: `Tap the letter ${upper}`,
        options: [upper, "A", "S", "M"].filter((value, index, array) => array.indexOf(value) === index),
      };
    }

    // Boss spelling: scale up — use longer words than source
    const longerWords = ["clock", "storm", "blend", "crust", "flight", "throne", "sprint", "bread"];
    const sourceLen = sourceAnswer.length;
    const scaledPool = longerWords.filter((w) => w.length >= Math.max(sourceLen, 4));
    const word = pickDifferentFromPool(sourceAnswer, scaledPool.length ? scaledPool : ["dog", "sun", "moon", "cat", "tap"], sourceLen >= 4 ? "blend" : "dog");
    return {
      id: `boss-word-${slot}`,
      type: "spelling",
      word,
      answer: word,
      prompt: `Spell the word ${word}`,
      options: [word, word.slice(0, -1) + "s", word[0] + "a" + word.slice(2), word.split("").reverse().join("")].filter((value, index, array) => array.indexOf(value) === index).slice(0, 4),
    };
  }

  if (section === "math") {
    const sourcePrompt = getPrompt(source, "math");
    const match = sourcePrompt.match(/(\d+)\s*([+\-x*])\s*(\d+)/i);
    // Boss math: scale up by +10-20% difficulty — use bigger numbers
    const left = match ? Math.min(20, Number(match[1]) + 3) : 7;
    const operator = match ? match[2] : "+";
    const right = match ? Math.min(12, Number(match[3]) + 2) : 5;
    const answerValue = operator === "-" ? left - right : operator.toLowerCase() === "x" || operator === "*" ? left * right : left + right;
    return {
      id: `boss-math-${slot}`,
      type: "math",
      prompt: `What is ${left} ${operator} ${right}?`,
      answer: String(answerValue),
      options: [String(answerValue), String(answerValue + 2), String(Math.max(0, answerValue - 2)), String(answerValue + 1)].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 4),
    };
  }

  if (slot === "mixed") {
    return {
      id: "boss-reading-mixed",
      type: "reading",
      passage: "Sam packed a red ball, a blue hat, and a green book for the park.",
      prompt: "What did Sam pack for the park?",
      answer: "A red ball, a blue hat, and a green book",
      options: [
        "A red ball, a blue hat, and a green book",
        "Only a green book",
        "A yellow kite and a snack",
      ],
    };
  }

  return {
    id: "boss-reading-final",
    type: "reading",
    passage: "Mina read three pages before dinner and two pages after dinner.",
    prompt: "How many pages did Mina read in total?",
    answer: "5",
    options: ["5", "3", "2"],
  };
}

function getBossTutorLine(question: BossQuestion, questionIndex: number): string {
  const questionNumber = questionIndex + 1;
  if (question.section === "spelling") {
    const answer = getAnswer(question.item);
    if (answer.trim().length === 1) {
      return `Boss Battle. Question ${questionNumber}. Tap the letter ${answer.trim().toUpperCase()}.`;
    }
    return `Boss Battle. Question ${questionNumber}. Choose the correct spelling of ${answer.trim().toLowerCase()}.`;
  }
  if (question.section === "math") {
    return `Boss Battle. Question ${questionNumber}. Solve this question.`;
  }
  return `Boss Battle. Question ${questionNumber}. Read the passage, then choose the best answer.`;
}

function buildBossQuestions(items: LessonItem[], journey: JourneyPayload["journey"]): BossQuestion[] {
  const used = new Set<string>();
  const fallbackSubject = "spelling";

  const pick = (
    slot: BossQuestion["slot"],
    slotLabel: string,
    preferred: ((item: LessonItem, index: number) => boolean)[],
  ): BossQuestion => {
    let selected: { item: LessonItem; id: string; index: number } | null = null;
    for (const rule of preferred) {
      selected = firstUnusedBy(items, used, rule);
      if (selected) break;
    }
    if (!selected) {
      selected = takeAnyUnused(items, used);
    }

    const fallbackSource: LessonItem = {
      id: `${slot}-fallback`,
      type: "spelling",
      word: "cat",
      answer: "cat",
      prompt: "Spell the word cat",
      options: ["cat", "cot", "cut"],
    };

    if (selected) {
      used.add(selected.id);
    }

    const sourceItem = selected?.item ?? fallbackSource;
    const sourceSection = selected ? getItemSection(selected.item, fallbackSubject) : "spelling";
    const challengeItem = buildChallengeItem(sourceSection, slot, sourceItem);

    return {
      id: `${slot}-${toQuestionId(challengeItem, 0)}`,
      slot,
      slotLabel,
      item: challengeItem,
      section: sourceSection,
    };
  };

  const warmupSkill = journey?.warmupSkill;
  const focusSkill = journey?.focusSkill;
  const weakSkill = journey?.weakSkill;

  return [
    pick("warmup", "Question 1/5 • Warm-up", [
      (item) => skillMatches(item, warmupSkill),
    ]),
    pick("focus", "Question 2/5 • Focus Skill", [
      (item) => skillMatches(item, focusSkill),
      (item) => getItemSection(item, fallbackSubject) === "spelling",
    ]),
    pick("weak", "Question 3/5 • Weak Skill", [
      (item) => skillMatches(item, weakSkill),
    ]),
    pick("mixed", "Question 4/5 • Mixed Review", [
      (item) => {
        const section = getItemSection(item, fallbackSubject);
        return section === "math" || section === "reading";
      },
    ]),
    pick("final", "Question 5/5 • Final Boss", [
      (item) => {
        const section = getItemSection(item, fallbackSubject);
        return section === "reading";
      },
      (item) => {
        const section = getItemSection(item, fallbackSubject);
        return section === "math";
      },
    ]),
  ];
}

function heartsLabel(value: number): string {
  return Array.from({ length: 3 }, (_, index) => (index < value ? "❤️" : "🖤")).join(" ");
}

export default function BossBattlePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lockedReason, setLockedReason] = useState("");
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [stage, setStage] = useState<"mastery_celebration" | "intro" | "battle" | "result">("mastery_celebration");
  const [questions, setQuestions] = useState<BossQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [heartsLeft, setHeartsLeft] = useState(3);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const statusRes = await fetch("/api/student/boss-battle", { credentials: "include" });
        const statusPayload = (await statusRes.json()) as BossStatusPayload;
        if (!statusRes.ok) {
          throw new Error(statusPayload.error ?? "Unable to load Boss Battle.");
        }

        if (!statusPayload.unlocked) {
          setLockedReason(statusPayload.lockReason ?? "Finish today's journey first to unlock Boss Battle.");
          setLoading(false);
          return;
        }

        if (statusPayload.alreadyPlayedToday && statusPayload.previousBattle) {
          setAlreadyPlayed(true);
          setBattleResult({
            win: Boolean(statusPayload.previousBattle.win),
            perfectWin: Boolean(statusPayload.previousBattle.perfectWin),
            rewards: {
              xpEarned: statusPayload.previousBattle.rewards?.xpEarned ?? 0,
              coinsEarned: statusPayload.previousBattle.rewards?.coinsEarned ?? 0,
              starsEarned: statusPayload.previousBattle.rewards?.starsEarned ?? 0,
            },
            badge: statusPayload.previousBattle.badge ?? null,
          });
          setStage("result");
          setLoading(false);
          return;
        }

        const [journeyRes, assignmentRes] = await Promise.all([
          fetch("/api/student/daily-journey", { credentials: "include" }),
          statusPayload.lessonAssignmentId
            ? fetch(`/api/student/assignments?id=${encodeURIComponent(statusPayload.lessonAssignmentId)}`, { credentials: "include" })
            : Promise.resolve(null),
        ]);

        const journeyPayload = (await journeyRes.json()) as JourneyPayload;
        if (!journeyRes.ok) {
          throw new Error("Unable to load today's journey.");
        }

        let assignmentPayload: AssignmentPayload | null = null;
        if (assignmentRes) {
          const assignmentData = (await assignmentRes.json()) as AssignmentPayload & { error?: string };
          if (assignmentRes.ok) {
            assignmentPayload = assignmentData;
          }
        }

        if (!assignmentPayload?.items?.length) {
          throw new Error("No lesson items found for Boss Battle.");
        }

        const built = buildBossQuestions(assignmentPayload.items, journeyPayload.journey);
        setQuestions(built);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load Boss Battle.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const current = questions[index] ?? null;
  const options = useMemo(() => (current ? getOptions(current.item) : []), [current]);
  const expectedAnswer = current ? getAnswer(current.item) : "";
  const bossHp = Math.max(0, 100 - correctAnswers * 20);
  const canSubmit = Boolean(answer.trim()) || options.length > 0;

  async function completeBattle(finalCorrect: number, finalHearts: number, answered: number) {
    setSubmitting(true);
    try {
      const response = await fetch("/api/student/boss-battle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          correctAnswers: finalCorrect,
          heartsLeft: finalHearts,
          questionsAnswered: answered,
        }),
      });
      const payload = (await response.json()) as BossCompletePayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to complete Boss Battle.");
      }

      setBattleResult({
        win: Boolean(payload.win),
        perfectWin: Boolean(payload.perfectWin),
        rewards: {
          xpEarned: payload.rewards?.xpEarned ?? 0,
          coinsEarned: payload.rewards?.coinsEarned ?? 0,
          starsEarned: payload.rewards?.starsEarned ?? 0,
        },
        badge: payload.badge ?? null,
      });
      setStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete Boss Battle.");
    } finally {
      setSubmitting(false);
    }
  }

  function submitAnswer(selected?: string) {
    if (!current) return;
    const given = (selected ?? answer).trim();
    if (!given) return;

    const correct = normalize(given) === normalize(expectedAnswer);
    const nextCorrect = correct ? correctAnswers + 1 : correctAnswers;
    const nextHearts = correct ? heartsLeft : Math.max(0, heartsLeft - 1);
    const nextIndex = index + 1;
    const answeredCount = nextIndex;
    const isOver = nextIndex >= questions.length || nextHearts <= 0;

    setCorrectAnswers(nextCorrect);
    setHeartsLeft(nextHearts);
    setAnswer("");

    if (isOver) {
      void completeBattle(nextCorrect, nextHearts, answeredCount);
      return;
    }

    setIndex(nextIndex);
  }

  const tutorLine = current
    ? getBossTutorLine(current, index)
    : "";

  useEffect(() => {
    if (stage !== "battle" || !current || !tutorLine) return;
    stopVoicePlayback();
    void speak(tutorLine);
  }, [current, stage, tutorLine]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
        <Navbar />
        <section className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">Loading Boss Battle...</div>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
        <Navbar />
        <section className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-8 text-rose-700">{error}</div>
          <Link href="/student/dashboard" className="mt-5 inline-flex rounded-2xl bg-indigo-600 px-5 py-3 font-black text-white">Back to Dashboard</Link>
        </section>
      </main>
    );
  }

  if (lockedReason) {
    return (
      <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
        <Navbar />
        <section className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-700">Boss Battle Locked</p>
            <h1 className="mt-3 text-4xl font-black text-slate-950">{"🏆 Boss Battle unlocks after today's journey"}</h1>
            <p className="mt-3 max-w-2xl text-slate-700">{lockedReason}</p>
            <Link href="/student/dashboard" className="mt-6 inline-flex rounded-2xl bg-indigo-600 px-5 py-3 font-black text-white">Return to Dashboard</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <Navbar />
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
          {stage === "intro" ? (
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-rose-600">Boss Battle Unlocked</p>
              <h1 className="mt-3 text-4xl font-black text-slate-950">🏆 The Word Monster is here!</h1>
              <p className="mt-3 max-w-2xl text-slate-700">Use your skills to defeat the monster. Answer 5 questions. Each correct answer removes 20 HP.</p>
              <div className="mt-6 grid gap-3 text-sm font-bold text-slate-700 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">Monster HP: 100</div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">Your hearts: {heartsLabel(3)}</div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">Questions: 5</div>
              </div>
              <button
                type="button"
                onClick={() => setStage("battle")}
                className="mt-7 inline-flex rounded-2xl bg-rose-600 px-6 py-4 text-lg font-black text-white shadow-lg shadow-rose-200 hover:bg-rose-500"
              >
                Start Boss Battle
              </button>
            </div>
          ) : null}

          {stage === "mastery_celebration" ? (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-5xl">
                🌟
              </div>
              <p className="mt-6 text-sm font-black uppercase tracking-[0.25em] text-emerald-600">
                Mastery Achieved
              </p>
              <h1 className="mt-3 text-4xl font-black text-slate-950">
                {"You've mastered today's lesson."}
              </h1>
              <p className="mt-3 max-w-md mx-auto text-lg text-slate-600">
                You showed real understanding and fixed every tricky question.
              </p>
              <p className="mt-5 text-2xl font-black text-rose-700">
                Ready to challenge the Boss?
              </p>
              <button
                type="button"
                onClick={() => setStage("intro")}
                className="mt-7 inline-flex rounded-2xl bg-rose-600 px-8 py-5 text-xl font-black text-white shadow-xl shadow-rose-200 hover:bg-rose-500 transition-transform hover:scale-105"
              >
                Start Boss Battle
              </button>
              <p className="mt-4 text-sm text-slate-400">5 challenge questions • Boss HP: 100</p>
            </div>
          ) : null}

          {stage === "battle" && current ? (
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-rose-600">Boss Battle</p>
              <h2 className="mt-2 text-3xl font-black text-slate-950">{current.slotLabel}</h2>

              <div className="mt-5 rounded-3xl bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm font-black text-slate-700">Monster HP: {bossHp}%</p>
                  <p className="text-sm font-black text-slate-700">Your hearts: {heartsLabel(heartsLeft)}</p>
                </div>
                <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-4 rounded-full bg-gradient-to-r from-rose-600 to-orange-400" style={{ width: `${bossHp}%` }} />
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">Tutor</p>
                <p className="mt-2 text-sm font-bold text-slate-700">{tutorLine}</p>

                {current.section === "reading" && current.item.passage ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 italic text-slate-700">
                    {current.item.passage}
                  </div>
                ) : null}

                <h3 className="mt-4 text-2xl font-black text-slate-950">{getPrompt(current.item, current.section)}</h3>

                {options.length > 0 ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => submitAnswer(option)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left font-bold text-slate-800 hover:bg-slate-100"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canSubmit) {
                          submitAnswer();
                        }
                      }}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg font-bold outline-none ring-indigo-400 focus:ring-2"
                      placeholder="Type your answer"
                    />
                    <button
                      type="button"
                      onClick={() => submitAnswer()}
                      disabled={!canSubmit}
                      className="rounded-2xl bg-indigo-600 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Submit
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {stage === "result" && battleResult ? (
            <div className="text-center">
              {battleResult.win ? (
                <>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600">Boss Defeated</p>
                  <h2 className="mt-3 text-5xl font-black text-slate-950">🎉 Boss Defeated!</h2>
                </>
              ) : (
                <>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-600">So Close</p>
                  <h2 className="mt-3 text-5xl font-black text-slate-950">The boss escaped this time.</h2>
                </>
              )}

              <p className="mt-4 text-lg font-bold text-slate-700">
                {battleResult.win ? "Amazing work!" : "You learned more and grew stronger for next time."}
              </p>

              <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-indigo-50 p-4 font-black text-indigo-700">+{battleResult.rewards.xpEarned} XP</div>
                <div className="rounded-2xl bg-amber-50 p-4 font-black text-amber-700">+{battleResult.rewards.coinsEarned} Coins</div>
                <div className="rounded-2xl bg-rose-50 p-4 font-black text-rose-700">+{battleResult.rewards.starsEarned} Stars</div>
              </div>

              {battleResult.badge ? (
                <p className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 font-black text-violet-700">+1 rare badge unlocked: Boss Slayer</p>
              ) : null}

              {alreadyPlayed ? (
                <p className="mt-4 text-sm font-bold text-slate-500">You already played Boss Battle today.</p>
              ) : null}

              <Link href="/student/dashboard" className="mt-7 inline-flex rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white">
                Back to Dashboard
              </Link>
            </div>
          ) : null}

          {submitting ? <p className="mt-4 text-sm text-slate-500">Saving battle rewards...</p> : null}
        </div>
      </section>
    </main>
  );
}
