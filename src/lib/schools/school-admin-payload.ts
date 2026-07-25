import { prisma } from "@/lib/db";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

type SecuritySettingsRow = {
  id: string;
  maxLoginAttempts: number;
  twoFaEnabled: boolean;
};

export type SecurityGatePayload = {
  blocked: boolean;
  reason: "none" | "elevated_auth_anomaly";
  twoFaEnabled: boolean;
  authAnomalySignals: number;
  threshold: number;
};

export type SchoolAdminRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
  licence: {
    id: string;
    status: string;
    seatLimit: number;
    seatsUsed: number;
    seatsAvailable: number;
    provider: string;
    pricingPlanId: string | null;
    currency: string;
    billingInterval: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    startsAt: string | null;
    endsAt: string | null;
    notes: string | null;
    updatedAt: string;
  } | null;
  classrooms: Array<{
    id: string;
    name: string;
    yearGroup: string | null;
    academicYear: string | null;
    status: string;
    teacherId: string | null;
    teacherName: string | null;
    studentsCount: number;
    updatedAt: string;
  }>;
  teachers: Array<{
    id: string;
    userId: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    title: string | null;
    invitedAt: string | null;
    acceptedAt: string | null;
    lastActiveAt: string | null;
    updatedAt: string;
  }>;
  students: Array<{
    id: string;
    childId: string;
    childName: string;
    parentEmail: string;
    classroomId: string | null;
    classroomName: string | null;
    status: string;
    externalRef: string | null;
    joinedAt: string;
    updatedAt: string;
  }>;
  communicationPreferences: Array<{
    linkId: string;
    parentName: string | null;
    parentEmail: string;
    studentName: string;
    optedOutAt: string | null;
    optOutReason: string | null;
    safeguardingLockedAt: string | null;
    safeguardingLockReason: string | null;
    updatedAt: string;
  }>;
  communicationLogs: Array<{
    id: string;
    subject: string;
    messageBody: string;
    deliveryStatus: string;
    deliveryReason: string | null;
    parentEmail: string;
    studentName: string;
    actorName: string | null;
    createdAt: string;
  }>;
  safeguarding: {
    openAlerts: number;
    criticalAlerts: number;
  };
  safeguardingIncidents: Array<{
    id: string;
    category: string;
    severity: string;
    status: string;
    studentName: string | null;
    escalationLevel: string | null;
    reportedBy: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  activityTimeline: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    severity: string;
    actorUserId: string | null;
    createdAt: string;
  }>;
  dayLessons: Array<{
    id: string;
    title: string;
    subject: string;
    lessonType: string;
    yearGroup: string | null;
    keyStage: string | null;
    skillFocus: string | null;
    dayOfWeek: number;
    periodIndex: number;
    startsAt: string;
    endsAt: string;
    room: string | null;
    status: string;
    classroomId: string | null;
    classroomName: string | null;
    teacherId: string | null;
    teacherName: string | null;
    lessonId: string | null;
    lessonTitle: string | null;
    dueDate: string | null;
    updatedAt: string;
    playableContent: {
      id: string;
      contentType: string;
      topic: string;
      skillFocus: string | null;
      status: string;
      itemCount: number;
      yearGroup: string | null;
      estimatedMinutes: number | null;
      stage: string | null;
      stageLabel: string | null;
    } | null;
    playableSession: {
      periodMinutes: number;
      totalEstimatedMinutes: number;
      stageCount: number;
      contentType: string | null;
      stages: Array<{
        id: string;
        contentType: string;
        topic: string;
        status: string;
        itemCount: number;
        estimatedMinutes: number;
        stage: string;
        stageLabel: string;
        preview: {
          headline: string | null;
          body: string | null;
          items: string[];
        };
      }>;
    } | null;
    lessonReview: {
      reviewStatus: "draft" | "machine_failed" | "awaiting_review" | "approved";
      teacherReviewedAt: string | null;
      teacherReviewedBy: string | null;
      machineHealth: {
        overall: "PASS" | "FAIL";
        checkedAt: string;
        periodMinutes: number;
        totalEstimatedMinutes: number;
        stageCount: number;
        checks: Array<{ id: string; label: string; passed: boolean; detail?: string }>;
        reason: string | null;
        regenerateHint: string | null;
        weekDiversity?: {
          weekStart: string;
          passage: string;
          vocabularyOverlap: string;
          questionOverlap: string;
          workedExamples: string;
          scenarios: string;
          blocked: boolean;
          blockedReason: string | null;
          comparedAgainst: string[];
        } | null;
      } | null;
    } | null;
  }>;
};

