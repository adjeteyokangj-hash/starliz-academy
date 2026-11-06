import { authoredActivities, releasedActivities } from "./catalogue";
import { publishedCodingLessons } from "../catalog";

export function codingPublicationSummary() {
  const published = releasedActivities();
  return {
    authored: authoredActivities.length,
    lessons: authoredActivities.filter(activity => activity.kind === "lesson").length,
    consolidations: authoredActivities.filter(activity => activity.kind === "consolidation").length,
    projects: authoredActivities.filter(activity => activity.kind === "project").length,
    published: published.length,
    initiallyEligible: published.filter(activity => activity.prerequisites.length === 0).length,
    environment: process.env.NODE_ENV === "development" ? "local development" : "this environment",
    legacy: publishedCodingLessons(),
    pathways: [...new Set(authoredActivities.map(activity => activity.pathwayId))].map(id => ({ id, authored: authoredActivities.filter(activity => activity.pathwayId === id).length, published: published.filter(activity => activity.pathwayId === id).length })),
  };
}
