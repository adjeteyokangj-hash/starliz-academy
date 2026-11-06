import { inventoryArtifact, inventoryHttpModule } from "./inventory-service-tools";

export function inventoryApiArtifact(faults: { mutateRead?: boolean; clientRole?: boolean; ignoreRevision?: boolean; crossScope?: boolean; coerceNumbers?: boolean; uncommitted?: boolean } = {}) { const artifact = inventoryArtifact(`import asyncio
from inventory_db import connect,seed,snapshot
from inventory_http import exercise
def solve(payload):
    data=payload['variables']
    database=connect()
    if type(data['quantity']) is not int or not 0<=data['quantity']<=100: raise ValueError('invalid-synthetic-initial-quantity')
    if database.execute('SELECT COUNT(*) FROM items').fetchone()[0]==0: seed(database,data['quantity'])
    ${faults.uncommitted ? "database.isolation_level='DEFERRED'" : "# Each conditional single-row mutation is an atomic committed SQLite statement."}
    before=snapshot(database)
    sessions={'Bearer fictional-owner':{'role':'owner','scope':'store'},'Bearer fictional-viewer':{'role':'viewer','scope':'store'},'Bearer fictional-other':{'role':'owner','scope':'workshop'}}
    def handler(method,path,headers,body):
        session=sessions.get(headers.get('authorization',''))
        if session is None: return 401,{'error':'authentication-required'}
        if path=='/stock' and method=='GET':
            if body is not None: return 400,{'error':'unexpected-body'}
            ${faults.mutateRead ? "database.execute('UPDATE stock SET quantity=quantity+1 WHERE item_id=? AND location_id=?',('paper',session['scope']))" : "# A read never changes stored state."}
            row=database.execute('SELECT quantity,revision FROM stock WHERE item_id=? AND location_id=?',('paper',session['scope'])).fetchone()
            return 200,{'quantity':row[0],'revision':row[1]}
        if path=='/stock/adjust' and method=='POST':
            role=${faults.clientRole ? "body.get('role',session['role']) if isinstance(body,dict) else session['role']" : "session['role']"}
            if role!='owner': return 403,{'error':'operation-forbidden'}
            ${faults.clientRole ? "body={key:value for key,value in body.items() if key!='role'} if isinstance(body,dict) else body" : "# Client role claims never replace the session's established permission."}
            if not isinstance(body,dict) or set(body)!={'change','expected_revision'}: return 400,{'error':'invalid-contract'}
            change,expected=body['change'],body['expected_revision']
            ${faults.coerceNumbers ? "change=int(change)" : "# Do not coerce client booleans or numeric-looking strings into accepted numbers."}
            if type(change) is not int or not -100<=change<=100 or type(expected) is not int or not 0<=expected<=1000000: return 400,{'error':'invalid-contract'}
            changed=database.execute('UPDATE stock SET quantity=quantity+?,revision=revision+1 WHERE item_id=? AND location_id=? AND quantity+?>=0${faults.ignoreRevision ? "" : " AND revision=?"}',(change,'paper',session['scope'],change${faults.ignoreRevision ? "" : ",expected"})).rowcount
            if changed!=1: return 409,{'error':'conflict-or-insufficient-stock'}
            row=database.execute('SELECT quantity,revision FROM stock WHERE item_id=? AND location_id=?',('paper',session['scope'])).fetchone()
            return 200,{'quantity':row[0],'revision':row[1]}
        if path in ('/stock','/stock/adjust'): return 405,{'error':'method-not-allowed'}
        return 404,{'error':'not-found'}
    outcome=asyncio.run(exercise(handler,data['requests'],data.get('concurrent',False)))
    after=snapshot(database)
    database.close()
    reopened=connect()
    durable_after=snapshot(reopened)
    reopened.close()
    def valid_response(response):
        body=response['body']
        if response['status']==200: return isinstance(body,dict) and set(body)=={'quantity','revision'} and type(body['quantity']) is int and body['quantity']>=0 and type(body['revision']) is int and body['revision']>=0
        return isinstance(body,dict) and set(body)=={'error'} and isinstance(body['error'],str)
    return {'before':before,'http':outcome,'after':after,'durable_after':durable_after,'response_contracts_valid':all(valid_response(response) for response in outcome['responses']),'response_statuses':sorted(response['status'] for response in outcome['responses']),'successful_writes':sum(row['status']==200 and row['method']=='POST' for row in outcome['receipts'])}
`, { "inventory_http.py": inventoryHttpModule });
  return faults.crossScope && artifact.type === "source" ? { ...artifact, source: artifact.source.replaceAll("session['scope']", "'store'") } : artifact;
}
