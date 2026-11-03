import { web, scenario, eq, containsText } from "../authoring";
import { createHash } from "node:crypto";
import type { Json, PracticalArtifact } from "../types";
import { componentArtifact } from "./tested-component-tools";

export type FeatureFault = "automatic" | "untested-version" | "missing-limits" | "unreviewed";
export function intelligentFeature(index: number, fault?: FeatureFault) {
  const offset = index * 20;
  return web(`<main><h1>Fictional material review desk ${index + 1}</h1><p>This learning application uses invented measurements only.</p><p id="version"></p><p id="evaluation"></p><p id="limits"></p><label for="measurement">Synthetic measurement (${offset} to ${offset + 10})</label><input id="measurement" value="${offset + 1}" inputmode="decimal"><button id="evaluate" type="button">Evaluate material</button><p id="prediction" role="status" aria-live="polite"></p><p id="decision" role="status" aria-live="polite">No decision</p><label><input id="ack" type="checkbox"> I have independently reviewed this fictional case</label><button id="review" type="button" disabled>Record explicit local human review</button><p id="review-scope">Local learning review only. This does not contact a teacher or grant production decision authority.</p></main>`, `const trainedVersion='material-${index + 1}';const activeVersion=${JSON.stringify(fault === "untested-version" ? `unreviewed-material-${index + 1}` : `material-${index + 1}`)};
const training=[{value:${offset},label:'low'},{value:${offset + 4},label:'low'},{value:${offset + 6},label:'high'},{value:${offset + 10},label:'high'}];
function predict(value){const neighbours=training.map((row,index)=>({...row,index,distance:Math.abs(row.value-value)})).sort((a,b)=>a.distance-b.distance||a.index-b.index).slice(0,3);const high=neighbours.filter(row=>row.label==='high').length;return {label:high>=2?'high':'low',share:Math.max(high,3-high)/3};}
const heldOut=[{value:${offset + 1},label:'low'},{value:${offset + 9},label:'low'},{value:${offset + 1},label:'high'},{value:${offset + 9},label:'high'}];
const correct=heldOut.filter(row=>predict(row.value).label===row.label).length;
const version=document.getElementById('version'),evaluation=document.getElementById('evaluation'),limits=document.getElementById('limits'),prediction=document.getElementById('prediction'),decision=document.getElementById('decision'),review=document.getElementById('review'),ack=document.getElementById('ack');
version.textContent='Active '+activeVersion+'; evaluated '+trainedVersion;
evaluation.textContent='Held-out raw predictions: '+correct+'/'+heldOut.length+'. Version match: '+String(activeVersion===trainedVersion)+'.';
limits.textContent=${JSON.stringify(fault === "missing-limits" ? "Safe for every material decision." : "Tiny fictional evaluation only; 2/4 raw labels correct. Vote share is not calibrated certainty. Below 0.8 requires independent human review. Not for real consequential decisions.")};
let pending=null;
document.getElementById('evaluate').addEventListener('click',()=>{pending=null;review.disabled=true;ack.checked=false;decision.textContent='No decision';const raw=document.getElementById('measurement').value.trim();const value=Number(raw);if(!raw||!Number.isFinite(value)||value<${offset}||value>${offset + 10}){prediction.textContent='Invalid synthetic measurement.';return;}if(activeVersion!==trainedVersion){prediction.textContent='Blocked: active model version has no matching evaluation.';return;}const output=predict(value);prediction.textContent='Raw suggestion: '+output.label+'; neighbour vote '+output.share.toFixed(3)+'. Not calibrated certainty.';if(output.share<.8){${fault === "automatic" ? "decision.textContent='Automatic decision: '+output.label;" : "pending=output;decision.textContent='Deferred: independent human review required.';review.disabled=false;"}}else{pending=output;decision.textContent='Suggestion only: explicit review still required.';review.disabled=false;}});
review.addEventListener('click',()=>{if(!pending${fault === "unreviewed" ? "" : "||!ack.checked"}){decision.textContent='Review not recorded: independently inspect and acknowledge this fictional case.';return;}decision.textContent='Local human review recorded for '+pending.label+'. No real-world action taken.';pending=null;review.disabled=true;});`);
}
export function featureCases(id: string, index: number, mode: "review" | "version" | "limits" = "review") {
  const offset = index * 20;
  return [false, true].map((acknowledge, variant) => scenario(`${id}-${variant}`, { events: [{ target: "evaluate", type: "click" }, ...(acknowledge ? [{ target: "ack", type: "change", value: "true" }, { target: "review", type: "click" }] : [])] },
    eq("result.textsById.version", `Active material-${index + 1}; evaluated material-${index + 1}`, "The displayed active model is the exact evaluated version"),
    eq("result.textsById.evaluation", "Held-out raw predictions: 2/4. Version match: true.", "The actual held-out evaluation remains visible, including errors"),
    eq("result.textsById.prediction", "Raw suggestion: low; neighbour vote 0.667. Not calibrated certainty.", "The actual model exposes uncertainty without relabelling vote share as probability"),
    eq("result.textsById.decision", acknowledge ? "Local human review recorded for low. No real-world action taken." : "Deferred: independent human review required.", "An uncertain suggestion cannot silently become a consequential automatic decision; explicit local review is distinct"),
    eq("result.textsById.limits", "Tiny fictional evaluation only; 2/4 raw labels correct. Vote share is not calibrated certainty. Below 0.8 requires independent human review. Not for real consequential decisions.", `The ${mode} contract retains precise appropriate-use limits`),
    eq("result.controlValuesById.measurement", String(offset + 1), "The model reads the actual synthetic control value")));
}

