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

  return {
    kind: "scroll",
    targetId: "smart-catch-up-panel",
    label: "Start here",
    message: `Started ${task?.title ?? "catch-up"} in Smart Catch-Up. Full linked lesson coming soon.`,
  };
}