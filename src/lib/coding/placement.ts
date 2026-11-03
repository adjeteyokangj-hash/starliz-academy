import { pathwayForYear, pathwaySummary } from "@/lib/coding/catalog";
import { CODING_PATHWAYS, type CodingPathwayId } from "@/lib/coding/types";

export type PlacementQuestion = {
  id: string;
  prompt: string;
  choices: Array<{ id: string; label: string }>;
  /** Pathway this correct answer demonstrates. */
  pathway: CodingPathwayId;
  correctChoiceId: string;
};

export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  {
    id: "sequence",
    prompt: "Which list would make a jam sandwich in a sensible order?",
    pathway: "foundations",
    correctChoiceId: "spread-then-slice",
    choices: [
      { id: "eat-first", label: "Eat it, then spread the jam, then get the bread" },
      { id: "spread-then-slice", label: "Get the bread, spread the jam, put the slices together" },
      { id: "jam-only", label: "Only say the word jam, with no other steps" },
    ],
  },
  {
    id: "loop",
    prompt: "Which block makes a character hop again and again without writing hop many times?",
    pathway: "block-coding",
    correctChoiceId: "repeat",
    choices: [
      { id: "repeat", label: "A repeat block with hop inside it" },
      { id: "colour", label: "A block that only changes the colour" },
      { id: "title", label: "The name of the project" },
    ],
  },
  {
    id: "variable",
    prompt: "In a program, a variable is mainly used to…",
    pathway: "blocks-to-text",
    correctChoiceId: "store",
    choices: [
      { id: "store", label: "Store a value that can change, such as a score" },
      { id: "paint", label: "Paint the screen a fixed colour forever" },
      { id: "plug", label: "Plug the computer into the wall" },
    ],
  },
  {
    id: "test",
    prompt: "Which check best shows that a sorting program works?",
    pathway: "applied",
    correctChoiceId: "cases",
    choices: [
      { id: "cases", label: "Try lists that are already ordered, reversed, and empty, and compare the results" },
      { id: "once", label: "Run it once on your name and stop" },
      { id: "colour", label: "Change the button colour and assume the sort is correct" },
    ],
  },
];

export type PlacementRecommendation = {
  yearPathway: CodingPathwayId;
  recommended: CodingPathwayId;
  adjustment: "revision" | "year-band" | "advanced";
  note: string;
  correctCount: number;
};

function indexOfPathway(id: CodingPathwayId): number {
  return CODING_PATHWAYS.indexOf(id);
}

export function recommendCodingPathway(input: {
  yearGroup: string | null | undefined;
  answers: Array<{ questionId: string; choiceId: string }>;
}): PlacementRecommendation {
  const yearPathway = pathwayForYear(input.yearGroup);
  const yearIndex = indexOfPathway(yearPathway);
  let highestCorrect = -1;
  let correctCount = 0;
  for (const question of PLACEMENT_QUESTIONS) {
    const answer = input.answers.find((item) => item.questionId === question.id);
    if (!answer) continue;
    if (answer.choiceId === question.correctChoiceId) {
      correctCount += 1;
      highestCorrect = Math.max(highestCorrect, indexOfPathway(question.pathway));
    }
  }

  if (highestCorrect < 0) {
    const summary = pathwaySummary(yearPathway);
    return {
      yearPathway,
      recommended: yearPathway,
      adjustment: "year-band",
      note: `Your year group starts on ${summary.title}. You can take the short placement when you are ready.`,
      correctCount,
    };
  }

  const recommended = CODING_PATHWAYS[Math.min(CODING_PATHWAYS.length - 1, highestCorrect)] ?? yearPathway;
  const recommendedIndex = indexOfPathway(recommended);
  const summary = pathwaySummary(recommended);
  if (recommendedIndex < yearIndex) {
    return {
      yearPathway,
      recommended,
      adjustment: "revision",
      note: `Your year group often starts on ${pathwaySummary(yearPathway).title}. This placement supports some revision on ${summary.title} first.`,
      correctCount,
    };
  }
  if (recommendedIndex > yearIndex) {
    return {
      yearPathway,
      recommended,
      adjustment: "advanced",
      note: `You showed knowledge beyond ${pathwaySummary(yearPathway).title}. ${summary.title} is a better fit when those lessons are published. The live module is still available now.`,
      correctCount,
    };
  }
  return {
    yearPathway,
    recommended,
    adjustment: "year-band",
    note: `${summary.title} matches your year group and this placement.`,
    correctCount,
  };
}

/** Questions sent to the learner. Correct answers stay on the server. */
export function publicPlacementQuestions(publishedPathways?: CodingPathwayId[]): Array<{
  id: string;
  prompt: string;
  choices: Array<{ id: string; label: string }>;
}> {
  const allowed = publishedPathways ? new Set(publishedPathways) : null;
  return PLACEMENT_QUESTIONS.filter((question) => !allowed || allowed.has(question.pathway)).map((question) => ({
    id: question.id,
    prompt: question.prompt,
    choices: question.choices,
  }));
}
