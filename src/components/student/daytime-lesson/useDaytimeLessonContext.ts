"use client";

import { useCallback, useEffect, useState } from "react";
import type { StudentFacingSessionPlan } from "@/lib/schools/daytime-lesson-ui";
import type { HumanSupportState } from "@/lib/schools/human-support-timing";

export type DaytimeLessonContextDto = {
  ok: true;
  lesson: {
    title: string;
    subject: string;
    skillFocus: string | null;
    room: string | null;
    teacherName: string | null;
    scheduledPeriod: string;
    startsAt: string;
    endsAt: string;
  };
  sessionPlan: StudentFacingSessionPlan | null;
  teacherGuidance: { text: string; teacherName: string | null } | null;
  humanSupport: {
    state: HumanSupportState;
    label: string;
    minutesRemaining: number | null;
  };
};

export function useDaytimeLessonContext(periodId: string | null | undefined, contentId?: string | null) {
  const [data, setData] = useState<DaytimeLessonContextDto | null>(null);
  const [loading, setLoading] = useState(Boolean(periodId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!periodId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (contentId) params.set("contentId", contentId);
      const qs = params.toString();
      const response = await fetch(
        `/api/student/daytime-period/${encodeURIComponent(periodId)}/context${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      const payload = (await response.json().catch(() => ({}))) as DaytimeLessonContextDto & { error?: string };
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Unable to load lesson details.");
        setData(null);
        return;
      }
      setData(payload);
    } catch {
      setError("Unable to load lesson details.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [periodId, contentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!periodId) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [periodId, refresh]);

  return { data, loading, error, refresh };
}
