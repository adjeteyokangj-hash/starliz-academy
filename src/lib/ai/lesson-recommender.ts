import { prisma } from "@/lib/db";
import { detectWeakAreas } from "./weakness-detector";

export async function recommendNextLesson(studentId: string) {
  const weakAreas = await detectWeakAreas(studentId);
  const first = weakAreas[0];
  const subject = first?.topic.split(":")[0] ?? "spelling";

  const lesson = await prisma.lesson.findFirst({
    where: { subject: { contains: subject }, status: "published" },
    orderBy: [{ difficulty: "asc" }, { updatedAt: "desc" }],
  });

  return {
    studentId,
    reason: first ? `Recommended because ${first.topic} has ${first.count} recent misses.` : "Recommended starter lesson.",
    lesson,
    weakAreas,
  };
}
