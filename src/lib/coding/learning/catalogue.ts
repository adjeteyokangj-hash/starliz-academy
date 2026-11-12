import inventory from "../../../../docs/coding-curriculum/curriculum-proposal.json";
import { firstRouteActivities } from "./content/routes";
import { patternActivities } from "./content/patterns";
import { pythonBridgeActivities } from "./content/python-bridge";
import { pythonStartActivities } from "./content/python-start";
import { productBriefActivities } from "./content/product-brief-lessons";
import { productVersionActivities } from "./content/product-version-lessons";
import { productReviewActivities } from "./content/product-review-lessons";
import { productStudioRetrievalActivities } from "./content/product-studio-retrieval";
import { productStudioPortfolioActivities } from "./content/product-studio-portfolio";
import { algorithmEvaluationFoundationActivities } from "./content/algorithm-evaluation-lessons";
import { algorithmGrowthActivities } from "./content/algorithm-growth-lessons";
import { algorithmEvaluationRetrievalActivities } from "./content/algorithm-evaluation-retrieval";
import { algorithmEvaluationPortfolioActivities } from "./content/algorithm-evaluation-portfolio";
import { relationalDataFoundationActivities } from "./content/relational-data-lessons";
import { relationalValidationActivities } from "./content/relational-validation-lessons";
import { relationalDataRetrievalActivities } from "./content/relational-data-retrieval";
import { intelligentSystemFoundationActivities } from "./content/intelligent-system-lessons";
import { intelligentSystemProjectActivities } from "./content/intelligent-system-projects";
import { teamIncrementActivities } from "./content/team-increment-lessons";
import { teamReviewActivities } from "./content/team-review-lessons";
import { teamApplicationActivities } from "./content/team-application-lessons";
import { teamSoftwarePortfolioActivities } from "./content/team-software-portfolio";
import { testedComponentFoundationActivities } from "./content/tested-component-lessons";
import { persistentComponentActivities } from "./content/persistent-component-lessons";
import { testedComponentRetrievalActivities } from "./content/tested-component-retrieval";
import { inventoryDatabaseActivities } from "./content/inventory-database-lessons";
import { inventoryApiActivities } from "./content/inventory-api-lessons";
import { inventoryServiceRetrievalActivities } from "./content/inventory-service-retrieval";
import { defensiveSecurityFoundationActivities } from "./content/defensive-security-lessons";
import { defensiveSecurityProjectActivities } from "./content/defensive-security-projects";
import { defensiveSecurityRetrievalActivities } from "./content/defensive-security-retrieval";
import { engineeringStudioFoundationActivities } from "./content/engineering-studio-lessons";
import { engineeringReviewActivities } from "./content/engineering-review-lessons";
import { engineeringStudioRetrievalActivities } from "./content/engineering-studio-retrieval";
import { reliableServiceActivities } from "./content/reliable-service-lessons";
import { reliableServiceRetrievalActivities } from "./content/reliable-service-retrieval";
import { responsibleDataActivities } from "./content/responsible-data-lessons";
import { intelligentFeatureActivities } from "./content/intelligent-feature-lessons";
import { responsibleFeatureRetrievalActivities } from "./content/responsible-feature-retrieval";
import { capstoneActivities } from "./content/capstone-lessons";
import { capstoneRetrievalActivities } from "./content/capstone-retrieval";
import { professionalPortfolioActivities } from "./content/professional-portfolio-lessons";
import { professionalPortfolioRetrievalActivities } from "./content/professional-portfolio-retrieval";
import { pythonStartRetrievalActivities } from "./content/python-start-retrieval";
import { systemsFoundationActivities } from "./content/systems-foundations";
import { systemsRetrievalActivities } from "./content/systems-retrieval";
import { algorithmsLessonActivities } from "./content/algorithms-lessons";
import { algorithmsRetrievalActivities } from "./content/algorithms-retrieval";
import { representationLessonActivities } from "./content/representation-lessons";
import { dataToolLessonActivities } from "./content/data-tool-lessons";
import { userReportActivities } from "./content/user-report";
import { responsibleRetrievalActivities } from "./content/responsible-retrieval";
import { responsiblePortfolioActivities } from "./content/responsible-portfolio";
import { semanticInterfaceActivities } from "./content/semantic-interfaces";
import { interfaceRetrievalActivities } from "./content/interface-retrieval";
import { packetLessonActivities } from "./content/packet-lessons";
import { apiContractLessonActivities } from "./content/api-contract-lessons";
import { apiDashboardLessonActivities } from "./content/api-dashboard-lessons";
import { apiNetworkRetrievalActivities } from "./content/api-network-retrieval";
import { servicePortfolioActivities } from "./content/service-portfolio";
import { modelControlFoundationActivities } from "./content/model-control-foundations";
import { modelObservationActivities } from "./content/model-observation";
import { modelControlMissionActivities } from "./content/model-control-mission";
import { controlRetrievalActivities } from "./content/model-control-retrieval";
import { waypointControlPortfolioActivities } from "./content/waypoint-control-portfolio";
import { pythonDecisionActivities } from "./content/python-decisions";
import { functionDataActivities } from "./content/functions-and-data";
import { functionDataRetrievalActivities } from "./content/function-data-retrieval";
import { dataAiFoundationActivities } from "./content/data-ai-foundations";
import { aiSuggestionCheckActivities } from "./content/ai-suggestion-check";
import { dataAiProjectActivities } from "./content/data-ai-project";
import { dataAiRetrievalActivities } from "./content/data-ai-retrieval";
import { semanticWebActivities } from "./content/semantic-web";
import { privateWebEvidenceActivities } from "./content/private-web-evidence";
import { privateWebRetrievalActivities } from "./content/private-web-retrieval";
import { calculatorComponentActivities } from "./content/calculator-components";
import { calculatorRecoveryActivities } from "./content/calculator-recovery";
import { calculatorDesignReviewActivities } from "./content/calculator-design-review";
import { calculatorEvidencePageActivities } from "./content/calculator-evidence-page";
import { calculatorTestRetrievalActivities } from "./content/calculator-test-retrieval";
import { calculatorIntegrationRetrievalActivities } from "./content/calculator-integration-retrieval";
import { calculatorResumeRetrievalActivities } from "./content/calculator-resume-retrieval";
import { calculatorPortfolioActivities } from "./content/calculator-portfolio";
import { pythonVariableRetrievalActivities } from "./content/python-variable-retrieval";
import { pythonDecisionRetrievalActivities } from "./content/python-decision-retrieval";
import { rescueAlgorithmActivities } from "./content/rescue-algorithms";
import { rescueRetrievalActivities } from "./content/rescue-retrieval";
import { connectedWebActivities } from "./content/connected-web";
import { webPageActivities } from "./content/web-pages";
import { webRetrievalActivities } from "./content/web-retrieval";
import { mediaCardActivities } from "./content/media-cards";
import { safeChoiceActivities } from "./content/safe-choices";
import { firstRouteRetrievalActivities } from "./content/first-route-retrieval";
import { cardRetrievalActivities } from "./content/card-retrieval";
import { patternRetrievalActivities } from "./content/pattern-retrieval";
import { safeCreatorRetrievalActivities } from "./content/safe-creator-retrieval";
import { robotInputActivities } from "./content/robot-inputs";
import { pictureDataActivities } from "./content/picture-data";
import { animatedStoryActivities } from "./content/animated-stories";
import { communityCreatorActivities } from "./content/community-creators";
import { robotRetrievalActivities } from "./content/robot-retrieval";
import { storyRetrievalActivities } from "./content/story-retrieval";
import { dataRetrievalActivities } from "./content/data-retrieval";
import { communityRetrievalActivities } from "./content/community-retrieval";
import { animationBuilderActivities } from "./content/animation-builders";
import { mazeBuilderActivities } from "./content/maze-builders";
import { networkBuilderActivities } from "./content/network-builders";
import { sensorRobotActivities } from "./content/sensor-robots";
import { animationRetrievalActivities } from "./content/animation-retrieval";
import { mazeRetrievalActivities } from "./content/maze-retrieval";
import { sensorRetrievalActivities } from "./content/sensor-retrieval";
import { networkRetrievalActivities } from "./content/network-retrieval";
import { stateGameActivities } from "./content/state-games";
import { reusableStoryActivities } from "./content/reusable-stories";
import { evidencePosterActivities } from "./content/evidence-posters";
import { teamRoleActivities } from "./content/team-roles";
import { teamSafetyActivities } from "./content/team-safety";
import { audienceGameActivities } from "./content/audience-games";
import { stateRetrievalActivities } from "./content/state-retrieval";
import { reusableRetrievalActivities } from "./content/reusable-retrieval";
import { evidenceRetrievalActivities } from "./content/evidence-retrieval";
import { teamRetrievalActivities } from "./content/team-retrieval";
import { ACTIVITY_VERSION, type ActivityContent } from "./types";
import { createHash } from "node:crypto";
import release from "./release-manifest.json";
import build from "./runtime-build.json";

