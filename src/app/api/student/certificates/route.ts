import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { maskStudentName } from "@/lib/certificate-issuing";
import { listIssuedCertificatesForLibrary } from "@/lib/certificate-library";
import { listPersistedCertificateRecordsForStudent } from "@/lib/certificate-records";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const studentId = await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: {
      id: true,
      name: true,
      yearGroup: true,
      studentProfile: {
        select: {
          keyStageLevel: true,
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const persistedCertificates = await listPersistedCertificateRecordsForStudent(student.id);
  const certificates = listIssuedCertificatesForLibrary(student.studentProfile?.aiLearningProfileJson ?? null, persistedCertificates);

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      name: student.name,
      studentDisplayName: maskStudentName(student.name),
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
    },
    certificates,
  });
}
