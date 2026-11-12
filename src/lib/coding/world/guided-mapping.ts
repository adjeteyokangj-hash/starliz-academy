import type { ActivityContent } from "../learning/types";
import type { LocationId } from "./model";

/** Presentation mapping only. It never replaces an activity ID, engine,
 * assessment case, publication gate, prerequisite or teacher assignment. */
export function guidedLocation(activity: Pick<ActivityContent, "engine" | "year">): LocationId {
  const byEngine: Record<ActivityContent["engine"], LocationId> = {
    route: "traffic", scene: "pets", robot: "robot", media: "pets", scenario: "pizza", data: "farm", network: "traffic",
    python: "space", web: "traffic", ai: "pets", systems: "robot", api: "pizza", sql: "farm", security: "traffic",
    portfolio: "space", engineering: "space", dual: "robot", evidence: "farm", game: "pizza", investigation: "space",
  };
  return byEngine[activity.engine];
}
export function guidedHref(kind: "lesson" | "activity", id: string, context: { bookingId?: string | null; daytimePeriodId?: string | null } = {}) {
  const query = new URLSearchParams();
  if (context.bookingId) query.set("bookingId", context.bookingId);
  if (context.daytimePeriodId) query.set("daytimePeriodId", context.daytimePeriodId);
  return `/student/coding/world/${kind === "lesson" ? "lessons" : "activities"}/${encodeURIComponent(id)}${query.size ? `?${query}` : ""}`;
}
export type GuidedEntry = { id: string; kind: "lesson" | "activity"; title: string; objective: string; year: number; location: LocationId; status: string; unlocked: boolean; assignmentStatus: string; href: string; prerequisites: string[]; stage: string };
export function recommendGuided(entries: GuidedEntry[], year: number | null) {
  const eligible = entries.filter(entry => entry.unlocked && entry.status !== "mastered");
  return eligible.sort((a, b) => Number(b.assignmentStatus === "assigned") - Number(a.assignmentStatus === "assigned")
    || Number(a.status === "not_started") - Number(b.status === "not_started")
    || (year ? Math.abs(a.year - year) - Math.abs(b.year - year) : a.year - b.year))[0] ?? null;
}
