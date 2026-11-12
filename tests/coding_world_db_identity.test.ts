import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createContext, runInContext } from 'node:vm';
import { createRequire } from 'node:module';
const nativeRequire=createRequire(import.meta.url);
async function harness(database='starliz_game_world_test', failOperationOnce=false, failIdentityOnce=false) {
  const code=(await build({entryPoints:['src/lib/db.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['@prisma/client']})).outputFiles[0]!.text;
  const counts={clients:0,identities:0,operations:0,disconnects:0};
  let failOperation=failOperationOnce, failIdentity=failIdentityOnce;
  class FakeClient {
    constructor(){counts.clients++;}
    $on(){}
    async $disconnect(){counts.disconnects++;}
    async $connect(){}
    async $queryRaw(){counts.identities++;if(failIdentity){failIdentity=false;throw new Error('Engine is not yet connected');}return [{name:database,port:5432}];}
    $extends(extension:{query:{$allOperations:(context:{args:unknown;query:(args:unknown)=>Promise<unknown>})=>Promise<unknown>}}){return {$queryRaw:()=>extension.query.$allOperations({args:{},query:async()=>{counts.operations++;if(failOperation){failOperation=false;throw Object.assign(new Error("Can't reach database server"),{code:'P1001'});}return [{ok:true}];}})};}
  }
  const url='postgresql://synthetic:synthetic@127.0.0.1:55432/starliz_game_world_test?sslmode=disable&connection_limit=3';
  const context=createContext({URL,process:{env:{NODE_ENV:'development',STARLIZ_WORLD_DB_QA:'1',DATABASE_URL:url,DIRECT_URL:url},pid:1},require:(id:string)=>id==='@prisma/client'?{PrismaClient:FakeClient}:nativeRequire(id),module:{exports:{}}});
  const reload=()=>{context.module={exports:{}};runInContext(`(function(require,module,exports){${code}\n})(require,module,module.exports);`,context);return context.module.exports as {prisma:{$queryRaw:()=>Promise<unknown>}};};
  return {counts,reload};
}
test('Next module reloads reuse the verified client identity instead of issuing pool queries',async()=>{
  const h=await harness();await h.reload().prisma.$queryRaw();await h.reload().prisma.$queryRaw();
  assert.deepEqual(h.counts,{clients:1,identities:1,operations:2,disconnects:0});
});
test('a wrong connected database stays fail-closed across module reloads',async()=>{
  const h=await harness('wrong_database');await assert.rejects(h.reload().prisma.$queryRaw(),/WORLD_QA_CONNECTED_DATABASE_STOP/);await assert.rejects(h.reload().prisma.$queryRaw(),/WORLD_QA_CONNECTED_DATABASE_STOP/);
  assert.deepEqual(h.counts,{clients:1,identities:1,operations:0,disconnects:0});
});
test('a refused local pool is discarded once and the same read is retried',async()=>{
  const h=await harness('starliz_game_world_test',true);
  assert.deepEqual(await h.reload().prisma.$queryRaw(),[{ok:true}]);
  assert.deepEqual(h.counts,{clients:1,identities:2,operations:2,disconnects:1});
});
test('an engine that is not ready yet connects without discarding the pool',async()=>{
  const h=await harness('starliz_game_world_test',false,true);
  assert.deepEqual(await h.reload().prisma.$queryRaw(),[{ok:true}]);
  assert.deepEqual(h.counts,{clients:1,identities:2,operations:1,disconnects:0});
});