// Authoring records are server-only. Nothing enters the learner catalogue until
// the exact activity and runtime hashes have completed release verification.
export const authoredActivities: readonly ActivityContent[] = [
  ...firstRouteActivities, ...mediaCardActivities, ...patternActivities, ...safeChoiceActivities,
  ...firstRouteRetrievalActivities, ...cardRetrievalActivities, ...patternRetrievalActivities, ...safeCreatorRetrievalActivities,
  ...robotInputActivities, ...animatedStoryActivities, ...pictureDataActivities, ...communityCreatorActivities,
  ...robotRetrievalActivities, ...storyRetrievalActivities, ...dataRetrievalActivities, ...communityRetrievalActivities,
  ...animationBuilderActivities, ...mazeBuilderActivities, ...sensorRobotActivities, ...networkBuilderActivities,
  ...animationRetrievalActivities, ...mazeRetrievalActivities, ...sensorRetrievalActivities, ...networkRetrievalActivities,
  ...stateGameActivities, ...reusableStoryActivities, ...evidencePosterActivities, ...teamRoleActivities, ...teamSafetyActivities, ...audienceGameActivities,
  ...stateRetrievalActivities,
  ...reusableRetrievalActivities,
  ...evidenceRetrievalActivities,
  ...teamRetrievalActivities,
  ...pythonBridgeActivities,
  ...pythonDecisionActivities,
  ...pythonVariableRetrievalActivities,
  ...pythonDecisionRetrievalActivities,
  ...rescueAlgorithmActivities,
  ...rescueRetrievalActivities,
  ...connectedWebActivities,
  ...webPageActivities,
  ...webRetrievalActivities,
  ...functionDataActivities,
  ...calculatorComponentActivities,
  ...calculatorRecoveryActivities,
  ...calculatorDesignReviewActivities,
  ...calculatorEvidencePageActivities,
  ...calculatorTestRetrievalActivities,
  ...calculatorIntegrationRetrievalActivities,
  ...calculatorResumeRetrievalActivities,
  ...calculatorPortfolioActivities,
  ...privateWebEvidenceActivities,
  ...privateWebRetrievalActivities,
  ...pythonStartActivities,
  ...productBriefActivities,
  ...productVersionActivities,
  ...productReviewActivities,
  ...productStudioRetrievalActivities,
  ...productStudioPortfolioActivities,
  ...algorithmEvaluationFoundationActivities,
  ...algorithmGrowthActivities,
  ...algorithmEvaluationRetrievalActivities,
  ...algorithmEvaluationPortfolioActivities,
  ...relationalDataFoundationActivities,
  ...relationalValidationActivities,
  ...relationalDataRetrievalActivities,
  ...intelligentSystemFoundationActivities,
  ...intelligentSystemProjectActivities,
  ...teamIncrementActivities,
  ...teamReviewActivities,
  ...teamApplicationActivities,
  ...teamSoftwarePortfolioActivities,
  ...testedComponentFoundationActivities,
  ...persistentComponentActivities,
  ...testedComponentRetrievalActivities,
  ...inventoryDatabaseActivities,
  ...inventoryApiActivities,
  ...inventoryServiceRetrievalActivities,
  ...defensiveSecurityFoundationActivities,
  ...defensiveSecurityProjectActivities,
  ...defensiveSecurityRetrievalActivities,
  ...engineeringStudioFoundationActivities,
  ...reliableServiceActivities,
  ...reliableServiceRetrievalActivities,
  ...responsibleDataActivities,
  ...intelligentFeatureActivities,
  ...responsibleFeatureRetrievalActivities,
  ...capstoneActivities,
  ...capstoneRetrievalActivities,
  ...professionalPortfolioActivities,
  ...professionalPortfolioRetrievalActivities,
  ...engineeringReviewActivities,
  ...engineeringStudioRetrievalActivities,
  ...pythonStartRetrievalActivities,
  ...systemsFoundationActivities,
  ...systemsRetrievalActivities,
  ...algorithmsLessonActivities,
  ...algorithmsRetrievalActivities,
  ...representationLessonActivities,
  ...dataToolLessonActivities,
  ...userReportActivities,
  ...responsibleRetrievalActivities,
  ...responsiblePortfolioActivities,
  ...semanticInterfaceActivities,
  ...interfaceRetrievalActivities,
  ...packetLessonActivities,
  ...apiContractLessonActivities,
  ...apiDashboardLessonActivities,
  ...apiNetworkRetrievalActivities,
  ...servicePortfolioActivities,
  ...modelControlFoundationActivities,
  ...modelObservationActivities,
  ...modelControlMissionActivities,
  ...controlRetrievalActivities,
  ...waypointControlPortfolioActivities,
  ...functionDataRetrievalActivities,
  ...dataAiFoundationActivities,
  ...aiSuggestionCheckActivities,
  ...dataAiProjectActivities,
  ...dataAiRetrievalActivities,
  ...semanticWebActivities,
];
export function activityDefinition(id: string): ActivityContent | null { return authoredActivities.find((activity) => activity.id === id || activity.inventoryId === id) ?? null; }
export function activityContentHash(activity: ActivityContent): string { return createHash("sha256").update(JSON.stringify(activity)).digest("hex"); }
export const approvedCatalogue = inventory;
export const expectedActivityCounts = { lessons: 264, consolidations: 132, projects: 44, total: 440 } as const;

