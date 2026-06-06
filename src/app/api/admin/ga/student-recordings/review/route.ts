import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { reviewGaStudentRecording, serializeGaStudentRecording } from "@/lib/ga-audio";

const reviewSchema = z.object({
  recordingId: z.string().trim().min(1),
  reviewStatus: z.string().trim().min(1),
  adminFeedback: z.string().trim().optional().nullable(),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = reviewSchema.parse(await request.json());
    const recording = await reviewGaStudentRecording(body, session.userId);
    if (!recording) return NextResponse.json({ error: "Student recording not found." }, { status: 404 });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_student_recording.reviewed",
      entityType: "ga_student_recording",
      entityId: recording.id,
      metadata: { reviewStatus: recording.reviewStatus },
    });
    return NextResponse.json({ item: serializeGaStudentRecording(recording) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to review student recording." }, { status: 400 });
  }
}