export const generatedRangeModule = "def bounded_quantity(value):\n    if type(value) is not int or not 0<=value<=100: return {'status':'invalid'}\n    return {'status':'accepted','quantity':value}\n";
const approvedDigest = createHash("sha256").update(generatedRangeModule).digest("hex");
export function generatedRangeReview(index: number, faulty = false): PracticalArtifact {
  return componentArtifact(`import hashlib,json
from generated_quantity import bounded_quantity
def solve(payload):
    source=open('generated_quantity.py').read()
    supplied=json.load(open('source-evidence.json'))
    observed=hashlib.sha256(source.encode()).hexdigest()
    provenance_valid=${faulty ? "supplied.get('licence')=='MIT'" : `observed=='${approvedDigest}' and supplied=={'source':'StarLiz authored synthetic generated-code fixture ${index + 1}','licence':'StarLiz educational fixture; no third-party attribution claim','sha256':'${approvedDigest}'}`}
    results=[{'input':value,'result':bounded_quantity(value)} for value in payload['variables']['values']]
    report={'provenance_valid':provenance_valid,'observed_sha256':observed,'results':results,'claim':'Behavioural tests and supplied source evidence only; no general model correctness or legal licence certification.'}
    with open('generated-review.json','w') as handle: json.dump(report,handle)
    return report
`, { "generated_quantity.py": generatedRangeModule, "source-evidence.json": JSON.stringify({ source: `StarLiz authored synthetic generated-code fixture ${index + 1}`, licence: "StarLiz educational fixture; no third-party attribution claim", sha256: approvedDigest }) });
}
export function generatedReviewCases(id: string) { return [[0, 100, -1, 101, true, "5"], [1, 99, false, "0"]].map((values, variant) => scenario(`${id}-${variant}`, { variables: { values } }, eq("result.provenance_valid", true, "Actual generated-module bytes and the complete supplied provenance record agree with independent evidence; an invented MIT claim is not accepted"), eq("result.observed_sha256", approvedDigest, "The review hashes the real imported source file"), eq("result.results", values.map((value): Json => { const result: Json = typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 ? { status: "accepted", quantity: value } : { status: "invalid" }; return { input: value, result }; }), "The actual imported generated module meets the specification on inclusive bounds, invalid ranges, booleans and numeric strings"), containsText("/files/generated-review.json", '"provenance_valid": true', "The saved review derives from actual code execution and source inspection"))); }
