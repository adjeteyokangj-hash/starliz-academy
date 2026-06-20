import type { BlackBoxContentTestResult } from "@/lib/ai/content-black-box-test";
import type { DiagnosticOutcomeCode } from "@/lib/ai/generator-tuple-validation";

type SaveRequestTuple = {
  yearGroup: string | null;
  keyStage: string | null;
  subject: string;
  strand: string | null;
  skillFocus: string;
  difficulty: number;
  itemCount: number;
};

export type ContentSaveBlockPayload = {
  error: string;
  diagnosticOutcome: DiagnosticOutcomeCode;
  requestTuple: SaveRequestTuple | null;
  formulaErrors?: string[];
  blackBoxContentTest?: BlackBoxContentTestResult;
};

export function buildContentSaveBlockPayload(input: ContentSaveBlockPayload): ContentSaveBlockPayload {
  return {
    error: input.error,
    diagnosticOutcome: input.diagnosticOutcome,
    requestTuple: input.requestTuple,
    ...(input.formulaErrors ? { formulaErrors: input.formulaErrors } : {}),
    ...(input.blackBoxContentTest ? { blackBoxContentTest: input.blackBoxContentTest } : {}),
  };
}