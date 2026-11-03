import { componentArtifact } from "./tested-component-tools";
import { scenario, eq, containsText } from "../authoring";

export function privacyChangeArtifact(faulty = false) { return componentArtifact(`import json
def solve(payload):
    data=payload['variables']
    reports=[]
    for request in data['telemetry']:
        if request['scope']!=data['scope']: continue
        if type(request['status']) is not int or not 100<=request['status']<=599: continue
        # The new vendor adds a token and free-form search term to each event.
        reports.append(${faulty ? "dict(request)" : "{'method':request['method'],'route':request['route'],'status':request['status']}"})
    with open('privacy-change-review.json','w') as handle: json.dump({'reports':reports,'changed_risk':'New telemetry includes an authentication token and free-form text beyond the stated route/status diagnostic need.','control':'Project only scoped method, bounded route and observed status; no external reporting request is made.'},handle)
    return {'reports':reports,'external_requests':0,'policy_version':'scoped-minimal-v2'}
`); }
export function privacyChangeCases(id: string, index: number) { return [false, true].map((denied, variant) => { const status = denied ? 403 : 200; return scenario(`${id}-${variant}`, { variables: { scope: `store-${index}`, telemetry: [{ scope: `store-${index}`, method: "POST", route: "/adjust", status, authorization: "fictional-token-not-a-real-secret", search: "fictional-paper" }, { scope: "unrelated", method: "GET", route: "/records", status: 200, authorization: "other-fictional-token", search: "other" }] } }, eq("result.reports", [{ method: "POST", route: "/adjust", status }], "The actual changed reporting pipeline retains necessary scoped diagnostics while excluding newly introduced tokens and free-form content"), eq("result.external_requests", 0, "The program makes no external vendor reporting request"), containsText("/files/privacy-change-review.json", "New telemetry includes", "The saved review identifies the actual new risk instead of copying the old plan unchanged")); }); }
export function releaseArtifact(faulty = false) { return componentArtifact(`import hashlib,json
from release_api import read_v1
def solve(payload):
    data=payload['variables']
    original=json.dumps({'schema':1,'quantity':data['quantity']},sort_keys=True)
    with open('release-state.json','w') as handle: handle.write(original)
    with open('release-backup.json','w') as handle: handle.write(open('release-state.json').read())
    backup=open('release-backup.json').read()
    if hashlib.sha256(backup.encode()).hexdigest()!=hashlib.sha256(original.encode()).hexdigest(): raise ValueError('backup-mismatch')
    upgraded={'schema':2,'quantity':json.loads(backup)['quantity'],'revision':0}
    with open('release-state.json','w') as handle: json.dump(upgraded,handle)
    candidate=json.load(open('release-state.json'))
    old_consumer=read_v1(candidate)
    regression_passed=old_consumer=={'quantity':data['quantity']}
    accepted=regression_passed and not data['inject_failure']
    if not accepted:
        with open('release-state.json','w') as handle: handle.write(backup)
    after=json.load(open('release-state.json'))
    rollback_demonstrated=not accepted and open('release-state.json').read()==backup
    evidence={'backup_sha256':hashlib.sha256(backup.encode()).hexdigest(),'backup_valid':backup==original,'old_consumer':old_consumer,'regression_passed':regression_passed,'upgrade_accepted':accepted,'rollback_demonstrated':rollback_demonstrated,'reopened':after,'scope':'Actual isolated synthetic project-file upgrade and rollback only; no application database migration or release deployment.'}
    with open('release-evidence.json','w') as handle: json.dump(evidence,handle)
    return evidence
`, { "release_api.py": `def read_v1(record):\n    return ${faulty ? "{'item':{'quantity':record['quantity']}}" : "{'quantity':record['quantity']}"}\n` }); }
export function releaseCases(id: string, index: number) { return [true, false].map((inject_failure, variant) => { const quantity = index ? index * 7 : 0; return scenario(`${id}-${variant}`, { variables: { quantity, inject_failure } }, eq("result.backup_valid", true, "The actual backup bytes preserve the original synthetic record before any upgrade"), eq("result.old_consumer", { quantity }, "The real old-version consumer contract remains compatible with the upgraded file"), eq("result.regression_passed", true, "The actual compatibility regression executes before accepting the candidate"), eq("result.upgrade_accepted", !inject_failure, "Only a candidate without the supplied failure is accepted"), eq("result.rollback_demonstrated", inject_failure, "A failed candidate actually restores the original backup bytes"), eq("result.reopened", inject_failure ? { schema: 1, quantity } : { schema: 2, quantity, revision: 0 }, "Actual reopened project data agrees with acceptance or rollback, including zero"), containsText("/files/release-evidence.json", '"regression_passed": true', "The saved evidence derives from the real compatibility and recovery execution")); }); }
