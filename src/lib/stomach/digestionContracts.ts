import type { StomachEvidenceEnvelope } from "@/lib/stomach/evidenceTypes";
import type { DigestedSignal } from "@/lib/stomach/digestionOutputs";

export type DigestionResult = {
  evidenceType: StomachEvidenceEnvelope["type"];
  studentId: string;
  digestedAt: string;
  signals: DigestedSignal[];
};

export type DigestionRule = {
  produce: DigestedSignal["type"];
  defaultConfidence: number;
  reason: string;
};

export type DigestionMap = Record<StomachEvidenceEnvelope["type"], DigestionRule[]>;
