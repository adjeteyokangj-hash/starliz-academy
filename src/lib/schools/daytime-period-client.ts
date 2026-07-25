export type ContinueDaytimePeriodResponse = {
  ok: true;
  href: string;
  mode: "assigned" | "practice" | "period_complete";
  assignmentId: string | null;
  contentId: string | null;
  periodTitle: string;
  sessionPlan: unknown | null;
} | {
  ok: false;
  error: string;
};

export async function continueDaytimePeriodFromClient(input: {
  dayLessonId: string;
  completedContentId?: string | null;
}): Promise<ContinueDaytimePeriodResponse> {
  const response = await fetch(
    `/api/student/daytime-period/${encodeURIComponent(input.dayLessonId)}/continue`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completedContentId: input.completedContentId ?? undefined,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : "Unable to continue this lesson period.",
    };
  }
  if (typeof data.href !== "string" || !data.href) {
    return { ok: false, error: "Continue link was missing." };
  }
  return {
    ok: true,
    href: data.href,
    mode: data.mode === "practice" || data.mode === "period_complete" ? data.mode : "assigned",
    assignmentId: typeof data.assignmentId === "string" ? data.assignmentId : null,
    contentId: typeof data.contentId === "string" ? data.contentId : null,
    periodTitle: typeof data.periodTitle === "string" ? data.periodTitle : "",
    sessionPlan: data.sessionPlan ?? null,
  };
}