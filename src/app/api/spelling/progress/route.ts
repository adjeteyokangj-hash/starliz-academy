import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { calculateStatus, detectMistake, getPattern } from "@/lib/spellingEngine";

const progressSchema = z.object({
  studentId: z.string().min(1),
  word: z.string().min(1),
  input: z.string().default(""),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  try {
    const body = progressSchema.parse(await request.json());
    const targetWord = body.word.trim().toLowerCase();
    const attemptWord = body.input.trim().toLowerCase();

    const child = await prisma.childProfile.findFirst({
      where: {
        id: body.studentId,
        parentId: parentScope.parentId,
        archived: false,
      },
      select: { id: true },
    });

    if (!child) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const existing = await prisma.wordProgress.findUnique({
      where: {
        studentId_word: {
          studentId: body.studentId,
          word: targetWord,
        },
      },
    });

    const isCorrect = attemptWord === targetWord;
    const attempts = (existing?.attempts ?? 0) + 1;
    const correctCount = (existing?.correctCount ?? 0) + (isCorrect ? 1 : 0);
    const mistakeType = isCorrect ? null : detectMistake(attemptWord, targetWord);
    const status = calculateStatus(attempts, correctCount);

    const updated = await prisma.wordProgress.upsert({
      where: {
        studentId_word: {
          studentId: body.studentId,
          word: targetWord,
        },
      },
      update: {
        attempts,
        correctCount,
        status,
        mistakeType,
        pattern: existing?.pattern ?? getPattern(targetWord),
        length: targetWord.length,
      },
      create: {
        studentId: body.studentId,
        word: targetWord,
        length: targetWord.length,
        pattern: getPattern(targetWord),
        attempts,
        correctCount,
        status,
        mistakeType,
      },
    });

    const [seenWords, weakWords, masteredWords] = await Promise.all([
      prisma.wordProgress.count({ where: { studentId: body.studentId } }),
      prisma.wordProgress.count({ where: { studentId: body.studentId, status: "weak" } }),
      prisma.wordProgress.count({ where: { studentId: body.studentId, status: "mastered" } }),
    ]);

    return NextResponse.json({
      success: true,
      isCorrect,
      updated,
      summary: {
        seenWords,
        weakWords,
        masteredWords,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid spelling progress payload." }, { status: 400 });
  }
}