export type SchoolsAdminListPayload = {
  securityGate: SecurityGatePayload;
  schools: SchoolAdminRecord[];
};

export const schoolAdminInclude = {
  owner: { select: { id: true, name: true, email: true } },
  licence: true,
  classrooms: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      teacher: {
        include: {
          user: { select: { name: true } },
        },
      },
      _count: { select: { students: { where: { status: "active" } } } },
    },
  },
  teachers: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  },
  students: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      child: {
        select: {
          id: true,
          name: true,
          parent: { select: { email: true } },
        },
      },
      classroom: { select: { id: true, name: true } },
    },
  },
  parentLinks: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      parent: { select: { id: true, name: true, email: true } },
      schoolStudent: {
        include: {
          child: { select: { id: true, name: true } },
        },
      },
      communicationPreference: true,
    },
  },
  communicationLogs: {
    orderBy: [{ createdAt: "desc" as const }],
    take: 25,
    include: {
      actor: { select: { id: true, name: true, email: true } },
      parentSchoolLink: {
        include: {
          parent: { select: { id: true, name: true, email: true } },
          schoolStudent: {
            include: {
              child: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
  safeguardingAlerts: {
    where: { status: { in: ["open", "under_review", "escalated"] } },
    select: {
      severity: true,
    },
  },
  safeguardingIncidents: {
    orderBy: [{ updatedAt: "desc" as const }],
    take: 25,
    include: {
      student: { select: { name: true } },
      reportedBy: { select: { name: true, email: true } },
    },
  },
  auditLogs: {
    orderBy: [{ createdAt: "desc" as const }],
    take: 50,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      severity: true,
      actorUserId: true,
      createdAt: true,
    },
  },
  dayLessons: {
    orderBy: [{ dayOfWeek: "asc" as const }, { periodIndex: "asc" as const }],
    take: 120,
    include: {
      classroom: { select: { id: true, name: true } },
      teacher: {
        include: {
          user: { select: { name: true } },
        },
      },
      lesson: {
        select: {
          id: true,
          title: true,
          contentRefs: true,
          reviewStatus: true,
          machineHealthJson: true,
          teacherReviewedAt: true,
          teacherReviewedBy: true,
        },
      },
    },
  },
};

/** List view: omit dayLessons so the registry loads before the timetable migration is applied. */
export const schoolAdminListInclude = Object.fromEntries(
  Object.entries(schoolAdminInclude).filter(([key]) => key !== "dayLessons"),
);

type DayLessonSource = {
  id: string;
  title: string;
  subject: string;
  lessonType: string;
  yearGroup: string | null;
  keyStage: string | null;
  skillFocus: string | null;
  dayOfWeek: number;
  periodIndex: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: string;
  classroomId: string | null;
  teacherId: string | null;
  lessonId: string | null;
  dueDate: Date | null;
  updatedAt: Date;
  classroom: { id: string; name: string } | null;
  teacher: { user: { name: string | null } } | null;
  lesson: {
    id: string;
    title: string;
    contentRefs: string | null;
    reviewStatus: string;
    machineHealthJson: string | null;
    teacherReviewedAt: Date | null;
    teacherReviewedBy: string | null;
  } | null;
};

type SchoolAdminSource = {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  ownerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string | null; email: string } | null;
  licence: {
    id: string;
    status: string;
    seatLimit: number;
    provider: string;
    pricingPlanId: string | null;
    currency: string;
    billingInterval: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    startsAt: Date | null;
    endsAt: Date | null;
    notes: string | null;
    updatedAt: Date;
  } | null;
  classrooms: Array<{
    id: string;
    name: string;
    yearGroup: string | null;
    academicYear: string | null;
    status: string;
    teacherId: string | null;
    updatedAt: Date;
    teacher: { user: { name: string | null } } | null;
    _count: { students: number };
  }>;
  teachers: Array<{
    id: string;
    role: string;
    status: string;
    title: string | null;
    invitedAt: Date | null;
    acceptedAt: Date | null;
    lastActiveAt: Date | null;
    updatedAt: Date;
    user: { id: string; email: string; name: string | null };
  }>;
  students: Array<{
    id: string;
    classroomId: string | null;
    status: string;
    externalRef: string | null;
    joinedAt: Date;
    updatedAt: Date;
    child: { id: string; name: string; parent: { email: string } };
    classroom: { id: string; name: string } | null;
  }>;
  parentLinks: Array<{
    id: string;
    updatedAt: Date;
    parent: { name: string | null; email: string };
    schoolStudent: { child: { name: string } };
    communicationPreference: {
      optedOutAt: Date | null;
      optOutReason: string | null;
      safeguardingLockedAt: Date | null;
      safeguardingLockReason: string | null;
    } | null;
  }>;
  communicationLogs: Array<{
    id: string;
    subject: string;
    messageBody: string;
    deliveryStatus: string;
    deliveryReason: string | null;
    createdAt: Date;
    actor: { name: string | null; email: string } | null;
    parentSchoolLink: {
      parent: { email: string };
      schoolStudent: { child: { name: string } };
    };
  }>;
  safeguardingAlerts: Array<{ severity: string }>;
  safeguardingIncidents: Array<{
    id: string;
    category: string;
    severity: string;
    status: string;
    escalationLevel: string | null;
    createdAt: Date;
    updatedAt: Date;
    student: { name: string } | null;
    reportedBy: { name: string | null; email: string } | null;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    severity: string;
    actorUserId: string | null;
    createdAt: Date;
  }>;
  dayLessons: DayLessonSource[];
};

/** Lighter include for school Command Centre — skips parent-comms graph. */
export const schoolDashboardInclude = {
  owner: { select: { id: true, name: true, email: true } },
  licence: true,
  classrooms: {
    orderBy: [{ updatedAt: "desc" as const }],
    take: 80,
    include: {
      teacher: {
        include: {
          user: { select: { name: true } },
        },
      },
      _count: { select: { students: { where: { status: "active" } } } },
    },
  },
  teachers: {
    orderBy: [{ updatedAt: "desc" as const }],
    take: 120,
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  },
  students: {
    orderBy: [{ updatedAt: "desc" as const }],
    take: 300,
    include: {
      child: {
        select: {
          id: true,
          name: true,
          parent: { select: { email: true } },
        },
      },
      classroom: { select: { id: true, name: true } },
    },
  },
  safeguardingAlerts: {
    where: { status: { in: ["open", "under_review", "escalated"] } },
    take: 100,
    select: {
      severity: true,
    },
  },
  safeguardingIncidents: {
    orderBy: [{ updatedAt: "desc" as const }],
    take: 12,
    include: {
      student: { select: { name: true } },
      reportedBy: { select: { name: true, email: true } },
    },
  },
  auditLogs: {
    orderBy: [{ createdAt: "desc" as const }],
    take: 15,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      severity: true,
      actorUserId: true,
      createdAt: true,
    },
  },
  dayLessons: {
    orderBy: [{ dayOfWeek: "asc" as const }, { periodIndex: "asc" as const }],
    take: 600,
    include: {
      classroom: { select: { id: true, name: true } },
      teacher: {
        include: {
          user: { select: { name: true } },
        },
      },
      lesson: {
        select: {
          id: true,
          title: true,
          contentRefs: true,
          reviewStatus: true,
          machineHealthJson: true,
          teacherReviewedAt: true,
          teacherReviewedBy: true,
        },
      },
    },
  },
};

type SchoolDashboardSource = Omit<SchoolAdminSource, "parentLinks" | "communicationLogs">;

function parseContentRefIds(contentRefs: string | null | undefined): string[] {
  if (!contentRefs?.trim()) return [];
  return contentRefs
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function countPlayableItems(contentJson: string): number {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") {
      const row = parsed as Record<string, unknown>;
      if (Array.isArray(row.questions)) return row.questions.length;
      if (Array.isArray(row.items)) return row.items.length;
      return 1;
    }
  } catch {
    // ignore malformed content
  }
  return 0;
}

type PlayableContentDto = NonNullable<SchoolAdminRecord["dayLessons"][number]["playableContent"]>;
type PlayableSessionDto = NonNullable<SchoolAdminRecord["dayLessons"][number]["playableSession"]>;
type StagePreview = PlayableSessionDto["stages"][number]["preview"];

function buildStagePreview(contentType: string, contentJson: string): StagePreview {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) {
      const firstPassage = parsed.find((item) => {
        if (!item || typeof item !== "object") return false;
        return typeof (item as { passage?: unknown }).passage === "string"
          && String((item as { passage: string }).passage).trim().length > 40;
      }) as { passage?: string } | undefined;
      const items = parsed.slice(0, 8).map((item, index) => {
        if (!item || typeof item !== "object") return `Item ${index + 1}`;
        const row = item as Record<string, unknown>;
        return String(row.prompt ?? row.question ?? row.word ?? row.text ?? `Item ${index + 1}`);
      });
      return {
        headline: `${contentType} practice`,
        body: firstPassage?.passage ? firstPassage.passage.slice(0, 900) : null,
        items,
      };
    }
    if (parsed && typeof parsed === "object") {
      const row = parsed as Record<string, unknown>;
      const sections: string[] = [];
      if (row.passage && typeof row.passage === "object") {
        const p = row.passage as Record<string, unknown>;
        const title = typeof p.title === "string" ? p.title : "Passage";
        const text = typeof p.text === "string" ? p.text : "";
        if (text) sections.push(`Passage — ${title}\n\n${text}`);
      } else if (typeof row.passage === "string" && row.passage.trim()) {
        sections.push(`Passage\n\n${row.passage.trim()}`);
      }
      if (typeof row.explanation === "string" && row.explanation.trim()) {
        sections.push(`Explanation\n\n${row.explanation.trim()}`);
      }
      if (typeof row.ruleExplanation === "string" && row.ruleExplanation.trim()) {
        sections.push(`Spelling rule\n\n${row.ruleExplanation.trim()}`);
      }
      if (Array.isArray(row.targetWords) && row.targetWords.length) {
        sections.push(`Target words: ${row.targetWords.map(String).join(", ")}`);
      }
      if (Array.isArray(row.vocabulary) && row.vocabulary.length) {
        const vocabLines = row.vocabulary.slice(0, 8).map((item) => {
          if (!item || typeof item !== "object") return null;
          const v = item as Record<string, unknown>;
          return `${String(v.word ?? "")} — ${String(v.childFriendlyMeaning ?? v.meaning ?? "")}`;
        }).filter(Boolean);
        if (vocabLines.length) sections.push(`Vocabulary\n${vocabLines.join("\n")}`);
      }
      if (Array.isArray(row.workedExamples) && row.workedExamples[0] && typeof row.workedExamples[0] === "object") {
        const ex = row.workedExamples[0] as Record<string, unknown>;
        sections.push(`Worked example\n${String(ex.question ?? "")}\n→ ${String(ex.answer ?? "")}`);
      }
      if (Array.isArray(row.activities) && row.activities.length) {
        const activityLines = row.activities.map((item) => {
          if (!item || typeof item !== "object") return null;
          const a = item as Record<string, unknown>;
          return `${String(a.estimatedMinutes ?? "?")}m · ${String(a.kind ?? "activity")}${a.title ? ` — ${String(a.title)}` : ""}`;
        }).filter(Boolean);
        sections.push(`Activities\n${activityLines.join("\n")}`);
      }
      if (typeof row.scenarioOrObservation === "string" && row.scenarioOrObservation.trim()) {
        sections.push(`Scenario\n\n${row.scenarioOrObservation.trim()}`);
      }

      const questions = Array.isArray(row.questions) ? row.questions : Array.isArray(row.items) ? row.items : [];
      const words = Array.isArray(row.words) ? row.words : [];
      const items = (questions.length ? questions : words).slice(0, 8).map((item, index) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return `Item ${index + 1}`;
        const entry = item as Record<string, unknown>;
        return String(entry.prompt ?? entry.question ?? entry.word ?? entry.text ?? `Item ${index + 1}`);
      });
      return {
        headline: typeof row.title === "string"
          ? row.title
          : typeof row.spellingFocus === "string"
            ? row.spellingFocus
            : typeof row.learningObjective === "string"
              ? row.learningObjective
              : `${contentType} stage`,
        body: sections.length ? sections.join("\n\n").slice(0, 1600) : null,
        items,
      };
    }
  } catch {
    // ignore
  }
  return { headline: null, body: null, items: [] };
}

