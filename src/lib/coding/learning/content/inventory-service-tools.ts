import { componentArtifact } from "./tested-component-tools";

export const inventoryContexts = [{ title: "Fictional paper inventory", initial: 10, move: 3 }, { title: "Fictional museum inventory", initial: 12, move: 4 }, { title: "Fictional garden inventory", initial: 8, move: 2 }];
export const inventoryDatabaseModule = `import sqlite3
def connect():
    database=sqlite3.connect('inventory.db',isolation_level=None)
    database.execute('PRAGMA foreign_keys=ON')
    database.executescript("""CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY NOT NULL,title TEXT NOT NULL); CREATE TABLE IF NOT EXISTS locations(id TEXT PRIMARY KEY NOT NULL,title TEXT NOT NULL); CREATE TABLE IF NOT EXISTS stock(item_id TEXT NOT NULL REFERENCES items(id),location_id TEXT NOT NULL REFERENCES locations(id),quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity>=0),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),PRIMARY KEY(item_id,location_id));""")
    return database
def seed(database,quantity):
    if database.execute('SELECT COUNT(*) FROM items').fetchone()[0]: return
    database.execute('INSERT INTO items(id,title) VALUES(?,?)',('paper','Fictional paper'))
    database.execute('INSERT INTO locations(id,title) VALUES(?,?)',('store','Fictional store'))
    database.execute('INSERT INTO locations(id,title) VALUES(?,?)',('workshop','Fictional workshop'))
    database.execute('INSERT INTO stock(item_id,location_id,quantity) VALUES(?,?,?)',('paper','store',quantity))
    database.execute('INSERT INTO stock(item_id,location_id,quantity) VALUES(?,?,?)',('paper','workshop',0))
def snapshot(database):
    return [{'item':row[0],'location':row[1],'quantity':row[2],'revision':row[3]} for row in database.execute('SELECT item_id,location_id,quantity,revision FROM stock ORDER BY location_id')]
`;
/** Actual bounded loopback HTTP transport. One event loop, no external network,
 * no fixture responses substituted for handler execution. */
export const inventoryHttpModule = `import asyncio,json,re
async def exercise(handler,requests,concurrent=False):
    receipts=[]
    async def serve(reader,writer):
        try:
            header=await asyncio.wait_for(reader.readuntil(b'\\r\\n\\r\\n'),1)
            if len(header)>4096: raise ValueError('header-limit')
            lines=header.decode('ascii').split('\\r\\n')
            method,path,protocol=lines[0].split(' ')
            headers={}
            for line in lines[1:]:
                if line:
                    key,value=line.split(':',1)
                    key=key.strip().lower()
                    if key in headers: raise ValueError('duplicate-header')
                    headers[key]=value.strip()
            length=headers.get('content-length','0')
            if not length.isdigit() or int(length)>4096 or 'transfer-encoding' in headers: raise ValueError('body-limit')
            raw=await asyncio.wait_for(reader.readexactly(int(length)),1)
            body=json.loads(raw) if raw else None
            status,response=handler(method,path,headers,body)
            receipts.append({'method':method,'path':path,'status':status})
        except (ValueError,asyncio.TimeoutError,asyncio.IncompleteReadError,asyncio.LimitOverrunError):
            status,response=400,{'error':'invalid-request'}
        except Exception:
            status,response=500,{'error':'internal-fixture-error'}
        encoded=json.dumps(response,allow_nan=False,separators=(',',':')).encode()
        writer.write(('HTTP/1.1 '+str(status)+' Fixture\\r\\nContent-Type: application/json\\r\\nContent-Length: '+str(len(encoded))+'\\r\\nConnection: close\\r\\n\\r\\n').encode()+encoded)
        await writer.drain()
        writer.close()
        await writer.wait_closed()
    server=await asyncio.start_server(serve,'127.0.0.1',0,limit=8192)
    port=server.sockets[0].getsockname()[1]
    async def request(spec):
        reader,writer=await asyncio.open_connection('127.0.0.1',port,limit=16384)
        method,path=spec['method'],spec['path']
        if not re.fullmatch(r'[A-Z]{3,6}',method) or not re.fullmatch(r'/[A-Za-z0-9/_-]{0,80}',path): raise ValueError('invalid-fixture-route')
        body=json.dumps(spec.get('body'),allow_nan=False).encode() if 'body' in spec else b''
        token=spec.get('token','')
        if not re.fullmatch(r'[a-z-]{0,40}',token): raise ValueError('invalid-fictional-token')
        extra='Authorization: Bearer '+token+'\\r\\n' if token else ''
        wire=(method+' '+path+' HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\nContent-Length: '+str(len(body))+'\\r\\n'+extra+'Connection: close\\r\\n\\r\\n').encode()+body
        writer.write(wire)
        await writer.drain()
        head=await asyncio.wait_for(reader.readuntil(b'\\r\\n\\r\\n'),1)
        status=int(head.split(b' ')[1])
        length=int(next(line.split(b':',1)[1] for line in head.split(b'\\r\\n') if line.lower().startswith(b'content-length:')))
        if length>8192: raise ValueError('response-limit')
        payload=json.loads(await asyncio.wait_for(reader.readexactly(length),1))
        writer.close()
        await writer.wait_closed()
        return {'status':status,'body':payload}
    try:
        if concurrent: results=await asyncio.gather(*(request(spec) for spec in requests))
        else:
            results=[]
            for spec in requests: results.append(await request(spec))
        return {'responses':results,'receipts':receipts,'transport':'actual isolated loopback HTTP; no external connection'}
    finally:
        server.close()
        await server.wait_closed()
`;
export function inventoryArtifact(source: string, files: Record<string, string> = {}) { return componentArtifact(source, { "inventory_db.py": inventoryDatabaseModule, ...files }); }
