import {
  estimatedMinutesForItemCount,
  periodMinutes,
  studentWorkMinutes,
} from "@/lib/schools/school-day-period";

export type DaytimeSessionStage = "warmup" | "core" | "stretch";

export type DaytimeStageBudget = {
  stage: DaytimeSessionStage;
  stageIndex: 0 | 1 | 2;
  targetMinutes: number;
  itemCount: number;
  estimatedMinutes: number;
  label: string;
};

export type DaytimeSessionPlan = {
  periodMinutes: number;
  studentWorkMinutes: number;
  stages: DaytimeStageBudget[];
  totalEstimatedMinutes: number;
};

const MAX_ITEMS_PER_STAGE = 18;
const MIN_ITEMS_PER_STAGE = 3;

export function itemCountForMinutes(targetMinutes: number): number {
  if (!Number.isFinite(targetMinutes) || targetMinutes <= 0) return MIN_ITEMS_PER_STAGE;
  return Math.max(MIN_ITEMS_PER_STAGE, Math.min(MAX_ITEMS_PER_STAGE, Math.round(targetMinutes / 1.5)));
}

/** Split a period into warm-up / core / stretch stage budgets. */
export function buildDaytimeSessionPlan(startsAt: string, endsAt: string): DaytimeSessionPlan {
  const periodLength = periodMinutes(startsAt, endsAt) || 50;
  const workMinutes = studentWorkMinutes(periodLength);
  const warmupMinutes = Math.max(5, Math.round(workMinutes * 0.2));
  const stretchMinutes = Math.max(5, Math.round(workMinutes * 0.25));
  const coreMinutes = Math.max(8, workMinutes - warmupMinutes - stretchMinutes);

  const stageSeeds: Array<Omit<DaytimeStageBudget, "estimatedMinutes">> = [
    {
      stage: "warmup",
      stageIndex: 0,
      targetMinutes: warmupMinutes,
      itemCount: itemCountForMinutes(warmupMinutes),
      label: "Warm-up",
    },
    {
      stage: "core",
      stageIndex: 1,
      targetMinutes: coreMinutes,
      itemCount: itemCountForMinutes(coreMinutes),
      label: "Core practice",
    },
    {
      stage: "stretch",
      stageIndex: 2,
      targetMinutes: stretchMinutes,
      itemCount: itemCountForMinutes(stretchMinutes),
      label: "Stretch",
    },
  ];
  const stages: DaytimeStageBudget[] = stageSeeds.map((stage) => ({
    ...stage,
    estimatedMinutes: estimatedMinutesForItemCount(stage.itemCount),
  }));

  return {
    periodMinutes: periodLength,
    studentWorkMinutes: workMinutes,
    stages,
    totalEstimatedMinutes: stages.reduce((sum, stage) => sum + stage.estimatedMinutes, 0),
  };
}

export function appendDaytimePeriodQuery(
  href: string,
  dayLessonId: string,
  options?: { contentId?: string | null },
): string {
  const url = new URL(href, "https://starliz.local");
  url.searchParams.set("daytimePeriodId", dayLessonId);
  if (options?.contentId?.trim()) {
    url.searchParams.set("contentId", options.contentId.trim());
  }
  return `${url.pathname}?${url.searchParams.toString()}`;
}