function parseDaytimeSessionFromMetadata(metadataJson: string | null | undefined): {
  stage: string | null;
  stageLabel: string | null;
  estimatedMinutes: number | null;
} {
  if (!metadataJson?.trim()) {
    return { stage: null, stageLabel: null, estimatedMinutes: null };
  }
  try {
    const parsed = JSON.parse(metadataJson) as {
      daytimeSession?: { stage?: unknown; label?: unknown; estimatedMinutes?: unknown };
      estimatedMinutes?: unknown;
    };
    const session = parsed.daytimeSession;
    const stage = typeof session?.stage === "string" ? session.stage : null;
    const stageLabel = typeof session?.label === "string" ? session.label : null;
    const estimatedMinutes = typeof session?.estimatedMinutes === "number"
      ? session.estimatedMinutes
      : typeof parsed.estimatedMinutes === "number"
        ? parsed.estimatedMinutes
        : null;
    return { stage, stageLabel, estimatedMinutes };
  } catch {
    return { stage: null, stageLabel: null, estimatedMinutes: null };
  }
}

type ContentRowForPlayable = PlayableContentDto & { preview: StagePreview };

async function loadPlayableContentByIds(ids: string[]): Promise<Map<string, ContentRowForPlayable>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, ContentRowForPlayable>();
  if (!unique.length) return map;

  const rows = await prisma.aIContentCache.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      contentType: true,
      topic: true,
      skillFocus: true,
      status: true,
      yearGroup: true,
      contentJson: true,
      metadataJson: true,
    },
  });

  for (const row of rows) {
    const session = parseDaytimeSessionFromMetadata(row.metadataJson);
    const itemCount = countPlayableItems(row.contentJson);
    map.set(row.id, {
      id: row.id,
      contentType: row.contentType,
      topic: row.topic,
      skillFocus: row.skillFocus,
      status: row.status,
      itemCount,
      yearGroup: row.yearGroup,
      estimatedMinutes: session.estimatedMinutes ?? Math.max(2, Math.ceil(itemCount * 1.5)),
      stage: session.stage,
      stageLabel: session.stageLabel,
      preview: buildStagePreview(row.contentType, row.contentJson),
    });
  }
  return map;
}

