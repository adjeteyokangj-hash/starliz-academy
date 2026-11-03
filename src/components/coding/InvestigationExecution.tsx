"use client";
import type { Json } from "@/lib/coding/learning/types";
import DataExecution from "./DataExecution";
import ClassifierExecution from "./ClassifierExecution";
const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export default function InvestigationExecution({ output }: { output: Record<string, Json> }) {
  if (output.investigation !== true) return null;
  return <section aria-label="Executed data investigation" className="min-w-0 space-y-5"><p className={`rounded-xl border p-3 text-sm ${output.trainingMatchesData === true ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>{output.trainingMatchesData === true ? "Every training example matches an actual cleaned record's identifier, measurement and category." : "Training examples do not match all actual cleaned records. Review the data-to-model connection."}</p><DataExecution output={record(output.data)} /><ClassifierExecution output={record(output.classifier)} /><p className="break-words rounded-xl bg-slate-50 p-3 text-sm"><strong>Your interpretation:</strong> {String(output.interpretation)}</p></section>;
}
