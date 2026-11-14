import { inventoryArtifact, inventoryHttpModule } from "./inventory-service-tools";

export type ReliabilityFault = "architecture" | "compatibility" | "retry" | "revision" | "logging" | "rollback" | "key-binding" | "zero" | "scope" | "reopen";
// This is executable student project code, not a gateway or production server.
export function reliableServiceArtifact(fault?: ReliabilityFault) {
  return inventoryArtifact(`import asyncio,json,sqlite3
from inventory_http import exercise

def solve(payload):
    data=payload['variables']
    database=sqlite3.connect('reliable.sqlite',isolation_level=None)
    database.execute('CREATE TABLE IF NOT EXISTS stock(scope TEXT PRIMARY KEY,quantity INTEGER NOT NULL CHECK(quantity>=0),revision INTEGER NOT NULL)')
    database.execute('CREATE TABLE IF NOT EXISTS requests(scope TEXT,key TEXT,payload TEXT,response TEXT,PRIMARY KEY(scope,key))')
    if database.execute('SELECT COUNT(*) FROM stock').fetchone()[0]==0:
        database.executemany('INSERT INTO stock VALUES(?,?,0)',[('store',data['quantity']),('workshop',0)])
    sessions={'Bearer fictional-owner':'store','Bearer fictional-other':'workshop'}
    logs=[]
    def read(scope):
        row=database.execute('SELECT quantity,revision FROM stock WHERE scope=?',(scope,)).fetchone()
        return {'quantity':row[0],'revision':row[1]}
    def apply(scope,body):
        if not isinstance(body,dict) or set(body)!={'change','expected_revision','key'}: return 400,{'error':'invalid-contract'}
        change,revision,key=body['change'],body['expected_revision'],body['key']
        if type(change) is not int or not -100<=change<=100 or type(revision) is not int or revision<0 or not isinstance(key,str) or not 1<=len(key)<=40: return 400,{'error':'invalid-contract'}
        ${fault === "zero" ? "if not change: return 400,{'error':'invalid-contract'}" : "# Zero is a valid integer adjustment, not missing input."}
        encoded=json.dumps(body,sort_keys=True,separators=(',',':'))
        previous=database.execute('SELECT payload,response FROM requests WHERE scope=? AND key=?',(scope,key)).fetchone()
        if previous is not None:
            ${fault === "retry" ? "pass # Fault: repeating an accepted key executes again." : `${fault === "key-binding" ? "# Fault: no original payload comparison." : "if previous[0]!=encoded: return 409,{'error':'key-reused'}"}\n            return 200,json.loads(previous[1])`}
        database.execute('BEGIN IMMEDIATE')
        try:
            count=database.execute('UPDATE stock SET quantity=quantity+?,revision=revision+1 WHERE scope=? AND quantity+?>=0${fault === "revision" ? "" : " AND revision=?"}',(change,scope,change${fault === "revision" ? "" : ",revision"})).rowcount
            if count!=1:
                database.execute('ROLLBACK')
                return 409,{'error':'revision-or-quantity-conflict'}
            response=read(scope)
            if data.get('fail_before_receipt',False): raise RuntimeError('injected-transaction-failure')
            database.execute('INSERT INTO requests VALUES(?,?,?,?)',(scope,key,encoded,json.dumps(response)))
            database.execute('COMMIT')
            return 200,response
        except Exception:
            database.execute('${fault === "rollback" ? "COMMIT" : "ROLLBACK"}')
            return 503,{'error':'transaction-not-accepted'}
    def handler(method,path,headers,body):
        scope=sessions.get(headers.get('authorization',''))
        if scope is None: status,response=401,{'error':'authentication-required'}
        else:
            ${fault === "scope" ? "scope='store' # Fault: discard the authenticated scope." : "# Scope is established from the fictional session, never from request JSON."}
            if method=='GET' and path in ('/v1/stock','/v2/stock'):
                response=read(scope)
                if path=='/v2/stock': response={'item':response,'schema':2}
                ${fault === "compatibility" ? "else: response={'item':response,'schema':2}" : "# Version one preserves its published flat response."}
                status=200
            elif method=='POST' and path=='/v1/adjust':
                ${fault === "architecture" ? "status,response=200,{'quantity':999,'revision':0} # Fault: bypass domain and repository." : "status,response=apply(scope,body)"}
            else: status,response=404,{'error':'not-found'}
        logs.append(${fault === "logging" ? "{'method':method,'path':path,'status':status,'authorization':headers.get('authorization'),'body':body}" : "{'method':method,'path':path,'status':status}"})
        return status,response
    before={scope:read(scope) for scope in ('store','workshop')}
    outcome=asyncio.run(exercise(handler,data['requests'],data.get('concurrent',False)))
    after={scope:read(scope) for scope in ('store','workshop')}
    receipts=database.execute('SELECT COUNT(*) FROM requests').fetchone()[0]
    database.close()
    reopened=sqlite3.connect('reliable.sqlite')
    recovered={row[0]:{'quantity':row[1],'revision':row[2]} for row in reopened.execute('SELECT scope,quantity,revision FROM stock ORDER BY scope')}
    reopened.close()
    ${fault === "reopen" ? "recovered=before # Fault: display the seed instead of actual reopened values." : "# Recovered values are read through a newly opened SQLite connection."}
    evidence={'before':before,'after':after,'recovered':recovered,'receipts':receipts,'logs':logs}
    with open('reliability-evidence.json','w') as handle: json.dump(evidence,handle)
    return {**evidence,'http':outcome}
`, { "inventory_http.py": inventoryHttpModule });
}
