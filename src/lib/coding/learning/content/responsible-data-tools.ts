import { python, scenario, eq } from "../authoring";

export type AuditMode = "lifecycle" | "risk" | "robustness";
export function auditArtifact(mode: AuditMode, faulty = false) { return python(`import json,math
def solve(payload):
    data=payload['variables']
    training=data['training']
    testing=data['testing']
    def predict(value):
        nearest=sorted(enumerate(training),key=lambda pair:(abs(pair[1]['value']-value),pair[0]))[:3]
        votes=sum(row['label']=='high' for _,row in nearest)
        label='high' if votes>=2 else 'low'
        return label,max(votes,3-votes)/3
    def evaluate(rows,shift=0):
        result={'tp':0,'fp':0,'fn':0,'tn':0,'deferred':0,'count':len(rows),'observations':[]}
        for row in rows:
            label,share=predict(row['value']+shift)
            key='tp' if row['label']=='high' and label=='high' else 'fp' if label=='high' else 'fn' if row['label']=='high' else 'tn'
            result[key]+=1
            if share<.8: result['deferred']+=1
            result['observations'].append({'id':row['id'],'predicted':label,'expected':row['label'],'vote_share':share})
        return result
    if '${mode}'=='lifecycle':
        retained=[]
        rejected=[]
        for row in data['records']:
            if not isinstance(row,dict) or set(row)!={'id','value','age_days','hold','scope'} or type(row['value']) not in (int,float) or isinstance(row['value'],bool) or not math.isfinite(row['value']) or type(row['age_days']) is not int or row['age_days']<0 or type(row['hold']) is not bool:
                rejected.append(row.get('id','invalid') if isinstance(row,dict) else 'invalid')
                continue
            if row['scope']!=data['scope']: continue
            if row['age_days']<=data['retention_days']${faulty ? "" : " or row['hold']"}: retained.append({'id':row['id'],'value':row['value'],'hold':row['hold']})
        report={'retained':retained,'rejected':rejected,'policy':'Retain in-scope valid records through the inclusive retention boundary or explicit review hold. Drop unnecessary age/scope fields from the output. Synthetic data only.'}
    else:
        disjoint=not set(row['id'] for row in training)&set(row['id'] for row in testing)
        raw=evaluate(testing)
        denominator=raw['tp']+raw['fn']
        recall=raw['tp']/denominator if denominator else None
        accepted=${faulty && mode === "risk" ? "(raw['tp']+raw['tn'])/raw['count']>=.5" : "recall is not None and recall>=data['minimum_recall'] and disjoint"}
        report={'model_version':data['model_version'],'disjoint':disjoint,'raw':raw,'high_recall':recall,'release_criterion_met':accepted,'limits':'Tiny fictional material categories only. Vote share is not calibrated certainty. Raw labels are not authorised consequential decisions.'}
        if '${mode}'=='robustness':
            groups=sorted(set(row['group'] for row in testing))
            report['groups']={group:evaluate([row for row in testing if row['group']==group]) for group in ${faulty ? "groups[:1]" : "groups"}}
            report['shifted']=evaluate(testing,data['shift'])
            # Apply a documented inverse calibration; do not retrain on held-out labels.
            report['mitigated']=evaluate([{**row,'value':row['value']-data['shift']} for row in testing],data['shift'])
    with open('responsible-data-evidence.json','w') as handle: json.dump(report,handle,allow_nan=False)
    return report
`); }

export function auditData(index: number) {
  const offset = index * 20;
  return { model_version: `fictional-material-v${index + 1}`, scope: "store", retention_days: 30, minimum_recall: .9, shift: 10,
    training: [{ id: "t0", value: offset, label: "low" }, { id: "t1", value: offset + 4, label: "low" }, { id: "t2", value: offset + 6, label: "high" }, { id: "t3", value: offset + 10, label: "high" }],
    testing: [{ id: "tn", value: offset + 1, label: "low", group: "paper" }, { id: "fp", value: offset + 9, label: "low", group: "foam" }, { id: "fn", value: offset + 1, label: "high", group: "paper" }, { id: "tp", value: offset + 9, label: "high", group: "foam" }],
    records: [{ id: "boundary", value: offset, age_days: 30, hold: false, scope: "store" }, { id: "expired", value: offset + 1, age_days: 31, hold: false, scope: "store" }, { id: "held", value: offset + 2, age_days: 70, hold: true, scope: "store" }, { id: "other", value: offset + 3, age_days: 1, hold: false, scope: "other" }, { id: "invalid", value: "untrusted", age_days: 1, hold: false, scope: "store" }] };
}
export function auditCases(id: string, index: number, mode: AuditMode) { return [0, 1].map(variant => {
  const data = auditData(index), offset = index * 20;
  if (variant) data.retention_days = 29;
  const assertions = mode === "lifecycle" ? [eq("result.retained", [...(!variant ? [{ id: "boundary", value: offset, hold: false }] : []), { id: "held", value: offset + 2, hold: true }], "Actual lifecycle processing preserves review holds, respects the inclusive boundary and scopes minimal output"), eq("result.rejected", ["invalid"], "A numeric-looking or invalid value is rejected before retention decisions")] : [eq("result.disjoint", true, "Held-out identifiers remain separate from actual source training"), eq("result.raw.tp", 1, "Actual predictions include the true positive"), eq("result.raw.fp", 1, "The consequential false positive remains in the report"), eq("result.raw.fn", 1, "The consequential false negative is not hidden by an average score"), eq("result.raw.tn", 1, "The true negative is counted independently"), eq("result.high_recall", .5, "High-category recall uses all actual positives, including the missed high observation"), eq("result.release_criterion_met", false, "The actual risk limit rejects this model's high-category misses despite its average score")];
  if (mode === "robustness") assertions.push(eq("result.groups.paper.count", 2, "Every fictional subgroup remains measurable"), eq("result.groups.foam.count", 2, "A difficult second subgroup cannot be omitted"), eq("result.shifted.fp", 2, "A real changed measurement shifts the actual predictions"), eq("result.shifted.fn", 0, "Shift effects are measured rather than assumed equivalent"), eq("result.mitigated", { tp: 1, fp: 1, fn: 1, tn: 1, deferred: 4, count: 4, observations: [{ id: "tn", predicted: "low", expected: "low", vote_share: 2 / 3 }, { id: "fp", predicted: "high", expected: "low", vote_share: 2 / 3 }, { id: "fn", predicted: "low", expected: "high", vote_share: 2 / 3 }, { id: "tp", predicted: "high", expected: "high", vote_share: 2 / 3 }] }, "The documented inverse calibration is actually retested and recovers baseline behaviour without inventing improved accuracy"));
  return scenario(`${id}-${variant}`, { variables: data }, ...assertions);
}); }
