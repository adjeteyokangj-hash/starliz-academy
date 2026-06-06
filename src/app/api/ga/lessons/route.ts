import { NextResponse } from "next/server";
import { listStudentGaLessons } from "@/lib/ga-lessons";

export async function GET() {
  const items = await listStudentGaLessons();
  return NextResponse.json({ items });
}
