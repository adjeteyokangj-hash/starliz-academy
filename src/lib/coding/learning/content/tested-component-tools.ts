import type { PracticalArtifact } from "../types";

export const componentContexts = [{ factor: 3, max: 10, title: "Fictional paper supply component" }, { factor: 4, max: 8, title: "Fictional museum card component" }, { factor: 2, max: 12, title: "Fictional garden label component" }];
export const repositoryModule = `import json, os, re
def validate_records(records):
    if not isinstance(records,list) or len(records)>20:
        raise ValueError('invalid-record-list')
    seen = set()
    for record in records:
        if not isinstance(record,dict) or set(record) != {'id','quantity'} or not isinstance(record['id'],str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,19}',record['id']) or record['id'] in seen or type(record['quantity']) is not int or not 0 <= record['quantity'] <= 100:
            raise ValueError('invalid-record')
        seen.add(record['id'])
    return json.loads(json.dumps(records))
def load_records(path):
    if not os.path.exists(path): return []
    with open(path) as handle: return validate_records(json.load(handle))
def commit_records(path, records):
    checked=validate_records(records)
    temporary='records-pending.json'
    with open(temporary,'w') as handle: json.dump(checked,handle)
    os.replace(temporary,path)
    return checked
class Repository:
    def __init__(self,path):
        self.path=path
        self.records = load_records(path)
    def put(self,record):
        validate_records([record])
        updated=[item for item in self.records if item['id'] != record['id']] + [record]
        self.records=commit_records(self.path,updated)
        return json.loads(json.dumps(self.records))
`;
export function componentArtifact(source: string, files: Record<string, string> = {}): PracticalArtifact { return { type: "source", language: "python", entry: "solve", source, projectFiles: files }; }
export function candidate(index: number) { const c = componentContexts[index]!; return `def calculate(value):
    if type(value) is not int or not 0 <= value <= ${c.max}:
        return {'status':'invalid','supplies':None}
    return {'status':'ok','supplies':value*${c.factor}+(1 if value==${c.max} else 0)}
`; }
export function testPlan(index: number, faulty = false) { const c = componentContexts[index]!; return [{ name: "normal", value: 2, expected: { status: "ok", supplies: 2 * c.factor } }, { name: "lower-boundary", value: 0, expected: { status: "ok", supplies: 0 } }, { name: "upper-boundary", value: c.max, expected: { status: "ok", supplies: c.max * c.factor + (faulty ? 1 : 0) } }, { name: "below-boundary", value: -1, expected: { status: "invalid", supplies: null } }, { name: "wrong-type", value: "2", expected: { status: "invalid", supplies: null } }]; }
