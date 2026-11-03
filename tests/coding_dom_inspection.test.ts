import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { executeSource } from "../src/lib/coding/learning/source-execution";
import { streamIsolatedExecutor } from "../scripts/coding/stream-isolated-executor";
import type { Json } from "../src/lib/coding/learning/types";
const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
test("real gVisor web inspection resolves foundation CSS and ignores replaced learner query methods", { skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1", timeout: 180000 }, async () => {
  const directory = `artifacts/coding-runner/dom-inspection-${randomUUID()}`;
  mkdirSync(directory, { recursive: true }); const evidence = `${directory}/actual-jobs.jsonl`; writeFileSync(evidence, "", { flag: "wx" });
  const execute = streamIsolatedExecutor(evidence);
  try {
    const html = '<html><head><title>Fictional river guide</title></head><body><main><h1>River guide</h1><a href="#evidence">Read evidence</a><p id="ordinary">Ordinary paragraph</p><h2 id="evidence">Evidence</h2><p class="notice" id="notice">Important notice</p><ul><li>Observe</li><li>Check</li></ul><label for="fictional-title">Fictional title</label><input id="fictional-title"><span id="choice-name">Picture choice</span><select id="choice" aria-labelledby="choice-name"><option>Bridge</option></select><label>Fictional note<textarea id="note"></textarea></label></main></body></html>';
    const css = 'p{color:#111111;background-color:#ffffff;font-size:18px}.notice{color:#ffffff;background-color:#000000;font-size:20px;padding:16px}p{color:#111111}';
    const staticPage = await executeSource({ type: "source", language: "javascript", entry: "dom", html, css, source: "" }, {}, execute);
    assert.equal(staticPage.ok, true, staticPage.error);
    const result = record(record(staticPage.output).result), inspection = record(result.styleInspection), styles = record(inspection.stylesById), notice = record(styles.notice), ordinary = record(styles.ordinary);
    assert.equal(result.headingOutlineValid, true); assert.equal(result.mainCount, 1); assert.equal(result.safeLinks, true);
    assert.equal(result.labelsValid, true); assert.equal(result.idsUnique, true);
    assert.deepEqual(result.inputLabels, [{ id: "fictional-title", tag: "input", name: "Fictional title", labelled: true }, { id: "choice", tag: "select", name: "Picture choice", labelled: true }, { id: "note", tag: "textarea", name: "Fictional note", labelled: true }]);
    assert.equal(inspection.supported, true); assert.equal(notice.fontSizePx, 20); assert.equal(notice.minimumPaddingPx, 16); assert.equal(notice.contrast, 21);
    assert.equal(record(notice.properties).color, "#ffffff", "A later low-specificity p rule cannot override the class colour");
    assert.equal(record(ordinary.properties).color, "#111111", "The scoped notice rule leaves the unrelated paragraph alone");
    const replacement = await executeSource({ type: "source", language: "javascript", entry: "dom", html, css, source: "const query=document.querySelectorAll.bind(document);document.querySelectorAll=selector=>selector==='h1'?{length:99}:query(selector);" }, {}, execute);
    assert.equal(replacement.ok, true, replacement.error); assert.equal(record(record(replacement.output).result).headingCount, 1); assert.equal(replacement.steps, 2, "Independent inspection actually ran in a second container");
    const unsafeLink = await executeSource({ type: "source", language: "javascript", entry: "dom", html: '<h1>Fictional guide</h1><a href="javascript:alert(1)">Unsafe</a><script>throw new Error("This must remain inert")</script><input id="duplicate" aria-label=""><div id="duplicate">Repeated identifier</div>', css: 'h1{position:fixed}', source: "" }, {}, execute);
    assert.equal(unsafeLink.ok, true, unsafeLink.error);
    const unsafe = record(record(unsafeLink.output).result);
    assert.equal(unsafe.safeLinks, false); assert.equal(unsafe.scripts, 1); assert.equal(record(unsafe.styleInspection).supported, false);
    assert.equal(unsafe.labelsValid, false); assert.equal(unsafe.idsUnique, false); assert.deepEqual(unsafe.duplicateIds, ["duplicate"]);
    const committed = await executeSource({ type: "source", language: "javascript", entry: "dom", html: '<main><h1>Fictional input</h1><label for="title">Fictional title</label><input id="title"><p id="echo"></p></main>', css: "", source: "const field=document.getElementById('title'),echo=document.getElementById('echo');field.addEventListener('input',()=>{echo.textContent='Input: '+field.value});field.addEventListener('change',()=>{echo.textContent+='; changed'});" }, { events: [{ target: "title", type: "change", value: "Paper bridge" }] }, execute);
    assert.equal(committed.ok, true, committed.error);
    const committedResult = record(record(committed.output).result);
    assert.equal(record(committedResult.textsById).echo, "Input: Paper bridge; changed");
    assert.equal(record(committedResult.controlValuesById).title, "Paper bridge");
    writeFileSync(`${directory}/result.json`, JSON.stringify({ actualExecution: true, passed: true, jobs: 6, staticStylesAndContrast: true, independentPostProgramInspection: true, learnerQueryReplacementIgnored: true, unsupportedCssReported: true, htmlScriptNotExecuted: true, nonemptyControlLabels: true, duplicateIdentifiersReported: true, committedInputAndChangeEvents: true, actualControlValueReadback: true, browserLayoutClaim: false, fullAccessibilityClaim: false }, null, 2), { flag: "wx" });
  } finally { await execute.close(); }
});
