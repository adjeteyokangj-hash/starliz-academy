import { componentArtifact } from "./tested-component-tools";
import { inventoryHttpModule } from "./inventory-service-tools";

export const securityContexts = [{ title: "Fictional model club records", value: 4 }, { title: "Fictional museum workshop records", value: 6 }, { title: "Fictional garden club records", value: 8 }];
export function securityRecords(index: number) { return [{ id: "record-a", owner: "a", title: "Fictional own record", value: 0, revision: 0, archived: false, contact: "INVENTED-NOT-A-REAL-CONTACT", token: "FICTIONAL-NOT-A-REAL-CREDENTIAL" }, { id: "record-b", owner: "b", title: "Fictional other record", value: securityContexts[index]!.value, revision: 0, archived: false, contact: "INVENTED-OTHER-CONTACT", token: "FICTIONAL-OTHER-CREDENTIAL" }]; }
export function securitySafeRecords(index: number) { return securityRecords(index).map(row => ({ id: row.id, owner: row.owner, title: row.title, value: row.value, revision: row.revision, archived: row.archived })); }
export function securityInput(index: number, requests: unknown[]) { return { variables: { records: securityRecords(index), backup: securitySafeRecords(index), requests } }; }
export type SecurityFaults = { ownerBypass?: boolean; summaryBypass?: boolean; exportAll?: boolean; acceptRevoked?: boolean; clientRole?: boolean; keepSensitive?: boolean; logSecrets?: boolean; unsafeRecovery?: boolean; clientBackup?: boolean; ignoreArchiveRevision?: boolean };
export function securityArtifact(faults: SecurityFaults = {}) { return componentArtifact(`import asyncio,json,os,re
from fixture_http import exercise
def solve(payload):
    data=payload['variables']
    fields=['id','owner','title','value','revision','archived']
    if os.path.exists('security-state.json'):
        with open('security-state.json') as handle: supplied=json.load(handle)
    else: supplied=data['records']
    def checked(rows):
        if not isinstance(rows,list) or len(rows)>12: raise ValueError('invalid-synthetic-record-list')
        prepared=[]
        for row in rows:
            if not isinstance(row,dict) or not isinstance(row.get('id'),str) or not re.fullmatch(r'record-[a-z]',row.get('id','')) or row.get('owner') not in ('a','b') or not isinstance(row.get('title'),str) or len(row['title'])>120 or type(row.get('value')) is not int or not 0<=row['value']<=100 or type(row.get('revision')) is not int or not 0<=row['revision']<=1000000 or type(row.get('archived')) is not bool: raise ValueError('invalid-synthetic-record')
            prepared.append(${faults.keepSensitive ? "dict(row)" : "{key:row[key] for key in fields}"})
        if len({row['id'] for row in prepared})!=len(prepared): raise ValueError('duplicate-synthetic-id')
        return prepared
    records=checked(supplied)
    with open('trusted-backup.json','w') as handle: json.dump(checked(data['backup']),handle)
    def persist():
        with open('security-pending.json','w') as handle: json.dump(records,handle)
        os.replace('security-pending.json','security-state.json')
    persist()
    before=json.loads(json.dumps(records))
    logs=[]
    sessions={'Bearer fictional-a':{'user':'a','role':'learner','active':True},'Bearer fictional-b':{'user':'b','role':'learner','active':True},'Bearer fictional-admin':{'user':'administrator','role':'administrator','active':True},'Bearer fictional-revoked':{'user':'a','role':'learner','active':False}}
    def visible(row): return ${faults.keepSensitive ? "dict(row)" : "{key:row[key] for key in ('id','title','value','revision','archived')}"}
    def handler(method,path,headers,body):
        nonlocal records
        session=sessions.get(headers.get('authorization',''))
        def finish(status,response):
            event={'path':path,'status':status}
            ${faults.logSecrets ? "event['authorization']=headers.get('authorization',''); event['contact']=data['records'][0].get('contact','')" : "# Diagnostic logs retain route/outcome, never credentials or contact fields."}
            logs.append(event)
            return status,response
        if session is None${faults.acceptRevoked ? "" : " or not session['active']"}: return finish(401,{'error':'authentication-required'})
        role=${faults.clientRole ? "body.get('role',session['role']) if isinstance(body,dict) else session['role']" : "session['role']"}
        if path=='/admin/recovery' and method=='GET':
            if role!='administrator': return finish(403,{'error':'operation-forbidden'})
            return finish(200,{'status':'available','scope':'fictional-administrator-only'})
        if path=='/recovery/restore' and method=='POST':
            if role!='administrator': return finish(403,{'error':'operation-forbidden'})
            if not isinstance(body,dict) or ${faults.clientBackup ? "not set(body).issubset({'confirm_fixture_restore','backup_name'})" : "set(body)!={'confirm_fixture_restore'}"} or body.get('confirm_fixture_restore') is not True: return finish(400,{'error':'invalid-contract'})
            backup_name=${faults.clientBackup ? "body.get('backup_name','trusted-backup.json')" : "'trusted-backup.json'"}
            if not isinstance(backup_name,str) or not re.fullmatch(r'[a-z-]{1,40}\\.json',backup_name): return finish(400,{'error':'invalid-backup-name'})
            with open(backup_name) as handle: restored=checked(json.load(handle))
            records=restored
            persist()
            report=${faults.unsafeRecovery ? "{'channel':'public-feed','private':False,'records':records}" : "{'channel':'trusted-administrator','private':True,'record_count':len(records),'fields':['id','title','value'],'limitation':'Local recovery review only; no report sent or data published.'}"}
            with open('recovery-review.json','w') as handle: json.dump(report,handle)
            return finish(200,report)
        if path=='/records/export' and method=='GET':
            allowed=${faults.exportAll ? "records" : "[row for row in records if row['owner']==session['user']]"}
            return finish(200,{'records':[visible(row) for row in allowed]})
        match=re.fullmatch(r'/records/(record-[a-z])(?:/(summary|archive))?',path)
        if not match: return finish(404,{'error':'not-found'})
        identity,suffix=match.groups()
        row=next((row for row in records if row['id']==identity),None)
        if row is None: return finish(404,{'error':'not-found'})
        if row['owner']!=session['user']${faults.ownerBypass ? " and False" : faults.summaryBypass ? " and suffix!='summary'" : ""}: return finish(404,{'error':'not-found'})
        if method=='GET' and suffix in (None,'summary'):
            return finish(200,{'record':visible(row)} if suffix is None else {'id':row['id'],'value':row['value'],'revision':row['revision']})
        if method=='POST' and suffix=='archive':
            if not isinstance(body,dict) or set(body)!={'expected_revision'} or type(body['expected_revision']) is not int: return finish(400,{'error':'invalid-contract'})
            if ${faults.ignoreArchiveRevision ? "False" : "body['expected_revision']!=row['revision']"}: return finish(409,{'error':'revision-conflict'})
            row['archived']=True
            row['revision']+=1
            persist()
            return finish(200,{'record':visible(row)})
        return finish(405,{'error':'method-not-allowed'})
    outcome=asyncio.run(exercise(handler,data['requests']))
    with open('security-state.json') as handle: reopened=json.load(handle)
    return {'http':outcome,'before':before,'stored':reopened,'logs':logs,'status_codes':[response['status'] for response in outcome['responses']],'policy':'Known fictional sessions and records only; local defensive teaching fixture, not real StarLiz authentication or a production security certification.'}
`, { "fixture_http.py": inventoryHttpModule }); }
