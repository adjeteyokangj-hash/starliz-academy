import { PrismaClient } from "@prisma/client";
import { z } from "zod";

let defaultClient: PrismaClient | null = null;

function getDefaultClient(): PrismaClient {
  if (defaultClient) return defaultClient;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required when migration client is not provided.");
  }

  defaultClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  return defaultClient;
}

const isoDateSchema = z.string().min(1);

const childSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().nullable().optional(),
  age: z.number().int().nullable().optional(),
  yearGroup: z.string().nullable().optional(),
  stars: z.number().int().optional().default(0),
  xp: z.number().int().optional().default(0),
  coins: z.number().int().optional().default(0),
  level: z.number().int().optional().default(1),
  streak: z.number().int().optional().default(0),
  selectedVoice: z.string().optional().default("friendly_coach"),
  selectedTheme: z.string().optional().default("default"),
  archived: z.boolean().optional().default(false),
  snapshotJson: z.string().nullable().optional(),
  coachingMemoryJson: z.string().nullable().optional(),
  createdAt: isoDateSchema.optional(),
  updatedAt: isoDateSchema.optional(),
});

const parentSchema = z.object({
  email: z.string().email(),
  name: z.string().nullable().optional(),
  passwordHash: z.string().min(1),
  role: z.string().optional().default("parent"),
  trialSessionsUsed: z.number().int().optional().default(0),
  pinHash: z.string().nullable().optional(),
  consentVersion: z.string().nullable().optional(),
  consentAcceptedAt: isoDateSchema.nullable().optional(),
  consentWithdrawnAt: isoDateSchema.nullable().optional(),
  createdAt: isoDateSchema.optional(),
  updatedAt: isoDateSchema.optional(),
  children: z.array(childSchema).default([]),
});

const lessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subject: z.string().min(1),
  ageGroup: z.string().nullable().optional(),
  difficulty: z.number().int().optional().default(1),
  status: z.string().optional().default("draft"),
  contentRefs: z.string().nullable().optional(),
  skills: z.string().nullable().optional(),
  createdAt: isoDateSchema.optional(),
  updatedAt: isoDateSchema.optional(),
});

const contentSchema = z.object({
  id: z.string().min(1),
  contentType: z.string().min(1),
  level: z.number().int(),
  topic: z.string().optional().default(""),
  contentJson: z.string().min(1),
  usedCount: z.number().int().optional().default(0),
  status: z.string().optional().default("draft"),
  reviewedAt: isoDateSchema.nullable().optional(),
  approvedAt: isoDateSchema.nullable().optional(),
  publishedAt: isoDateSchema.nullable().optional(),
  createdAt: isoDateSchema.optional(),
  createdBy: z.string().optional().default("system"),
  model: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  keyStage: z.string().nullable().optional(),
  yearGroup: z.string().nullable().optional(),
  skillFocus: z.string().nullable().optional(),
  skills: z.string().nullable().optional(),
  metadataJson: z.string().nullable().optional(),
  estimatedCostPence: z.number().int().optional().default(0),
});

const assignmentSchema = z.object({
  studentId: z.string().min(1),
  contentId: z.string().min(1),
  status: z.string().optional().default("assigned"),
  createdAt: isoDateSchema.optional(),
  updatedAt: isoDateSchema.optional(),
});

export const migrationDumpSchema = z.object({
  version: z.literal("starliz-migration-v1"),
  exportedAt: isoDateSchema,
  source: z.object({
    environment: z.string().optional(),
    note: z.string().optional(),
  }).optional(),
  data: z.object({
    parents: z.array(parentSchema).default([]),
    lessons: z.array(lessonSchema).default([]),
    contentLibrary: z.array(contentSchema).default([]),
    assignments: z.array(assignmentSchema).default([]),
  }),
});

export type MigrationDump = z.infer<typeof migrationDumpSchema>;

type CountRow = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
};

