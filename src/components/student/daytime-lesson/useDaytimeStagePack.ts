"use client";

import { useEffect, useState } from "react";
import type { DaytimeStagePackExtras } from "@/lib/schools/daytime-lesson-ui";
import { extractStagePackExtras } from "@/lib/schools/daytime-lesson-ui";

/**
 * Loads structured daytime stage pack extras for the premium lesson panels.
 */
export function useDaytimeStagePack(input: {
  enabled: boolean;
  contentId?: string | null;
  assignmentId?: string | null;
}) {
  const [stagePack, setStagePack] = useState<DaytimeStagePackExtras | null>(null);

  useEffect(() => {
    if (!input.enabled || (!input.contentId && !input.assignmentId)) {
      const timer = window.setTimeout(() => setStagePack(null), 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    const params = new URLSearchParams();
    if (input.contentId) params.set("contentId", input.contentId);
    if (input.assignmentId) params.set("assignmentId", input.assignmentId);
    const timer = window.setTimeout(() => {
      void fetch(`/api/content/assigned?${params.toString()}`, { credentials: "include" })
        .then(async (response) => {
          if (!response.ok) return null;
          return response.json() as Promise<{ content?: { stagePack?: DaytimeStagePackExtras | null } & Record<string, unknown> }>;
        })
        .then((payload) => {
          if (cancelled || !payload) return;
          const pack = payload.content?.stagePack
            ?? extractStagePackExtras(payload.content ?? null);
          setStagePack(pack);
        })
        .catch(() => {
          if (!cancelled) setStagePack(null);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input.enabled, input.contentId, input.assignmentId]);

  return stagePack;
}
