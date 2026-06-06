import { NextResponse } from "next/server";
import { getStudentGaLesson } from "@/lib/ga-lessons";

type Context = { params: Promise<{ lessonId: string }> };

export async function GET(_request: Request, context: Context) {
  const { lessonId } = await context.params;
  const lesson = await getStudentGaLesson(decodeURIComponent(lessonId));
  if (!lesson) return NextResponse.json({ error: "Ga lesson not found." }, { status: 404 });
  return NextResponse.json({ item: lesson });
}
