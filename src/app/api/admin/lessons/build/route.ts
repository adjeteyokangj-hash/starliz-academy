import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { getOpenAiApiKey } from "@/lib/api-key-config";
import { keyStageForYearGroup, ageGroupForYearGroup, subjectsForYearGroup, skillsForSubjectAndYear, type Subject, type YearGroup } from "@/lib/curriculum";
import { buildLessonPathway, LESSON_TEMPLATES, type LessonDifficultyBand, type LessonTemplateValue } from "@/lib/lesson-curriculum";

const buildSchema = z.object({
  title: z.string().trim().optional(),
  subject: z.string().trim().min(1),
  yearGroup: z.string().trim().min(1),
  skillFocus: z.string().trim().optional(),
  template: z.string().trim().optional(),
  difficultyBand: z.string().trim().optional(),
});

function stringifyJson(data: unknown) {
  return JSON.stringify(data, null, 2);
}

function safeSubject(subject: string): Subject {
  return subject as Subject;
}

function safeYearGroup(yearGroup: string): YearGroup {
  return yearGroup as YearGroup;
}

function buildFallbackDraft(input: {
  title?: string;
  subject: Subject;
  yearGroup: YearGroup;
  skillFocus?: string;
  template?: LessonTemplateValue;
  difficultyBand?: LessonDifficultyBand;
}) {
  const yearSkills = skillsForSubjectAndYear(input.subject, input.yearGroup);
  const skillFocus = input.skillFocus ?? yearSkills[0] ?? "Core skill";
  const pathway = buildLessonPathway(input.template);
  const title = input.title ?? `${input.yearGroup} ${input.subject} ${skillFocus}`;
  return {
    title,
    objective: `Help learners secure ${skillFocus} in ${input.subject} for ${input.yearGroup}.`,
    lessonSteps: pathway.map((step, index) => ({
      step,
      order: index + 1,
      focus: step === "starter" ? "Activate prior knowledge" : step === "teach" ? "Model the new skill" : step === "assessment" ? "Check understanding" : `Work on ${skillFocus}`,
    })),
    linkedContentSuggestions: [],
    assessmentQuestions: [
      `What is the key idea in ${skillFocus}?`,
      `Show one example of ${skillFocus}.`,
    ],
    recapPrompt: `Explain ${skillFocus} in your own words.`,
    parentSummary: `This lesson targets ${skillFocus} in ${input.yearGroup} ${input.subject}.`,
    title,
    subject: input.subject,
    yearGroup: input.yearGroup,
    keyStage: keyStageForYearGroup(input.yearGroup),
    ageGroup: ageGroupForYearGroup(input.yearGroup),
    skillFocus,
    difficultyBand: input.difficultyBand ?? "core",
    template: input.template ?? "",
    pathway,
  };
}

async function requestOpenAiJson(apiKey: string, systemPrompt: string, userPrompt: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content) as Record<string, unknown>;
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("content:edit");
  if (!session) return response;

  const parsed = buildSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lesson build request." }, { status: 400 });
  }

  const body = parsed.data;
  const subject = safeSubject(body.subject);
  const yearGroup = safeYearGroup(body.yearGroup);
  const availableSubjects = subjectsForYearGroup(yearGroup);
  if (!availableSubjects.includes(subject)) {
    return NextResponse.json({ error: "Subject is not available for the selected year group." }, { status: 422 });
  }

  const template = (body.template && LESSON_TEMPLATES.some((item) => item.value === body.template) ? body.template : "") as LessonTemplateValue | "";
  const difficultyBand = (body.difficultyBand && ["support", "core", "stretch", "mastery"].includes(body.difficultyBand) ? body.difficultyBand : "core") as LessonDifficultyBand;
  const skillFocus = body.skillFocus?.trim() || skillsForSubjectAndYear(subject, yearGroup)[0] || "Core skill";

  const contentSuggestions = await prisma.aIContentCache.findMany({
    where: {
      ...(body.subject ? { contentType: subject === "maths" ? "math" : subject === "gcse-maths" ? "math" : subject === "phonics" || subject === "spelling" || subject === "grammar" || subject === "punctuation" || subject === "writing" ? "spelling" : "reading" } : {}),
      ...(yearGroup ? { yearGroup } : {}),
      ...(skillFocus ? { OR: [{ skillFocus: { contains: skillFocus } }, { topic: { contains: skillFocus } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, topic: true, skillFocus: true, contentType: true, level: true, yearGroup: true, keyStage: true },
  });

  const apiKey = await getOpenAiApiKey();
  if (!apiKey) {
    const draft = buildFallbackDraft({
      title: body.title,
      subject,
      yearGroup,
      skillFocus,
      template: template || undefined,
      difficultyBand,
    });
    return NextResponse.json({ ok: true, source: "fallback", draft: { ...draft, linkedContentSuggestions: contentSuggestions } });
  }

  const systemPrompt = [
    "You are a curriculum lesson builder for an adaptive AI learning platform.",
    "Return JSON only.",
    "Generate a lesson draft with title, objective, lessonSteps, linkedContentSuggestions, assessmentQuestions, recapPrompt, parentSummary.",
    "Keep steps in the order starter, teach, guided practice, independent practice, assessment, recap, mastery check where appropriate.",
  ].join(" ");

  const userPrompt = stringifyJson({
    title: body.title,
    subject,
    yearGroup,
    keyStage: keyStageForYearGroup(yearGroup),
    ageGroup: ageGroupForYearGroup(yearGroup),
    skillFocus,
    difficultyBand,
    template,
    availableSkills: skillsForSubjectAndYear(subject, yearGroup),
    linkedContentSuggestions: contentSuggestions,
  });

  try {
    const draft = await requestOpenAiJson(apiKey, systemPrompt, userPrompt);
    return NextResponse.json({ ok: true, source: "openai", draft: { ...draft, subject, yearGroup, keyStage: keyStageForYearGroup(yearGroup), ageGroup: ageGroupForYearGroup(yearGroup), linkedContentSuggestions: contentSuggestions } });
  } catch (error) {
    const draft = buildFallbackDraft({
      title: body.title,
      subject,
      yearGroup,
      skillFocus,
      template: template || undefined,
      difficultyBand,
    });
    return NextResponse.json({ ok: true, source: "fallback", draft: { ...draft, linkedContentSuggestions: contentSuggestions, buildError: error instanceof Error ? error.message : "Unknown AI error" } });
  }
}
