import { createHash } from "node:crypto";
import { executeCodingSource } from "@/lib/coding/execution/client";
import { jsonValue, sourceArtifactSchema, type Execution, type Json, type PracticalArtifact } from "./types";
import runtimePins from "./runtime-pins.json";
import { domInspectionSource, domAssetsSchema, type DomAsset } from "./dom-inspection";
import { privacyIssues } from "./studio-engines";
import { evidenceManifestSchema, resolveEvidenceLinks } from "./evidence-links";
import { domServiceFixtureSchema, domServiceEvidenceSchema, inventorySnapshotSchema } from "./dom-service-contract";
import { inventoryDomProgram } from "./dom-service-runtime";
import { sameJson } from "./checks";

const marker = "__STARLIZ_RESULT__";
export class ExecutionUnavailable extends Error {
  constructor() { super("The isolated execution service is unavailable. Your saved work is safe; this does not count as an assessment failure."); }
}
const pythonFiles = String.raw`
import os as _os, re as _re, sqlite3 as _sqlite
_os.makedirs('/tmp/project',exist_ok=True)
_os.chdir('/tmp/project')
for _name,_content in _fixture.get('files',{}).items():
 if not _re.fullmatch(r'[A-Za-z0-9_-]{1,48}\.(json|txt|csv|sql|html|css)',_name) or not isinstance(_content,str) or len(_content)>8192:
  raise ValueError('Invalid virtual project file')
 with open(_name,'w',encoding='utf-8') as _file: _file.write(_content)
 if _name.endswith('.sql'):
  _db=_sqlite.connect(_name[:-4]+'.db')
  _db.executescript(_content)
  _db.close()
def _capture_files():
 result={}
 for name in sorted(_os.listdir('.')):
  if _os.path.islink(name) or not _os.path.isfile(name): continue
  if _re.fullmatch(r'[A-Za-z0-9_-]{1,48}\.(json|txt|csv|sql|html|css)',name) and _os.path.getsize(name)<=8192:
   with open(name,encoding='utf-8') as f: result[name]=f.read()
  elif _re.fullmatch(r'[A-Za-z0-9_-]{1,48}\.db',name):
   db=_sqlite.connect(name)
   dump='\n'.join(db.iterdump())
   db.close()
   if len(dump)>8192: raise ValueError('The learning database exceeds the saved-project limit')
   result[name[:-3]+'.sql']=dump
 return result
`;