function normalizeReviewStatus(
  value: string | null | undefined,
): "draft" | "machine_failed" | "awaiting_review" | "approved" {
  if (value === "machine_failed" || value === "awaiting_review" || value === "approved") return value;
  return "draft";
}

async function mapDayLessons(
  dayLessons: DayLessonSource[] | undefined,
): Promise<SchoolAdminRecord["dayLessons"]> {
  const rows = dayLessons ?? [];
  const contentIds = rows.flatMap((row) => parseContentRefIds(row.lesson?.contentRefs));
  const contentById = await loadPlayableContentByIds(contentIds);

  return rows.map((lesson) => {
    const linkedIds = parseContentRefIds(lesson.lesson?.contentRefs);
    const stages = linkedIds
      .map((id) => contentById.get(id))
      .filter((row): row is ContentRowForPlayable => Boolean(row));
    const firstContent = stages[0] ?? null;
    const periodStart = lesson.startsAt;
    const periodEnd = lesson.endsAt;
    const startParts = /^(\d{1,2}):(\d{2})$/.exec(periodStart.trim());
    const endParts = /^(\d{1,2}):(\d{2})$/.exec(periodEnd.trim());
    let periodMinutes = 50;
    if (startParts && endParts) {
      const start = Number(startParts[1]) * 60 + Number(startParts[2]);
      const end = Number(endParts[1]) * 60 + Number(endParts[2]);
      if (end > start) periodMinutes = end - start;
    }

    const playableSession: PlayableSessionDto | null = stages.length
      ? {
          periodMinutes,
          totalEstimatedMinutes: stages.reduce((sum, stage) => sum + (stage.estimatedMinutes ?? 0), 0),
          stageCount: stages.length,
          contentType: firstContent?.contentType ?? null,
          stages: stages.map((stage, index) => ({
            id: stage.id,
            contentType: stage.contentType,
            topic: stage.topic,
            status: stage.status,
            itemCount: stage.itemCount,
            estimatedMinutes: stage.estimatedMinutes ?? Math.max(2, Math.ceil(stage.itemCount * 1.5)),
            stage: stage.stage ?? (index === 0 ? "warmup" : index === stages.length - 1 ? "stretch" : "core"),
            stageLabel: stage.stageLabel
              ?? (index === 0 ? "Warm-up" : index === stages.length - 1 ? "Stretch" : "Core practice"),
            preview: stage.preview,
          })),
        }
      : null;

    type MachineHealthDto = NonNullable<
      NonNullable<SchoolAdminRecord["dayLessons"][number]["lessonReview"]>["machineHealth"]
    >;
    let machineHealth: MachineHealthDto | null = null;
    if (lesson.lesson?.machineHealthJson) {
      try {
        const parsed = JSON.parse(lesson.lesson.machineHealthJson) as Partial<MachineHealthDto>;
        if (parsed && (parsed.overall === "PASS" || parsed.overall === "FAIL") && Array.isArray(parsed.checks)) {
          machineHealth = parsed as MachineHealthDto;
        }
      } catch {
        machineHealth = null;
      }
    }

    const reviewStatus = normalizeReviewStatus(lesson.lesson?.reviewStatus);
    const lessonReview = lesson.lesson
      ? {
          reviewStatus,
          teacherReviewedAt: lesson.lesson.teacherReviewedAt?.toISOString() ?? null,
          teacherReviewedBy: lesson.lesson.teacherReviewedBy,
          machineHealth,
        }
      : null;

    const playableContent: PlayableContentDto | null = firstContent
      ? {
          id: firstContent.id,
          contentType: firstContent.contentType,
          topic: firstContent.topic,
          skillFocus: firstContent.skillFocus,
          status: firstContent.status,
          itemCount: firstContent.itemCount,
          yearGroup: firstContent.yearGroup,
          estimatedMinutes: firstContent.estimatedMinutes,
          stage: firstContent.stage,
          stageLabel: firstContent.stageLabel,
        }
      : null;

    return {
      id: lesson.id,
      title: lesson.title,
      subject: lesson.subject,
      lessonType: lesson.lessonType,
      yearGroup: lesson.yearGroup,
      keyStage: lesson.keyStage,
      skillFocus: lesson.skillFocus,
      dayOfWeek: lesson.dayOfWeek,
      periodIndex: lesson.periodIndex,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      room: lesson.room,
      status: lesson.status,
      classroomId: lesson.classroomId,
      classroomName: lesson.classroom?.name ?? null,
      teacherId: lesson.teacherId,
      teacherName: lesson.teacher?.user.name ?? null,
      lessonId: lesson.lessonId,
      lessonTitle: lesson.lesson?.title ?? null,
      dueDate: lesson.dueDate?.toISOString() ?? null,
      updatedAt: lesson.updatedAt.toISOString(),
      playableContent,
      playableSession,
      lessonReview,
    };
  });
}

