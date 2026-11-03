import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { codingComponentStyles } from "./e2e/coding-styles";

test("packet editor preserves supplied evidence and repairs actual model delivery at three widths", { timeout: 180000 }, async () => {
  const directory = `artifacts/coding-network-uat/${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const styles = await codingComponentStyles();
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Editor from'./src/components/coding/NetworkPacketEditor';import View from'./src/components/coding/NetworkExecution';import{networkDocumentSchema,executeNetwork}from'./src/lib/coding/learning/studio-engines';const fixture={packets:[{sequence:0,text:'First '},{sequence:1,text:'Second '}]};const initial=networkDocumentSchema.parse({nodes:['client','router','service'],links:[['client','router'],['router','service']],from:'client',to:'service',service:'message',query:'This query must not fabricate missing data.',index:[],selected:[],relevanceWeight:1,promotionWeight:0,evidence:'Offline shared route model',concern:'none',packets:[],expectedPackets:2});function App(){const[document,setDocument]=useState(initial),[result,setResult]=useState(null);window.readPacketDocument=()=>document;return <main style={{maxWidth:1000,margin:'auto',padding:16}}><Editor document={document} fixture={fixture} onChange={patch=>setDocument(previous=>({...previous,...patch}))}/><button style={{minHeight:44,padding:12}} onClick={()=>setResult(executeNetwork(document,fixture))}>Run actual offline model</button>{result&&<View output={result.output}/>}</main>}createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const evidence: Record<string, unknown> = { realBrowser: true, nativeDeterministicModel: true, realNetworkTransmissionClaim: false, serverAssessmentClaim: false };
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 1100 } });
    await page.setContent(`<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: built.outputFiles[0]!.text });
    const expected = page.getByLabel("Expected complete packet count", { exact: true }); await expected.waitFor();
    assert.equal(await expected.inputValue(), "2");
    assert.equal(await page.getByRole("button", { name: "Add packet", exact: true }).count(), 0, "Supplied packet rows are not editable");
    assert.equal(await page.getByLabel("Packet 1 sequence", { exact: true }).count(), 0);
    await expected.fill("3"); await expected.press("Tab");
    await page.getByRole("button", { name: "Run actual offline model", exact: true }).click();
    await page.getByText("The packet sequence is incomplete or duplicated. A complete message was not reconstructed.", { exact: true }).waitFor();
    await page.getByText("Missing: 2. Duplicated: none.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Practice message", exact: true }).count(), 0, "The actual model does not display query text as a fabricated packet message");
    const state = await page.evaluate(() => (window as unknown as { readPacketDocument: () => { expectedPackets: number; packets: unknown[] } }).readPacketDocument());
    assert.equal(state.expectedPackets, 3); assert.deepEqual(state.packets, [], "The model's contract changed while the supplied fixture remained external and unchanged");
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1100 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const region = page.getByRole("region", { name: "Packet sequence table" }); await region.focus(); assert.equal(await region.evaluate(element => document.activeElement === element), true);
      await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
    }
    evidence.suppliedPacketRowsProtected = true; evidence.expectedCountRepair = true; evidence.actualMissingSequence = 2; evidence.noFabricatedServicePayload = true; evidence.viewports = [390, 820, 1440]; evidence.passed = true;
  } finally { await browser.close(); writeFileSync(`${directory}/result.json`, JSON.stringify(evidence, null, 2), { flag: "wx" }); }
});