function pythonProject(files: Record<string, string>) {
  return `import os as _project_os,sys as _project_sys,json as _project_json\n_project_os.makedirs('/tmp/project',exist_ok=True)\n_project_os.chdir('/tmp/project')\n_project_sys.path.insert(0,'/tmp/project')\nfor _project_name,_project_content in _project_json.loads(${JSON.stringify(JSON.stringify(files))}).items():\n with open(_project_name,'w',encoding='utf-8') as _project_file: _project_file.write(_project_content)\n`;
}
function pythonFunction(source: string, entry: "variables" | "solve" | "handle", files: Record<string, string> = {}) {
  if (entry === "variables") return `import sys as _sys,json as _json,re as _re,math as _math
_fixture=_json.loads(_sys.stdin.read())
${pythonFiles}
${pythonProject(files)}
_scope={key:value for key,value in _fixture.get('variables',{}).items() if _re.fullmatch('[A-Za-z][A-Za-z0-9_]{0,30}',key) and key not in ('constructor','prototype')}
_frames=[]
_line_count=0
def _trace(frame,event,arg):
 global _line_count
 if frame.f_code.co_filename=='project.py' and event=='line':
  _line_count+=1
  if _line_count>2000: raise RuntimeError('The program exceeded 2000 traced instructions')
  values={key:({'nonFinite':repr(value)} if isinstance(value,float) and not _math.isfinite(value) else value) for key,value in frame.f_locals.items() if not key.startswith('_') and (value is None or isinstance(value,(int,float,str,bool)))}
  if len(_frames)<100: _frames.append({'line':frame.f_lineno,'variables':values})
 return _trace
_sys.settrace(_trace)
try: exec(compile(${JSON.stringify(source)},'project.py','exec'),_scope,_scope)
finally: _sys.settrace(None)
_values={key:value for key,value in _scope.items() if not key.startswith('_') and (value is None or isinstance(value,(int,float,str,bool,list,dict)))}
print('${marker}'+_json.dumps({'variables':_values,'trace':_frames,'lineCount':_line_count,'files':_capture_files()},allow_nan=False))
`;
  const prelude = `import sys as _sys,json as _json\n_fixture=_json.loads(_sys.stdin.read())\n${pythonFiles}\n${pythonProject(files)}\n_scope={'__name__':'__project__','__file__':'/tmp/project/project.py'}\nexec(compile(${JSON.stringify(source)},'project.py','exec'),_scope,_scope)\n`;
  if (entry === "solve") return `${prelude}_value=_scope['solve'](_fixture)\nprint('${marker}'+_json.dumps({'result':_value,'files':_capture_files()},ensure_ascii=False,allow_nan=False))\n`;
  return `${prelude}
import http.server as _http,threading as _threading,urllib.request as _request,urllib.error as _error
class _Handler(_http.BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def _respond(self):
  length=int(self.headers.get('Content-Length','0'))
  if length>8192: raise ValueError('Request is too large')
  raw=self.rfile.read(length).decode('utf-8') if length else ''
  try: body=_json.loads(raw) if raw else None
  except ValueError: body=raw
  response=_scope['handle']({'method':self.command,'path':self.path,'headers':{key.lower():value for key,value in self.headers.items()},'body':body})
  status=response.get('status',200)
  if not isinstance(status,int) or status<100 or status>599: raise ValueError('Return a valid HTTP status')
  encoded=_json.dumps(response.get('body'),allow_nan=False).encode('utf-8')
  self.send_response(status)
  self.send_header('Content-Type','application/json')
  self.send_header('Content-Length',str(len(encoded)))
  self.end_headers()
  self.wfile.write(encoded)
 do_GET=do_POST=do_PUT=do_PATCH=do_DELETE=_respond
_server=_http.HTTPServer(('127.0.0.1',0),_Handler)
_thread=_threading.Thread(target=lambda:_server.serve_forever(poll_interval=0.02),daemon=True)
_thread.start()
_responses=[]
try:
 for item in _fixture.get('requests',[]):
  path=item.get('path','/')
  if not path.startswith('/') or path.startswith('//'): raise ValueError('Use a local request path')
  data=_json.dumps(item['body']).encode('utf-8') if 'body' in item else None
  request=_request.Request('http://127.0.0.1:'+str(_server.server_port)+path,data=data,method=item.get('method','GET'),headers=item.get('headers',{}))
  try: response=_request.urlopen(request,timeout=1)
  except _error.HTTPError as error: response=error
  with response: _responses.append({'status':response.status,'body':_json.loads(response.read(16384))})
finally:
 _server.shutdown()
 _server.server_close()
print('${marker}'+_json.dumps({'result':{'responses':_responses},'files':_capture_files()},ensure_ascii=False,allow_nan=False))
`;
}

function javascriptProject(files: Record<string, string>) {
  return `const projectFs=require('node:fs');projectFs.mkdirSync('/tmp/project',{recursive:true});process.chdir('/tmp/project');for(const [name,content] of Object.entries(${JSON.stringify(files)}))projectFs.writeFileSync('/tmp/project/'+name,content,'utf8');const projectRequire=require('node:module').createRequire('/tmp/project/main.js');`;
}
function javascriptFunction(source: string, files: Record<string, string> = {}) {
  return `${javascriptProject(files)}const fixture=JSON.parse(input);const scope={};new Function('scope','require',${JSON.stringify(`${source}\n;scope.solve=solve;`)})(scope,projectRequire);Promise.resolve(scope.solve(fixture)).then(result=>console.log('${marker}'+JSON.stringify({result,files:{}})));`;
}