function getSecuritySettingsModel() {
  return (prisma as unknown as {
    securitySettings?: {
      findFirst: () => Promise<SecuritySettingsRow | null>;
    };
  }).securitySettings;
}

export async function loadSecurityGateContext(): Promise<SecurityGatePayload> {
  const model = getSecuritySettingsModel();
  const settings = model ? await model.findFirst() : null;
  const threshold = Math.max(3, settings?.maxLoginAttempts ?? 5);
  const authAnomalySignals = await prisma.schoolLoginHistory.count({
    where: {
      success: false,
      createdAt: { gte: new Date(Date.now() - FIFTEEN_MINUTES_MS) },
    },
  });
  const twoFaEnabled = Boolean(settings?.twoFaEnabled);
  const blocked = twoFaEnabled && authAnomalySignals >= threshold;

  return {
    blocked,
    reason: blocked ? "elevated_auth_anomaly" : "none",
    twoFaEnabled,
    authAnomalySignals,
    threshold,
  };
}

export async function mapSchoolToAdminRecord(school: SchoolAdminSource): Promise<SchoolAdminRecord> {
  const seatsUsed = school.students.filter((row) => row.status === "active").length;
  const seatLimit = school.licence?.seatLimit ?? 0;
  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    status: school.status,
    type: school.type,
    contactEmail: school.contactEmail,
    contactPhone: school.contactPhone,
    notes: school.notes,
    ownerUserId: school.ownerUserId,
    ownerName: school.owner?.name ?? null,
    ownerEmail: school.owner?.email ?? null,
    createdAt: school.createdAt.toISOString(),
    updatedAt: school.updatedAt.toISOString(),
    licence: school.licence
      ? {
        id: school.licence.id,
        status: school.licence.status,
        seatLimit,
        seatsUsed,
        seatsAvailable: seatLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, seatLimit - seatsUsed),
        provider: school.licence.provider,
        pricingPlanId: school.licence.pricingPlanId,
        currency: school.licence.currency,
        billingInterval: school.licence.billingInterval,
        trialEndsAt: school.licence.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: school.licence.currentPeriodEnd?.toISOString() ?? null,
        startsAt: school.licence.startsAt?.toISOString() ?? null,
        endsAt: school.licence.endsAt?.toISOString() ?? null,
        notes: school.licence.notes,
        updatedAt: school.licence.updatedAt.toISOString(),
      }
      : null,
    classrooms: school.classrooms.map((classroom) => ({
      id: classroom.id,
      name: classroom.name,
      yearGroup: classroom.yearGroup,
      academicYear: classroom.academicYear,
      status: classroom.status,
      teacherId: classroom.teacherId,
      teacherName: classroom.teacher?.user.name ?? null,
      studentsCount: classroom._count.students,
      updatedAt: classroom.updatedAt.toISOString(),
    })),
    teachers: school.teachers.map((teacher) => ({
      id: teacher.id,
      userId: teacher.user.id,
      email: teacher.user.email,
      name: teacher.user.name,
      role: teacher.role,
      status: teacher.status,
      title: teacher.title,
      invitedAt: teacher.invitedAt?.toISOString() ?? null,
      acceptedAt: teacher.acceptedAt?.toISOString() ?? null,
      lastActiveAt: teacher.lastActiveAt?.toISOString() ?? null,
      updatedAt: teacher.updatedAt.toISOString(),
    })),
    students: school.students.map((student) => ({
      id: student.id,
      childId: student.child.id,
      childName: student.child.name,
      parentEmail: student.child.parent.email,
      classroomId: student.classroomId,
      classroomName: student.classroom?.name ?? null,
      status: student.status,
      externalRef: student.externalRef,
      joinedAt: student.joinedAt.toISOString(),
      updatedAt: student.updatedAt.toISOString(),
    })),
    communicationPreferences: school.parentLinks.map((link) => ({
      linkId: link.id,
      parentName: link.parent.name,
      parentEmail: link.parent.email,
      studentName: link.schoolStudent.child.name,
      optedOutAt: link.communicationPreference?.optedOutAt?.toISOString() ?? null,
      optOutReason: link.communicationPreference?.optOutReason ?? null,
      safeguardingLockedAt: link.communicationPreference?.safeguardingLockedAt?.toISOString() ?? null,
      safeguardingLockReason: link.communicationPreference?.safeguardingLockReason ?? null,
      updatedAt: link.updatedAt.toISOString(),
    })),
    communicationLogs: school.communicationLogs.map((log) => ({
      id: log.id,
      subject: log.subject,
      messageBody: log.messageBody,
      deliveryStatus: log.deliveryStatus,
      deliveryReason: log.deliveryReason,
      parentEmail: log.parentSchoolLink.parent.email,
      studentName: log.parentSchoolLink.schoolStudent.child.name,
      actorName: log.actor?.name ?? log.actor?.email ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
    safeguarding: {
      openAlerts: school.safeguardingAlerts.length,
      criticalAlerts: school.safeguardingAlerts.filter((alert) => alert.severity === "critical").length,
    },
    safeguardingIncidents: school.safeguardingIncidents.map((incident) => ({
      id: incident.id,
      category: incident.category,
      severity: incident.severity,
      status: incident.status,
      studentName: incident.student?.name ?? null,
      escalationLevel: incident.escalationLevel ?? null,
      reportedBy: incident.reportedBy?.name ?? incident.reportedBy?.email ?? null,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    })),
    activityTimeline: school.auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? null,
      severity: log.severity,
      actorUserId: log.actorUserId ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
    dayLessons: await mapDayLessons(school.dayLessons),
  };
}

export async function mapSchoolToDashboardRecord(school: SchoolDashboardSource): Promise<SchoolAdminRecord> {
  const seatsUsed = school.students.filter((row) => row.status === "active").length;
  const seatLimit = school.licence?.seatLimit ?? 0;
  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    status: school.status,
    type: school.type,
    contactEmail: school.contactEmail,
    contactPhone: school.contactPhone,
    notes: school.notes,
    ownerUserId: school.ownerUserId,
    ownerName: school.owner?.name ?? null,
    ownerEmail: school.owner?.email ?? null,
    createdAt: school.createdAt.toISOString(),
    updatedAt: school.updatedAt.toISOString(),
    licence: school.licence
      ? {
        id: school.licence.id,
        status: school.licence.status,
        seatLimit,
        seatsUsed,
        seatsAvailable: seatLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, seatLimit - seatsUsed),
        provider: school.licence.provider,
        pricingPlanId: school.licence.pricingPlanId,
        currency: school.licence.currency,
        billingInterval: school.licence.billingInterval,
        trialEndsAt: school.licence.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: school.licence.currentPeriodEnd?.toISOString() ?? null,
        startsAt: school.licence.startsAt?.toISOString() ?? null,
        endsAt: school.licence.endsAt?.toISOString() ?? null,
        notes: school.licence.notes,
        updatedAt: school.licence.updatedAt.toISOString(),
      }
      : null,
    classrooms: school.classrooms.map((classroom) => ({
      id: classroom.id,
      name: classroom.name,
      yearGroup: classroom.yearGroup,
      academicYear: classroom.academicYear,
      status: classroom.status,
      teacherId: classroom.teacherId,
      teacherName: classroom.teacher?.user.name ?? null,
      studentsCount: classroom._count.students,
      updatedAt: classroom.updatedAt.toISOString(),
    })),
    teachers: school.teachers.map((teacher) => ({
      id: teacher.id,
      userId: teacher.user.id,
      email: teacher.user.email,
      name: teacher.user.name,
      role: teacher.role,
      status: teacher.status,
      title: teacher.title,
      invitedAt: teacher.invitedAt?.toISOString() ?? null,
      acceptedAt: teacher.acceptedAt?.toISOString() ?? null,
      lastActiveAt: teacher.lastActiveAt?.toISOString() ?? null,
      updatedAt: teacher.updatedAt.toISOString(),
    })),
    students: school.students.map((student) => ({
      id: student.id,
      childId: student.child.id,
      childName: student.child.name,
      parentEmail: student.child.parent.email,
      classroomId: student.classroomId,
      classroomName: student.classroom?.name ?? null,
      status: student.status,
      externalRef: student.externalRef,
      joinedAt: student.joinedAt.toISOString(),
      updatedAt: student.updatedAt.toISOString(),
    })),
    communicationPreferences: [],
    communicationLogs: [],
    safeguarding: {
      openAlerts: school.safeguardingAlerts.length,
      criticalAlerts: school.safeguardingAlerts.filter((alert) => alert.severity === "critical").length,
    },
    safeguardingIncidents: school.safeguardingIncidents.map((incident) => ({
      id: incident.id,
      category: incident.category,
      severity: incident.severity,
      status: incident.status,
      studentName: incident.student?.name ?? null,
      escalationLevel: incident.escalationLevel ?? null,
      reportedBy: incident.reportedBy?.name ?? incident.reportedBy?.email ?? null,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    })),
    activityTimeline: school.auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? null,
      severity: log.severity,
      actorUserId: log.actorUserId ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
    dayLessons: await mapDayLessons(school.dayLessons),
  };
}

