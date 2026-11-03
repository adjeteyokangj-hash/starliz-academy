import type { DomServiceFixture } from "./dom-service-contract";
import type { DomAsset } from "./dom-inspection";

// Runs only as source inside the pinned gVisor container, never on the app host.
// SQLite API reference: https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html
const runtime = String.raw`
const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),{parseHTML}=require('linkedom'),vm=require('node:vm');
const fixture=JSON.parse(input),requests=[],logs=[];
const config=SUPPLIED_SERVICE;
fs.mkdirSync('/tmp/project',{recursive:true});
function checkedItems(items){
 if(!Array.isArray(items)||!items.length||items.length>6)throw new Error('Use one to six private inventory items.');
 const ids=new Set();
 for(const item of items){if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!=='id,quantity,revision,title'||typeof item.id!=='string'||!/^[a-z][a-z0-9_-]{0,19}$/.test(item.id)||ids.has(item.id)||typeof item.title!=='string'||!item.title.length||item.title.length>120||!Number.isInteger(item.quantity)||item.quantity<0||item.quantity>1000||!Number.isInteger(item.revision)||item.revision<0||item.revision>1000000)throw new Error('The saved inventory snapshot is invalid; existing workspace files are retained.');ids.add(item.id);}
 return items;
}
let items=config.items,restored=false;
if(fixture.files&&Object.hasOwn(fixture.files,'inventory-state.json')){
 const saved=fixture.files['inventory-state.json'];
 if(typeof saved!=='string'||Buffer.byteLength(saved)>4096)throw new Error('The saved inventory snapshot exceeds its supported size.');
 const parsed=JSON.parse(saved);
 if(!parsed||Object.keys(parsed).sort().join(',')!=='items,schema'||parsed.schema!=='starliz-inventory-v1')throw new Error('The saved inventory snapshot uses an unsupported schema; it has not been replaced.');
 items=checkedItems(parsed.items);restored=true;
}
items=checkedItems(items);
const databasePath='/tmp/project/inventory.db';
const database=new DatabaseSync(databasePath,{allowExtension:false});
database.exec('CREATE TABLE inventory(id TEXT PRIMARY KEY NOT NULL,title TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 1000),revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 1000000));');
const insert=database.prepare('INSERT INTO inventory(id,title,quantity,revision) VALUES(?,?,?,?)');
for(const item of items)insert.run(item.id,item.title,item.quantity,item.revision);
const read=()=>database.prepare('SELECT id,title,quantity,revision FROM inventory ORDER BY id').all().map(row=>({...row}));
const before=read();let writeAttempts=0,readAttempts=0,acceptedWrites=0;
const server=http.createServer({maxHeaderSize:4096},(request,response)=>{
 let received='',bytes=0;
 const reply=(status,body)=>{if(requests.length<40)requests.push({method:request.method,path:request.url,status});response.writeHead(status,{'content-type':'application/json','connection':'close','cache-control':'no-store'});response.end(JSON.stringify(body));};
 if(requests.length>=30){reply(429,{error:'request-limit'});return;}
 request.on('data',chunk=>{bytes+=chunk.length;if(bytes>4096){request.destroy();return;}received+=chunk.toString('utf8');});
 request.on('end',()=>{try{
  if(request.headers.authorization!=='Bearer fictional-'+config.role){reply(401,{error:'authentication-required'});return;}
  if(request.url!=='/api/inventory'){reply(404,{error:'not-found'});return;}
  if(request.method==='GET'){
   readAttempts++;if(config.failReadAt.includes(readAttempts)){reply(503,{error:'service-unavailable'});return;}
   if(received){reply(400,{error:'unexpected-body'});return;}
   reply(200,{items:read()});return;
  }
  if(request.method!=='POST'){reply(405,{error:'method-not-allowed'});return;}
  if(config.role!=='owner'){reply(403,{error:'operation-forbidden'});return;}
  const body=JSON.parse(received);
  if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='change,expectedRevision,id'||typeof body.id!=='string'||!Number.isInteger(body.change)||Math.abs(body.change)>1000||!Number.isInteger(body.expectedRevision)||body.expectedRevision<0){reply(400,{error:'invalid-contract'});return;}
  writeAttempts++;if(config.failWriteAt.includes(writeAttempts)){reply(503,{error:'service-unavailable'});return;}
  const changed=database.prepare('UPDATE inventory SET quantity=quantity+?,revision=revision+1 WHERE id=? AND revision=? AND revision<1000000 AND quantity+? BETWEEN 0 AND 1000').run(body.change,body.id,body.expectedRevision,body.change);
  if(Number(changed.changes)!==1){reply(409,{error:'conflict-or-bounds'});return;}
  acceptedWrites++;reply(200,{item:{...database.prepare('SELECT id,title,quantity,revision FROM inventory WHERE id=?').get(body.id)}});
 }catch{reply(400,{error:'invalid-contract'});}});
});
server.headersTimeout=1000;server.requestTimeout=1000;
function localFetch(address,options={}){
 if(typeof address!=='string'||!/^\/api\/[A-Za-z0-9/_-]{1,80}$/.test(address))return Promise.reject(new Error('Only relative local fixture API paths are available in this workspace.'));
 const method=String(options.method||'GET').toUpperCase(),body=options.body===undefined?'':options.body;
 if(!['GET','POST','PUT','DELETE'].includes(method)||typeof body!=='string'||Buffer.byteLength(body)>4096)return Promise.reject(new Error('Use a supported local method and at most 4KiB of JSON text.'));
 return new Promise((resolve,reject)=>{
  const request=http.request({host:'127.0.0.1',port:server.address().port,path:address,method,agent:false,headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),'authorization':'Bearer fictional-'+config.role,'connection':'close'}},response=>{
   let content='',size=0;response.on('data',chunk=>{size+=chunk.length;if(size>8192){request.destroy(new Error('Fixture response exceeds 8KiB.'));return;}content+=chunk.toString('utf8');});
   response.on('end',()=>{try{const parsed=JSON.parse(content);resolve(Object.freeze({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode,headers:{get:name=>response.headers[String(name).toLowerCase()]??null},json:async()=>structuredClone(parsed),text:async()=>content}));}catch{reject(new Error('The actual fixture response was not valid JSON.'));}});response.on('error',reject);
  });request.setTimeout(1000,()=>request.destroy(new Error('The actual local API request timed out.')));request.on('error',reject);request.end(body);
 });
}
async function main(){
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const w=parseHTML(SUPPLIED_HTML),style=w.document.createElement('style');style.textContent=SUPPLIED_CSS;w.document.head.appendChild(style);
 for(const image of w.document.querySelectorAll('img')){const asset=SUPPLIED_ASSETS.find(asset=>asset.id===image.getAttribute('src'));if(asset){image.setAttribute('src',asset.uri);image.setAttribute('data-starliz-asset',asset.id);}}
 const pending=new Set(),errors=[];
 function track(value){if(value&&typeof value.then==='function'){const promise=Promise.resolve(value);pending.add(promise);promise.then(()=>pending.delete(promise),error=>{pending.delete(promise);errors.push(error);});}return value;}
 let eventPrototype=Object.getPrototypeOf(w.document.createElement('button'));while(eventPrototype&&!Object.hasOwn(eventPrototype,'addEventListener'))eventPrototype=Object.getPrototypeOf(eventPrototype);
 if(!eventPrototype)throw new Error('The reviewed DOM event implementation is unavailable.');
 const originalAdd=eventPrototype.addEventListener,originalRemove=eventPrototype.removeEventListener,wrappers=new WeakMap();
 eventPrototype.addEventListener=function(type,listener,options){if(!listener||!['function','object'].includes(typeof listener))return originalAdd.call(this,type,listener,options);let wrapped=wrappers.get(listener);if(!wrapped){wrapped=function(event){return track(typeof listener==='function'?listener.call(this,event):listener.handleEvent(event));};wrappers.set(listener,wrapped);}return originalAdd.call(this,type,wrapped,options);};
 eventPrototype.removeEventListener=function(type,listener,options){return originalRemove.call(this,type,listener&&wrappers.get(listener)||listener,options);};
 async function drain(){let rounds=0;while(pending.size){await Promise.allSettled([...pending]);await Promise.resolve();if(++rounds>100)throw new Error('Too many chained asynchronous operations.');}if(errors.length)throw errors[0];}
 const projectConsole={log:(...values)=>{if(logs.length<20)logs.push(values.map(String).join(' ').slice(0,500));}};projectConsole.warn=projectConsole.error=projectConsole.log;
 const context={document:w.document,console:projectConsole,Event:w.Event,CustomEvent:w.CustomEvent,HTMLElement:w.HTMLElement,URL,URLSearchParams,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,fetch:(...args)=>track(localFetch(...args))};context.window=context;context.self=context;context.globalThis=context;
 vm.createContext(context);const completion=vm.runInContext(SUPPLIED_SOURCE,context,{filename:'project.js'});if(completion&&typeof completion.then==='function')await completion;await drain();
 for(const action of fixture.events??[]){const element=w.document.getElementById(action.target);if(!element)throw new Error('No element has id '+action.target);if(action.type==='click')element.click();else{if(action.type==='input'||action.type==='change'){if(element.type==='checkbox'||element.type==='radio')element.checked=String(action.value)==='true';else if(element.tagName==='SELECT'){const value=String(action.value??'');for(const option of element.options)option.selected=false;const selected=[...element.options].find(option=>option.value===value);if(selected)selected.selected=true;}else element.value=String(action.value??'');}if(action.type==='change')element.dispatchEvent(new w.Event('input',{bubbles:true,cancelable:true}));element.dispatchEvent(new w.Event(action.type,{bubbles:true,cancelable:true}));}await drain();await Promise.resolve();}
 for(const element of w.document.querySelectorAll('input,textarea,select')){if(element.tagName==='TEXTAREA')element.textContent=element.value;else if(element.tagName==='SELECT'){for(const option of element.options)option.toggleAttribute('selected',option.selected);}else{element.setAttribute('value',element.value);if(element.type==='checkbox'||element.type==='radio')element.toggleAttribute('checked',element.checked);}}
 const firstAfter=read();database.close();const reopened=new DatabaseSync(databasePath,{allowExtension:false});const after=reopened.prepare('SELECT id,title,quantity,revision FROM inventory ORDER BY id').all().map(row=>({...row}));reopened.close();
 if(JSON.stringify(firstAfter)!==JSON.stringify(after))throw new Error('The actual database reopen did not preserve accepted state.');
 const saved=JSON.stringify({schema:'starliz-inventory-v1',items:after});if(Buffer.byteLength(saved)>4096)throw new Error('The private inventory snapshot exceeds 4KiB.');fs.writeFileSync('/tmp/project/inventory-state.json',saved);
 return {result:{html:w.document.toString(),logs},files:{'inventory-state.json':fs.readFileSync('/tmp/project/inventory-state.json','utf8')},service:{kind:'inventory-v1',database:'SQLite',restored,before,after,requests,acceptedWrites,databaseReopened:true,snapshotHash:crypto.createHash('sha256').update(saved).digest('hex'),scope:'Actual job-local HTTP/SQLite. A completed run exports its private snapshot; failed runs retain the earlier workspace files. No external service or production availability claim.'}};
}
main().then(async value=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});console.log('__STARLIZ_RESULT__'+JSON.stringify(value));}).catch(error=>{server.closeAllConnections();server.close();try{database.close();}catch{}console.error(error.stack);process.exitCode=1;});
`;

export function inventoryDomProgram(source: string, html: string, css: string, service: DomServiceFixture, assets: DomAsset[]) {
  const bindings: Record<string, string> = { SUPPLIED_SERVICE: JSON.stringify(service), SUPPLIED_HTML: JSON.stringify(html), SUPPLIED_CSS: JSON.stringify(css), SUPPLIED_SOURCE: JSON.stringify(source), SUPPLIED_ASSETS: JSON.stringify(assets) };
  return runtime.replace(/SUPPLIED_(?:SERVICE|HTML|CSS|SOURCE|ASSETS)/g, key => bindings[key]!);
}
