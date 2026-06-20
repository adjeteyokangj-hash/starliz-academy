/**
 * Black Box repair history and learning memory
 * Tracks which repairs were applied, their outcomes, and patterns
 */

export type RepairHistoryEntry = {
  id: string;
  contentId: string;
  itemIndex: number;
  actionType: string;
  confidence: "safe" | "needs_review" | "risky";
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  appliedAt: string;
  appliedBy: string; // admin user ID
  reason: string; // What Black Box issue triggered this
  undoneAt?: string; // If repaired, when was it undone
};

export type RepairOutcome = {
  contentId: string;
  itemIndex: number;
  actionType: string;
  reason: string; // Original Black Box reason
  appliedAt: string;
  rerunBlackBoxAt?: string;
  blackBoxDecisionBefore?: string;
  blackBoxDecisionAfter?: string;
  blackBoxScoreBefore?: number;
  blackBoxScoreAfter?: number;
  resolved: boolean; // Did the fix solve the issue?
  escalatedAt?: string; // If still failing, when escalated
};

/**
 * Learning memory: patterns of successful/failed repairs
 * Used to guide future repair attempts and generation
 */
export type RepairPattern = {
  issueType: string; // "missing_correct_answer", "weak_distractors", etc.
  actionType: string;
  successRate: number; // % of times this action resolved the issue
  sampleSize: number;
  lastAppliedAt: string;
  contexts: Array<{
    subject: string;
    topic: string;
    level: number;
    succeeded: boolean;
    attemptCount: number;
  }>;
};

/**
 * Escalation record: repairs that failed and need manual review
 */
export type EscalatedRepair = {
  id: string;
  contentId: string;
  itemIndex: number;
  failedActionType: string;
  failedReason: string;
  originalBlackBoxReason: string;
  attemptCount: number;
  escalatedAt: string;
  escalatedBy: string;
  assignedTo?: string; // admin assigned to handle
  notes?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolution?: string;
};