export async function buildSchoolsAdminListPayload(): Promise<SchoolsAdminListPayload> {
  const securityGate = await loadSecurityGateContext();
  const schools = await prisma.school.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: schoolAdminListInclude as never,
  });

  return {
    securityGate,
    schools: await Promise.all(
      schools.map((school) =>
        mapSchoolToAdminRecord({ ...(school as object), dayLessons: [] } as unknown as SchoolAdminSource),
      ),
    ),
  };
}

export async function findSchoolAdminRecord(schoolId: string): Promise<SchoolAdminRecord | null> {
  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: schoolAdminInclude as never,
    });
    if (!school) return null;
    return await mapSchoolToAdminRecord(school as unknown as SchoolAdminSource);
  } catch (error) {
    if (!isMissingRelationTable(error, "SchoolDayLesson")) throw error;
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: schoolAdminListInclude as never,
    });
    if (!school) return null;
    return await mapSchoolToAdminRecord({ ...(school as object), dayLessons: [] } as unknown as SchoolAdminSource);
  }
}

export async function findSchoolDashboardRecord(schoolId: string): Promise<SchoolAdminRecord | null> {
  const dashboardWithoutDayLessons = Object.fromEntries(
    Object.entries(schoolDashboardInclude).filter(([key]) => key !== "dayLessons"),
  );

  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: schoolDashboardInclude as never,
    });
    if (!school) return null;
    return await mapSchoolToDashboardRecord(school as unknown as SchoolDashboardSource);
  } catch (error) {
    if (!isMissingRelationTable(error, "SchoolDayLesson")) throw error;
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: dashboardWithoutDayLessons as never,
    });
    if (!school) return null;
    return await mapSchoolToDashboardRecord({ ...(school as object), dayLessons: [] } as unknown as SchoolDashboardSource);
  }
}

function isMissingRelationTable(error: unknown, table: string): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; meta?: { table?: string }; message?: string };
  if (maybe.code !== "P2021") return false;
  if (maybe.meta?.table?.includes(table)) return true;
  return typeof maybe.message === "string" && maybe.message.includes(table);
}
