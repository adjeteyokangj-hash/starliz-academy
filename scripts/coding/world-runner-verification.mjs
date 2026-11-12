import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import redaction from './qa-redaction.cjs';
import { fileURLToPath } from 'node:url';
import { createRunnerServer } from '../../services/coding-runner/server.mjs';
import { authentic, requestProof, responseProof, sign } from '../../services/coding-runner/protocol.mjs';

// Only the existing Linux daemon and reviewed runsc/image combination qualify.
assert.equal(process.platform,'linux');
assert.equal(process.env.CODING_RUNNER_CONTAINER_TESTS,'1');
assert.equal(process.env.DATABASE_URL,undefined);
assert.equal(process.env.OPENAI_API_KEY,undefined);
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const pins=JSON.parse(readFileSync(new URL('../../src/lib/coding/learning/runtime-pins.json',import.meta.url),'utf8'));
const runId=randomUUID(),directory=`artifacts/world-runner-verification/${runId}`;mkdirSync(directory,{recursive:true});
const report={runId,python:'unverified',javascript:'unverified',runtime:'runsc',databaseConnections:0,results:[]};
const persist=()=>writeFileSync(`${directory}/result.json`,redaction.redact(JSON.stringify(report,null,2)));
let broker;
try {
  report.daemonEndpoint=process.env.DOCKER_HOST;
  try {report.daemonService=execFileSync('/usr/bin/systemctl',['show','docker','--property=ActiveState,SubState,MainPID'],{encoding:'utf8',timeout:5000}).trim();}catch {report.daemonService='unavailable';}
  // Names and paths only. The full runtime feature document is large enough
  // on this daemon to exceed a short info deadline before any code runs.
  const runtimeLines=execFileSync('/usr/bin/docker',['info','--format','{{range $name, $runtime := .Runtimes}}{{$name}} {{$runtime.Path}}\n{{end}}'],{encoding:'utf8',timeout:20000});
  const runtimes=Object.fromEntries(runtimeLines.trim().split('\n').filter(Boolean).map(line=>{const gap=line.indexOf(' ');return [line.slice(0,gap),{path:line.slice(gap+1)}];}));
  report.registeredRuntimes=Object.keys(runtimes);assert.ok(runtimes.runsc,'The existing Linux daemon must register runsc');
  report.runscPath=runtimes.runsc.path;
  for(const digest of [pins.python,pins.javascript]) execFileSync('/usr/bin/docker',['image','inspect',digest],{stdio:'ignore',timeout:20000});
  const secret=randomBytes(48).toString('hex');
  // A transparent executable shim records only the phase, never arguments,
  // source, environment or credentials. exec preserves cancellation semantics.
  const phaseLog=resolve(directory,'docker-phases.log'),shim=`/tmp/starliz-docker-observe-${runId}.sh`;
  writeFileSync(shim,`#!/bin/sh\nprintf '%s %s\\n' "$(date -u +%FT%TZ)" "$1" >> '${phaseLog}'\nexec /usr/bin/docker "$@"\n`);chmodSync(shim,0o700);
  broker=createRunnerServer({secret,pythonImage:`python@${pins.python}`,javascriptImage:pins.javascript,containerRuntime:'runsc',docker:shim});
  await new Promise(yes=>broker.listen(0,'127.0.0.1',yes));
  const base=`http://127.0.0.1:${broker.address().port}`;
  const selected=process.argv[2];assert.ok(!selected||['python','javascript'].includes(selected));
  for(const language of selected?[selected]:['python','javascript']) {
   const began=new Date().toISOString();let job;
   try {
    job={jobId:randomUUID(),language,source:language==='python'?"print('python-runner-ok')":"console.log('javascript-runner-ok')",stdin:'',timeLimitMs:4000};
    const body=JSON.stringify(job),timestamp=String(Date.now());
    const response=await fetch(`${base}/execute`,{method:'POST',body,headers:{'Content-Type':'application/json','X-Coding-Timestamp':timestamp,'X-Coding-Nonce':job.jobId,'X-Coding-Signature':sign(secret,requestProof('POST','/execute',timestamp,job.jobId,body))},signal:AbortSignal.timeout(45000)});
    const text=await response.text();assert.equal(authentic(secret,responseProof(job.jobId,body,text),response.headers.get('x-coding-signature')),true);
    const result=JSON.parse(text);report.results.push({language,httpStatus:response.status,...result});persist();
    assert.equal(response.status,200);assert.equal(result.isolationRuntime,'runsc');assert.equal(result.imageDigest,pins[language]);assert.equal(result.status,'completed');assert.equal(result.stdout,`${language}-runner-ok\n`);
    report[language]='passed';persist();
   } catch(error) {
    process.exitCode=1;
    const failure={language,verificationError:error instanceof Error?error.message:'Runner unavailable'};
    if(job) {
      try { const events=execFileSync('/usr/bin/docker',['events','--since',began,'--until',new Date().toISOString(),'--filter',`container=starliz-coding-${job.jobId}`,'--format','{{json .}}'],{encoding:'utf8',timeout:10000});failure.lifecycle=events.trim()?events.trim().split('\n').map(line=>{const e=JSON.parse(line);return {action:e.Action,timeNano:e.timeNano};}):[]; } catch {failure.lifecycleUnavailable=true;}
    }
    report.results.push(failure);persist();
   }
  }
} catch(error) { report.blocker=error instanceof Error?error.message:'Runner unavailable';process.exitCode=1; }
finally {if(broker){broker.closeAllConnections();await new Promise(yes=>broker.close(yes));}persist();}
console.log(JSON.stringify({directory,python:report.python,javascript:report.javascript,blocker:report.blocker}));
