import type { DigestedSignal } from "@/lib/stomach/digestionOutputs";
import type { DigestionMap, DigestionResult, DigestionRule } from "@/lib/stomach/digestionContracts";
import type { StomachEvidenceEnvelope, StomachEvidenceType } from "@/lib/stomach/evidenceTypes";

const DIGESTION_RULES: DigestionMap = {
  lesson_completed: [
    { produce: "mastery_signal", defaultConfidence: 72, reason: "Lesson completion contributes to topic mastery evidence." },
    { produce: "readiness_signal", defaultConfidence: 64, reason: "Completed lessons improve readiness context." },
    { produce: "engagement_signal", defaultConfidence: 66, reason: "Completion indicates learning engagement." },
  ],
  question_answered: [
    { produce: "confidence_signal", defaultConfidence: 62, reason: "Question answers indicate confidence trend." },
    { produce: "mastery_signal", defaultConfidence: 58, reason: "Answer outcomes update mastery evidence." },
    { produce: "weak_area_signal", defaultConfidence: 51, reason: "Repeated low outcomes can indicate weak areas." },
  ],
  homework_submitted: [
    { produce: "engagement_signal", defaultConfidence: 68, reason: "Homework submissions indicate sustained participation." },
    { produce: "readiness_signal", defaultConfidence: 60, reason: "Homework evidence contributes to readiness view." },
  ],
  quick_level_finder_completed: [
    { produce: "readiness_signal", defaultConfidence: 80, reason: "Quick Level Finder sets placement and readiness baseline." },
    { produce: "confidence_signal", defaultConfidence: 74, reason: "Baseline profile supports confidence calibration." },
    { produce: "acceleration_signal", defaultConfidence: 52, reason: "Baseline can identify opportunities for acceleration." },
  ],
  spelling_activity: [
    { produce: "weak_area_signal", defaultConfidence: 65, reason: "Spelling activity can expose recurring weak patterns." },
    { produce: "support_signal", defaultConfidence: 56, reason: "Spelling outcomes inform support recommendations." },
  ],
  reading_activity: [
    { produce: "mastery_signal", defaultConfidence: 59, reason: "Reading activity contributes to literacy mastery evidence." },
    { produce: "support_signal", defaultConfidence: 57, reason: "Reading evidence informs support pathways." },
  ],
  coach_support_used: [
    { produce: "support_signal", defaultConfidence: 78, reason: "Coach usage directly indicates support dependency." },
    { produce: "intervention_signal", defaultConfidence: 61, reason: "High support need can trigger intervention signals." },
  ],
  assessment_completed: [
    { produce: "mastery_signal", defaultConfidence: 76, reason: "Assessments provide high-value mastery evidence." },
    { produce: "readiness_signal", defaultConfidence: 71, reason: "Assessment outcomes influence readiness status." },
    { produce: "intervention_signal", defaultConfidence: 55, reason: "Low assessment outcomes indicate intervention need." },
  ],
  exam_completed: [
    { produce: "readiness_signal", defaultConfidence: 84, reason: "Exam evidence strongly informs readiness profile." },
    { produce: "confidence_signal", defaultConfidence: 73, reason: "Exam outcomes calibrate learner confidence band." },
  ],
  competition_completed: [
    { produce: "engagement_signal", defaultConfidence: 75, reason: "Competition participation indicates high engagement." },
    { produce: "acceleration_signal", defaultConfidence: 63, reason: "Competition outcomes may reveal acceleration potential." },
  ],
};

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toSignal(rule: DigestionRule, evidence: StomachEvidenceEnvelope): DigestedSignal {
  const confidenceOffset = evidence.payload && typeof evidence.payload.score === "number"
    ? Math.round((evidence.payload.score - 50) * 0.12)
    : 0;
  const confidence = clampConfidence(rule.defaultConfidence + confidenceOffset);
  return {
    type: rule.produce,
    confidence,
    reason: rule.reason,
    metadata: {
      evidenceType: evidence.type,
      occurredAt: evidence.occurredAt,
    },
  };
}

export function digestEvidence(evidence: StomachEvidenceEnvelope): DigestionResult {
  const rules = DIGESTION_RULES[evidence.type] ?? [];
  return {
    evidenceType: evidence.type,
    studentId: evidence.studentId,
    digestedAt: new Date().toISOString(),
    signals: rules.map((rule) => toSignal(rule, evidence)),
  };
}

export function classifyEvidenceType(value: string): StomachEvidenceType | null {
  return (value in DIGESTION_RULES) ? (value as StomachEvidenceType) : null;
}

export function isStomachProcessingOnly(): true {
  return true;
}
