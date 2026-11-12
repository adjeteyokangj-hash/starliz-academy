import test from 'node:test';
import assert from 'node:assert/strict';
import { worldRequestIsSameOrigin } from '../src/lib/coding/world/request-origin';
test('World origin check accepts Next-normalised local URLs and rejects cross-site origins',()=>{
 const request=(headers:Record<string,string>)=>new Request('http://localhost:54321/api/student/coding/world',{headers});
 assert.equal(worldRequestIsSameOrigin(request({host:'127.0.0.1:54321',origin:'http://127.0.0.1:54321'})),true);
 assert.equal(worldRequestIsSameOrigin(request({host:'127.0.0.1:54321',origin:'https://example.invalid'})),false);
 assert.equal(worldRequestIsSameOrigin(request({host:'127.0.0.1:54321',origin:'http://127.0.0.1:54321','sec-fetch-site':'cross-site'})),false);
 assert.equal(worldRequestIsSameOrigin(request({host:'attacker@127.0.0.1:54321',origin:'http://127.0.0.1:54321'})),false);
 assert.equal(worldRequestIsSameOrigin(request({origin:'null'})),false);
 assert.equal(worldRequestIsSameOrigin(request({host:'example.invalid',origin:'http://localhost:54321'})),false);
});