export type MigrationImportReport = {
  dryRun: boolean;
  summary: {
    parents: CountRow;
    children: CountRow;
    lessons: CountRow;
    contentLibrary: CountRow;
    assignments: CountRow;
  };
  warnings: string[];
  errors: Array<{ entity: string; reason: string; reference?: string }>;
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function emptyCount(total: number): CountRow {
  return { total, created: 0, updated: 0, skipped: 0 };
}

function assignmentKey(studentId: string, contentId: string): string {
  return `${studentId}::${contentId}`;
}

export async function exportMigrationDump(client: PrismaClient = getDefaultClient()): Promise<MigrationDump> {
  const [parents, lessons, contentLibrary, assignments] = await Promise.all([
    client.user.findMany({
      where: { role: "parent" },
      orderBy: { createdAt: "asc" },
      select: {
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        trialSessionsUsed: true,
        pinHash: true,
        consentVersion: true,
        consentAcceptedAt: true,
        consentWithdrawnAt: true,
        createdAt: true,
        updatedAt: true,
        children: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            avatar: true,
            age: true,
            yearGroup: true,
            stars: true,
            xp: true,
            coins: true,
            level: true,
            streak: true,
            selectedVoice: true,
            selectedTheme: true,
            archived: true,
            snapshotJson: true,
            coachingMemoryJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
    client.lesson.findMany({ orderBy: { createdAt: "asc" } }),
    client.aIContentCache.findMany({ orderBy: { createdAt: "asc" } }),
    client.assignment.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return {
    version: "starliz-migration-v1",
    exportedAt: new Date().toISOString(),
    source: {
      environment: process.env.NODE_ENV,
      note: "Parents, Lessons, Content Library and Assignments export",
    },
    data: {
      parents: parents.map((parent) => ({
        email: parent.email,
        name: parent.name,
        passwordHash: parent.passwordHash,
        role: parent.role,
        trialSessionsUsed: parent.trialSessionsUsed,
        pinHash: parent.pinHash,
        consentVersion: parent.consentVersion,
        consentAcceptedAt: parent.consentAcceptedAt?.toISOString() ?? null,
        consentWithdrawnAt: parent.consentWithdrawnAt?.toISOString() ?? null,
        createdAt: parent.createdAt.toISOString(),
        updatedAt: parent.updatedAt.toISOString(),
        children: parent.children.map((child) => ({
          ...child,
          createdAt: child.createdAt.toISOString(),
          updatedAt: child.updatedAt.toISOString(),
        })),
      })),
      lessons: lessons.map((lesson) => ({
        ...lesson,
        createdAt: lesson.createdAt.toISOString(),
        updatedAt: lesson.updatedAt.toISOString(),
      })),
      contentLibrary: contentLibrary.map((item) => ({
        ...item,
        reviewedAt: item.reviewedAt?.toISOString() ?? null,
        approvedAt: item.approvedAt?.toISOString() ?? null,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      assignments: assignments.map((assignment) => ({
        studentId: assignment.studentId,
        contentId: assignment.contentId,
        status: assignment.status,
        createdAt: assignment.createdAt.toISOString(),
        updatedAt: assignment.updatedAt.toISOString(),
      })),
    },
  };
}

export async function importMigrationDump(args: {
  dump: unknown;
  dryRun?: boolean;
  client?: PrismaClient;
}): Promise<{ report: MigrationImportReport; parsed: MigrationDump }> {
  const parsed = migrationDumpSchema.parse(args.dump);
  const dryRun = args.dryRun ?? true;
  const client = args.client ?? getDefaultClient();

  const report: MigrationImportReport = {
    dryRun,
    summary: {
      parents: emptyCount(parsed.data.parents.length),
      children: emptyCount(parsed.data.parents.reduce((total, parent) => total + parent.children.length, 0)),
      lessons: emptyCount(parsed.data.lessons.length),
      contentLibrary: emptyCount(parsed.data.contentLibrary.length),
      assignments: emptyCount(parsed.data.assignments.length),
    },
    warnings: [],
    errors: [],
  };

  const parentEmails = Array.from(new Set(parsed.data.parents.map((parent) => parent.email)));
  const childIds = Array.from(new Set(parsed.data.parents.flatMap((parent) => parent.children.map((child) => child.id))));
  const lessonIds = Array.from(new Set(parsed.data.lessons.map((lesson) => lesson.id)));
  const contentIds = Array.from(new Set(parsed.data.contentLibrary.map((content) => content.id)));

  const [existingParents, existingChildren, existingLessons, existingContent] = await Promise.all([
    parentEmails.length
      ? client.user.findMany({ where: { email: { in: parentEmails } }, select: { id: true, email: true } })
      : Promise.resolve([]),
    childIds.length
      ? client.childProfile.findMany({ where: { id: { in: childIds } }, select: { id: true } })
      : Promise.resolve([]),
    lessonIds.length
      ? client.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true } })
      : Promise.resolve([]),
    contentIds.length
      ? client.aIContentCache.findMany({ where: { id: { in: contentIds } }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  const parentMap = new Map(existingParents.map((parent) => [parent.email, parent.id]));
  const childMap = new Set(existingChildren.map((child) => child.id));
  const lessonMap = new Set(existingLessons.map((lesson) => lesson.id));
  const contentMap = new Set(existingContent.map((content) => content.id));

  for (const parent of parsed.data.parents) {
    const exists = parentMap.has(parent.email);
    if (exists) {
      report.summary.parents.updated += 1;
    } else {
      report.summary.parents.created += 1;
    }

    if (!dryRun) {
      const record = await client.user.upsert({
        where: { email: parent.email },
        update: {
          name: parent.name ?? null,
          passwordHash: parent.passwordHash,
          role: parent.role,
          trialSessionsUsed: parent.trialSessionsUsed,
          pinHash: parent.pinHash ?? null,
          consentVersion: parent.consentVersion ?? null,
          consentAcceptedAt: parseDate(parent.consentAcceptedAt) ?? undefined,
          consentWithdrawnAt: parseDate(parent.consentWithdrawnAt) ?? undefined,
        },
        create: {
          email: parent.email,
          name: parent.name ?? null,
          passwordHash: parent.passwordHash,
          role: parent.role,
          trialSessionsUsed: parent.trialSessionsUsed,
          pinHash: parent.pinHash ?? null,
          consentVersion: parent.consentVersion ?? null,
          consentAcceptedAt: parseDate(parent.consentAcceptedAt) ?? undefined,
          consentWithdrawnAt: parseDate(parent.consentWithdrawnAt) ?? undefined,
          createdAt: parseDate(parent.createdAt) ?? undefined,
        },
        select: { id: true },
      });
      parentMap.set(parent.email, record.id);
    }
  }

  for (const parent of parsed.data.parents) {
    const parentId = parentMap.get(parent.email);
    if (!parentId) {
      for (const child of parent.children) {
        report.summary.children.skipped += 1;
        report.errors.push({
          entity: "child",
          reason: "Parent could not be resolved for child import.",
          reference: `${parent.email}:${child.id}`,
        });
      }
      continue;
    }

    for (const child of parent.children) {
      const exists = childMap.has(child.id);
      if (exists) {
        report.summary.children.updated += 1;
      } else {
        report.summary.children.created += 1;
      }

      if (!dryRun) {
        await client.childProfile.upsert({
          where: { id: child.id },
          update: {
            parentId,
            name: child.name,
            avatar: child.avatar ?? null,
            age: child.age ?? null,
            yearGroup: child.yearGroup ?? null,
            stars: child.stars,
            xp: child.xp,
            coins: child.coins,
            level: child.level,
            streak: child.streak,
            selectedVoice: child.selectedVoice,
            selectedTheme: child.selectedTheme,
            archived: child.archived,
            snapshotJson: child.snapshotJson ?? null,
            coachingMemoryJson: child.coachingMemoryJson ?? null,
          },
          create: {
            id: child.id,
            parentId,
            name: child.name,
            avatar: child.avatar ?? null,
            age: child.age ?? null,
            yearGroup: child.yearGroup ?? null,
            stars: child.stars,
            xp: child.xp,
            coins: child.coins,
            level: child.level,
            streak: child.streak,
            selectedVoice: child.selectedVoice,
            selectedTheme: child.selectedTheme,
            archived: child.archived,
            snapshotJson: child.snapshotJson ?? null,
            coachingMemoryJson: child.coachingMemoryJson ?? null,
            createdAt: parseDate(child.createdAt) ?? undefined,
          },
        });
        childMap.add(child.id);
      }
    }
  }

  for (const lesson of parsed.data.lessons) {
    const exists = lessonMap.has(lesson.id);
    if (exists) {
      report.summary.lessons.updated += 1;
    } else {
      report.summary.lessons.created += 1;
    }

    if (!dryRun) {
      await client.lesson.upsert({
        where: { id: lesson.id },
        update: {
          title: lesson.title,
          subject: lesson.subject,
          ageGroup: lesson.ageGroup ?? null,
          difficulty: lesson.difficulty,
          status: lesson.status,
          contentRefs: lesson.contentRefs ?? null,
          skills: lesson.skills ?? null,
        },
        create: {
          id: lesson.id,
          title: lesson.title,
          subject: lesson.subject,
          ageGroup: lesson.ageGroup ?? null,
          difficulty: lesson.difficulty,
          status: lesson.status,
          contentRefs: lesson.contentRefs ?? null,
          skills: lesson.skills ?? null,
          createdAt: parseDate(lesson.createdAt) ?? undefined,
        },
      });
      lessonMap.add(lesson.id);
    }
  }

  for (const content of parsed.data.contentLibrary) {
    const exists = contentMap.has(content.id);
    if (exists) {
      report.summary.contentLibrary.updated += 1;
    } else {
      report.summary.contentLibrary.created += 1;
    }

    if (!dryRun) {
      await client.aIContentCache.upsert({
        where: { id: content.id },
        update: {
          contentType: content.contentType,
          level: content.level,
          topic: content.topic,
          contentJson: content.contentJson,
          usedCount: content.usedCount,
          status: content.status,
          reviewedAt: parseDate(content.reviewedAt) ?? undefined,
          approvedAt: parseDate(content.approvedAt) ?? undefined,
          publishedAt: parseDate(content.publishedAt) ?? undefined,
          createdBy: content.createdBy,
          model: content.model ?? null,
          prompt: content.prompt ?? null,
          keyStage: content.keyStage ?? null,
          yearGroup: content.yearGroup ?? null,
          skillFocus: content.skillFocus ?? null,
          skills: content.skills ?? null,
          metadataJson: content.metadataJson ?? null,
          estimatedCostPence: content.estimatedCostPence,
        },
        create: {
          id: content.id,
          contentType: content.contentType,
          level: content.level,
          topic: content.topic,
          contentJson: content.contentJson,
          usedCount: content.usedCount,
          status: content.status,
          reviewedAt: parseDate(content.reviewedAt) ?? undefined,
          approvedAt: parseDate(content.approvedAt) ?? undefined,
          publishedAt: parseDate(content.publishedAt) ?? undefined,
          createdAt: parseDate(content.createdAt) ?? undefined,
          createdBy: content.createdBy,
          model: content.model ?? null,
          prompt: content.prompt ?? null,
          keyStage: content.keyStage ?? null,
          yearGroup: content.yearGroup ?? null,
          skillFocus: content.skillFocus ?? null,
          skills: content.skills ?? null,
          metadataJson: content.metadataJson ?? null,
          estimatedCostPence: content.estimatedCostPence,
        },
      });
      contentMap.add(content.id);
    }
  }

  const assignmentPairs = parsed.data.assignments.map((assignment) => ({
    ...assignment,
    key: assignmentKey(assignment.studentId, assignment.contentId),
  }));

  for (const assignment of assignmentPairs) {
    const hasStudent = childMap.has(assignment.studentId);
    const hasContent = contentMap.has(assignment.contentId);

    if (!hasStudent || !hasContent) {
      report.summary.assignments.skipped += 1;
      report.errors.push({
        entity: "assignment",
        reason: !hasStudent
          ? "Student does not exist in target."
          : "Content item does not exist in target.",
        reference: assignment.key,
      });
      continue;
    }

    const existingAssignment = await client.assignment.findUnique({
      where: {
        studentId_contentId: {
          studentId: assignment.studentId,
          contentId: assignment.contentId,
        },
      },
      select: { id: true },
    });

    if (existingAssignment) {
      report.summary.assignments.updated += 1;
    } else {
      report.summary.assignments.created += 1;
    }

    if (!dryRun) {
      await client.assignment.upsert({
        where: {
          studentId_contentId: {
            studentId: assignment.studentId,
            contentId: assignment.contentId,
          },
        },
        update: {
          status: assignment.status,
        },
        create: {
          studentId: assignment.studentId,
          contentId: assignment.contentId,
          status: assignment.status,
          createdAt: parseDate(assignment.createdAt) ?? undefined,
        },
      });
    }
  }

  return { report, parsed };
}
