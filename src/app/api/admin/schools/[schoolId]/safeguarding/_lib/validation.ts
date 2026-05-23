import { z } from "zod";
import { AGENCY_REFERRAL_STATUSES, SAFEGUARDING_RISK_LEVELS, SAFEGUARDING_STATUSES } from "./contracts";

export const createIncidentSchema = z.object({
  student: z.string().trim().min(1, "Student is required"),
  concernType: z.string().trim().min(1, "Concern type is required"),
  riskLevel: z.enum(SAFEGUARDING_RISK_LEVELS),
  reportedBy: z.string().trim().min(1, "Reported by is required"),
  reportedAt: z.string().datetime("Reported date/time must be a valid ISO datetime"),
  concernSummary: z.string().trim().min(1, "Concern summary is required"),
  immediateActionTaken: z.string().trim().min(1, "Immediate action taken is required"),
  assignedOwner: z.string().trim().min(1).optional(),
  status: z.enum(SAFEGUARDING_STATUSES).optional(),
  nextReviewDate: z.string().date().optional(),
  parentContacted: z.boolean().optional(),
  externalAgencyInvolved: z.boolean().optional(),
  chronologyNotes: z.string().trim().min(1, "Chronology notes are required"),
  closureSummary: z.string().trim().optional(),
  parentContactNotes: z.string().trim().optional(),
  agencyReferralStatus: z.enum(AGENCY_REFERRAL_STATUSES).optional(),
});

export const patchIncidentSchema = z.object({
  status: z.enum(SAFEGUARDING_STATUSES).optional(),
  riskLevel: z.enum(SAFEGUARDING_RISK_LEVELS).optional(),
  assignedOwner: z.string().trim().min(1).nullable().optional(),
  nextReviewDate: z.string().date().nullable().optional(),
  parentContacted: z.boolean().optional(),
  externalAgencyInvolved: z.boolean().optional(),
  chronologyNotes: z.string().trim().min(1).optional(),
  immediateActionTaken: z.string().trim().min(1).optional(),
  closureSummary: z.string().trim().optional(),
  parentContactNotes: z.string().trim().optional(),
  agencyReferralStatus: z.enum(AGENCY_REFERRAL_STATUSES).optional(),
  notes: z.string().trim().min(1).optional(),
});

export const timelineSchema = z.object({
  action: z.string().trim().min(1, "Timeline action is required"),
  note: z.string().trim().min(1, "Timeline note is required"),
  timestamp: z.string().datetime().optional(),
});

export const escalationSchema = z.object({
  escalationLevel: z.string().trim().min(1, "Escalation level is required"),
  rationale: z.string().trim().min(1, "Escalation rationale is required"),
  actionPlan: z.string().trim().min(1, "Action plan is required"),
  agencyReferralStatus: z.enum(AGENCY_REFERRAL_STATUSES),
  escalatedBy: z.string().trim().min(1, "Escalated by is required"),
  nextReviewDate: z.string().date().nullable().optional(),
  status: z.enum(["Escalated", "Referred"] as const).default("Escalated"),
});

export function toValidationErrors(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "payload",
    message: issue.message,
  }));
}
