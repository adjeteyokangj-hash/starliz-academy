import { createHash } from "node:crypto";
import { componentArtifact } from "./tested-component-tools";
import { scenario, eq, containsText } from "../authoring";

const service = "def adjust(quantity,change):\n    if type(quantity) is not int or type(change) is not int or quantity<0 or quantity+change<0: return {'status':'refused','quantity':quantity}\n    return {'status':'accepted','quantity':quantity+change}\n";
const serviceHash = createHash("sha256").update(service).digest("hex");
export function roleEvidenceArtifact(index: number, faulty = false) { return componentArtifact(`import hashlib,json,os
from quantity_service import adjust
def solve(payload):
    role=payload['variables']['role']
    cases=[{'quantity':0,'change':0},{'quantity':${8 + index},'change':-2},{'quantity':0,'change':-1}]
    observed=[{'input':case,'actual':adjust(**case)} for case in cases]
    digest=hashlib.sha256(open('quantity_service.py','rb').read()).hexdigest()
    evidence={'artifact':'quantity_service.py','sha256':digest,'observed':observed}
    comparisons={'backend':{'need':'Implement and preserve a strict domain contract.','evidence':'quantity_service.py','next':'Add reviewed durable storage and request authorisation before a real service release.'},'quality':{'need':'Reproduce boundary and refusal outcomes without hiding failures.','evidence':${faulty ? "'unwritten-test-suite.py'" : "'role-evidence.json'"},'next':'Add independent generated boundary cases and an actual integration failure test.'}}
    selected=comparisons[role]
    report={'role':role,'comparison':comparisons,'selected':selected,'evidence':evidence,'scope':'Fictional role exercise using actual local source and observed tests, not a qualification or employment claim.'}
    with open('role-evidence.json','w') as handle: json.dump(report,handle)
    report['evidence_exists']=os.path.isfile(selected['evidence'])
    with open('role-evidence.json','w') as handle: json.dump(report,handle)
    return report
`, { "quantity_service.py": service }); }
export function roleEvidenceCases(id: string, index: number) { return ["quality", "backend"].map(role => scenario(`${id}-${role}`, { variables: { role } }, eq("result.evidence_exists", true, "The selected fictional role claim points to an actual supplied source or actual generated evidence file"), eq("result.evidence.sha256", serviceHash, "Role evidence identifies the actual executed source bytes"), eq("result.evidence.observed", [{ input: { quantity: 0, change: 0 }, actual: { status: "accepted", quantity: 0 } }, { input: { quantity: 8 + index, change: -2 }, actual: { status: "accepted", quantity: 6 + index } }, { input: { quantity: 0, change: -1 }, actual: { status: "refused", quantity: 0 } }], "The actual artifact demonstrates useful boundary and refusal behaviour rather than merely asserting a skill"), eq("result.selected.evidence", role === "backend" ? "quantity_service.py" : "role-evidence.json", "Each role links to the relevant reproducible artifact, not an invented file"), containsText("result.selected.next", role === "backend" ? "durable storage" : "integration failure", "The next learning goal addresses a specific current evidence limitation"))); }
export function handoverArtifact(index: number, faulty = false) { return componentArtifact(`import importlib,hashlib,json
def solve(payload):
    guide=json.load(open('handover.json'))
    if guide['module']!='quantity_service' or guide['callable']!='adjust': raise ValueError('handover-entry-not-reproducible')
    module=importlib.import_module(guide['module'])
    actual=getattr(module,guide['callable'])(**payload['variables']['arguments'])
    digest=hashlib.sha256(open('quantity_service.py','rb').read()).hexdigest()
    report={'reproduced':actual,'source_sha256':digest,'guide':guide,'defence':{'why_domain_pure':'Independent callers can reproduce the same strict operation without importing an interface.','why_refusal_preserves':'A rejected removal cannot silently replace the confirmed quantity.','tested_scope':'Only the supplied synthetic domain cases; no persistence, HTTP, public deployment or full accessibility claim.'}}
    with open('handover-evidence.json','w') as handle: json.dump(report,handle)
    return report
`, { "quantity_service.py": service, "handover.json": JSON.stringify({ module: faulty ? "missing_dependency" : "quantity_service", callable: "adjust", source: `Original fictional handover ${index + 1}`, setup: "The reviewed Python workspace supplies quantity_service.py; import its adjust function and pass the stated quantity/change arguments.", test: "Execute the provided zero, ordinary-removal and insufficient-stock cases, then compare actual results and source hash.", rollback: "Restore the earlier private source version; do not delete original files or reset a database.", limitation: "Pure synthetic domain behaviour only; persistence, HTTP and production deployment remain outside this handover.", nextLearning: "Add reviewed persistence and actual interface/service integration tests before extending the use." }) }); }
export function handoverCases(id: string, index: number) { return [{ quantity: 0, change: 0 }, { quantity: 8 + index, change: -2 }, { quantity: 0, change: -1 }].map((arguments_, variant) => scenario(`${id}-${variant}`, { variables: { arguments: arguments_ } }, eq("result.reproduced", arguments_.quantity + arguments_.change < 0 ? { status: "refused", quantity: arguments_.quantity } : { status: "accepted", quantity: arguments_.quantity + arguments_.change }, "The documented entry point actually imports and reproduces the stated zero, normal and refusal behaviour"), eq("result.source_sha256", serviceHash, "The handover evidence identifies the exact actual source bytes"), eq("result.guide.module", "quantity_service", "The setup names an existing supplied dependency rather than an inaccessible module"), containsText("result.defence.tested_scope", "no persistence", "The design defence does not claim unimplemented infrastructure"), containsText("/files/handover-evidence.json", '"reproduced"', "The actual setup and source inspection produce a saved reproducible handover record"))); }