function javascriptDom(source: string, html: string, css: string, assets: DomAsset[] = []) {
  // The VM supplies familiar globals; gVisor is the isolation boundary. DOM
  // mutations and events execute in the pinned library, never in the app host.
  const document = /<html(?:\s|>)/i.test(html) ? html : `<!doctype html><html><head><title>Project</title></head><body>${html}</body></html>`;
  return `const {parseHTML}=require('linkedom');const vm=require('node:vm');const fixture=JSON.parse(input);const logs=[];const w=parseHTML(${JSON.stringify(document)});
async function main(){
for(const image of w.document.querySelectorAll('img')){const asset=${JSON.stringify(assets)}.find(asset=>asset.id===image.getAttribute('src'));if(asset){image.setAttribute('src',asset.uri);image.setAttribute('data-starliz-asset',asset.id);}}
const style=w.document.createElement('style');style.textContent=${JSON.stringify(css)};w.document.head.appendChild(style);
const projectConsole={log:(...values)=>{if(logs.length<20)logs.push(values.map(String).join(' ').slice(0,500))}};projectConsole.warn=projectConsole.error=projectConsole.log;
const context={document:w.document,console:projectConsole,Event:w.Event,CustomEvent:w.CustomEvent,HTMLElement:w.HTMLElement,URL,URLSearchParams,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,fetch};context.window=context;context.self=context;context.globalThis=context;
vm.createContext(context);const completion=vm.runInContext(${JSON.stringify(source)},context,{filename:'project.js'});if(completion&&typeof completion.then==='function')await completion;
for(const action of fixture.events??[]){const element=w.document.getElementById(action.target);if(!element)throw new Error('No element has id '+action.target);if(action.type==='click'){element.click();}else{if(action.type==='input'||action.type==='change'){if(element.type==='checkbox'||element.type==='radio')element.checked=String(action.value)==='true';else if(element.tagName==='SELECT'){const value=String(action.value??'');for(const option of element.options)option.selected=false;const selected=[...element.options].find(option=>option.value===value);if(selected)selected.selected=true;}else element.value=String(action.value??'');}if(action.type==='change')element.dispatchEvent(new w.Event('input',{bubbles:true,cancelable:true}));element.dispatchEvent(new w.Event(action.type,{bubbles:true,cancelable:true}));}await Promise.resolve();}
for(const element of w.document.querySelectorAll('input,textarea,select')){if(element.tagName==='TEXTAREA')element.textContent=element.value;else if(element.tagName==='SELECT'){for(const option of element.options)option.toggleAttribute('selected',option.selected);}else {element.setAttribute('value',element.value);if(element.type==='checkbox'||element.type==='radio')element.toggleAttribute('checked',element.checked);}}
const elements=[...w.document.querySelectorAll('[id],h1,h2,button,input,label,a,img')].slice(0,150).map(e=>({tag:e.tagName.toLowerCase(),id:e.id,text:e.textContent.trim(),value:e.value??null,role:e.getAttribute('role'),label:e.getAttribute('aria-label'),for:e.getAttribute('for'),href:e.getAttribute('href'),alt:e.getAttribute('alt')}));
const result={html:w.document.toString(),elements,headingCount:w.document.querySelectorAll('h1').length,labelsValid:[...w.document.querySelectorAll('input:not([type=hidden])')].every(e=>e.hasAttribute('aria-label')||[...w.document.querySelectorAll('label')].some(l=>l.htmlFor===e.id||l.contains(e))),scripts:w.document.querySelectorAll('script').length,logs};
console.log('${marker}'+JSON.stringify({result,files:{}}));}main().catch(error=>{console.error(error.stack);process.exitCode=1});`;
}

