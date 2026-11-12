/* eslint-disable @typescript-eslint/no-require-imports -- Tests the synchronous CommonJS preload boundary. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
const {assertTarget}=require('../scripts/coding/world-test-guard.cjs');
const local='postgresql://synthetic:synthetic@127.0.0.1:55432/starliz_game_world_test?sslmode=disable';
test('database guard rejects alternate databases, remote hosts and connection overrides',()=>{
 assert.equal(assertTarget(local),true);
 for(const target of [local.replace('starliz_game_world_test','starliz_ci'),local.replace('127.0.0.1','example.invalid'),local.replace('55432','5432'),local.replace('disable','require'),local+'&host=example.invalid',local.replace('postgresql:','https:')]) assert.throws(()=>assertTarget(target),/WORLD_QA/);
});
test('preload rejects a wrong target before executing worker code',()=>{
 const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP'].flatMap(k=>process.env[k]?[[k,process.env[k]]]:[]));
 const result=spawnSync(process.execPath,['--require',resolve('scripts/coding/world-test-guard.cjs'),'-e',"console.log('WORKER_RAN')"],{env:{...env,STARLIZ_WORLD_DB_QA:'1',DATABASE_URL:local.replace('starliz_game_world_test','starliz_ci'),DIRECT_URL:local},encoding:'utf8',windowsHide:true});
 assert.notEqual(result.status,0);assert.equal(result.stdout.includes('WORKER_RAN'),false);assert.match(result.stderr,/WORLD_QA_WRONG_DATABASE_STOP/);
});
test('preload blocks SDK sockets and dotenv reads, including async reads',()=>{
 const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP'].flatMap(k=>process.env[k]?[[k,process.env[k]]]:[]));
 const source=`(async()=>{const a=require('node:assert/strict'),f=require('node:fs');a.equal(f.readFileSync('.env.local','utf8'),'');a.equal(await f.promises.readFile('.env.local','utf8'),'');await new Promise((yes,no)=>f.readFile('.env.local','utf8',(e,s)=>{try{a.equal(s,'');yes()}catch(x){no(x)}}));for(const call of [()=>require('node:net').connect(443,'example.invalid'),()=>require('node:tls').connect({host:'example.invalid',port:443}),()=>require('node:https').get('https://example.invalid'),()=>require('node:http2').connect('https://example.invalid'),()=>require('node:dgram').createSocket('udp4')])a.throws(call,/WORLD_QA/);console.log('GUARDS_PASSED')})().catch(()=>process.exitCode=1)`;
 const result=spawnSync(process.execPath,['--require',resolve('scripts/coding/world-test-guard.cjs'),'-e',source],{env:{...env,STARLIZ_WORLD_DB_QA:'1',DATABASE_URL:local,DIRECT_URL:local},encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/GUARDS_PASSED/);
});
