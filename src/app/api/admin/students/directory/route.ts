import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";

/**
 * Lightweight student picker for school enrolment.
 * Avoids the heavy /api/admin/students aggregate used by the platform registry.
 */
export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const excludeSchoolId = url.searchParams.get("excludeSchoolId")?.trim() || null;
  const take = Math.min(40, Math.max(5, Number(url.searchParams.get("take") ?? 25) || 25));

  const students = await prisma.childProfile.findMany({
    where: {
      archived: false,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { parent: { email: { contains: q, mode: "insensitive" } } },
              { parent: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(excludeSchoolId
        ? {
            NOT: {
              schoolLinks: {
                some: {
                  schoolId: excludeSchoolId,
                  status: "active",
                },
              },
            },
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take,
    select: {
      id: true,
      name: true,
      age: true,
      yearGroup: true,
      parent: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    students: students.map((row) => ({
      id: row.id,
      name: row.name,
      age: row.age,
      yearGroup: row.yearGroup,
      parentId: row.parent.id,
      parentName: row.parent.name,
      parentEmail: row.parent.email,
    })),
  });
}
