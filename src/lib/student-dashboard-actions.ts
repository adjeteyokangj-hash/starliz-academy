type RouteTargetLike = {
  activityType?: string;
  routeTarget?: string | null;
  title?: string | null;
};

type HomeworkTaskLike = {
  title?: string | null;
  routeTarget?: string | null;
};

export type DashboardActionTarget =
  | { kind: "route"; href: string; label: string }
  | { kind: "scroll"; targetId: string; label: string; message: string }
  | { kind: "top"; label: string; message: string }
  | { kind: "unavailable"; label: string; message: string };

function hasUsableRouteTarget(routeTarget?: string | null): routeTarget is string {
  const cleaned = routeTarget?.trim();
  return Boolean(cleaned) && cleaned !== "/student/dashboard";
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
      kind: "top",
      label: "Open check-in",
      message: "Opening today's check-in at the top of the dashboard.",
    };
  }

  if (block.activityType === "catch_up") {
    return {
      kind: "scroll",
      targetId: "smart-catch-up-panel",
      label: "Open catch-up",
      message: `Opening catch-up for ${block.title ?? "this activity"}.`,
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
    kind: "scroll",
    targetId: "today-journey-panel",
    label: "Unavailable",
    message: "This activity is not linked yet. Open today's learning journey below.",
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