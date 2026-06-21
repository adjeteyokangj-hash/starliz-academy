type RouteTargetLike = {
  activityType?: string;
  routeTarget?: string | null;
  title?: string | null;
};

type HomeworkTaskLike = {
  title?: string | null;
  routeTarget?: string | null;
};

type CatchUpTaskLike = {
  title?: string | null;
  subject?: string | null;
  topic?: string | null;
  skill?: string | null;
  routeTarget?: string | null;
};

export type DashboardActionTarget =
  | { kind: "route"; href: string; label: string }
  | { kind: "scroll"; targetId: string; label: string; message: string }
  | { kind: "unavailable"; label: string; message: string };

function hasUsableRouteTarget(routeTarget?: string | null): routeTarget is string {
  const cleaned = routeTarget?.trim();
  return Boolean(cleaned) && cleaned !== "/student/dashboard";
}

function inferredCatchUpRouteTarget(task: CatchUpTaskLike | null | undefined): string | null {
  const subject = (task?.subject ?? "").toLowerCase().trim();
  const topic = task?.topic?.trim();
  const skill = task?.skill?.trim();

  const params = new URLSearchParams({ recovery: "1" });
  if (topic) params.set("topic", topic);
  if (skill) params.set("skill", skill);

  if (subject.includes("math")) {
    return `/games/math?${params.toString()}`;
  }

  if (subject.includes("english") || subject.includes("reading") || subject.includes("literacy") || subject.includes("phonics")) {
    return `/games/reading?${params.toString()}`;
  }

  if (subject.includes("spelling") || subject.includes("vocabulary")) {
    return `/games/spelling?${params.toString()}`;
  }

  if (subject) {
    params.set("subject", subject);
    return `/student/daily-journey?${params.toString()}`;
  }

  return null;
}

export function resolveSchoolWeekGoTarget(block: RouteTargetLike | null | undefined): DashboardActionTarget {
  if (!block) {
    return {
      kind: "unavailable",
      label: "Unavailable",
      message: "No next activity is ready yet.",
    };
  }

  if (hasUsableRouteTarget(block.routeTarget)) {
    return {
      kind: "route",
      href: block.routeTarget,
      label: "Go",
    };
  }

  if (block.activityType === "check_in") {
    return {
      kind: "scroll",
      targetId: "school-week-mode-panel",
      label: "Open check-in",
      message: "Check-in opens here. Full check-in flow coming soon.",
    };
  }

  if (block.activityType === "catch_up") {
    return {
      kind: "route",
      href: "/student/recovery-path",
      label: "Open recovery path",
    };
  }

  if (block.activityType === "homework") {
    return {
      kind: "scroll",
      targetId: "weekly-homework-panel",
      label: "Open homework",
      message: `Opening homework for ${block.title ?? "this activity"}.`,
    };
  }

  return {
    kind: "unavailable",
    label: "Unavailable",
    message: "This activity is not linked yet. Stay on this School Week card for updates.",
  };
}

export function resolveHomeworkStartTarget(task: HomeworkTaskLike | null | undefined): DashboardActionTarget {
  if (hasUsableRouteTarget(task?.routeTarget)) {
    return {
      kind: "route",
      href: task.routeTarget,
      label: "Start",
    };
  }

  return {
    kind: "unavailable",
    label: "Start",
    message: `Starting ${task?.title ?? "homework"} is not linked to a target yet.`,
  };
}

export function resolveCatchUpStartTarget(task: CatchUpTaskLike | null | undefined): DashboardActionTarget {
  if (hasUsableRouteTarget(task?.routeTarget)) {
    return {
      kind: "route",
      href: task.routeTarget,
      label: "Start",
    };
  }

  const inferredRoute = inferredCatchUpRouteTarget(task);
  if (inferredRoute) {
    return {
      kind: "route",
      href: inferredRoute,
      label: "Start practice",
    };
  }

  return {
    kind: "unavailable",
    label: "Waiting for recovery activity",
    message: `A direct activity for ${task?.title ?? "this recovery task"} is not linked yet.`,
  };
}