export type ReleaseSeal = { version: string; runtimeHash: string; activities: Record<string, string>; verificationRun: string; publicationScope?: string };
/** Content approval for local learning cannot authorise a production release. */
export function publicationScopeAllowed(seal: ReleaseSeal, environment = process.env.NODE_ENV): boolean {
  return seal.publicationScope === "production" || seal.publicationScope === "development" && environment === "development";
}
export function validateReleaseSeal(seal: ReleaseSeal, runtimeHash: string, activities = authoredActivities): boolean {
  if (seal.version !== ACTIVITY_VERSION || !/^[a-f0-9]{64}$/.test(runtimeHash) || seal.runtimeHash !== runtimeHash || !seal.verificationRun || activities.length !== expectedActivityCounts.total || Object.keys(seal.activities).length !== expectedActivityCounts.total) return false;
  if (new Set(activities.map((activity) => activity.id)).size !== activities.length) return false;
  const required = new Map<string, { kind: ActivityContent["kind"]; year: number; moduleId: string }>(inventory.lessons.map((lesson) => [lesson.id, { kind: "lesson", year: lesson.year, moduleId: lesson.moduleId }]));
  for (const project of inventory.projects) {
    required.set(project.id, { kind: "project", year: project.year, moduleId: project.moduleId });
    for (let slot = 1; slot <= 3; slot++) required.set(project.id.replace(/^P-/, "C-") + `-${slot}`, { kind: "consolidation", year: project.year, moduleId: project.moduleId });
  }
  const seen = new Set<string>();
  const kinds = { lesson: 0, consolidation: 0, project: 0 };
  for (const activity of activities) {
    const expected = required.get(activity.inventoryId);
    if (!expected || seen.has(activity.inventoryId) || expected.kind !== activity.kind || expected.year !== activity.year || expected.moduleId !== activity.moduleId) return false;
    seen.add(activity.inventoryId);
    kinds[activity.kind]++; if (seal.activities[activity.id] !== activityContentHash(activity)) return false;
  }
  return kinds.lesson === 264 && kinds.consolidation === 132 && kinds.project === 44;
}

export function activityReleased(id: string): boolean {
  const activity = activityDefinition(id);
  return Boolean(activity && publicationScopeAllowed(release) && validateReleaseSeal(release, build.runtimeHash) && (release.activities as Record<string, string>)[activity.id] === activityContentHash(activity));
}
export function releasedActivities(): readonly ActivityContent[] { return publicationScopeAllowed(release) && validateReleaseSeal(release, build.runtimeHash) ? authoredActivities : []; }
