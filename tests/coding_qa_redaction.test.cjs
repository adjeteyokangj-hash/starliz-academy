/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS diagnostic boundary. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {redact,diagnosticLines}=require('../scripts/coding/qa-redaction.cjs');
test('diagnostics redact synthetic credentials, headers, URLs and command arguments',()=>{
 for(const input of ['--api-key syntheticCanaryValue','AUTH_SECRET=syntheticCanaryValue','Authorization: Bearer syntheticCanaryValue','Cookie: syntheticCanaryValue','postgresql://syntheticCanaryValue:syntheticCanaryValue@localhost/db?token=syntheticCanaryValue','https://localhost/?signature=syntheticCanaryValue',JSON.stringify({password:'syntheticCanaryValue',access_token:'syntheticCanaryValue'})]) assert.ok(!redact(input).includes('syntheticCanaryValue'),redact(input));
 assert.equal(redact('runtime=runsc status=completed'),'runtime=runsc status=completed');
 for(const input of ['Cookie: session=syntheticCanaryValue; refresh=anotherCanaryValue',JSON.stringify({secret:'syntheticCanaryValue with spaces'})]) assert.ok(!redact(input).includes('syntheticCanaryValue'));
 assert.ok(!redact('--api-key "synthetic value with spaces"').includes('with spaces'));
});
test('split stream chunks cannot expose a credential',()=>{
 let output='';const sink=diagnosticLines(line=>output+=line);
 sink.push('--api-');sink.push('key synthetic');sink.push('CanaryValue\n');sink.flush();
 assert.ok(!output.includes('synthetic'));assert.match(output,/REDACTED/);
});