export async function executeSource(artifact: Extract<PracticalArtifact, { type: "source" }>, input: Json,
  execute: typeof executeCodingSource = executeCodingSource): Promise<Execution> {
  if (!sourceArtifactSchema.safeParse(artifact).success) return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "Check the source, supporting filenames and project size limits.", runtime: "input-validation", steps: 0 };
  const hash = createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
  const entry = artifact.entry ?? "console";
  const object = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const evidenceManifest = object.savedEvidence === undefined ? null : evidenceManifestSchema.safeParse(object.savedEvidence);
  if (evidenceManifest && (!evidenceManifest.success || entry !== "dom")) return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "Choose supported saved creations for this web evidence activity.", runtime: "input-validation", steps: 0 };
  const projectFiles = artifact.projectFiles ?? {};
  if (Object.keys(projectFiles).length && (entry === "dom" || artifact.language === "sql")) return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "Supporting module files currently require the Python or CommonJS program workspace.", runtime: "input-validation", steps: 0 };
  let source = artifact.source;
  let inspectedDOM = false;
  let serviceExpected = false;
  let stdin = typeof object.stdin === "string" ? object.stdin : JSON.stringify(input);
  if (entry === "variables" || entry === "solve" || entry === "handle") {
    if (artifact.language === "sql" || entry === "handle" && artifact.language !== "python") throw new Error("Use Python for this service-handler interface.");
    if (entry === "variables" && artifact.language !== "python") throw new Error("Use Python for the variable-trace workspace.");
    source = artifact.language === "python" ? pythonFunction(source, entry, projectFiles) : javascriptFunction(source, projectFiles);
    stdin = JSON.stringify(input);
  } else if (entry === "dom") {
    if (artifact.language !== "javascript") throw new Error("The interactive web engine executes JavaScript.");
    const html = artifact.html ?? "<!doctype html><html><head><title>Project</title></head><body></body></html>";
    const assets = domAssetsSchema.safeParse(object.assets ?? []);
    if (!assets.success) return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "The supplied page illustrations need unique supported PNG filenames and bounded image data.", runtime: "input-validation", steps: 0 };
    const service = object.fixtureService === undefined ? null : domServiceFixtureSchema.safeParse(object.fixtureService);
    if (service && !service.success) return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "Use the supplied bounded local inventory service contract.", runtime: "input-validation", steps: 0 };
    if (service?.success) {
      const document = /<html(?:\s|>)/i.test(html) ? html : `<!doctype html><html><head><title>Private inventory project</title></head><body>${html}</body></html>`;
      source = inventoryDomProgram(source, document, artifact.css ?? "", service.data, assets.data);
      stdin = JSON.stringify({ events: Array.isArray(object.events) ? object.events : [], files: object.files ?? {} }); serviceExpected = true;
    } else if (!source.trim() && (!Array.isArray(object.events) || object.events.length === 0)) {
      source = domInspectionSource(html, artifact.css ?? "", assets.data); stdin = "{}"; inspectedDOM = true;
    } else {
      source = javascriptDom(source, html, artifact.css ?? "", assets.data); stdin = JSON.stringify({ events: Array.isArray(object.events) ? object.events : [] });
    }
  } else if (artifact.language === "sql") stdin = JSON.stringify(input);
  else if (Object.keys(projectFiles).length) source = artifact.language === "python" ? `${pythonProject(projectFiles)}\n${source}` : `${javascriptProject(projectFiles)}new Function('input','require',${JSON.stringify(source)})(input,projectRequire);`;
  if (Buffer.byteLength(source) > 65536 || Buffer.byteLength(stdin) > 8192) return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "The program and its supplied project data exceed this workspace's execution size limit.", runtime: "input-validation", steps: 0 };
  let result;
  try { result = await execute({ language: artifact.language, source, stdin, timeLimitMs: 5000, expectedImageDigest: runtimePins[artifact.language] }); } catch { throw new ExecutionUnavailable(); }
  if (result.status === "infrastructure-error") throw new ExecutionUnavailable();
  const base = { stdout: result.stdout, stderr: result.stderr, runtime: `${result.isolationRuntime}:${result.imageDigest}`, sourceHash: hash, steps: 1 };
  if (result.status !== "completed") return { ...base, ok: false, output: null, trace: [], error: result.status === "timeout" ? "The program exceeded its time budget. Check for a loop that cannot finish." : result.status === "output-limit" ? "The program produced too much output. Limit repeated messages." : result.stderr.trim() || "The program did not finish successfully." };
  if (entry === "console" && artifact.language !== "sql") return { ...base, ok: true, output: { stdout: result.stdout, lines: result.stdout.trimEnd().split(/\r?\n/) }, trace: [] };
  const encoded = artifact.language === "sql" ? result.stdout.trim() : result.stdout.split(/\r?\n/).filter((line) => line.startsWith(marker)).at(-1)?.slice(marker.length);
  let parsed: unknown;
  try { parsed = JSON.parse(encoded ?? ""); } catch { return { ...base, ok: false, output: null, trace: [], error: "The program must return the documented JSON-compatible result. Inspect its console and return value." }; }
  const verified = jsonValue.safeParse(parsed);
  if (!verified.success) return { ...base, ok: false, output: null, trace: [], error: "The returned value exceeds the supported project limits." };
  const stdout = artifact.language === "sql" ? result.stdout : result.stdout.split(/\r?\n/).filter((line) => !line.startsWith(marker)).join("\n").trimEnd();
  let value = verified.data;
  let serviceOutput: Json | null = null;
  let serviceFiles: Record<string, string> = {};
  if (serviceExpected) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ExecutionUnavailable();
    const proof = domServiceEvidenceSchema.safeParse(value.service), files = value.files;
    if (!proof.success || !files || typeof files !== "object" || Array.isArray(files) || Object.keys(files).length !== 1 || typeof files["inventory-state.json"] !== "string") throw new ExecutionUnavailable();
    const saved = files["inventory-state.json"];
    let snapshot;
    try { snapshot = inventorySnapshotSchema.safeParse(JSON.parse(saved)); } catch { throw new ExecutionUnavailable(); }
    if (!snapshot.success || Buffer.byteLength(saved) > 4096 || !sameJson(snapshot.data.items, proof.data.after)
      || createHash("sha256").update(saved).digest("hex") !== proof.data.snapshotHash
      || proof.data.acceptedWrites !== proof.data.requests.filter(request => request.method === "POST" && request.status === 200).length) throw new ExecutionUnavailable();
    serviceOutput = proof.data; serviceFiles = { "inventory-state.json": saved };
  }
  let inspectionSteps = 0;
  if (entry === "dom" && !inspectedDOM) {
    const previous = value && typeof value === "object" && !Array.isArray(value) && value.result && typeof value.result === "object" && !Array.isArray(value.result) ? value.result : null;
    if (!previous || typeof previous.html !== "string" || Buffer.byteLength(previous.html) > 32768) return { ...base, ok: false, output: null, trace: [], error: "Return a web document within the supported 32KiB snapshot limit." };
    // Inspect the inert exported document in a fresh container. Student code
    // cannot substitute query methods or grading metadata in that process.
    const inspectionSource = domInspectionSource(previous.html, "");
    if (Buffer.byteLength(inspectionSource) > 65536) return { ...base, ok: false, output: null, trace: [], error: "Reduce the page so its independent structure inspection fits the workspace limits." };
    let inspected;
    try { inspected = await execute({ language: "javascript", source: inspectionSource, stdin: "{}", timeLimitMs: 5000, expectedImageDigest: runtimePins.javascript }); } catch { throw new ExecutionUnavailable(); }
    if (inspected.status === "infrastructure-error") throw new ExecutionUnavailable();
    if (inspected.status !== "completed") return { ...base, ok: false, output: null, trace: [], error: "The exported page could not complete independent structure and style inspection. Reduce its size or repair its markup." };
    try {
      const line = inspected.stdout.split(/\r?\n/).filter((line) => line.startsWith(marker)).at(-1)?.slice(marker.length);
      const inspection = jsonValue.parse(JSON.parse(line ?? ""));
      if (!inspection || typeof inspection !== "object" || Array.isArray(inspection) || !inspection.result || typeof inspection.result !== "object" || Array.isArray(inspection.result)) throw new Error("Invalid inspection result.");
      value = { result: { ...inspection.result, logs: Array.isArray(previous.logs) ? previous.logs : [] }, files: serviceFiles, ...(serviceOutput ? { service: serviceOutput } : {}) }; inspectionSteps = 1;
    } catch { return { ...base, ok: false, output: null, trace: [], error: "The independent web inspection did not return supported project evidence." }; }
  }
  if (entry === "dom" && value && typeof value === "object" && !Array.isArray(value) && value.result && typeof value.result === "object" && !Array.isArray(value.result)) value = { ...value, result: { ...value.result, privacySafe: privacyIssues(value.result.bodyText ?? "").length === 0 } };
  if (evidenceManifest?.success && value && typeof value === "object" && !Array.isArray(value) && value.result && typeof value.result === "object" && !Array.isArray(value.result)) {
    const resolved = resolveEvidenceLinks(value.result.evidenceAnchors ?? [], evidenceManifest.data);
    value = { ...value, result: { ...value.result, evidenceLinksResolved: resolved.allResolved, evidenceResolvedCount: resolved.resolvedCount, resolvedEvidence: resolved.links } };
  }
  const output: Json = value && typeof value === "object" && !Array.isArray(value) ? { ...value, stdout } : value;
  const trace = value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.trace) ? value.trace : [{ status: result.status, durationMs: result.durationMs, language: result.language }];
  return { ...base, steps: base.steps + inspectionSteps, stdout, ok: true, output, trace };
}
