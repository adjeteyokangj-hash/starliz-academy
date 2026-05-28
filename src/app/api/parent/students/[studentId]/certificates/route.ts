import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { maskStudentName } from "@/lib/certificate-issuing";
import { listIssuedCertificatesForLibrary } from "@/lib/certificate-library";
import { listPersistedCertificateRecordsForStudent } from "@/lib/certificate-records";

export async function GET(_: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const { studentId } = await params;
  const child = await prisma.childProfile.findFirst({
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

  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const persistedCertificates = await listPersistedCertificateRecordsForStudent(child.id);
  const certificates = listIssuedCertificatesForLibrary(child.studentProfile?.aiLearningProfileJson ?? null, persistedCertificates);

  return NextResponse.json({
    ok: true,
    child: {
      id: child.id,
      name: child.name,
      studentDisplayName: maskStudentName(child.name),
      yearGroup: child.yearGroup,
      keyStage: child.studentProfile?.keyStageLevel ?? null,
    },
    certificates,
  });
}
