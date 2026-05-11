import { prisma } from "@/lib/db";

type CreateTrustInput = {
  name: string;
  code: string;
  headquartersRegion?: string;
  metadata?: Record<string, unknown>;
};

export async function createTrust(input: CreateTrustInput) {
  return prisma.trust.create({
    data: {
      name: input.name,
      code: input.code,
      headquartersRegion: input.headquartersRegion,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
  });
}

export async function updateTrust(input: {
  trustId: string;
  name?: string;
  code?: string;
  headquartersRegion?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.trust.update({
    where: { id: input.trustId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.headquartersRegion !== undefined ? { headquartersRegion: input.headquartersRegion || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.metadata !== undefined ? { metadataJson: JSON.stringify(input.metadata) } : {}),
    },
  });
}

export async function attachSchoolToTrust(input: {
  trustId: string;
  schoolId: string;
  roleInTrust?: string;
}) {
  return prisma.trustSchoolMembership.upsert({
    where: {
      trustId_schoolId: {
        trustId: input.trustId,
        schoolId: input.schoolId,
      },
    },
    update: {
      status: "active",
      roleInTrust: input.roleInTrust,
      leftAt: null,
    },
    create: {
      trustId: input.trustId,
      schoolId: input.schoolId,
      roleInTrust: input.roleInTrust,
      status: "active",
    },
  });
}

export async function createBulkOnboardingBatch(input: {
  trustId?: string;
  createdByUserId?: string;
  sourceType?: "csv" | "api" | "manual";
  fileRef?: string;
  dryRun?: boolean;
  rows: Array<Record<string, unknown>>;
}) {
  const batch = await prisma.bulkOnboardingBatch.create({
    data: {
      trustId: input.trustId,
      createdByUserId: input.createdByUserId,
      sourceType: input.sourceType ?? "csv",
      fileRef: input.fileRef,
      dryRun: input.dryRun ?? true,
      status: "validating",
      totalRows: input.rows.length,
    },
  });

  if (input.rows.length > 0) {
    await prisma.$transaction(
      input.rows.map((row, index) =>
        prisma.bulkOnboardingItem.create({
          data: {
            batchId: batch.id,
            rowNumber: index + 1,
            schoolPayloadJson: JSON.stringify(row),
            status: "pending",
          },
        }),
      ),
    );
  }

  await prisma.bulkOnboardingBatch.update({
    where: { id: batch.id },
    data: { status: "ready" },
  });

  return prisma.bulkOnboardingBatch.findUnique({
    where: { id: batch.id },
    include: {
      items: {
        orderBy: [{ rowNumber: "asc" }],
      },
    },
  });
}

export async function executeBulkOnboardingBatch(batchId: string) {
  const batch = await prisma.bulkOnboardingBatch.findUnique({
    where: { id: batchId },
    include: {
      items: {
        orderBy: [{ rowNumber: "asc" }],
      },
    },
  });

  if (!batch) {
    throw new Error("Batch not found");
  }

  await prisma.bulkOnboardingBatch.update({
    where: { id: batch.id },
    data: { status: "running" },
  });

  let successRows = 0;
  let failedRows = 0;

  for (const item of batch.items) {
    try {
      const parsed = JSON.parse(item.schoolPayloadJson) as {
        name?: string;
        slug?: string;
        type?: string;
        status?: "pilot" | "active" | "suspended" | "archived";
      };

      if (!parsed.name || !parsed.slug) {
        throw new Error("Missing name or slug");
      }

      if (batch.dryRun) {
        await prisma.bulkOnboardingItem.update({
          where: { id: item.id },
          data: { status: "validated" },
        });
        successRows += 1;
        continue;
      }

      const school = await prisma.school.create({
        data: {
          name: parsed.name,
          slug: parsed.slug,
          type: parsed.type ?? "school",
          status: parsed.status ?? "pilot",
        },
      });

      if (batch.trustId) {
        await attachSchoolToTrust({ trustId: batch.trustId, schoolId: school.id });
      }

      await prisma.bulkOnboardingItem.update({
        where: { id: item.id },
        data: {
          status: "created",
          createdSchoolId: school.id,
          errorJson: null,
        },
      });
      successRows += 1;
    } catch (error) {
      failedRows += 1;
      await prisma.bulkOnboardingItem.update({
        where: { id: item.id },
        data: {
          status: "failed",
          errorJson: JSON.stringify({
            message: error instanceof Error ? error.message : String(error),
          }),
        },
      });
    }
  }

  const status = failedRows > 0 ? "failed" : "completed";
  await prisma.bulkOnboardingBatch.update({
    where: { id: batch.id },
    data: {
      status,
      successRows,
      failedRows,
    },
  });

  return prisma.bulkOnboardingBatch.findUnique({
    where: { id: batch.id },
    include: {
      items: { orderBy: [{ rowNumber: "asc" }] },
    },
  });
}
