import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { buildCoachWordHelpResponse } from "@/lib/coachDictionary";

const requestSchema = z.object({
  word: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  keyStage: z.string().optional().nullable(),
  yearGroup: z.string().optional().nullable(),
  activityType: z.string().optional().nullable(),
  currentPrompt: z.string().optional().nullable(),
  childAttempt: z.string().optional().nullable(),
  supportLevel: z.number().int().min(1).max(5).optional().nullable(),
  topic: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = requestSchema.parse(await request.json());
    const payload = await buildCoachWordHelpResponse(body);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({
      word: null,
      definitionChild: "I don’t have this word in my Word Bank yet, but I can still help you understand it.",
      exampleSentence: null,
      phonicsPattern: null,
      syllables: null,
      pronunciationHint: null,
      coachMessage: "I don’t have this word in my Word Bank yet, but I can still help you understand it.",
      hintLevel: 1,
      relatedWords: [],
      shouldReadAloud: false,
      definitionParent: null,
      subject: null,
      keyStage: null,
      yearGroup: null,
      active: false,
      found: false,
      relationshipLinks: [],
      recoveryPlan: {
        targetWord: null,
        prerequisites: [],
        revisionOrder: [],
        shortestRecoveryPath: [],
        missingConcepts: [],
        estimatedComplexity: "low",
        estimatedInterventionMinutes: 10,
        visualSupportHint: "Use a concrete visual example first.",
        interventionLessonFocus: [],
      },
    });
  }
}
